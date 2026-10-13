"""Module de gestion des sessions et jetons d'authentification pour PREVIA.
Génère et vérifie des jetons signés HMAC-SHA256 pour sécuriser l'ensemble des routes de l'API.
"""
import base64
import hashlib
import hmac
import json
import os
import secrets
import time
from pathlib import Path
from fastapi import Header, HTTPException, Depends, Query

_FICHIER_SECRET = Path(__file__).resolve().parent.parent.parent.parent / "db" / ".secret_key"


def _charger_secret() -> bytes:
    """Clé : 1) variable PREVIA_SECRET_KEY, 2) fichier db/.secret_key,
    3) sinon clé aléatoire créée maintenant. JAMAIS de clé par défaut dans le code."""
    depuis_env = os.environ.get("PREVIA_SECRET_KEY", "").strip()
    if depuis_env:
        return depuis_env.encode("utf-8")
    try:
        existante = _FICHIER_SECRET.read_text(encoding="utf-8").strip()
        if len(existante) >= 32:
            return existante.encode("utf-8")
    except OSError:
        pass
    nouvelle = secrets.token_hex(32)
    try:
        _FICHIER_SECRET.parent.mkdir(parents=True, exist_ok=True)
        _FICHIER_SECRET.write_text(nouvelle, encoding="utf-8")
        try:
            os.chmod(_FICHIER_SECRET, 0o600)
        except OSError:
            pass
    except OSError as exc:
        print(f"[session] clé de session non sauvegardée ({exc})", flush=True)
    return nouvelle.encode("utf-8")


SECRET_KEY = _charger_secret()


def regenerer_secret() -> None:
    """Invalide tous les jetons déjà émis (appelé après un reboot complet)."""
    global SECRET_KEY
    try:
        _FICHIER_SECRET.unlink()
    except OSError:
        pass
    SECRET_KEY = _charger_secret()


DUREE_SESSION_SECONDES = 86400 * 7  # 7 jours


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + padding)


def creer_session(utilisateur: dict) -> str:
    now = time.time()
    payload = {
        "id": utilisateur.get("id"),
        "email": utilisateur.get("email"),
        "role": utilisateur.get("role", "user"),
        "nom": utilisateur.get("nom", ""),
        "prenom": utilisateur.get("prenom", ""),
        "exp": now + DUREE_SESSION_SECONDES,
    }
    payload_b64 = _b64url_encode(json.dumps(payload, separators=(",", ":")).encode("utf-8"))
    sig = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    return f"{payload_b64}.{_b64url_encode(sig)}"


def verifier_session(token: str) -> dict | None:
    if not token or "." not in token:
        return None
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).digest()
        if not hmac.compare_digest(expected_sig, _b64url_decode(sig_b64)):
            return None
        payload = json.loads(_b64url_decode(payload_b64).decode("utf-8"))
        if payload.get("exp", 0) < time.time():
            return None
        return payload
    except Exception:
        return None


def exiger_authentification(
    authorization: str | None = Header(None, alias="Authorization"),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
    token_query: str | None = Query(None, alias="token"),
) -> dict:
    token = None
    if isinstance(authorization, str) and authorization.strip():
        parts = authorization.strip().split()
        if len(parts) == 2 and parts[0].lower() == "bearer":
            token = parts[1]
        elif len(parts) == 1:
            token = parts[0]
    elif isinstance(x_session_token, str) and x_session_token.strip():
        token = x_session_token.strip()
    elif isinstance(token_query, str) and token_query.strip():
        token = token_query.strip()

    if not token:
        if os.environ.get("PREVIA_MODE_DEV", "").strip() == "1":
            return {"id": "admin_local", "role": "admin", "email": "admin@previa.local"}
        raise HTTPException(401, "Authentification requise : jeton de session manquant ou invalide")

    session = verifier_session(token)
    if not session:
        if os.environ.get("PREVIA_MODE_DEV", "").strip() == "1":
            return {"id": "admin_local", "role": "admin", "email": "admin@previa.local"}
        raise HTTPException(401, "Session expirée ou jeton invalide")
    # Révocation : compte supprimé -> 401 ; rôle = rôle ACTUEL du compte.
    from fonctionnalites.users import compte
    actuel = compte.trouver_par_id(session.get("id") or "")
    if actuel is None:
        raise HTTPException(401, "Compte supprimé ou introuvable : reconnectez-vous")
    return {**session, "role": actuel.get("role", session.get("role", "user"))}


def utilisateur_optionnel(
    authorization: str | None = Header(None, alias="Authorization"),
    x_session_token: str | None = Header(None, alias="X-Session-Token"),
) -> dict | None:
    """Comme exiger_authentification, mais renvoie None au lieu de lever 401."""
    token = None
    if isinstance(authorization, str) and authorization.strip():
        parts = authorization.strip().split()
        token = parts[1] if len(parts) == 2 and parts[0].lower() == "bearer" else (parts[0] if len(parts) == 1 else None)
    elif isinstance(x_session_token, str) and x_session_token.strip():
        token = x_session_token.strip()
    session = verifier_session(token) if token else None
    if session is None and os.environ.get("PREVIA_MODE_DEV", "").strip() == "1":
        return {"id": "admin_local", "role": "admin", "email": "admin@previa.local"}
    return session


def exiger_admin(utilisateur: dict = Depends(exiger_authentification)) -> dict:
    if utilisateur.get("role") != "admin":
        raise HTTPException(403, "Accès refusé : privilèges administrateur requis")
    return utilisateur
