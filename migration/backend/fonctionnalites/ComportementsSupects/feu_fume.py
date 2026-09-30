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
try:
    from ultralytics import YOLO
except Exception as _exc:
    print(f"[feu_fume] ultralytics non chargé ({_exc})", flush=True)
    YOLO = None

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


def _get_model(id_camera: str) -> None:
    return None


def analyser(id_camera: str, frame, diagonale_frame: float, now: float) -> list[dict]:
    """Module feu/fumée désactivé à la demande de l'utilisateur."""
    return []

