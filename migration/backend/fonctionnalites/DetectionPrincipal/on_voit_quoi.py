"""PLUSIEURS caméras, un seul type de modèle : YOLO11 xlarge (variante
segmentation), le plus précis des trois tailles disponibles. Décrit ce
que CHAQUE caméra voit (objets + nombre de personnes), et suit chaque
instance individuellement PAR CAMÉRA (depuis quand elle est visible sur
CETTE caméra), pas juste un total par type d'objet.

Architecture multi-caméra : chaque caméra a son propre modèle chargé
(voir _models, dict indexé par id_camera) et sa propre mémoire de suivi
(voir _track_state/_track_perdus). Ce n'est PAS une optimisation
cosmétique : le tracker interne du modèle (ByteTrack, via
model.track(persist=True)) construit sa continuité d'un appel à l'autre
en supposant qu'il reçoit toujours des images de LA MÊME source vidéo —
si on lui envoyait en alternance des images de deux caméras différentes
sur le MÊME modèle, il essaierait de "suivre le mouvement" entre deux
scènes physiquement sans rapport, ce qui casserait le suivi même DANS une
seule caméra (mauvaise ré-association, ID qui changent sans raison).
Coût assumé : autant de modèles chargés en mémoire que de caméras
actives.

Une image par appel — la vérification ne vient pas d'un lot envoyé d'un
coup, mais d'une VRAIE mémoire qui persiste entre des appels séparés dans
le temps : un objet n'est marqué "confirmé" qu'après avoir été suivi en
continu pendant plusieurs secondes (donc revu sur plusieurs appels
successifs de LA MÊME caméra), pas sur la foi d'une seule image isolée.

Les objets portables (sac à dos, sac à main, valise) sont aussi croisés
avec la position des personnes de la même image pour détecter un objet
potentiellement ABANDONNÉ — voir ComportementsSupects/abandonne.py.

Un modèle spécialisé séparé tourne aussi sur chaque image pour repérer un
départ de FEU ou de la FUMÉE anormale — voir ComportementsSupects/feu_fume.py.

Le résultat de chaque caméra est écrit dans son propre rapport (voir
fonctionnalites/Infrastructure/rapport_cam.py, migration/db/rapportCam/<id_camera>/),
jamais dans un état global partagé entre caméras."""
import time
from pathlib import Path

import numpy as np
from fonctionnalites.Infrastructure import rapport_cam
from ultralytics import YOLO

from fonctionnalites.ComportementsSupects import abandonne, feu_fume

MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models"

COCO_FR = {
    "bicycle": "vélo", "car": "voiture", "motorcycle": "moto", "airplane": "avion",
    "bus": "bus", "train": "train", "truck": "camion", "boat": "bateau",
    "traffic light": "feu de circulation", "fire hydrant": "bouche d'incendie",
    "stop sign": "panneau stop", "parking meter": "parcmètre", "bench": "banc",
    "bird": "oiseau", "cat": "chat", "dog": "chien", "horse": "cheval",
    "sheep": "mouton", "cow": "vache", "elephant": "éléphant", "bear": "ours",
    "zebra": "zèbre", "giraffe": "girafe", "backpack": "sac à dos",
    "umbrella": "parapluie", "handbag": "sac à main", "tie": "cravate",
    "suitcase": "valise", "frisbee": "frisbee", "skis": "skis",
    "snowboard": "snowboard", "sports ball": "ballon de sport", "kite": "cerf-volant",
    "baseball bat": "batte de baseball", "baseball glove": "gant de baseball",
    "skateboard": "skateboard", "surfboard": "planche de surf",
    "tennis racket": "raquette de tennis", "bottle": "bouteille",
    "wine glass": "verre à vin", "cup": "tasse", "fork": "fourchette",
    "knife": "couteau", "spoon": "cuillère", "bowl": "bol", "banana": "banane",
    "apple": "pomme", "sandwich": "sandwich", "orange": "orange",
    "broccoli": "brocoli", "carrot": "carotte", "hot dog": "hot-dog",
    "pizza": "pizza", "donut": "donut", "cake": "gâteau", "chair": "chaise",
    "couch": "canapé", "potted plant": "plante en pot", "bed": "lit",
    "dining table": "table à manger", "toilet": "toilettes", "tv": "télé",
    "laptop": "ordinateur portable", "mouse": "souris", "remote": "télécommande",
    "keyboard": "clavier", "cell phone": "téléphone portable",
    "microwave": "micro-ondes", "oven": "four", "toaster": "grille-pain",
    "sink": "évier", "refrigerator": "réfrigérateur", "book": "livre",
    "clock": "horloge", "vase": "vase", "scissors": "ciseaux",
    "teddy bear": "ours en peluche", "hair drier": "sèche-cheveux",
    "toothbrush": "brosse à dents",
}

CONF = 0.5

# Si une instance suivie n'est plus revue pendant ce délai, ByteTrack lui-
# même l'a perdue (son propre buffer interne l'oublie) : elle passe dans
# _track_perdus, récupérable encore un moment (voir TRACK_FUSION_*) avant
# d'être vraiment oubliée.
TRACK_EXPIRY_S = 5.0

# Un objet n'est marqué "confirmé" qu'après avoir été suivi en continu
# pendant ce délai — donc revu sur plusieurs appels séparés dans le temps,
# pas juste apparu sur la dernière image envoyée.
CONFIRME_APRES_S = 3.0

# Re-liaison après perte de suivi : si un NOUVEAU track_id apparaît, de la
# MÊME classe et physiquement très proche (les objets suivis pour
# l'abandon sont typiquement immobiles) d'un objet récemment perdu SUR LA
# MÊME CAMÉRA, on considère que c'est probablement le même objet et on
# reprend sa mémoire (depuis quand il est là, depuis quand personne n'est
# proche) au lieu de repartir de zéro. Corrige un vrai problème : sans
# ça, une occlusion brève (quelqu'un passe devant) suffisait à faire
# perdre toute la mémoire d'un objet, y compris son statut d'abandon.
TRACK_FUSION_DELAI_MAX_S = 20.0
TRACK_FUSION_DISTANCE_FRACTION = 0.05

# Tout ce qui suit est indexé par id_camera EN PREMIER — voir docstring
# du module.
_models: dict[str, YOLO] = {}
# id_camera -> {track_id -> {"label", "first_seen", "last_seen", "centroid"}}.
# Permet de savoir depuis quand CHAQUE instance précise est visible SUR
# CETTE CAMÉRA, pas juste combien il y en a.
_track_state: dict[str, dict] = {}
# id_camera -> {track_id -> même structure + "perdu_a": float} — objets
# récemment sortis de _track_state, encore récupérables par re-liaison
# position/classe, PARMI LES OBJETS DE LA MÊME CAMÉRA seulement.
_track_perdus: dict[str, dict] = {}


def _get_model(id_camera: str) -> YOLO:
    if id_camera not in _models:
        print(f"[on_voit_quoi] chargement du modèle xlarge (segmentation) pour la caméra {id_camera}...", flush=True)
        # Variante -seg (masques de segmentation), pas juste détection —
        # même classes/précision (80 classes COCO, mesuré identique),
        # +0.18s/image mesuré (0.30s -> 0.48s), négligeable comparé aux
        # ~8s du pipeline /qui. Sert à donner aux objets suivis ici
        # (vélo, sac, valise...) un centre de MASQUE plutôt que de boîte
        # englobante pour les calculs de proximité (rôdeur/abandon/vol).
        _models[id_camera] = YOLO(MODELS_DIR / "yolo11x-seg.pt")
        print(f"[on_voit_quoi] modèle prêt (caméra {id_camera})", flush=True)
    return _models[id_camera]


def _box_centroid(box) -> tuple:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _centroid_instance(result, i: int, box) -> tuple:
    """Centre du masque de segmentation de cette détection si disponible
    (plus stable/précis qu'un centre de boîte englobante pour un objet vu
    de biais — même choix déjà fait pour les personnes, voir _run_seg
    dans on_voit_qui.py), sinon centre de la boîte englobante en secours
    (masque absent pour cette détection précise, ou modèle sans tête de
    segmentation)."""
    if result.masks is not None:
        poly = result.masks.xy[i]
        if len(poly) > 0:
            return (float(np.mean(poly[:, 0])), float(np.mean(poly[:, 1])))
    return _box_centroid(box.xyxy[0].tolist())


def _trouver_objet_perdu(id_camera: str, label: str, centroid: tuple, diagonale_frame: float) -> int | None:
    """Cherche, parmi les objets récemment perdus PAR CETTE CAMÉRA, celui
    de la MÊME classe le plus proche de `centroid` — pour re-lier un
    nouveau track_id à son historique au lieu de repartir de zéro."""
    seuil = TRACK_FUSION_DISTANCE_FRACTION * diagonale_frame
    meilleur_id, meilleure_distance = None, seuil
    for tid, info in _track_perdus.get(id_camera, {}).items():
        if info["label"] != label:
            continue
        d = ((centroid[0] - info["centroid"][0]) ** 2 + (centroid[1] - info["centroid"][1]) ** 2) ** 0.5
        if d <= meilleure_distance:
            meilleure_distance, meilleur_id = d, tid
    return meilleur_id


def _suivre_instances(id_camera: str, result, now: float, diagonale_frame: float) -> dict:
    """Met à jour l'état de suivi DE CETTE CAMÉRA à partir d'un résultat
    de tracking (model.track(persist=True)) et renvoie
    {track_id: {"label", "centroid"}} pour les instances vues À CET appel
    précis.

    Limite honnête, partiellement corrigée : ce suivi repose sur la
    continuité de mouvement d'un appel à l'autre (ByteTrack), pas sur une
    vraie ré-identification par apparence. Deux objets identiques (même
    couleur, même forme) restent distingués tant qu'ils sont chacun
    trackés en continu — mais si le tracker perd un objet (occlusion
    brève, sort du champ) puis le retrouve, un NOUVEAU track_id est
    normalement assigné. Pour limiter ça : un objet perdu depuis moins de
    TRACK_FUSION_DELAI_MAX_S est gardé en mémoire (_track_perdus), et
    réassocié au nouveau track_id s'il réapparaît de la même classe tout
    près de sa dernière position connue (voir _trouver_objet_perdu) — les
    objets suivis pour l'abandon sont typiquement immobiles, donc une vraie
    réapparition au même endroit est un signal fiable. Ça ne couvre pas
    deux objets identiques qui se croisent/s'occultent, où l'identité peut
    toujours se mélanger.

    Important : la purge doit se faire AVANT de traiter les détections de
    cet appel — sinon un objet qui revient après une longue absence, mais
    auquel le tracker réattribue le même track_id, se voit rafraîchir son
    "last_seen" avant d'avoir été purgé, et sa durée ne repart jamais à
    zéro alors qu'elle aurait dû (bug constaté et corrigé)."""
    track_state_camera = _track_state.setdefault(id_camera, {})
    track_perdus_camera = _track_perdus.setdefault(id_camera, {})

    expires_perdus = [tid for tid, info in track_perdus_camera.items() if now - info["perdu_a"] > TRACK_FUSION_DELAI_MAX_S]
    for tid in expires_perdus:
        del track_perdus_camera[tid]

    expires = [tid for tid, info in track_state_camera.items() if now - info["last_seen"] > TRACK_EXPIRY_S]
    for tid in expires:
        info = track_state_camera.pop(tid)
        info["perdu_a"] = now
        track_perdus_camera[tid] = info

    vus_maintenant = {}
    for i, box in enumerate(result.boxes):
        if box.id is None:
            continue  # le tracker n'a pas pu assigner d'identité cet appel
        track_id = int(box.id[0])
        label = result.names[int(box.cls[0])]
        centroid = _centroid_instance(result, i, box)

        if track_id not in track_state_camera:
            candidat = _trouver_objet_perdu(id_camera, label, centroid, diagonale_frame)
            if candidat is not None:
                track_state_camera[track_id] = track_perdus_camera.pop(candidat)
                track_state_camera[track_id].pop("perdu_a", None)

        if track_id in track_state_camera:
            track_state_camera[track_id]["last_seen"] = now
            track_state_camera[track_id]["centroid"] = centroid
        else:
            track_state_camera[track_id] = {"label": label, "first_seen": now, "last_seen": now, "centroid": centroid}
        vus_maintenant[track_id] = {"label": label, "centroid": centroid}

    return vus_maintenant


def analyser(id_camera: str, frame) -> dict:
    """Détecte + suit avec le modèle xlarge DE CETTE CAMÉRA sur CETTE
    image, compare avec la mémoire accumulée depuis les appels précédents
    DE CETTE MÊME CAMÉRA, et écrit le résultat dans son propre rapport
    (voir rapport_cam.py) — jamais dans un état partagé entre caméras."""
    model = _get_model(id_camera)
    now = time.time()
    diagonale_frame = (frame.shape[0] ** 2 + frame.shape[1] ** 2) ** 0.5

    result = model.track(frame, persist=True, conf=CONF, verbose=False)[0]
    instances = _suivre_instances(id_camera, result, now, diagonale_frame)
    track_state_camera = _track_state[id_camera]
    labels = [result.names[int(box.cls[0])] for box in result.boxes]
    print(f"[on_voit_quoi] caméra {id_camera} — xlarge voit : {labels}", flush=True)

    # Positions des personnes de CET appel — sert à savoir si un objet
    # portable (sac, valise...) a quelqu'un à proximité ou non (voir
    # ComportementsSupects/abandonne.py).
    personnes_centroides = [i["centroid"] for i in instances.values() if i["label"] == "person"]

    instances_par_label = {}
    for track_id, info in instances.items():
        label = info["label"]
        if label == "person":
            continue
        depuis = now - track_state_camera[track_id]["first_seen"]
        nom_fr = COCO_FR.get(label, label)

        abandonne.observer(id_camera, track_id, nom_fr, info["centroid"], personnes_centroides, diagonale_frame, now)

        instances_par_label.setdefault(label, []).append({
            "id": track_id,
            "depuis_secondes": round(depuis, 1),
            "confirme": depuis >= CONFIRME_APRES_S,
            "abandonne": abandonne.evalue(id_camera, track_id, now),
            "position": info["centroid"],  # sert à ComportementsSupects/rodeur.py pour corréler rôdage + disparition d'objet
        })

    objets = {}
    for label in set(labels) - {"person"}:
        nom_fr = COCO_FR.get(label, label)
        instances_du_label = sorted(instances_par_label.get(label, []), key=lambda i: i["id"])
        objets[nom_fr] = {
            "nombre": labels.count(label),
            "instances": instances_du_label,
        }

    # Feu / fumée (voir ComportementsSupects/feu_fume.py) : modèle
    # spécialisé à part, tourne sur la même image de CETTE caméra,
    # indépendant du suivi d'objets ci-dessus.
    alertes_feu_fumee = feu_fume.analyser(id_camera, frame, diagonale_frame, now)

    resultat = {
        "id_camera": id_camera,
        "objets": dict(sorted(objets.items())),
        "nombre_personnes": labels.count("person"),
        "alertes_feu_fumee": alertes_feu_fumee,
        "updated_at": now,
    }

    rapport_cam.enregistrer_etat(id_camera, "vueActuelle", resultat)
    print(f"[on_voit_quoi] caméra {id_camera} — rapport écrit (db/rapportCam/{id_camera}/etat.json)", flush=True)
    return resultat
