"""Zones à surveiller par caméra — stockage local, un fichier JSON par
caméra, sous migration/db/zone/<id_camera>.json.

Une "zone" est un polygone dessiné par un admin sur l'image d'UNE
caméra (voir main.py > POST /cameras/{id}/zone, et admin.jsx >
ZoneConfig) : la liste de ses sommets, dans l'ORDRE où ils ont été
posés. Les coordonnées sont des FRACTIONS (0.0 à 1.0) de la largeur/
hauteur de l'image, PAS des pixels — un polygone dessiné à l'écran reste
valable quelle que soit la résolution réelle de la caméra, qui peut
changer d'un flux à l'autre (téléphone vs webcam, orientation...).

Ce module ne fait QUE stocker/relire le polygone — il ne contient
aucune logique de détection (point dans le polygone, alerte si une
personne y entre...) : ça viendra plus tard, en réutilisant simplement
lire_zone() depuis ComportementsSupects/ le jour où cette
fonctionnalité sera branchée."""
import json
import time
from pathlib import Path

ZONES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "zone"


def _chemin(id_camera: str) -> Path:
    return ZONES_DIR / f"{id_camera}.json"


def enregistrer_zone(id_camera: str, points: list[dict]) -> dict:
    """Remplace (ou crée) la zone de `id_camera` par `points` — une
    liste d'au moins 3 points `{"x": .., "y": ..}`, chacun entre 0 et 1.
    Lève ValueError si `points` ne forme pas un polygone valide."""
    if not isinstance(points, list) or len(points) < 3:
        raise ValueError("Une zone a besoin d'au moins 3 points pour former un polygone")
    for p in points:
        x, y = p.get("x"), p.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise ValueError("Chaque point doit avoir des coordonnées x et y numériques")
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError("Les coordonnées x et y doivent être comprises entre 0 et 1")

    zone = {
        "id_camera": id_camera,
        "points": [{"x": p["x"], "y": p["y"]} for p in points],
        "enregistre_le": time.time(),
    }
    ZONES_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(id_camera), "w", encoding="utf-8") as f:
        json.dump(zone, f, ensure_ascii=False, indent=2)
    return zone


def lire_zone(id_camera: str) -> dict | None:
    """La zone enregistrée pour `id_camera`, ou None si aucune n'a
    encore été dessinée."""
    chemin = _chemin(id_camera)
    if not chemin.exists():
        return None
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def supprimer_zone(id_camera: str) -> bool:
    chemin = _chemin(id_camera)
    if not chemin.exists():
        return False
    chemin.unlink()
    return True


def lister_zones() -> list[dict]:
    """Toutes les zones enregistrées, toutes caméras confondues — utile
    pour un futur tableau de bord récapitulatif."""
    ZONES_DIR.mkdir(parents=True, exist_ok=True)
    zones = []
    for fichier in sorted(ZONES_DIR.glob("*.json")):
        with open(fichier, encoding="utf-8") as f:
            zones.append(json.load(f))
    return zones
