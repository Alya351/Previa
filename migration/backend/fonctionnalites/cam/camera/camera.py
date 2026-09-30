"""Caméras de PREVIA — stockage local, un fichier JSON par caméra, sous
migration/db/cam/cameras/<id>.json.

Une caméra appartient à UNE seule pièce (voir
fonctionnalites/cam/pieces/piece.py) ; une pièce peut avoir plusieurs
caméras, mais jamais l'inverse (une même caméra ne peut pas être dans
plusieurs pièces à la fois).

`est_entree` : marque une caméra comme surveillant un point d'ENTRÉE du
bâtiment (porte principale, portail...) — utilisé par
ComportementsSupects/infiltre.py pour détecter une personne découverte à
l'intérieur du bâtiment sans être jamais passée par une entrée
surveillée (voir ce module pour la logique complète)."""
import json
import time
import uuid
from pathlib import Path

from fonctionnalites.cam.pieces import piece

CAMERAS_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "db" / "cam" / "cameras"


def _chemin(id_camera: str) -> Path:
    return CAMERAS_DIR / f"{id_camera}.json"


def lister_cameras() -> list[dict]:
    CAMERAS_DIR.mkdir(parents=True, exist_ok=True)
    cameras = []
    for fichier in sorted(CAMERAS_DIR.glob("*.json")):
        with open(fichier, encoding="utf-8") as f:
            cameras.append(json.load(f))
    return cameras


def lister_par_piece(id_piece: str) -> list[dict]:
    """Toutes les caméras d'UNE pièce donnée — utilisé par main.py pour
    lister/filtrer, et pour refuser la suppression d'une pièce qui a
    encore des caméras."""
    return [c for c in lister_cameras() if c.get("piece_id") == id_piece]


def trouver_par_id(id_camera: str) -> dict | None:
    chemin = _chemin(id_camera)
    if not chemin.exists():
        return None
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def creer_camera(num: str, piece_id: str, est_entree: bool = False, url_flux: str | None = None) -> dict:
    """Lève ValueError si `piece_id` ne correspond à aucune pièce
    existante."""
    if piece.trouver_par_id(piece_id) is None:
        raise ValueError(f"Aucune pièce avec l'id {piece_id}")

    camera = {
        "id": uuid.uuid4().hex,
        "num": num.strip() if isinstance(num, str) else num,
        "piece_id": piece_id,
        "est_entree": bool(est_entree),
        "url_flux": url_flux.strip() if url_flux else None,
        "cree_le": time.time(),
    }
    CAMERAS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(camera["id"]), "w", encoding="utf-8") as f:
        json.dump(camera, f, ensure_ascii=False, indent=2)
    return camera


def modifier_camera(
    id_camera: str, num: str | None = None, piece_id: str | None = None, est_entree: bool | None = None, url_flux: str | None = None,
) -> dict | None:
    """Lève ValueError si la nouvelle `piece_id` ne correspond à aucune
    pièce existante."""
    c = trouver_par_id(id_camera)
    if c is None:
        return None
    if piece_id is not None:
        if piece.trouver_par_id(piece_id) is None:
            raise ValueError(f"Aucune pièce avec l'id {piece_id}")
        c["piece_id"] = piece_id
    if num is not None:
        c["num"] = num.strip() if isinstance(num, str) else num
    if est_entree is not None:
        c["est_entree"] = bool(est_entree)
    if url_flux is not None:
        c["url_flux"] = url_flux.strip() if url_flux else None
    with open(_chemin(id_camera), "w", encoding="utf-8") as f:
        json.dump(c, f, ensure_ascii=False, indent=2)
    return c


def supprimer_camera(id_camera: str) -> bool:
    chemin = _chemin(id_camera)
    if not chemin.exists():
        return False
    chemin.unlink()
    return True
