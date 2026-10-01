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
from fonctionnalites.Infrastructure.sqlite_db import get_connection

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


def _json_default(obj):
    if hasattr(obj, "item"):
        return obj.item()
    if hasattr(obj, "tolist"):
        return obj.tolist()
    if hasattr(obj, "dtype"):
        return float(obj)
    return str(obj)


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
            try:
                with open(chemin, encoding="utf-8") as f:
                    etat = json.load(f)
            except Exception:
                etat = {}
        etat[cle] = valeur
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(etat, f, ensure_ascii=False, indent=2, default=_json_default)


def lire_etat(id_camera: str, cle: str | None = None, peremption_s: float = 10.0):
    """État courant de CETTE caméra — juste la valeur de `cle` si fournie
    (ex. "vueActuelle"), sinon tout l'état (toutes les clés). {} si rien
    n'a encore été rapporté / si `cle` n'existe pas encore.
    Si la caméra n'a pas produit de nouvelle analyse depuis > peremption_s (10s),
    les détections fantômes sont réinitialisées à vide."""
    chemin = _dossier_camera(id_camera) / "etat.json"
    if not chemin.exists():
        return {}
    with _verrous[id_camera]:
        try:
            with open(chemin, encoding="utf-8") as f:
                etat = json.load(f)
        except Exception:
            etat = {}

    now = time.time()
    if peremption_s is not None and etat:
        pv = etat.get("personnesVues", {})
        if pv and (now - pv.get("updated_at", 0) > peremption_s):
            etat["personnesVues"] = {
                "id_camera": id_camera,
                "personnes": [],
                "objets": {},
                "nombre_personnes": 0,
                "zones_suspectes": [],
                "updated_at": pv.get("updated_at", 0),
            }
        va = etat.get("vueActuelle", {})
        if va and (now - va.get("updated_at", 0) > peremption_s):
            etat["vueActuelle"] = {
                "id_camera": id_camera,
                "objets": {},
                "nombre_personnes": 0,
                "alertes_feu_fumee": [],
                "updated_at": va.get("updated_at", 0),
            }

    return etat if cle is None else etat.get(cle, {})




def ajouter_historique(id_camera: str, evenement: dict) -> None:
    """Ajoute un événement horodaté à la table SQLite 'evenements_historique' avec synchronous=FULL (REQ-REP-01)."""
    conn = get_connection()
    evenement = dict(evenement)
    ts = evenement.setdefault("horodatage", time.time())
    type_ev = evenement.get("type") or evenement.get("type_evenement") or "detection"
    gravite = evenement.get("gravite") or "info"
    statut = evenement.get("statut") or "non_traite"
    payload = json.dumps(evenement, ensure_ascii=False, default=_json_default)
    
    with conn:
        # synchronous=FULL pour garantir la résistance absolue aux coupures de courant
        conn.execute("PRAGMA synchronous=FULL;")
        conn.execute("""
            INSERT INTO evenements_historique (camera_id, timestamp, type_evenement, gravite, statut, payload_json)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (id_camera, ts, type_ev, gravite, statut, payload))
        conn.execute("PRAGMA synchronous=NORMAL;")


def lire_historique(id_camera: str, limit: int = 100) -> list[dict]:
    """Lit l'historique indexé depuis SQLite (REQ-REP-01 & REQ-ALT-03)."""
    conn = get_connection()
    rows = conn.execute("""
        SELECT payload_json, statut, acquitte_par, acquitte_le
        FROM evenements_historique
        WHERE camera_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
    """, (id_camera, limit)).fetchall()
    
    resultat = []
    for r in rows:
        try:
            ev = json.loads(r["payload_json"])
            ev["statut"] = r["statut"]
            ev["acquitte_par"] = r["acquitte_par"]
            ev["acquitte_le"] = r["acquitte_le"]
            resultat.append(ev)
        except Exception:
            pass
    return resultat


def lister_cameras_avec_rapport() -> list[str]:
    """Ids des caméras qui ont déjà rapporté au moins une fois — utile
    pour un futur endpoint listant les caméras actives."""
    if not RAPPORT_DIR.exists():
        return []
    return sorted(p.name for p in RAPPORT_DIR.iterdir() if p.is_dir())
