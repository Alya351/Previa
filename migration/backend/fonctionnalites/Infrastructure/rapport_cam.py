"""Rapports de détection PAR CAMÉRA — stockage local, sous
migration/db/rapportCam/<id_camera>/ : un dossier par caméra, avec
etat.json (dernier état connu — équivalent par-caméra de l'ancien
vueActuelle/personnesVues global) et historique.json (liste d'événements
horodatés — équivalent par-caméra de l'ancien historique/... global).

Pourquoi un module séparé de local_store.py : l'architecture est
multi-caméra (voir fonctionnalites/DetectionPrincipal/) — chaque caméra
fait tourner sa propre chaîne de détection et ne doit JAMAIS mélanger son
état avec celui d'une autre caméra. Un seul arbre JSON global (comme
local_store.py) mélangerait tout sous les mêmes clés ; ici, un
sous-dossier physiquement séparé par caméra rend le mélange impossible
par construction.

Même principe que local_store.py (JSON local, pas de cloud, écriture
synchrone à chaque appel) — thread-safety : un verrou par caméra (pas un
verrou global) pour ne pas bloquer l'écriture de la caméra A pendant que
la caméra B écrit la sienne."""
import json
import threading
import time
from collections import defaultdict
from pathlib import Path

RAPPORT_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "rapportCam"

# Un verrou par caméra (pas un verrou global) : les caméras tournent leur
# chaîne indépendamment, pas de raison qu'elles s'attendent entre elles.
_verrous: dict[str, threading.Lock] = defaultdict(threading.Lock)

# Nombre max d'événements gardés par caméra — au-delà, les plus anciens
# sont supprimés, pour ne pas laisser historique.json grossir sans fin.
MAX_HISTORIQUE = 500


def _dossier_camera(id_camera: str) -> Path:
    d = RAPPORT_DIR / id_camera
    d.mkdir(parents=True, exist_ok=True)
    return d


def enregistrer_etat(id_camera: str, cle: str, valeur) -> None:
    """Met à jour UNE clé de l'état courant de cette caméra (ex.
    "vueActuelle" pour on_voit_quoi.py, "personnesVues" pour
    on_voit_qui.py) SANS toucher aux autres clés — equivalent par-caméra
    de l'ancien db.reference("vueActuelle"/"personnesVues").set(), sauf
    qu'ici les deux passes (objets, personnes) partagent le même fichier
    par caméra au lieu de deux racines Firebase séparées, donc une
    fusion (pas un écrasement complet) est nécessaire."""
    with _verrous[id_camera]:
        chemin = _dossier_camera(id_camera) / "etat.json"
        etat = {}
        if chemin.exists():
            with open(chemin, encoding="utf-8") as f:
                etat = json.load(f)
        etat[cle] = valeur
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(etat, f, ensure_ascii=False, indent=2)


def lire_etat(id_camera: str, cle: str | None = None):
    """État courant de CETTE caméra — juste la valeur de `cle` si fournie
    (ex. "vueActuelle"), sinon tout l'état (toutes les clés). {} si rien
    n'a encore été rapporté / si `cle` n'existe pas encore."""
    chemin = _dossier_camera(id_camera) / "etat.json"
    if not chemin.exists():
        return {}
    with open(chemin, encoding="utf-8") as f:
        etat = json.load(f)
    return etat if cle is None else etat.get(cle, {})


def ajouter_historique(id_camera: str, evenement: dict) -> None:
    """Ajoute un événement horodaté à l'historique de CETTE caméra
    (équivalent par-caméra de l'ancien db.reference("historique/...").push()).
    Tronque à MAX_HISTORIQUE entrées (garde les plus récentes)."""
    with _verrous[id_camera]:
        chemin = _dossier_camera(id_camera) / "historique.json"
        historique = []
        if chemin.exists():
            with open(chemin, encoding="utf-8") as f:
                historique = json.load(f)
        evenement = dict(evenement)
        evenement.setdefault("horodatage", time.time())
        historique.append(evenement)
        if len(historique) > MAX_HISTORIQUE:
            historique = historique[-MAX_HISTORIQUE:]
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(historique, f, ensure_ascii=False, indent=2)


def lire_historique(id_camera: str) -> list[dict]:
    chemin = _dossier_camera(id_camera) / "historique.json"
    if not chemin.exists():
        return []
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def lister_cameras_avec_rapport() -> list[str]:
    """Ids des caméras qui ont déjà rapporté au moins une fois — utile
    pour un futur endpoint listant les caméras actives."""
    if not RAPPORT_DIR.exists():
        return []
    return sorted(p.name for p in RAPPORT_DIR.iterdir() if p.is_dir())
