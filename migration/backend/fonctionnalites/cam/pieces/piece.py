"""Pièces des bâtiments surveillés par PREVIA — stockage local, un
fichier JSON par pièce, sous migration/db/cam/pieces/<id>.json.

Une pièce appartient à UN seul bâtiment (voir
fonctionnalites/cam/batiment/batiment.py) ; un bâtiment peut avoir
plusieurs pièces. Une pièce peut ensuite avoir plusieurs caméras (voir
fonctionnalites/cam/camera/camera.py) ; une caméra n'appartient qu'à UNE
seule pièce, jamais l'inverse."""
import json
import time
import uuid
from pathlib import Path

from fonctionnalites.cam.batiment import batiment

PIECES_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "db" / "cam" / "pieces"


def _chemin(id_piece: str) -> Path:
    return PIECES_DIR / f"{id_piece}.json"


def lister_pieces() -> list[dict]:
    PIECES_DIR.mkdir(parents=True, exist_ok=True)
    pieces = []
    for fichier in sorted(PIECES_DIR.glob("*.json")):
        with open(fichier, encoding="utf-8") as f:
            pieces.append(json.load(f))
    return pieces


def lister_par_batiment(id_batiment: str) -> list[dict]:
    """Toutes les pièces d'UN bâtiment donné — utilisé par main.py pour
    lister/filtrer, et pour refuser la suppression d'un bâtiment qui a
    encore des pièces."""
    return [p for p in lister_pieces() if p.get("batiment_id") == id_batiment]


def trouver_par_id(id_piece: str) -> dict | None:
    chemin = _chemin(id_piece)
    if not chemin.exists():
        return None
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def creer_piece(nom: str, batiment_id: str) -> dict:
    """Lève ValueError si `batiment_id` ne correspond à aucun bâtiment
    existant."""
    if batiment.trouver_par_id(batiment_id) is None:
        raise ValueError(f"Aucun bâtiment avec l'id {batiment_id}")

    piece = {
        "id": uuid.uuid4().hex,
        "nom": nom.strip(),
        "batiment_id": batiment_id,
        "cree_le": time.time(),
    }
    PIECES_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(piece["id"]), "w", encoding="utf-8") as f:
        json.dump(piece, f, ensure_ascii=False, indent=2)
    return piece


def modifier_piece(id_piece: str, nom: str | None = None, batiment_id: str | None = None) -> dict | None:
    """Lève ValueError si le nouveau `batiment_id` ne correspond à aucun
    bâtiment existant."""
    p = trouver_par_id(id_piece)
    if p is None:
        return None
    if batiment_id is not None:
        if batiment.trouver_par_id(batiment_id) is None:
            raise ValueError(f"Aucun bâtiment avec l'id {batiment_id}")
        p["batiment_id"] = batiment_id
    if nom is not None:
        p["nom"] = nom.strip()
    with open(_chemin(id_piece), "w", encoding="utf-8") as f:
        json.dump(p, f, ensure_ascii=False, indent=2)
    return p


def supprimer_piece(id_piece: str) -> bool:
    """Supprime la pièce. Ne vérifie PAS elle-même si des caméras en
    dépendent encore — voir docstring du module."""
    chemin = _chemin(id_piece)
    if not chemin.exists():
        return False
    chemin.unlink()
    return True
