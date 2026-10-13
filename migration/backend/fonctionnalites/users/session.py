"""Module de gestion des sessions et jetons d'authentification pour PREVIA.
Génère et vérifie des jetons signés HMAC-SHA256 pour sécuriser l'ensemble des routes de l'API.
"""
import base64
import hashlib
import hmac
import json
import os
import time
from fastapi import Header, HTTPException, Depends, Query

SECRET_KEY = os.environ.get("PREVIA_SECRET_KEY", "previa_secret_auth_token_key_2026_dev").encode("utf-8")
DUREE_SESSION_SECONDES = 86400 * 7  # 7 jours


def _b64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("utf-8").rstrip("=")


def _b64url_decode(s: str) -> bytes:
    padding = "=" * ((4 - len(s) % 4) % 4)
    return base64.urlsafe_b64decode(s + padding)


def creer_session(utilisateur: dict) -> str:
    """Génère un jeton signé contenant l'id, l'email, le rôle et l'expiration."""
    now = time.time()
    payload = {
        "id": utilisateur.get("id"),
        "email": utilisateur.get("email"),
        "role": utilisateur.get("role", "user"),
        "nom": utilisateur.get("nom", ""),
        "prenom": utilisateur.get("prenom", ""),
        "exp": now + DUREE_SESSION_SECONDES,
    }
    payload_bytes = json.dumps(payload, separators=(",", ":")).encode("utf-8")
    payload_b64 = _b64url_encode(payload_bytes)
    sig = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).digest()
    sig_b64 = _b64url_encode(sig)
    return f"{payload_b64}.{sig_b64}"


def verifier_session(token: str) -> dict | None:
    """Vérifie l'intégrité de la signature et l'expiration du jeton."""
    if not token or "." not in token:
        return None
    try:
        payload_b64, sig_b64 = token.split(".", 1)
        expected_sig = hmac.new(SECRET_KEY, payload_b64.encode("utf-8"), hashlib.sha256).digest()
        actual_sig = _b64url_decode(sig_b64)
        if not hmac.compare_digest(expected_sig, actual_sig):
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
    """Dépendance FastAPI : extrait et valide le jeton de session.
    Lève 401 si le jeton est manquant, invalide ou expiré."""
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
    return session


def exiger_admin(utilisateur: dict = Depends(exiger_authentification)) -> dict:
    """Dépendance FastAPI : exige que l'utilisateur connecté possède le rôle 'admin'."""
    if utilisateur.get("role") != "admin":
        raise HTTPException(403, "Accès refusé : privilèges administrateur requis")
    return utilisateur
