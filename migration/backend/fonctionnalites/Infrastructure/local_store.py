"""Remplace Firebase Realtime Database par un stockage JSON local, pour
faire tourner le pipeline sans connexion internet ni compte cloud. Même
interface que firebase_admin.db, utilisée telle quelle partout ailleurs
dans le code (get/set/update/push/delete) — pas besoin de toucher au reste
des fichiers, juste l'import : `from firebase_admin import db` devient
`from local_store import db`.

Copie de raspberry/backend/local_store.py (déjà éprouvé sur le Pi),
adaptée telle quelle pour le backend principal — même code, même
comportement, juste un chemin de fichier différent (voir DB_PATH).

Tout l'arbre vit dans un seul fichier JSON (voir DB_PATH), avec la même
structure de chemins que Firebase ("vueActuelle", "corps/registry/xxx",
"historique/pid", etc.). Écrit sur disque à chaque modification (set,
update, push, delete) — pas de mise en cache risquée, la fréquence des
appels ici (une poignée par image analysée) est bien assez faible pour
se permettre une écriture synchrone à chaque fois.

Thread-safety : les endpoints FastAPI tournent en threadpool (plusieurs
requêtes en parallèle) — un verrou global protège toute lecture/
modification du fichier pour éviter une corruption si deux threads
écrivent en même temps."""
import json
import threading
import time
import uuid
from fonctionnalites.Infrastructure.sqlite_db import get_connection

_lock = threading.Lock()


def _json_default(obj):
    if hasattr(obj, "item"):
        return obj.item()
    if hasattr(obj, "tolist"):
        return obj.tolist()
    if hasattr(obj, "dtype"):
        return float(obj)
    return str(obj)


def _segments(chemin: str) -> list:
    return [s for s in chemin.strip("/").split("/") if s]


def _charger_arbre() -> dict:
    conn = get_connection()
    row = conn.execute("SELECT value_json FROM kv_store WHERE key='root_tree'").fetchone()
    if row and row["value_json"]:
        try:
            return json.loads(row["value_json"])
        except Exception:
            return {}
    return {}


def _sauvegarder_arbre(arbre: dict) -> None:
    conn = get_connection()
    val_json = json.dumps(arbre, ensure_ascii=False, default=_json_default)
    with conn:
        conn.execute(
            "INSERT INTO kv_store (key, value_json, updated_at) VALUES ('root_tree', ?, ?) ON CONFLICT(key) DO UPDATE SET value_json=excluded.value_json, updated_at=excluded.updated_at",
            (val_json, time.time())
        )


def _lire_a(arbre: dict, segments: list):
    noeud = arbre
    for s in segments:
        if not isinstance(noeud, dict) or s not in noeud:
            return None
        noeud = noeud[s]
    return noeud


def _ecrire_a(arbre: dict, segments: list, valeur) -> None:
    if not segments:
        return
    noeud = arbre
    for s in segments[:-1]:
        if not isinstance(noeud.get(s), dict):
            noeud[s] = {}
        noeud = noeud[s]
    if valeur is None:
        noeud.pop(segments[-1], None)
    else:
        noeud[segments[-1]] = valeur


class Reference:
    def __init__(self, chemin: str):
        self.chemin = chemin
        self._segments = _segments(chemin)

    def get(self):
        with _lock:
            return _lire_a(_charger_arbre(), self._segments)

    def set(self, valeur) -> None:
        with _lock:
            arbre = _charger_arbre()
            _ecrire_a(arbre, self._segments, valeur)
            _sauvegarder_arbre(arbre)

    def update(self, valeurs: dict) -> None:
        with _lock:
            arbre = _charger_arbre()
            existant = _lire_a(arbre, self._segments)
            fusionne = dict(existant) if isinstance(existant, dict) else {}
            fusionne.update(valeurs)
            _ecrire_a(arbre, self._segments, fusionne)
            _sauvegarder_arbre(arbre)

    def push(self, valeur):
        cle = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
        with _lock:
            arbre = _charger_arbre()
            parent = _lire_a(arbre, self._segments)
            if not isinstance(parent, dict):
                parent = {}
                _ecrire_a(arbre, self._segments, parent)
            parent[cle] = valeur
            _sauvegarder_arbre(arbre)
        return Reference(f"{self.chemin}/{cle}")

    def delete(self) -> None:
        self.set(None)


class _DB:
    def reference(self, chemin: str) -> Reference:
        return Reference(chemin)


db = _DB()

