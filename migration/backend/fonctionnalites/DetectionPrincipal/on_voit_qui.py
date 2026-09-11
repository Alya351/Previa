"""Décrit chaque personne détectée : visage, genre, vêtements (type +
couleur), avec le nombre de chaque type.

Architecture multi-caméra : l'IDENTITÉ (visage/corps, voir identify_face/
identify_body/_memoire_personnes plus bas) reste GLOBALE — stockée dans
local_store (db), pas indexée par caméra — pour reconnaître la MÊME
personne quelle que soit la caméra qui l'a vue (c'est tout l'intérêt
d'une ré-identification par apparence plutôt que par simple présence dans
le cadre). Le genre et les vêtements observés sont aussi une propriété de
la personne elle-même, pas de la caméra qui regarde — mêlés sans
problème, ils se confirment même plus vite avec plusieurs caméras.

En revanche, la POSITION/le COMPORTEMENT (rôdage, regard, posture — voir
ComportementsSupects/rodeur.py et DetectionPrincipal/qui_fait_quoi.py)
sont jugés SUR L'IMAGE d'une caméra précise (coordonnées en pixels
propres à son cadrage) : ces modules-là reçoivent `id_camera` et gardent
une mémoire séparée par caméra, jamais mélangée.

Deux modèles de vêtements, complémentaires plutôt que redondants :
- YOLO (DeepFashion2) détecte les vêtements PRINCIPAUX avec des types
  fins (chemise manches courtes/longues, veste, gilet, robe...), chacun
  avec son propre masque de segmentation.
- SegFormer (human parsing) ne ressort que pour les ACCESSOIRES que
  DeepFashion2 ne connaît pas du tout (chapeau, lunettes, ceinture,
  chaussures, sac, écharpe) — pas pour les vêtements principaux, pour ne
  pas compter deux fois le même haut/pantalon avec deux granularités
  différentes.

Technique d'attribution vêtement -> personne (les deux modèles) : chaque
vêtement/accessoire est un masque de pixels (le sien pour YOLO, ou
l'intersection classe x carte pour SegFormer), croisé avec le masque de
segmentation de CHAQUE personne (lui aussi au pixel près) — l'attribution
se fait par recouvrement de pixels réel, jamais par simple distance de
centroïdes, ce qui se trompe dès que deux personnes sont proches. La
couleur d'un vêtement est la couleur médiane (HSV) de ces pixels RÉELS,
jamais devinée sur toute une boîte englobante (qui contiendrait du fond
ou de la peau).

Une image par appel — la vérification ne vient pas d'un lot envoyé d'un
coup, mais d'une VRAIE mémoire par personne qui persiste entre des appels
séparés dans le temps : le genre et les vêtements ne sont confirmés
qu'après plusieurs observations cohérentes (votes accumulés), pas sur la
foi d'une seule image isolée. Une couleur mal lue ou un genre mal classé
une fois ne suffit pas à l'affirmer."""
import time
import uuid
from pathlib import Path

import cv2
import numpy as np
import torch
from fonctionnalites.Infrastructure import rapport_cam
from fonctionnalites.Infrastructure.local_store import db
from insightface.app import FaceAnalysis
from torchreid.reid.utils import FeatureExtractor
from transformers import (
    AutoImageProcessor,
    AutoModelForImageClassification,
    AutoModelForSemanticSegmentation,
    SegformerImageProcessor,
)
from ultralytics import YOLO

from fonctionnalites.Infrastructure import etat_persistant
from fonctionnalites.cam.camera import camera as _camera_registre
from fonctionnalites.DetectionPrincipal import on_voit_quoi
from fonctionnalites.DetectionPrincipal import qui_fait_quoi
from fonctionnalites.ComportementsSupects import rodeur, profil_suspect, infiltre
from fonctionnalites.zoneCam import detectionEnZone

MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

FACE_MIN_CONF = 0.6  # SCRFD (InsightFace) : score pas saturé près de 1 comme MTCNN — de vrais visages nets mesurés entre 0.78 et 0.89

# Genre : fusion de deux sources, chacune votant indépendamment dans la
# même mémoire par personne (voir _maj_memoire) —
# - visage (InsightFace "genderage", inclus dans buffalo_l, gratuit : pas
#   de modèle ni de calcul en plus, tourne sur le même visage aligné
#   qu'ArcFace) ;
# - corps entier (NTQAI/pedestrian_gender_recognition, BEiT entraîné sur
#   PETA), qui marche même sans visage visible.
# Les deux se complètent : le visage est en général plus fiable de face,
# le corps entier fonctionne de dos/de loin/sans visage.
GENDER_MIN_CONF = 0.75  # seuil de confiance pour le modèle corps entier (le visage n'expose pas de score exploitable)

# Identité persistante par visage (Firebase) : donne un identifiant stable
# à un visage déjà vu, sans exiger de nom pour l'instant — juste "est-ce
# la même personne qu'avant", vérifié par similarité cosinus entre
# embeddings. Contrairement au track_id du tracker de posture (qui se
# perd dès que la personne sort du champ ou que le tracking décroche),
# cette identité résiste à une absence temporaire.
FACE_MATCH_THRESHOLD = 0.4  # similarité cosinus minimale pour "même visage" (ArcFace : calibré sur des vrais visages, même personne ~0.68+, personnes différentes <0.1)
FACE_CONFIRM_THRESHOLD = 5  # nombre de fois vu avant de devenir une identité confirmée

# Ré-identification par apparence corporelle pour les personnes SANS
# visage — même principe que l'identité par visage (embedding + similarité
# cosinus + candidat/confirmé, stocké dans Firebase pour ne jamais
# l'oublier, même après un redémarrage du serveur), mais sur un modèle
# entraîné spécifiquement pour ça (OSNet, réseau appris sur des jeux de
# ré-identification comme MSMT17), pas une comparaison de type/couleur de
# vêtements faite à la main. Bien plus robuste : une couleur mal lue ou un
# vêtement manquant sur une frame ne casse plus la correspondance.
#
# Limite honnête, assumée délibérément : contrairement à un visage, une
# apparence corporelle change avec les vêtements du jour au lendemain — la
# garder indéfiniment augmente le risque qu'une autre personne habillée
# de façon similaire, des jours plus tard, soit confondue avec une
# ancienne identité. Choix explicite malgré ce risque.
REID_MATCH_THRESHOLD = 0.6
REID_CONFIRM_THRESHOLD = 3

# Mise à jour de l'apparence de référence : quand une identité "corps" est
# reconnue avec une similarité assez haute (plus stricte que le simple
# seuil de reconnaissance, pour ne pas dériver vers une mauvaise personne
# sur un match limite), l'embedding stocké est mélangé avec la nouvelle
# observation (moyenne glissante douce, pas un remplacement brutal) — ça
# atténue le risque évoqué plus haut : l'apparence de référence suit les
# changements de tenue au fil du temps plutôt que de rester figée sur la
# toute première confirmation.
REID_MAJ_APPARENCE_SEUIL = 0.7
REID_MAJ_APPARENCE_POIDS = 0.15  # poids de la nouvelle observation dans le mélange

# Fusion assistée par position/temps : constaté en conditions réelles
# (va-et-vient rapide dans le cadre) que la MÊME personne peut retomber
# sous le seuil strict de reconnaissance d'un appel à l'autre (mesuré :
# similarités réelles entre 0.27 et 0.55 pour la même personne, contre un
# seuil de 0.6) — pas un seuil mal calé pour autant : baisser le seuil
# strict pour tout le monde accepterait aussi des inconnus qui se
# ressemblent un peu, n'importe où dans l'image. Au lieu de ça, un
# candidat récent ET physiquement proche de la nouvelle détection obtient
# une barre de similarité plus basse — la proximité spatio-temporelle
# comble ce que l'apparence seule ne suffit plus à garantir, exactement
# comme les vrais systèmes de tracking (apparence + mouvement, jamais
# l'apparence seule).
REID_FUSION_SIM_MIN = 0.35
REID_FUSION_DELAI_MAX_S = 20.0
REID_FUSION_DISTANCE_MAX_FRACTION = 0.15

# Mémoire par personne (genre + vêtements), qui persiste entre les appels
# séparés — pas de nom, juste "qu'est-ce qu'on a observé de cette
# identité au fil du temps". Un vêtement pas revu depuis longtemps est
# oublié (tenue changée, jour différent).
#
# Le genre, lui, est VERROUILLÉ dès qu'il atteint GENDER_MIN_VOTES : c'est
# une caractéristique fixe de la personne, contrairement aux vêtements —
# sans verrou, des observations bruitées (mauvais angle, contre-jour)
# accumulées sur une longue session pouvaient faire basculer le vote
# majoritaire et écraser un résultat déjà correct (bug constaté en
# conditions réelles : une identité confirmée "femme" est repassée à
# "homme" après ~50 observations). Une fois verrouillé, les observations
# suivantes n'ont plus aucun effet sur ce champ.
GENDER_MIN_VOTES = 3          # nombre de votes avant de verrouiller un genre
CLOTHING_CONFIRM_COUNT = 3    # nombre de fois qu'un même (type, couleur) doit revenir
CLOTHING_MEMORY_EXPIRY_S = 60  # un vêtement plus revu depuis ce délai est oublié

# Mémoire RAM du genre/vêtements (pas l'identité elle-même, qui persiste
# dans Firebase sans expiration) pas revue depuis ce délai : oubliée —
# sans ça, chaque candidat éphémère jamais confirmé (un visage entraperçu
# une fois, par exemple) resterait en mémoire pour toujours sur une
# session longue, qui est le mode d'usage normal ici (caméra qui tourne
# en continu). Même logique que CLOTHING_MEMORY_EXPIRY_S, appliquée à
# l'entrée entière.
MEMOIRE_PERSONNE_EXPIRY_S = 3600.0

_memoire_personnes = {}
# id -> {"genre_votes": {"female": n, "male": n}, "genre_verrouille": str | None,
#        "vetements": {(type_fr, couleur_fr): {"count": n, "last_seen": t}},
#        "last_seen": float}

CLOTHING_FR = {
    "short_sleeved_shirt": "chemise à manches courtes",
    "long_sleeved_shirt": "chemise à manches longues",
    "short_sleeved_outwear": "veste à manches courtes",
    "long_sleeved_outwear": "veste à manches longues",
    "vest": "gilet",
    "sling": "débardeur fin",
    "shorts": "short",
    "trousers": "pantalon",
    "skirt": "jupe",
    "short_sleeved_dress": "robe à manches courtes",
    "long_sleeved_dress": "robe à manches longues",
    "vest_dress": "robe sans manches",
    "sling_dress": "robe à bretelles fines",
}

# Classes du modèle mattmdjaga/segformer_b2_clothes (id2label complet :
# 0 Background, 1 Hat, 2 Hair, 3 Sunglasses, 4 Upper-clothes, 5 Skirt,
# 6 Pants, 7 Dress, 8 Belt, 9 Left-shoe, 10 Right-shoe, 11 Face, 12
# Left-leg, 13 Right-leg, 14 Left-arm, 15 Right-arm, 16 Bag, 17 Scarf) —
# on ne garde QUE les accessoires que YOLO/DeepFashion2 ne détecte pas du
# tout (chapeau, lunettes, ceinture, chaussures, sac) ; les vêtements
# principaux (haut/jupe/pantalon/robe) viennent de YOLO, plus fin (types
# précis) — pas de doublon entre les deux modèles.
#
# "Scarf" (17, écharpe) volontairement RETIRÉE : faux positif constaté en
# conditions réelles et persistant (confond une zone du cou/col avec une
# écharpe sur une personne qui n'en portait pas), sur plusieurs appels
# séparés et malgré un relèvement du seuil de pixels — pas un bruit
# isolé qu'un seuil peut filtrer, la classe elle-même n'est pas fiable
# ici. Même logique que le retrait de SlowFast : mieux vaut ne rien dire
# qu'affirmer un faux détail vestimentaire.
SEGFORMER_ACCESSOIRES_FR = {
    1: "chapeau", 3: "lunettes de soleil", 8: "ceinture",
    9: "chaussure", 10: "chaussure", 16: "sac",
}

# Nombre minimum de pixels (recouvrement vêtement x masque de la personne)
# pour compter un vêtement comme réellement porté — élimine le bruit d'un
# pixel isolé mal classé en bordure.
CLOTHING_MIN_PIXELS = 500

COLOR_FR = {
    "red": "rouge", "orange": "orange", "yellow": "jaune", "green": "vert",
    "cyan": "cyan", "blue": "bleu", "purple": "violet", "pink": "rose",
    "black": "noir", "white": "blanc", "gray": "gris", "?": None,
}

GENDER_FR = {"female": "femme", "male": "homme"}

CONF_PERSONNE = 0.5
CONF_VETEMENT = 0.5

# Détection de squelette (posture/activité, voir qui_fait_quoi.py) — même
# seuil que CONF_PERSONNE, cohérence entre les deux passes.
CONF_POSE = 0.5

# Seuil bas, spécifique au suivi de zone anonyme pour le rôdage (voir
# on_surveil_quoi/rodeur.py, assigner_zone_anonyme) — une personne trop
# petite/loin de la caméra n'atteint jamais CONF_PERSONNE, mais sa
# position répétée dans le temps reste un signal valable même sans
# identité complète (visage/genre/vêtements). Confirmé en conditions
# réelles : sur une vraie vidéo de rôdage, la confiance mesurée pour la
# personne réellement suspecte était de 0.10 à 0.33.
CONF_RODEUR_ANONYME = 0.1

# Distance (fraction de la diagonale) en dessous de laquelle une
# détection à seuil bas est considérée comme LA MÊME personne qu'une
# détection déjà comptée en "vraie" personne (CONF_PERSONNE) — évite de
# suivre deux fois la même personne (une fois avec identité, une fois en
# zone anonyme).
RODEUR_ANONYME_DEDOUBLONNAGE_FRACTION = 0.05

# Corroboration par le modèle général (xlarge, on_voit_quoi.py) : une
# détection à seuil bas du modèle spécialisé (person-seg-yolo12l.pt) n'est
# retenue pour le suivi de zone anonyme QUE si le modèle général voit
# aussi quelque chose de "personne" au même endroit, même très
# faiblement. Nécessaire après un faux positif constaté en conditions
# réelles : le modèle spécialisé confondait un objet bleu statique posé
# sur un support avec une personne, de façon assez stable pour se faire
# confirmer "rôdeur" (immobile par définition, un objet gagne facilement
# ce critère) — vérifié que le modèle général, entraîné différemment, ne
# fait JAMAIS cette confusion sur ce même objet, alors qu'il détecte bien
# (par intermittence) la vraie personne suspecte. Deux modèles entraînés
# séparément qui se trompent au même endroit de la même façon est bien
# moins probable qu'un seul qui se trompe seul.
CONF_RODEUR_CORROBORATION = 0.05
RODEUR_CORROBORATION_DISTANCE_FRACTION = 0.15

HUE_RANGES = [
    ("red", (0, 8)), ("orange", (8, 20)), ("yellow", (20, 35)), ("green", (35, 85)),
    ("cyan", (85, 100)), ("blue", (100, 130)), ("purple", (130, 150)),
    ("pink", (150, 170)), ("red", (170, 180)),
]

_models = None


def _get_models():
    global _models
    if _models is None:
        print("[on_voit_qui] chargement des modèles...", flush=True)
        person_seg = YOLO(MODELS_DIR / "person-seg-yolo12l.pt")
        person_seg.to(DEVICE)
        clothing = YOLO(MODELS_DIR / "clothing-yolov8s-seg.pt")
        clothing.to(DEVICE)
        pose = YOLO(MODELS_DIR / "yolo11x-pose.pt")
        pose.to(DEVICE)

        clothing_processor = SegformerImageProcessor.from_pretrained(str(MODELS_DIR / "segformer-clothes"))
        clothing_model = AutoModelForSemanticSegmentation.from_pretrained(str(MODELS_DIR / "segformer-clothes"))
        clothing_model = clothing_model.eval().to(DEVICE)

        face_app = FaceAnalysis(
            name="buffalo_l",
            # genderage : genre par visage (voir plus haut) ; landmark_3d_68 :
            # orientation de la tête (yaw), pour on_surveil_quoi/rodeur.py
            # (partie "regard") — tous les deux gratuits, même passage
            # que la détection.
            allowed_modules=["detection", "recognition", "genderage", "landmark_3d_68"],
            root=str(MODELS_DIR / "insightface"),
        )
        face_app.prepare(ctx_id=-1, det_size=(640, 640))  # ctx_id=-1 : CPU, comme les autres sessions ONNX ici

        gender_body_processor = AutoImageProcessor.from_pretrained(str(MODELS_DIR / "pedestrian-gender"))
        gender_body_model = AutoModelForImageClassification.from_pretrained(str(MODELS_DIR / "pedestrian-gender"))
        gender_body_model = gender_body_model.eval().to(DEVICE)

        reid = FeatureExtractor(
            model_name="osnet_x1_0",
            model_path=str(MODELS_DIR / "osnet-reid" / "osnet_x1_0_msmt17.pth"),
            device=DEVICE,
        )

        _models = {
            "person_seg": person_seg, "clothing": clothing, "pose": pose,
            "clothing_processor": clothing_processor, "clothing_model": clothing_model,
            "face": face_app,
            "gender_body_processor": gender_body_processor, "gender_body_model": gender_body_model,
            "reid": reid,
        }
        print(f"[on_voit_qui] modèles prêts sur {DEVICE}", flush=True)
    return _models


def dominant_color(pixels_bgr: np.ndarray) -> str:
    """Couleur médiane en HSV, calculée sur un ensemble de pixels BGR déjà
    isolés (intersection classe SegFormer x masque de la personne) — jamais
    devinée sur toute une boîte englobante, qui contiendrait du fond, de la
    peau ou des cheveux."""
    if pixels_bgr.size == 0:
        return "?"

    hsv = cv2.cvtColor(pixels_bgr.reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    h, s, v = np.median(hsv, axis=0)
    if v < 50:
        return "black"
    if s < 35 and v > 200:
        return "white"
    if s < 40:
        return "gray"
    for name, (lo, hi) in HUE_RANGES:
        if lo <= h < hi:
            return name
    return "?"


def _box_centroid(box) -> tuple:
    return ((box[0] + box[2]) / 2, (box[1] + box[3]) / 2)


def _distance(p1: tuple, p2: tuple) -> float:
    return ((p1[0] - p2[0]) ** 2 + (p1[1] - p2[1]) ** 2) ** 0.5


def _corrobore_par_modele_general(id_camera: str, frame, centroid: tuple, diagonale_frame: float) -> bool:
    """Vérifie si le modèle général (xlarge, on_voit_quoi.py — déjà
    chargé, même instance partagée) voit aussi une personne près de
    `centroid`, même très faiblement. Voir CONF_RODEUR_CORROBORATION."""
    # _get_model est indexé par id_camera (voir on_voit_quoi.py) — cet
    # argument manquait ici, ce qui faisait planter TOUT /qui (donc aussi
    # la détection de zone plus bas dans analyser(), jamais atteinte) dès
    # qu'un candidat à faible confiance apparaissait sur l'image.
    model = on_voit_quoi._get_model(id_camera)
    result = model.predict(frame, conf=CONF_RODEUR_CORROBORATION, verbose=False)[0]
    seuil = RODEUR_CORROBORATION_DISTANCE_FRACTION * diagonale_frame
    for box in result.boxes:
        if result.names[int(box.cls[0])] != "person":
            continue
        c = _box_centroid(box.xyxy[0].tolist())
        if _distance(c, centroid) <= seuil:
            return True
    return False


def _assign_faces_to_people(people_centroids: list, face_centroids: list) -> dict:
    """Attribution visage <-> personne en 1-à-1 stricte : on trie toutes
    les paires (personne, visage) par distance croissante, et on attribue
    en priorité les paires les plus proches — une fois qu'une personne ou
    qu'un visage est pris, il ne peut plus être réattribué. Sans ça, deux
    personnes proches l'une de l'autre pouvaient toutes les deux se voir
    attribuer le MÊME visage le plus proche, laissant l'autre visage
    orphelin (bug trouvé et corrigé en relisant ce fichier)."""
    paires = []
    for pi, pc in enumerate(people_centroids):
        for fi, fc in enumerate(face_centroids):
            paires.append((_distance(pc, fc), pi, fi))
    paires.sort(key=lambda x: x[0])

    personne_vers_visage = {}
    visages_pris = set()
    for _, pi, fi in paires:
        if pi in personne_vers_visage or fi in visages_pris:
            continue
        personne_vers_visage[pi] = fi
        visages_pris.add(fi)
    return personne_vers_visage


def _run_seg(model, frame, conf):
    """Détection+segmentation (sans tracking : personne et vêtements sont
    ré-identifiés par apparence à chaque appel — visage/OSNet pour les
    personnes, recouvrement de pixels pour les vêtements — donc un
    track_id ByteTrack ne sert plus à rien ici, juste du calcul en plus).
    Renvoie une liste de {box, label, centroid (du masque si dispo, sinon
    de la boîte), mask_poly}."""
    result = model.predict(frame, conf=conf, verbose=False)[0]
    detections = []
    for i, box in enumerate(result.boxes):
        det_box = [round(v, 1) for v in box.xyxy[0].tolist()]
        det = {
            "label": result.names[int(box.cls[0])],
            "box": det_box,
            "centroid": _box_centroid(det_box),
            "mask_poly": None,
            "score": float(box.conf[0]),
        }
        if result.masks is not None:
            poly = result.masks.xy[i]
            if len(poly) > 0:
                det["centroid"] = (float(np.mean(poly[:, 0])), float(np.mean(poly[:, 1])))
                det["mask_poly"] = poly
        detections.append(det)
    return detections


def _run_pose(model, frame, conf):
    """Détection de squelette (17 points-clés COCO, x/y/confiance) pour
    CHAQUE personne de l'image — sert à juger la posture par géométrie
    réelle (angle du torse, flexion des genoux) plutôt qu'en devinant sur
    une image comme le faisait CLIP (voir qui_fait_quoi.py). Renvoie une
    liste de {centroid, keypoints (array 17x3)}."""
    result = model.predict(frame, conf=conf, verbose=False)[0]
    detections = []
    if result.keypoints is None:
        return detections
    for box, kpts in zip(result.boxes, result.keypoints.data):
        det_box = [round(v, 1) for v in box.xyxy[0].tolist()]
        detections.append({
            "centroid": _box_centroid(det_box),
            "keypoints": kpts.cpu().numpy(),
        })
    return detections


def detect_faces(face_app, frame_bgr):
    """Détection + embedding ArcFace + genre + orientation de tête en un
    seul passage (InsightFace, modèles SCRFD + w600k_r50 + genderage +
    landmark_3d_68) — travaille directement en BGR, pas de conversion
    PIL/RGB nécessaire contrairement à l'ancien MTCNN."""
    faces = []
    for f in face_app.get(frame_bgr):
        if f.det_score < FACE_MIN_CONF:
            continue
        pose = getattr(f, "pose", None)  # [pitch, yaw, roll] en degrés, ou None si le module landmark n'a pas pu être calculé
        faces.append({
            "box": [round(float(v), 1) for v in f.bbox.tolist()],
            "confidence": round(float(f.det_score), 3),
            "embedding": [round(float(x), 6) for x in f.normed_embedding.tolist()],
            "genre": {0: "female", 1: "male"}.get(int(f.gender)) if f.gender is not None else None,
            "yaw": float(pose[1]) if pose is not None else None,
        })
    return faces


def _segment_clothing(processor, model, frame_bgr: np.ndarray) -> np.ndarray:
    """Segmentation sémantique de TOUTE l'image en une passe (SegFormer,
    mattmdjaga/segformer_b2_clothes) : renvoie une carte (H, W) où chaque
    pixel porte l'id de sa classe (vêtement, peau ou fond). Contrairement à
    une détection par boîte, il n'y a ni instance ni confiance par objet —
    l'attribution à une personne précise se fait ensuite en croisant cette
    carte avec le masque de segmentation de chaque personne."""
    rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
    inputs = processor(images=rgb, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        logits = model(**inputs).logits
    upsampled = torch.nn.functional.interpolate(
        logits, size=frame_bgr.shape[:2], mode="bilinear", align_corners=False,
    )
    return upsampled.argmax(dim=1)[0].cpu().numpy()


def _polygon_pixel_mask(mask_poly, shape) -> np.ndarray:
    """Masque booléen (H, W) plein cadre à partir d'un polygone de
    segmentation — permet de croiser directement avec la carte SegFormer
    par un simple ET logique, pixel à pixel."""
    mask = np.zeros(shape[:2], dtype=np.uint8)
    if mask_poly is not None and len(mask_poly) > 0:
        cv2.fillPoly(mask, [np.array(mask_poly, dtype=np.int32)], 255)
    return mask > 0


def _clothing_pixel_mask(det: dict, shape) -> np.ndarray:
    """Masque plein cadre d'une détection YOLO (vêtement) : son propre
    masque de segmentation s'il existe, sinon sa boîte englobante en
    secours (modèle sans tête de segmentation)."""
    if det["mask_poly"] is not None:
        return _polygon_pixel_mask(det["mask_poly"], shape)
    mask = np.zeros(shape[:2], dtype=np.uint8)
    x1, y1, x2, y2 = [max(0, int(v)) for v in det["box"]]
    mask[y1:y2, x1:x2] = 255
    return mask > 0


def classify_gender_body(processor, model, frame_bgr: np.ndarray, box) -> str | None:
    """Genre à partir du corps entier (NTQAI/pedestrian_gender_recognition,
    BEiT entraîné sur PETA) — marche même sans visage visible,
    contrairement au genre par visage (InsightFace genderage)."""
    x1, y1, x2, y2 = [max(0, int(v)) for v in box]
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return None

    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    inputs = processor(images=rgb, return_tensors="pt").to(DEVICE)
    with torch.no_grad():
        logits = model(**inputs).logits[0]
    probs = torch.softmax(logits, dim=-1)
    idx = int(torch.argmax(probs))
    if probs[idx] < GENDER_MIN_CONF:
        return None
    return {"Female": "female", "Male": "male"}[model.config.id2label[idx]]


def _cosine_similarity(a, b) -> float:
    a, b = np.array(a), np.array(b)
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


def _best_embedding_match(embedding, records: dict):
    best_id, best_sim = None, -1.0
    for face_id, rec in records.items():
        if "embedding" not in rec:
            continue  # entrée incomplète/corrompue, on l'ignore plutôt que de planter
        sim = _cosine_similarity(embedding, rec["embedding"])
        if sim > best_sim:
            best_sim, best_id = sim, face_id
    return best_id, best_sim


def _best_assisted_match(embedding, records: dict, position: tuple, diagonale_frame: float, now: float):
    """Fusion assistée par position/temps (voir REID_FUSION_*) : parmi les
    entrées encore RÉCENTES et PROCHES physiquement de `position`, celle
    dont la similarité d'apparence est la meilleure — à condition qu'elle
    dépasse REID_FUSION_SIM_MIN (bien plus bas que le seuil strict, mais
    pas n'importe quoi non plus)."""
    best_id, best_sim = None, -1.0
    for pid, rec in records.items():
        if "embedding" not in rec or "position" not in rec:
            continue
        if now - rec["last_seen"] > REID_FUSION_DELAI_MAX_S:
            continue
        px, py = rec["position"]
        dist = ((position[0] - px) ** 2 + (position[1] - py) ** 2) ** 0.5
        if dist / diagonale_frame > REID_FUSION_DISTANCE_MAX_FRACTION:
            continue
        sim = _cosine_similarity(embedding, rec["embedding"])
        if sim >= REID_FUSION_SIM_MIN and sim > best_sim:
            best_sim, best_id = sim, pid
    return best_id, best_sim


def identify_face(embedding: list, deja_pris: set | None = None) -> dict:
    """Reconnaît un visage à partir de son embedding : identité déjà
    confirmée, candidat en cours d'observation, ou tout nouveau visage.
    Jamais de nom — juste un identifiant stable et un statut.

    `deja_pris` : ids déjà attribués à un AUTRE visage sur cette même
    image — exclus du matching. `_assign_faces_to_people` garantit qu'un
    visage détecté n'est utilisé que par une seule personne, mais rien
    n'empêchait que DEUX visages différents de la même image matchent la
    même identité Firebase (même bug que identify_body, même correctif)."""
    now = time.time()
    deja_pris = deja_pris or set()

    registry = db.reference("faces/registry").get() or {}
    registry = {k: v for k, v in registry.items() if k not in deja_pris}
    face_id, sim = _best_embedding_match(embedding, registry)
    if face_id is not None and sim >= FACE_MATCH_THRESHOLD:
        db.reference(f"faces/registry/{face_id}/last_seen").set(now)
        return {"statut": "connu", "id": face_id, "similarite": round(sim, 3)}

    candidates = db.reference("faces/candidates").get() or {}
    candidates = {k: v for k, v in candidates.items() if k not in deja_pris}
    face_id, sim = _best_embedding_match(embedding, candidates)
    if face_id is not None and sim >= FACE_MATCH_THRESHOLD:
        rec = candidates[face_id]
        seen_count = rec["seen_count"] + 1

        if seen_count >= FACE_CONFIRM_THRESHOLD:
            db.reference(f"faces/candidates/{face_id}").delete()
            db.reference(f"faces/registry/{face_id}").set({
                "embedding": rec["embedding"],
                "first_seen": rec["first_seen"],
                "last_seen": now,
            })
            return {"statut": "vient_d_etre_confirme", "id": face_id}

        db.reference(f"faces/candidates/{face_id}").update({"seen_count": seen_count, "last_seen": now})
        return {"statut": "en_observation", "id": face_id, "vu": seen_count}

    # Suffixe aléatoire (pas juste l'horodatage) : analyser() calcule `now`
    # UNE fois pour toute l'image, donc deux visages nouveaux dans la même
    # image tomberaient sur le même id sans ça (collision constatée en
    # conditions réelles pour identify_body, même cause ici).
    new_id = f"visage_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
    db.reference(f"faces/candidates/{new_id}").set({
        "embedding": embedding, "seen_count": 1, "first_seen": now, "last_seen": now,
    })
    return {"statut": "en_observation", "id": new_id, "vu": 1}


def _maj_memoire(pid: str, genre_observes: list, items_observes: set, now: float) -> None:
    """Ajoute cette observation à la mémoire de la personne `pid` : un vote
    de genre par source disponible (visage + corps, voir analyser()), et un
    comptage par vêtement observé. Les vêtements pas revus depuis
    CLOTHING_MEMORY_EXPIRY_S sont oubliés avant d'ajouter les nouveaux
    (tenue changée, jour différent). Le genre, lui, est verrouillé dès la
    confirmation — voir le commentaire sur GENDER_MIN_VOTES."""
    expires = [p for p, mem in _memoire_personnes.items() if now - mem["last_seen"] > MEMOIRE_PERSONNE_EXPIRY_S]
    for p in expires:
        del _memoire_personnes[p]

    m = _memoire_personnes.setdefault(
        pid, {"genre_votes": {}, "genre_verrouille": None, "vetements": {}, "last_seen": now},
    )
    m["last_seen"] = now

    if m["genre_verrouille"] is None:
        for genre_observe in genre_observes:
            if not genre_observe:
                continue
            m["genre_votes"][genre_observe] = m["genre_votes"].get(genre_observe, 0) + 1
        if m["genre_votes"]:
            genre, n = max(m["genre_votes"].items(), key=lambda kv: kv[1])
            if n >= GENDER_MIN_VOTES:
                m["genre_verrouille"] = genre

    vet = m["vetements"]
    expires = [k for k, v in vet.items() if now - v["last_seen"] > CLOTHING_MEMORY_EXPIRY_S]
    for k in expires:
        del vet[k]
    for item in items_observes:
        if item in vet:
            vet[item]["count"] += 1
            vet[item]["last_seen"] = now
        else:
            vet[item] = {"count": 1, "last_seen": now}


def _genre_confirme(pid: str) -> str | None:
    return _memoire_personnes.get(pid, {}).get("genre_verrouille")


def _vetements_confirmes(pid: str) -> list:
    """Un seul (type, couleur) confirmé PAR TYPE — celui avec le plus
    d'observations. Sans ça, une couleur mal lue une poignée de fois
    (lumière changeante) pouvait atteindre son propre seuil de
    confirmation et s'afficher EN PLUS de la bonne couleur pour le même
    vêtement (bug constaté en conditions réelles : une même chemise
    affichée confirmée à la fois en rouge et en gris)."""
    vet = _memoire_personnes.get(pid, {}).get("vetements", {})
    meilleur_par_type = {}
    for (t, c), info in vet.items():
        if info["count"] < CLOTHING_CONFIRM_COUNT:
            continue
        if t not in meilleur_par_type or info["count"] > meilleur_par_type[t][1]:
            meilleur_par_type[t] = (c, info["count"])
    return [{"type": t, "couleur": c} for t, (c, _) in meilleur_par_type.items()]


# --- Persistance (voir etat_persistant.py) ---------------------------------
# Sûr à restaurer : indexé par `pid` (identité visage/corps), stable
# d'un redémarrage à l'autre. Seule subtilité : "vetements" a des clés
# TUPLE (type_fr, couleur_fr), pas JSON-safe telles quelles — converties
# en liste de [type, couleur, count, last_seen] à la sauvegarde, et
# reconstruites en tuples à la restauration.
def _etat_json() -> dict:
    data = {}
    for pid, m in _memoire_personnes.items():
        data[pid] = {
            "genre_votes": dict(m["genre_votes"]),
            "genre_verrouille": m["genre_verrouille"],
            "vetements": [
                [t, c, info["count"], info["last_seen"]]
                for (t, c), info in m["vetements"].items()
            ],
            "last_seen": m["last_seen"],
        }
    return data


def _charger_etat_json(data: dict) -> None:
    global _memoire_personnes
    _memoire_personnes = {}
    for pid, m in data.items():
        _memoire_personnes[pid] = {
            "genre_votes": dict(m.get("genre_votes", {})),
            "genre_verrouille": m.get("genre_verrouille"),
            "vetements": {
                (t, c): {"count": count, "last_seen": last_seen}
                for t, c, count, last_seen in m.get("vetements", [])
            },
            "last_seen": m["last_seen"],
        }


etat_persistant.enregistrer("on_voit_qui", _etat_json, _charger_etat_json)


def _body_embedding(reid_extractor, frame_bgr: np.ndarray, box) -> list | None:
    """Embedding d'apparence corporelle (OSNet, 512 dims) pour re-identifier
    une personne SANS visage — remplace l'ancienne comparaison manuelle de
    type/couleur de vêtements par un vrai modèle entraîné pour la
    ré-identification (MSMT17) : une couleur mal lue ou un vêtement
    manquant sur une frame ne casse plus la correspondance."""
    x1, y1, x2, y2 = [max(0, int(v)) for v in box]
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return None
    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    emb = reid_extractor(rgb).detach().cpu().numpy()[0]
    return [round(float(x), 6) for x in emb.tolist()]


def _resoudre_identite(pid: str) -> str:
    """Suit le pointeur "lie_a" (voir _lier_corps_a_visage) jusqu'à
    l'identité canonique — une identité "corps" reconnue entre-temps
    comme étant la MÊME personne qu'une identité "visage" (par une autre
    caméra, ou la même plus tard) renvoie désormais l'id visage, pas
    l'ancien id corps. Garde-fou anti-boucle (ne devrait jamais arriver
    en pratique, une chaîne fait toujours au plus 1 saut)."""
    vus = set()
    while pid not in vus:
        vus.add(pid)
        rec = db.reference(f"corps/registry/{pid}").get()
        if not rec or "lie_a" not in rec:
            return pid
        pid = rec["lie_a"]
    return pid  # boucle détectée (ne devrait jamais arriver), on s'arrête là plutôt que planter


def _lier_corps_a_visage(id_corps: str, id_visage: str, now: float) -> None:
    """"Union" entre caméras : marque `id_corps` (identité "corps" déjà
    connue — vue par une autre caméra, ou par celle-ci plus tôt, SANS
    visage) comme étant EN RÉALITÉ la même personne que `id_visage`
    (identité "visage", vue ICI avec son visage). Appelé depuis
    analyser() quand l'apparence corporelle de la personne dont on vient
    d'identifier le visage correspond fortement à une identité corps
    déjà enregistrée.

    Toute future reconnaissance par corps de cette personne, PAR
    N'IMPORTE QUELLE CAMÉRA (y compris celle qui ne voit jamais son
    visage), renverra désormais id_visage — voir _resoudre_identite,
    appelé par identify_body()."""
    if id_corps == id_visage:
        return
    db.reference(f"corps/registry/{id_corps}").update({"lie_a": id_visage, "lie_le": now})
    print(f"[on_voit_qui] union : corps {id_corps} relié à visage {id_visage}", flush=True)


def identify_body(
    embedding: list, position: tuple, diagonale_frame: float, now: float, deja_pris: set | None = None,
) -> dict:
    """Équivalent de identify_face() mais pour l'apparence corporelle
    (OSNet) — même principe candidat/confirmé par similarité cosinus,
    stocké dans Firebase (sous 'corps/registry' et 'corps/candidates')
    pour ne jamais oublier une identité, même sans visage jamais vu,
    même après un redémarrage du serveur.

    Si rien ne matche au seuil strict, une fusion assistée par
    position/temps est tentée avant de créer un nouvel id (voir
    REID_FUSION_* et _best_assisted_match) — corrige un vrai problème
    constaté en conditions réelles : une même personne en mouvement rapide
    (va-et-vient dans le cadre) retombe souvent sous le seuil strict d'un
    appel à l'autre, créant une nouvelle identité à chaque fois au lieu de
    rester reconnue.

    `deja_pris` : ids déjà attribués à une AUTRE personne sur cette même
    image — exclus du matching, sinon deux personnes différentes visibles
    dans le même appel peuvent matcher le même id (bug constaté en
    conditions réelles : contrairement aux visages, qui utilisent une
    vraie attribution 1-à-1, rien n'empêchait ça ici)."""
    deja_pris = deja_pris or set()

    # 1. Registre (identité déjà confirmée) : d'abord seuil strict, sinon
    # fusion assistée par position/temps.
    registry = db.reference("corps/registry").get() or {}
    registry = {k: v for k, v in registry.items() if k not in deja_pris}
    pid, sim = _best_embedding_match(embedding, registry)
    if pid is None or sim < REID_MATCH_THRESHOLD:
        pid, sim = _best_assisted_match(embedding, registry, position, diagonale_frame, now)

    if pid is not None:
        maj = {"last_seen": now, "position": list(position)}
        if sim >= REID_MAJ_APPARENCE_SEUIL:
            ancien = np.array(registry[pid]["embedding"])
            nouveau = np.array(embedding)
            fusion = (1 - REID_MAJ_APPARENCE_POIDS) * ancien + REID_MAJ_APPARENCE_POIDS * nouveau
            fusion = fusion / (np.linalg.norm(fusion) + 1e-8)
            maj["embedding"] = [round(float(x), 6) for x in fusion.tolist()]
        db.reference(f"corps/registry/{pid}").update(maj)
        # Union entre caméras (voir _lier_corps_a_visage) : si CET id
        # corps a depuis été relié à une identité visage (par une autre
        # caméra, ou celle-ci plus tôt), c'est cette identité canonique
        # qu'on renvoie — pas l'ancien id corps.
        pid_final = _resoudre_identite(pid)
        return {"statut": "connu", "id": pid_final, "similarite": round(sim, 3)}

    # 2. Candidats (pas encore confirmés) : idem, strict puis assisté.
    candidates = db.reference("corps/candidates").get() or {}
    candidates = {k: v for k, v in candidates.items() if k not in deja_pris}
    pid, sim = _best_embedding_match(embedding, candidates)
    if pid is None or sim < REID_MATCH_THRESHOLD:
        pid, sim = _best_assisted_match(embedding, candidates, position, diagonale_frame, now)

    if pid is not None:
        rec = candidates[pid]
        seen_count = rec["seen_count"] + 1

        if seen_count >= REID_CONFIRM_THRESHOLD:
            db.reference(f"corps/candidates/{pid}").delete()
            db.reference(f"corps/registry/{pid}").set({
                "embedding": rec["embedding"],
                "first_seen": rec["first_seen"],
                "last_seen": now,
                "position": list(position),
            })
            return {"statut": "vient_d_etre_confirme", "id": pid}

        db.reference(f"corps/candidates/{pid}").update({
            "seen_count": seen_count, "last_seen": now, "position": list(position),
        })
        return {"statut": "en_observation", "id": pid, "vu": seen_count}

    # Suffixe aléatoire, pas juste l'horodatage : analyser() calcule `now`
    # UNE fois pour toute l'image, donc deux personnes nouvelles (sans
    # visage) dans la MÊME image tombaient sur exactement le même id sans
    # ça — bug constaté en conditions réelles (deux profils différents
    # affichant le même "corps_..." dans le même appel).
    new_pid = f"corps_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
    db.reference(f"corps/candidates/{new_pid}").set({
        "embedding": embedding, "seen_count": 1, "first_seen": now, "last_seen": now, "position": list(position),
    })
    return {"statut": "en_observation", "id": new_pid, "vu": 1}


def analyser(id_camera: str, frame) -> dict:
    """Détecte les personnes, visages et vêtements sur CETTE image DE
    CETTE CAMÉRA, compare avec la mémoire accumulée depuis les appels
    précédents (par personne, identité globale — voir docstring du
    module), et écrit le résultat confirmé dans le rapport DE CETTE
    CAMÉRA (voir rapport_cam.py, clé "personnesVues")."""
    models = _get_models()
    now = time.time()
    diagonale_frame = (frame.shape[0] ** 2 + frame.shape[1] ** 2) ** 0.5

    # Cette caméra surveille-t-elle un point d'ENTRÉE du bâtiment ? (voir
    # ComportementsSupects/infiltre.py) — résolu une seule fois pour tout
    # l'appel, pas par personne (même caméra pour tout le monde ici).
    cam_info = _camera_registre.trouver_par_id(id_camera)
    est_camera_entree = bool(cam_info.get("est_entree")) if cam_info else False

    # Les objets généraux (vélo, sac, valise...) sont déjà détectés par
    # on_voit_quoi.py à chaque appel de /voir POUR CETTE MÊME CAMÉRA — on
    # récupère son dernier résultat plutôt que de refaire tourner un
    # modèle de plus ici. Récupéré TÔT (pas seulement en fin de fonction)
    # car rodeur.py s'en sert pour corréler rôdage + disparition d'un
    # objet proche (indice de vol).
    objets_actuels = rapport_cam.lire_etat(id_camera, "vueActuelle").get("objets", {})

    # Chronométrage temporaire (diagnostic de lenteur, voir discussion) —
    # à retirer une fois qu'on sait précisément où va le temps.
    _t0 = time.time()
    # Une SEULE passe du modèle au seuil le plus bas (CONF_RODEUR_ANONYME)
    # au lieu de deux passes séparées (une à CONF_PERSONNE, une à
    # CONF_RODEUR_ANONYME) — CONF_RODEUR_ANONYME est strictement plus
    # permissif, donc capture déjà tout ce que l'ancienne passe à
    # CONF_PERSONNE trouvait. Le tri entre "vraie personne" et "candidat
    # bas seuil" se fait ensuite en Python sur le score de chaque
    # détection, sans deuxième passage du modèle (~1s gagné par appel,
    # mesuré en conditions réelles). Voir plus bas pour candidats_bas_seuil.
    tous_candidats_personnes = _run_seg(models["person_seg"], frame, CONF_RODEUR_ANONYME)
    personnes = [d for d in tous_candidats_personnes if d["score"] >= CONF_PERSONNE]
    print(f"[chrono] person_seg (passe unique) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    vetements = _run_seg(models["clothing"], frame, CONF_VETEMENT)
    print(f"[chrono] clothing (YOLO-seg) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    carte_vetements = _segment_clothing(models["clothing_processor"], models["clothing_model"], frame)
    print(f"[chrono] segformer (vetements) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    faces = detect_faces(models["face"], frame)
    print(f"[chrono] insightface (visages) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    print(f"[on_voit_qui] {len(personnes)} personne(s), {len(vetements)} vêtement(s) YOLO, "
          f"{len(faces)} visage(s)", flush=True)

    centroides_personnes = [p["centroid"] for p in personnes]
    face_centroids = [_box_centroid(f["box"]) for f in faces]
    assignation_visages = _assign_faces_to_people(centroides_personnes, face_centroids)

    # Squelettes (posture/activité, voir qui_fait_quoi.py) — même principe
    # d'attribution 1-à-1 par proximité que les visages, réutilise la même
    # fonction (générique malgré son nom).
    poses = _run_pose(models["pose"], frame, CONF_POSE)
    print(f"[chrono] pose (squelette) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    pose_centroids = [p["centroid"] for p in poses]
    assignation_poses = _assign_faces_to_people(centroides_personnes, pose_centroids)

    # Zones suspectes ANONYMES (voir CONF_RODEUR_ANONYME plus haut) : une
    # deuxième passe à seuil bas, uniquement pour repérer une présence
    # prolongée là où personne n'a atteint le seuil de confiance d'une
    # identité complète. On ignore les détections qui correspondent déjà
    # à une "vraie" personne (évite le double suivi de la même personne),
    # et on exige la corroboration du modèle général avant de compter
    # l'observation (voir _corrobore_par_modele_general — sans ça, un
    # objet statique confondu avec une personne par le seul modèle
    # spécialisé peut se faire confirmer "rôdeur" à tort, constaté en
    # conditions réelles).
    zones_suspectes = []
    # Déjà calculé plus haut (une seule passe du modèle, voir
    # tous_candidats_personnes) — pas de deuxième appel au modèle ici.
    candidats_bas_seuil = tous_candidats_personnes
    seuil_dedoublonnage = RODEUR_ANONYME_DEDOUBLONNAGE_FRACTION * diagonale_frame
    for candidat in candidats_bas_seuil:
        deja_couvert = any(
            _distance(candidat["centroid"], c) <= seuil_dedoublonnage for c in centroides_personnes
        )
        if deja_couvert:
            continue
        if not _corrobore_par_modele_general(id_camera, frame, candidat["centroid"], diagonale_frame):
            continue
        zone_id = rodeur.assigner_zone_anonyme(id_camera, candidat["centroid"], diagonale_frame, now)
        rodeur.observer_position(id_camera, zone_id, candidat["centroid"], now)
        evaluation = rodeur.evalue_rodeur(id_camera, zone_id, now, diagonale_frame)
        if evaluation["rodeur"]:
            rodeur.observer_objets_proches(id_camera, zone_id, candidat["centroid"], objets_actuels, diagonale_frame, now)
            disparitions = rodeur.evalue_disparition_objet(id_camera, zone_id, objets_actuels, now)
            if disparitions:
                evaluation["objets_disparus"] = disparitions
            zones_suspectes.append({"zone_id": zone_id, "position": candidat["centroid"], **evaluation})

    # Masque plein cadre de chaque personne, calculé une seule fois — sert
    # à attribuer aussi bien les vêtements YOLO que les accessoires
    # SegFormer par recouvrement de pixels réel (pas par centroïde).
    masques_personnes = [
        _polygon_pixel_mask(p["mask_poly"], frame.shape) if p["mask_poly"] is not None else None
        for p in personnes
    ]

    # Vêtements PRINCIPAUX (YOLO/DeepFashion2, types fins) : chaque
    # instance détectée est attribuée à la personne dont le masque
    # recouvre le plus de pixels du sien — pas juste son centre, pour ne
    # pas se tromper quand deux personnes sont proches.
    items_par_personne = {i: set() for i in range(len(personnes))}
    for v in vetements:
        pixels_vetement = _clothing_pixel_mask(v, frame.shape)
        meilleur_i, meilleur_overlap = None, 0
        for i, masque_p in enumerate(masques_personnes):
            if masque_p is None:
                continue
            overlap = int((pixels_vetement & masque_p).sum())
            if overlap > meilleur_overlap:
                meilleur_overlap, meilleur_i = overlap, i
        if meilleur_i is None or meilleur_overlap < CLOTHING_MIN_PIXELS:
            continue
        couleur = dominant_color(frame[pixels_vetement & masques_personnes[meilleur_i]])
        items_par_personne[meilleur_i].add((CLOTHING_FR.get(v["label"], v["label"]), COLOR_FR.get(couleur, couleur)))

    # Accessoires que DeepFashion2 ne connaît pas du tout (chapeau,
    # lunettes, ceinture, chaussures, sac, écharpe) : SegFormer segmente
    # toute l'image pixel par pixel, on croise avec le masque de chaque
    # personne.
    for i, masque_p in enumerate(masques_personnes):
        if masque_p is None:
            continue
        for classe_id, nom_fr in SEGFORMER_ACCESSOIRES_FR.items():
            pixels_classe = masque_p & (carte_vetements == classe_id)
            if pixels_classe.sum() < CLOTHING_MIN_PIXELS:
                continue
            couleur = dominant_color(frame[pixels_classe])
            items_par_personne[i].add((nom_fr, COLOR_FR.get(couleur, couleur)))

    print(f"[chrono] attribution vetements/accessoires (pixels) : {time.time() - _t0:.2f}s", flush=True); _t0 = time.time()
    _t_boucle = time.time()
    profils = []
    ids_corps_pris_cette_image = set()  # évite que 2 personnes différentes de CETTE image matchent le même id (voir identify_body)
    ids_visages_pris_cette_image = set()  # même protection côté visage (voir identify_face)
    for i, personne in enumerate(personnes):
        face_idx = assignation_visages.get(i)
        face = faces[face_idx] if face_idx is not None else None
        pose_idx = assignation_poses.get(i)
        keypoints = poses[pose_idx]["keypoints"] if pose_idx is not None else None

        # Genre : deux sources indépendantes, fusionnées comme deux votes
        # dans la même mémoire (voir _maj_memoire) — visage (InsightFace,
        # si un visage est visible) et corps entier (marche toujours,
        # avec ou sans visage).
        genre_observes = [classify_gender_body(
            models["gender_body_processor"], models["gender_body_model"], frame, personne["box"],
        )]
        if face is not None:
            genre_observes.append(face["genre"])

        # Vêtements + accessoires de cette personne précise, déjà
        # attribués par recouvrement de pixels (YOLO + SegFormer, voir
        # plus haut).
        items_observes = items_par_personne.get(i, set())

        # Identité stable par visage (résiste à une sortie du champ,
        # contrairement au track_id qui repose sur la continuité de
        # mouvement) — pas de nom pour l'instant. Sans visage, on retrouve
        # la même personne par son apparence corporelle (OSNet, voir
        # identify_body), pas le track_id fragile du tracker de silhouette.
        if face is not None:
            try:
                identite = identify_face(face["embedding"], deja_pris=ids_visages_pris_cette_image)
                if identite["id"] is not None:
                    ids_visages_pris_cette_image.add(identite["id"])
            except Exception as exc:
                print(f"[on_voit_qui] Firebase indisponible pour l'identité : {exc}", flush=True)
                identite = {"statut": "identification_indisponible", "id": None}
        else:
            embedding_corps = _body_embedding(models["reid"], frame, personne["box"])
            if embedding_corps is not None:
                try:
                    identite = identify_body(
                        embedding_corps, personne["centroid"], diagonale_frame, now,
                        deja_pris=ids_corps_pris_cette_image,
                    )
                    if identite["id"] is not None:
                        ids_corps_pris_cette_image.add(identite["id"])
                except Exception as exc:
                    print(f"[on_voit_qui] Firebase indisponible pour l'identité corps : {exc}", flush=True)
                    identite = {"statut": "identification_indisponible", "id": None}
            else:
                identite = {"statut": "sans_visage", "id": None}
        pid = identite["id"]

        # Union entre caméras (voir _lier_corps_a_visage) : cette
        # personne vient d'être identifiée PAR SON VISAGE ici — si son
        # APPARENCE CORPORELLE correspond fortement à une identité
        # "corps" déjà connue (par exemple vue par une AUTRE caméra qui
        # n'avait pas vu son visage : "je vois un homme habillé en noir"
        # sans visage, puis une autre caméra voit son visage et reconnaît
        # la même tenue), on relie les deux — la caméra qui ne voyait que
        # le corps profite immédiatement de l'identité complète pour
        # toutes ses prochaines détections. Coût assumé : un calcul
        # d'embedding OSNet EN PLUS par personne AVEC visage (déjà fait
        # systématiquement pour celles SANS visage) — nécessaire, pas de
        # façon de vérifier la correspondance sans le calculer.
        if pid is not None and face is not None:
            embedding_corps = _body_embedding(models["reid"], frame, personne["box"])
            if embedding_corps is not None:
                registre_corps = db.reference("corps/registry").get() or {}
                id_corps_correspondant, sim_corps = _best_embedding_match(embedding_corps, registre_corps)
                if (
                    id_corps_correspondant is not None
                    and sim_corps >= REID_MATCH_THRESHOLD
                    and _resoudre_identite(id_corps_correspondant) != pid
                ):
                    _lier_corps_a_visage(id_corps_correspondant, pid, now)

        if pid is not None:
            _maj_memoire(pid, genre_observes, items_observes, now)
            genre = _genre_confirme(pid)
            items_confirmes = _vetements_confirmes(pid)
        else:
            genre, items_confirmes = None, []

        comptes = {}
        for it in items_confirmes:
            comptes[it["type"]] = comptes.get(it["type"], 0) + 1

        # Posture/activité de cette personne précise (squelette + objets
        # proches, voir qui_fait_quoi.py) : jugée par géométrie réelle
        # (angle du torse, flexion des genoux, position des poignets),
        # confirmée après plusieurs votes cohérents.
        if pid is not None:
            qui_fait_quoi.observer(id_camera, pid, keypoints, personne["centroid"], objets_actuels, diagonale_frame, now)
            action = qui_fait_quoi.action_de(id_camera, pid, now)

            # Comportement (voir ComportementsSupects/rodeur.py) : deux
            # signaux indépendants, chacun sur sa propre mémoire par
            # personne PAR CAMÉRA — position ("reste dans la même zone
            # longtemps") et orientation de tête ("scanne les alentours",
            # visage seulement).
            rodeur.observer_position(id_camera, pid, personne["centroid"], now)
            assis = qui_fait_quoi.est_assis(id_camera, pid)
            comportement = {"rodeur": rodeur.evalue_rodeur(id_camera, pid, now, diagonale_frame, assis=assis)}

            # Corrélation avec un objet qui disparaît (indice de vol,
            # voir rodeur.py) : seulement pertinent si un rôdage est en
            # cours — pas la peine de suivre les objets proches d'une
            # personne qui ne fait que passer.
            if comportement["rodeur"]["rodeur"]:
                rodeur.observer_objets_proches(id_camera, pid, personne["centroid"], objets_actuels, diagonale_frame, now)
                disparitions = rodeur.evalue_disparition_objet(id_camera, pid, objets_actuels, now)
                if disparitions:
                    comportement["objets_disparus"] = disparitions

            if face is not None and face["yaw"] is not None:
                rodeur.observer_orientation(id_camera, pid, face["yaw"], now)
                comportement["regarde_autour"] = rodeur.evalue_regard(id_camera, pid, now)
            else:
                comportement["regarde_autour"] = {"scanne": False, "statut": "pas_de_visage"}

            # Profil croisé entre caméras (voir profil_suspect.py) :
            # cette personne a-t-elle déjà été signalée suspecte par une
            # AUTRE caméra récemment ? Permet de dire "déjà vu(e) rôder à
            # l'entrée il y a 40s" même si SON comportement sur CETTE
            # caméra, à l'instant, semble normal — les caméras s'associent
            # pour décrire/confirmer le profil d'une même personne au
            # lieu de juger chacune dans l'isolement total.
            deja_ailleurs = profil_suspect.deja_suspect_ailleurs(pid, id_camera)
            if deja_ailleurs is not None:
                comportement["deja_suspect_ailleurs"] = deja_ailleurs

            # Infiltration (voir ComportementsSupects/infiltre.py) :
            # cette personne est-elle découverte à l'intérieur sans avoir
            # jamais été vue passer par une entrée surveillée ?
            comportement["infiltration"] = infiltre.evaluer(id_camera, pid, est_camera_entree, now)
        else:
            action = {"posture": {"position": None, "activite": None, "statut": "pas_d_id"}}
            comportement = {
                "rodeur": {"rodeur": False, "statut": "pas_d_id"},
                "regarde_autour": {"scanne": False, "statut": "pas_d_id"},
            }

        # Zone interdite (voir zoneCam/detectionEnZone.py) : contrairement
        # au reste de `comportement`, calculé MÊME sans identité (pid=None)
        # — la présence physique au mauvais endroit compte, pas qui est la
        # personne (une personne pas encore identifiée reste suivie par
        # zone anonyme, voir rodeur.assigner_zone_anonyme dans ce module).
        comportement["intrusion_zone"] = detectionEnZone.evaluer(
            id_camera, pid, personne["box"], personne["centroid"], diagonale_frame, frame.shape, now,
        )

        profils.append({
            "id": pid,
            "statut": identite["statut"],
            "visage_detecte": face is not None,
            "genre": GENDER_FR.get(genre),
            "vetements": items_confirmes,
            "nombre_vetements": comptes,
            "action": action,
            "comportement": comportement,
        })

    print(f"[chrono] boucle par personne (genre corps + reid + posture/rodeur, {len(personnes)} personne(s)) : {time.time() - _t_boucle:.2f}s", flush=True)

    resultat = {
        "id_camera": id_camera,
        "personnes": profils,
        "objets": objets_actuels,
        "nombre_personnes": len(profils),
        "zones_suspectes": zones_suspectes,
        "updated_at": now,
    }

    rapport_cam.enregistrer_etat(id_camera, "personnesVues", resultat)
    print(f"[on_voit_qui] caméra {id_camera} — rapport écrit (db/rapportCam/{id_camera}/etat.json)", flush=True)
    return resultat
