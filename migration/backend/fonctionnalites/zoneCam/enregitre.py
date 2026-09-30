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


def enregistrer_zone(
    id_camera: str,
    points: list[dict],
    nom_zone: str | None = None,
    plage_horaire: dict | None = None,
) -> dict:
    """Remplace (ou crée) la zone de `id_camera` par `points` — une
    liste d'au moins 3 points `{"x": .., "y": ..}`, chacun entre 0 et 1.
    Accepte également un nom de zone (`nom_zone`) et une plage horaire
    d'activation (`plage_horaire` : {"active_24h": bool, "heure_debut": "HH:MM", "heure_fin": "HH:MM", "jours_actifs": [0..6]}).
    Lève ValueError si `points` ne forme pas un polygone valide."""
    if not isinstance(points, list) or len(points) < 3:
        raise ValueError("Une zone a besoin d'au moins 3 points pour former un polygone")
    for p in points:
        x, y = p.get("x"), p.get("y")
        if not isinstance(x, (int, float)) or not isinstance(y, (int, float)):
            raise ValueError("Chaque point doit avoir des coordonnées x et y numériques")
        if not (0 <= x <= 1 and 0 <= y <= 1):
            raise ValueError("Les coordonnées x et y doivent être comprises entre 0 et 1")

    # Plage horaire par défaut (24h/24, tous les jours) si non spécifiée
    plage_valide = {
        "active_24h": True,
        "heure_debut": "00:00",
        "heure_fin": "23:59",
        "jours_actifs": [0, 1, 2, 3, 4, 5, 6],
    }
    if isinstance(plage_horaire, dict):
        plage_valide["active_24h"] = bool(plage_horaire.get("active_24h", True))
        plage_valide["heure_debut"] = str(plage_horaire.get("heure_debut", "20:00"))
        plage_valide["heure_fin"] = str(plage_horaire.get("heure_fin", "06:00"))
        jours = plage_horaire.get("jours_actifs")
        if isinstance(jours, list) and len(jours) > 0:
            plage_valide["jours_actifs"] = [int(j) for j in jours if 0 <= int(j) <= 6]
        else:
            plage_valide["jours_actifs"] = [0, 1, 2, 3, 4, 5, 6]

    zone = {
        "id_camera": id_camera,
        "nom_zone": str(nom_zone).strip() if nom_zone else "Zone Surveillée",
        "points": [{"x": p["x"], "y": p["y"]} for p in points],
        "plage_horaire": plage_valide,
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
