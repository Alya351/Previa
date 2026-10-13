"""
Module de gestion de base de données SQLite Hybride pour Previa.
Remplace l'ancien stockage JSON (db.json / rapportCam) par SQLite en mode WAL.

Fonctionnalités :
- Table 'kv_store' pour le KV local (configurations, personnel, registres)
- Table 'evenements_historique' dédiée, indexée par (camera_id, timestamp) et (statut)
  avec colonnes d'acquittement (REQ-ALT-03) et écriture synchronous=FULL (REQ-REP-01).
- Script d'auto-migration des anciens fichiers historique.json.
"""

import json
import sqlite3
import threading
import time
import uuid
from pathlib import Path

DB_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db"
DB_FILE = DB_DIR / "previa.db"

_lock = threading.Lock()
_conn: sqlite3.Connection | None = None


def get_connection() -> sqlite3.Connection:
    global _conn
    with _lock:
        if _conn is None:
            DB_DIR.mkdir(parents=True, exist_ok=True)
            conn = sqlite3.connect(str(DB_FILE), check_same_thread=False)
            conn.row_factory = sqlite3.Row

            # Activer WAL
            conn.execute("PRAGMA journal_mode=WAL;")
            conn.execute("PRAGMA synchronous=NORMAL;")  # Défaut pour la DB globale

            _initialiser_tables(conn)
            _migrer_anciens_historiques(conn)
            # Publiée SEULEMENT une fois les tables créées : avant, la
            # connexion était publiée d'abord, et si l'initialisation
            # échouait (ou n'était pas encore définie), toutes les
            # requêtes suivantes tombaient sur « no such table: kv_store »
            # sur une installation neuve (aucune base existante).
            _conn = conn
        return _conn


def fermer_connexion() -> None:
    global _conn
    with _lock:
        if _conn is not None:
            try:
                _conn.close()
            except Exception:
                pass
            _conn = None

def _initialiser_tables(conn: sqlite3.Connection):
    with conn:
        # 1. Store Clé-Valeur pour la compatibilité Firebase local_store
        conn.execute("""
            CREATE TABLE IF NOT EXISTS kv_store (
                key TEXT PRIMARY KEY,
                value_json TEXT NOT NULL,
                updated_at REAL NOT NULL
            );
        """)
        
        # 2. Table dédiée d'historique des événements (REQ-REP-01 & REQ-ALT-03)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS evenements_historique (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                camera_id TEXT NOT NULL,
                timestamp REAL NOT NULL,
                type_evenement TEXT NOT NULL,
                gravite TEXT DEFAULT 'info',
                statut TEXT DEFAULT 'non_traite',
                acquitte_par TEXT,
                acquitte_le REAL,
                payload_json TEXT NOT NULL
            );
        """)
        
        # Index multi-critères et haute performance pour filtrage instantané
        conn.execute("CREATE INDEX IF NOT EXISTS idx_hist_cam_ts ON evenements_historique(camera_id, timestamp DESC);")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_hist_ts ON evenements_historique(timestamp DESC);")
        # 3. Table des sessions révoquées (liste noire pour déconnexion immédiate)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS sessions_revoquees (
                jti TEXT PRIMARY KEY,
                exp REAL NOT NULL,
                revoque_le REAL NOT NULL
            );
        """)
        conn.execute("CREATE INDEX IF NOT EXISTS idx_sessions_revoquees_exp ON sessions_revoquees(exp);")


def _migrer_anciens_historiques(conn: sqlite3.Connection):
    """
    Auto-migration des anciens fichiers db/rapportCam/<id_camera>/historique.json
    vers la table SQLite 'evenements_historique' sans perte de données.
    """
    rapport_dir = DB_DIR / "rapportCam"
    if not rapport_dir.exists():
        return
        
    for cam_dir in rapport_dir.iterdir():
        if not cam_dir.is_dir():
            continue
        id_camera = cam_dir.name
        hist_file = cam_dir / "historique.json"
        if hist_file.exists():
            try:
                with open(hist_file, encoding="utf-8") as f:
                    evenements = json.load(f)
                
                if isinstance(evenements, list) and evenements:
                    conn.execute("PRAGMA synchronous=FULL;")
                    with conn:
                        for ev in evenements:
                            ts = ev.get("horodatage") or ev.get("timestamp") or time.time()
                            type_ev = ev.get("type") or ev.get("type_evenement") or "detection"
                            gravite = ev.get("gravite") or "info"
                            statut = ev.get("statut") or "non_traite"
                            payload = json.dumps(ev, ensure_ascii=False)
                            
                            existant = conn.execute(
                                "SELECT id FROM evenements_historique WHERE camera_id=? AND timestamp=? AND type_evenement=?",
                                (id_camera, ts, type_ev)
                            ).fetchone()
                            if not existant:
                                conn.execute("""
                                    INSERT INTO evenements_historique (camera_id, timestamp, type_evenement, gravite, statut, payload_json)
                                    VALUES (?, ?, ?, ?, ?, ?)
                                """, (id_camera, ts, type_ev, gravite, statut, payload))
                    conn.execute("PRAGMA synchronous=NORMAL;")
                
                hist_file.rename(hist_file.with_suffix(".json.migrated"))
                print(f"[sqlite_db] Migration de l'historique reussie pour la camera {id_camera}", flush=True)
            except Exception as e:
                print(f"[sqlite_db] Erreur lors de la migration {hist_file} : {e}", flush=True)


# Initialisation immédiate au premier import pour garantir la disponibilité
# instantanée — placée EN FIN DE FICHIER : elle appelle des fonctions
# (_initialiser_tables, _migrer_anciens_historiques) qui doivent déjà être
# définies à cet instant.
try:
    get_connection()
except Exception as _e_init_db:
    print(f"[sqlite_db] Initialisation différée : {_e_init_db}", flush=True)

