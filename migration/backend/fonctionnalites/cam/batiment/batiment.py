"""Bâtiments surveillés par PREVIA — stockage local, un fichier JSON par
bâtiment, sous migration/db/cam/batiments/<id>.json.

Sommet de la hiérarchie caméra : bâtiment -> pièces (voir
fonctionnalites/cam/pieces/piece.py) -> caméras (voir
fonctionnalites/cam/camera/camera.py). Un bâtiment peut avoir plusieurs
pièces ; une pièce n'appartient qu'à UN seul bâtiment.

Ce module ne connaît PAS piece.py (pour éviter une dépendance circulaire,
piece.py important déjà batiment.py pour vérifier qu'un bâtiment existe)
— c'est à la route de main.py de refuser la suppression d'un bâtiment qui
a encore des pièces, via piece.lister_par_batiment()."""
import json
import time
import uuid
from pathlib import Path

BATIMENTS_DIR = Path(__file__).resolve().parent.parent.parent.parent.parent / "db" / "cam" / "batiments"


def _chemin(id_batiment: str) -> Path:
    return BATIMENTS_DIR / f"{id_batiment}.json"


def lister_batiments() -> list[dict]:
    BATIMENTS_DIR.mkdir(parents=True, exist_ok=True)
    batiments = []
    for fichier in sorted(BATIMENTS_DIR.glob("*.json")):
        with open(fichier, encoding="utf-8") as f:
            batiments.append(json.load(f))
    return batiments


def trouver_par_id(id_batiment: str) -> dict | None:
    chemin = _chemin(id_batiment)
    if not chemin.exists():
        return None
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def creer_batiment(nom: str, lieu: str, responsable_id: str | None = None) -> dict:
    nom_nettoye = nom.strip()
    # Empêcher les doublons de nom de bâtiment
    for existant in lister_batiments():
        if existant.get("nom", "").strip().lower() == nom_nettoye.lower():
            raise ValueError(f"Un bâtiment nommé '{nom_nettoye}' existe déjà.")

    batiment = {
        "id": uuid.uuid4().hex,
        "nom": nom_nettoye,
        "lieu": lieu.strip(),
        "responsable_id": responsable_id.strip() if responsable_id else None,
        "cree_le": time.time(),
    }
    BATIMENTS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(batiment["id"]), "w", encoding="utf-8") as f:
        json.dump(batiment, f, ensure_ascii=False, indent=2)
    return batiment


def modifier_batiment(id_batiment: str, nom: str | None = None, lieu: str | None = None, responsable_id: str | None = None) -> dict | None:
    b = trouver_par_id(id_batiment)
    if b is None:
        return None
    if nom is not None:
        b["nom"] = nom.strip()
    if lieu is not None:
        b["lieu"] = lieu.strip()
    if responsable_id is not None:
        b["responsable_id"] = responsable_id.strip() if responsable_id else None
    with open(_chemin(id_batiment), "w", encoding="utf-8") as f:
        json.dump(b, f, ensure_ascii=False, indent=2)
    return b


def supprimer_batiment(id_batiment: str) -> bool:
    """Supprime le bâtiment. Ne vérifie PAS lui-même si des pièces en
    dépendent encore — voir docstring du module."""
    chemin = _chemin(id_batiment)
    if not chemin.exists():
        return False
    chemin.unlink()
    return True
