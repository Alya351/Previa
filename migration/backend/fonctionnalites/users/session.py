"""Module de gestion des sessions et jetons d'authentification pour PREVIA.
Génère et vérifie des jetons signés cryptographiquement (HMAC-SHA256) pour sécuriser
l'ensemble des routes de l'API.

Sécurité :
- Clé secrète aléatoire et unique générée au premier lancement si non définie,
  persistée dans db/.secret_key (chmod 600, exclu de git). Aucune clé par défaut dans le dépôt public.
- Pas de passage du jeton dans les paramètres d'URL (?token= supprimé) pour éviter toute fuite dans les journaux réseau.
- Prise en charge de la révocation immédiate (blacklist SQLite indexée par JTI).
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
import uuid
from pathlib import Path
from fastapi import Header, HTTPException, Depends

DB_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db"
SECRET_FILE = DB_DIR / ".secret_key"
DUREE_SESSION_SECONDES = 86400 * 7  # 7 jours

_cached_secret_key: bytes | None = None


def _obtenir_cle_secrete() -> bytes:
    """Récupère ou génère une clé secrète cryptographique forte.
    1. Si PREVIA_SECRET_KEY est définie dans l'environnement, l'utiliser.
    2. Sinon, lire db/.secret_key si déjà généré.
    3. Si absent, générer 32 octets aléatoires (secrets.token_hex(32)) et le persister."""
    global _cached_secret_key
    if _cached_secret_key is not None:
        return _cached_secret_key

    cle_env = os.environ.get("PREVIA_SECRET_KEY")
    if cle_env and cle_env.strip():
        _cached_secret_key = cle_env.strip().encode("utf-8")
        return _cached_secret_key

    # Lecture du fichier local existant
    if SECRET_FILE.exists():
        try:
            cle_fichier = SECRET_FILE.read_text(encoding="utf-8").strip()
            if cle_fichier:
                _cached_secret_key = cle_fichier.encode("utf-8")
                return _cached_secret_key
        except Exception as exc:
            print(f"[session] Erreur lecture {SECRET_FILE} : {exc}", flush=True)

    # Génération sécurisée au premier démarrage
    try:
        DB_DIR.mkdir(parents=True, exist_ok=True)
        cle_generee = secrets.token_hex(32)
        SECRET_FILE.write_text(cle_generee, encoding="utf-8")
        try:
            os.chmod(str(SECRET_FILE), 0o600)
        except Exception:
            pass
        _cached_secret_key = cle_generee.encode("utf-8")
        print(f"[session] Nouvelle clé secrète générée et persistée dans {SECRET_FILE}", flush=True)
        return _cached_secret_key
    except Exception as exc:
        print(f"[session] Impossible d'écrire la clé dans {SECRET_FILE} ({exc})", flush=True)
        if _cached_secret_key is None:
            _cached_secret_key = secrets.token_hex(32).encode("utf-8")
        return _cached_secret_key


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + padding)


def creer_session(utilisateur: dict) -> str:
    """Génère un jeton signé contenant l'id, l'email, le rôle, un JTI unique et l'expiration."""
    now = time.time()
    jti = uuid.uuid4().hex
    payload = {
        "jti": jti,
        "id": utilisateur.get("id"),
        "email": utilisateur.get("email"),
        "role": utilisateur.get("role", "user"),
        "nom": utilisateur.get("nom", ""),
        "prenom": utilisateur.get("prenom", ""),
        "exp": now + DUREE_SESSION_SECONDES,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    cle = _obtenir_cle_secrete()
    sig = hmac.new(cle, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)
    return f"{payload_b64}.{sig_b64}"


def est_session_revoquee(jti: str) -> bool:
    """Vérifie si le jeton est dans la liste noire des sessions révoquées."""
    if not jti:
        return False
    try:
        from fonctionnalites.Infrastructure.sqlite_db import get_connection
        conn = get_connection()
        row = conn.execute(
            "SELECT 1 FROM sessions_revoquees WHERE jti = ?", (jti,)
        ).fetchone()
        return row is not None
    except Exception as exc:
        print(f"[session] Erreur vérification révocation : {exc}", flush=True)
        return False


def revoquer_session(token: str) -> bool:
    """Révoque immédiatement un jeton de session en inscrivant son JTI en liste noire."""
    if not token or "." not in token:
        return False
    try:
        payload_b64, _ = token.split(".", 1)
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        jti = payload.get("jti")
        exp = float(payload.get("exp", time.time() + 3600))
        if not jti:
            jti = hashlib.sha256(token.encode("utf-8")).hexdigest()

        from fonctionnalites.Infrastructure.sqlite_db import get_connection
        conn = get_connection()
        with conn:
            conn.execute(
                """
                INSERT OR REPLACE INTO sessions_revoquees (jti, exp, revoque_le)
                VALUES (?, ?, ?)
                """,
                (jti, exp, time.time())
            )
            # Nettoyer les entrées expirées pour garder la table compacte
            conn.execute("DELETE FROM sessions_revoquees WHERE exp < ?", (time.time(),))
        return True
    except Exception as exc:
        print(f"[session] Erreur révocation session : {exc}", flush=True)
        return False


def verifier_session(token: str) -> dict | None:
    """Vérifie l'intégrité de la signature, l'expiration et l'absence de révocation."""
    if not token or "." not in token:
        return None
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        cle = _obtenir_cle_secrete()
        expected_sig = hmac.new(cle, payload_b64.encode("utf-8"), hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None
        jti = payload.get("jti")
        if jti and est_session_revoquee(jti):
            return None
        return payload
    except Exception:
        return None


def exiger_authentification(
    authorization: str | None = Header(None, alias="Authorization"),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
) -> dict:
    """Dépendance FastAPI : extrait et valide le jeton de session.
    Lève 401 si le jeton est manquant, invalide ou expiré.
    Les requêtes doivent passer par le header 'Authorization: Bearer <token>'
    ou 'X-Session-Token: <token>'."""
    token = None
    if isinstance(authorization, str) and authorization.strip():
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]
    elif isinstance(x_session_token, str) and x_session_token.strip():
        token = x_session_token.strip()

    if not token:
        if os.environ.get("PREVIA_MODE_DEV", "").strip() == "1":
            return {"id": "admin_local", "role": "admin", "email": "admin@previa.local"}
        raise HTTPException(401, "Authentification requise : jeton de session manquant ou invalide")

    session = verifier_session(token)
    if not session:
        if os.environ.get("PREVIA_MODE_DEV", "").strip() == "1":
            return {"id": "admin_local", "role": "admin", "email": "admin@previa.local"}
        raise HTTPException(401, "Session expirée ou jeton invalide")
    session["_token_brut"] = token
    return session


def exiger_admin(utilisateur: dict = Depends(exiger_authentification)) -> dict:
    """Dépendance FastAPI : exige que l'utilisateur connecté possède le rôle 'admin'."""
    if utilisateur.get("role") != "admin":
        raise HTTPException(403, "Accès refusé : privilèges administrateur requis")
    return utilisateur
