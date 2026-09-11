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
from pathlib import Path

DB_PATH = Path(__file__).resolve().parent.parent.parent.parent / "db" / "db.json"

_lock = threading.Lock()


def _charger() -> dict:
    if not DB_PATH.exists():
        return {}
    try:
        with open(DB_PATH, encoding="utf-8") as f:
            return json.load(f)
    except (json.JSONDecodeError, OSError) as exc:
        print(f"[local_store] fichier {DB_PATH} illisible ({exc}) — redémarre avec une base vide", flush=True)
        return {}


def _sauvegarder(arbre: dict) -> None:
    # Écriture dans un fichier temporaire puis renommage atomique — évite
    # un fichier JSON à moitié écrit si le processus est interrompu
    # pendant la sauvegarde (kill -9, coupure...).
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)  # sinon plante sur un tout premier lancement (dossier db/ pas encore créé)
    tmp = DB_PATH.with_suffix(".tmp")
    with open(tmp, "w", encoding="utf-8") as f:
        json.dump(arbre, f, ensure_ascii=False)
    tmp.replace(DB_PATH)


def _segments(chemin: str) -> list:
    return [s for s in chemin.strip("/").split("/") if s]


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
        noeud.pop(segments[-1], None)  # Firebase : écrire None = supprimer la clé
    else:
        noeud[segments[-1]] = valeur


class Reference:
    def __init__(self, chemin: str):
        self.chemin = chemin
        self._segments = _segments(chemin)

    def get(self):
        with _lock:
            return _lire_a(_charger(), self._segments)

    def set(self, valeur) -> None:
        with _lock:
            arbre = _charger()
            _ecrire_a(arbre, self._segments, valeur)
            _sauvegarder(arbre)

    def update(self, valeurs: dict) -> None:
        with _lock:
            arbre = _charger()
            existant = _lire_a(arbre, self._segments)
            fusionne = dict(existant) if isinstance(existant, dict) else {}
            fusionne.update(valeurs)
            _ecrire_a(arbre, self._segments, fusionne)
            _sauvegarder(arbre)

    def push(self, valeur):
        # Clé unique, à peu près triable chronologiquement (millisecondes
        # + suffixe aléatoire) — pas l'algorithme exact des push-ids
        # Firebase, mais le même usage : chaque appel obtient sa propre
        # clé, jamais de collision entre deux pushes au même moment (même
        # principe que les identifiants de personnes ailleurs dans ce
        # projet).
        cle = f"{int(time.time() * 1000)}_{uuid.uuid4().hex[:8]}"
        with _lock:
            arbre = _charger()
            parent = _lire_a(arbre, self._segments)
            if not isinstance(parent, dict):
                parent = {}
                _ecrire_a(arbre, self._segments, parent)
            parent[cle] = valeur
            _sauvegarder(arbre)
        return Reference(f"{self.chemin}/{cle}")

    def delete(self) -> None:
        self.set(None)


class _DB:
    def reference(self, chemin: str) -> Reference:
        return Reference(chemin)


db = _DB()
