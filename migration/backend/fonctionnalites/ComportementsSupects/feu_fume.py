"""Détecte un départ de FEU ou de la FUMÉE anormale dans le champ de la
caméra — modèle spécialisé (fire-yolo11s.pt, 2 classes : Fire, Smoke),
totalement indépendant du modèle général (yolo11x) qui ne connaît pas ces
classes-là.

Architecture multi-caméra : CHAQUE caméra a son propre modèle chargé
(voir _models, dict indexé par id_camera) et ses propres foyers suivis
(voir _foyers) — un feu détecté par la caméra A ne doit jamais "compter"
comme une observation de plus pour un foyer suivi par la caméra B, sinon
une caméra pourrait faire confirmer une alerte à la place d'une autre.
Coût assumé : autant de modèles chargés en mémoire que de caméras
actives (le modèle fire-yolo11s est petit, ~10 Mo, contrairement à
yolo11x — voir on_voit_quoi.py où le même choix coûte bien plus cher).

Contrainte différente du reste du projet : ici la vitesse prime sur la
prudence — un feu qui se propage se compte en secondes, pas en minutes
(contrairement à un rôdeur ou un objet abandonné, où on peut se permettre
d'attendre pour être sûr). On garde quand même une confirmation sur
PLUSIEURS appels (pas une seule image) pour filtrer un flash isolé
(reflet, phare de voiture, lumière orangée passagère) — mais il suffit de
le revoir une deuxième fois pour confirmer, pas d'attendre une longue
fenêtre.

Suivi : ce modèle ne fait pas de tracking (pas de track_id persistant,
une détection brute par appel) — donc, comme pour les zones anonymes de
rodeur.py, on regroupe les détections par proximité de position d'un
appel à l'autre en un "foyer" (foyer_id), qui persiste tant que quelque
chose est encore détecté au même endroit DE LA MÊME CAMÉRA. Un foyer non
revu depuis FOYER_EXPIRY_S est considéré éteint/dissipé — et comme cette
purge tourne AVANT de traiter les détections du tour, une réapparition
après ce délai récrée un foyer neuf (donc redemande une confirmation) :
ça sert aussi de fenêtre de confirmation implicite, pas besoin d'une
constante séparée.

Signal de propagation : si la surface détectée grandit nettement depuis
la première confirmation, le feu (ou la fumée) s'étend — escalade en
"propagation", remontée séparément de "confirme" simple."""
import uuid
from pathlib import Path

from fonctionnalites.Alertes import alertes as alertes_module
from fonctionnalites.Infrastructure import rapport_cam
from ultralytics import YOLO

MODELS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "models"

LABEL_FR = {"Fire": "feu", "Smoke": "fumée"}

# Seuil bas par rapport aux autres modèles du projet, assumé : mieux vaut
# une détection en trop (filtrée par la confirmation multi-appels
# ci-dessous) qu'un vrai départ de feu raté parce que le seuil était trop
# strict.
CONF_DETECTION = 0.35

# Un même foyer (feu ou fumée) est reconnu d'un appel à l'autre par
# proximité de position — pas de track_id fourni par ce modèle.
FUSION_DISTANCE_FRACTION = 0.10

# Confirmation RAPIDE (contrairement à rodeur/abandonne) : il suffit de
# revoir le même foyer une deuxième fois pour le confirmer — assez pour
# filtrer un flash d'une seule image, pas pour retarder une vraie alerte.
CONFIRMATION_OBSERVATIONS_MIN = 2

# Si plus rien n'est détecté à cet endroit depuis ce délai, le foyer est
# considéré éteint/dissipé (et sert aussi de fenêtre de confirmation
# implicite, voir docstring).
FOYER_EXPIRY_S = 30.0

# Croissance de la surface détectée depuis la première confirmation qui
# indique une propagation active (pas juste du bruit de bounding box).
PROPAGATION_CROISSANCE_SEUIL = 1.6

# Tout ce qui suit est indexé par id_camera EN PREMIER — voir docstring
# du module.
_models: dict[str, YOLO] = {}
# id_camera -> {foyer_id -> {"labels", "first_seen", "last_seen",
#               "centroid", "observations", "surface_confirmee",
#               "surface_derniere", "confirme"}}
_foyers: dict[str, dict] = {}
_dernier_statut: dict[str, dict] = {}  # id_camera -> {foyer_id -> statut string}


def _get_model(id_camera: str) -> YOLO:
    if id_camera not in _models:
        print(f"[feu_fume] chargement du modèle feu/fumée pour la caméra {id_camera}...", flush=True)
        _models[id_camera] = YOLO(MODELS_DIR / "fire-yolo11s.pt")
        print(f"[feu_fume] modèle prêt (caméra {id_camera})", flush=True)
    return _models[id_camera]


def _box_centroid(box) -> tuple:
    x1, y1, x2, y2 = box
    return ((x1 + x2) / 2, (y1 + y2) / 2)


def _box_surface(box) -> float:
    x1, y1, x2, y2 = box
    return max(0.0, x2 - x1) * max(0.0, y2 - y1)


def _trouver_foyer(id_camera: str, centroid: tuple, diagonale_frame: float) -> str | None:
    """Foyer déjà suivi le plus proche de `centroid` PARMI CEUX DE CETTE
    CAMÉRA, sous le seuil de fusion — les foyers expirés ont déjà été
    purgés avant l'appel."""
    seuil = FUSION_DISTANCE_FRACTION * diagonale_frame
    meilleur_id, meilleure_distance = None, seuil
    for fid, info in _foyers.get(id_camera, {}).items():
        d = ((centroid[0] - info["centroid"][0]) ** 2 + (centroid[1] - info["centroid"][1]) ** 2) ** 0.5
        if d <= meilleure_distance:
            meilleure_distance, meilleur_id = d, fid
    return meilleur_id


def _purge(id_camera: str, now: float) -> None:
    foyers_camera = _foyers.setdefault(id_camera, {})
    statuts_camera = _dernier_statut.setdefault(id_camera, {})
    expires = [fid for fid, info in foyers_camera.items() if now - info["last_seen"] > FOYER_EXPIRY_S]
    for fid in expires:
        info = foyers_camera.pop(fid)
        if statuts_camera.get(fid) in ("confirme", "propagation"):
            rapport_cam.ajouter_historique(id_camera, {
                "type_evenement": "feu_fumee",
                "foyer": fid, "evenement": "eteint_ou_dissipe",
                "type": " et ".join(sorted(info["labels"])),
                "horodatage": now,
            })
        statuts_camera.pop(fid, None)


def analyser(id_camera: str, frame, diagonale_frame: float, now: float) -> list[dict]:
    """Fait tourner le modèle feu/fumée DE CETTE CAMÉRA sur CETTE image,
    met à jour SES foyers suivis et renvoie la liste des foyers CONFIRMÉS
    à CET appel (avec leur statut) — pensé pour être appelé depuis
    on_voit_quoi.py et intégré à son rapport."""
    model = _get_model(id_camera)
    _purge(id_camera, now)
    foyers_camera = _foyers.setdefault(id_camera, {})
    statuts_camera = _dernier_statut.setdefault(id_camera, {})

    result = model.predict(frame, conf=CONF_DETECTION, verbose=False)[0]

    # Surface max vue CE tour par foyer — si feu ET fumée sont détectés
    # au même foyer sur cet appel (deux boîtes qui pointent vers la même
    # zone), on garde la plus grande des deux pour le suivi de
    # propagation, pas la dernière traitée arbitrairement.
    surfaces_ce_tour = {}

    for box in result.boxes:
        label_en = result.names[int(box.cls[0])]
        label_fr = LABEL_FR.get(label_en, label_en)
        xyxy = box.xyxy[0].tolist()
        centroid = _box_centroid(xyxy)
        surface = _box_surface(xyxy)

        fid = _trouver_foyer(id_camera, centroid, diagonale_frame)
        if fid is None:
            fid = f"foyer_{int(now * 1000)}_{uuid.uuid4().hex[:6]}"
            foyers_camera[fid] = {
                "labels": set(), "first_seen": now, "last_seen": now,
                "centroid": centroid, "observations": 0,
                "surface_confirmee": None, "surface_derniere": 0.0,
                "confirme": False,
            }

        entry = foyers_camera[fid]
        entry["labels"].add(label_fr)
        entry["last_seen"] = now
        entry["centroid"] = centroid
        if fid not in surfaces_ce_tour:
            entry["observations"] += 1
        surfaces_ce_tour[fid] = max(surfaces_ce_tour.get(fid, 0.0), surface)
        entry["surface_derniere"] = surfaces_ce_tour[fid]

    alertes = []
    for fid in surfaces_ce_tour:
        entry = foyers_camera[fid]

        if not entry["confirme"] and entry["observations"] >= CONFIRMATION_OBSERVATIONS_MIN:
            entry["confirme"] = True
            entry["surface_confirmee"] = entry["surface_derniere"]

        propagation = (
            entry["confirme"]
            and entry["surface_confirmee"]
            and entry["surface_derniere"] >= entry["surface_confirmee"] * PROPAGATION_CROISSANCE_SEUIL
        )

        if not entry["confirme"]:
            statut = "en_verification"
        elif propagation:
            statut = "propagation"
        else:
            statut = "confirme"

        type_fr = " et ".join(sorted(entry["labels"]))
        ancien = statuts_camera.get(fid)
        if ancien != statut and statut in ("confirme", "propagation"):
            rapport_cam.ajouter_historique(id_camera, {
                "type_evenement": "feu_fumee",
                "foyer": fid, "evenement": statut, "type": type_fr, "horodatage": now,
            })
            # Alerte isolée (voir Alertes/alertes.py) — pas d'avis IA ici
            # (contrairement à rodeur/abandonne) : la vitesse prime sur
            # la prudence pour le feu (voir docstring du module), pas de
            # coûteux aller-retour réseau vers traiteComportement.
            description = f"Départ de {type_fr} {statut} (foyer {fid})."
            alertes_module.enregistrer_alerte("feu_fumee", id_camera, None, description, None, now)
        statuts_camera[fid] = statut

        if statut in ("confirme", "propagation"):
            alertes.append({
                "foyer_id": fid,
                "type": type_fr,
                "statut": statut,
                "depuis_secondes": round(now - entry["first_seen"], 1),
                "position": entry["centroid"],
            })

    if alertes:
        print(f"[feu_fume] ALERTE (caméra {id_camera}) : {alertes}", flush=True)

    return alertes
