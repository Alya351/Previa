"""Licence PREVIA — un code d'amorçage (8 caractères, généré par un admin
sur previa-SV après validation d'une demande, voir webBackend/main.py
POST /admin/demandes/{cle}/valider) active CETTE installation pour 1 an.

Remplace l'ancien CODE_SECRET_PAR_DEFAUT statique ("2026", voir
users/defaultAdmin.py) : amorcer le tout premier admin exige maintenant
un VRAI code, obtenu sur le site officiel — ce module le vérifie une
fois en ligne (auprès de previa-SV) puis retient localement tout ce
qu'il faut pour faire vivre la licence SANS connexion ensuite (voir
etat() ci-dessous) : l'expiration est un simple timestamp comparé à
l'horloge locale, pas une vérification en ligne à chaque appel — c'est
ce qui permet au compte à rebours de continuer hors ligne.

Fichier persistant sous db/ (volume previa_db, voir docker-compose.yml)
— même volume que users/*.json, donc déjà survivant à un `docker compose
down` puis `up`, sans montage supplémentaire à ajouter."""
import json
import os
import time
from pathlib import Path

import requests

FICHIER = Path(__file__).resolve().parent.parent.parent.parent / "db" / "licence.json"

# Site vitrine PREVIA — PREVIA_LICENCE_URL permet de pointer vers un
# autre backend (test local de webBackend/) sans toucher au code, même
# principe que PREVIA_IP_PUBLIQUE (voir main.py).
URL_BASE = os.environ.get("PREVIA_LICENCE_URL", "https://tech-impact.onrender.com")
DELAI_S = 60  # L'instance Render peut se réveiller après une période d'inactivité.

# Entre deux vérifications en ligne, on ne retente qu'au plus une fois
# par intervalle -- juste pour éviter des appels en rafale si etat() est
# appelé plusieurs fois de suite (double montage React, plusieurs
# onglets...), PAS pour espacer la détection d'une désactivation :
# volontairement COURT (pas des heures) pour qu'une installation qui se
# reconnecte après avoir été hors ligne soit re-vérifiée dès le
# PROCHAIN appel (chargement de /admin, ou pire le sondage 10 min du
# frontend, voir admin.jsx) plutôt que d'attendre un long délai fixe.
# Ne dépend jamais d'internet pour autant : voir etat(), le compte à
# rebours continue même si cette revalidation échoue faute de connexion.
INTERVALLE_REVALIDATION_S = 60


class CodeInvalide(Exception):
    """Code inconnu, pas encore validé par un admin côté previa-SV,
    désactivé, ou webBackend injoignable au moment de l'activation — une
    activation, contrairement à etat(), EXIGE d'être en ligne : c'est la
    seule vérification en ligne obligatoire de tout ce mécanisme."""


def _lire() -> dict | None:
    try:
        return json.loads(FICHIER.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError):
        return None


def _ecrire(donnees: dict) -> None:
    FICHIER.parent.mkdir(parents=True, exist_ok=True)
    FICHIER.write_text(json.dumps(donnees, ensure_ascii=False, indent=2), encoding="utf-8")


def _verifier_en_ligne(code: str) -> dict:
    """Appelle previa-SV (GET /api/v1/amorcage/verifier, public, voir
    webBackend/main.py) — lève CodeInvalide si injoignable. Réponse dans
    l'enveloppe {"success": true, "data": {...}} standard de cette API
    -- seul `data` nous intéresse ici."""
    try:
        reponse = requests.get(f"{URL_BASE}/api/v1/amorcage/verifier", params={"code": code}, timeout=DELAI_S)
        reponse.raise_for_status()
        return reponse.json()["data"]
    except requests.RequestException as e:
        raise CodeInvalide(f"Impossible de vérifier ce code auprès de Previa : {e}") from e


def activer(code: str) -> dict:
    """Active (ou remplace) la licence de cette installation avec `code`.
    Exige d'être en ligne (voir _verifier_en_ligne) — une fois activée,
    voir etat() pour la suite, qui elle fonctionne hors ligne."""
    code = code.strip().upper()
    resultat = _verifier_en_ligne(code)
    if not resultat.get("valide"):
        raise CodeInvalide("Code d'amorçage inconnu ou pas encore validé par un administrateur Previa.")
    if not resultat.get("active"):
        raise CodeInvalide("Ce code a été désactivé.")
    maintenant = time.time()
    code_expire_le = resultat.get("code_expire_le") or (maintenant + 365 * 86400)
    donnees = {
        "code": code,
        "code_expire_le": code_expire_le,
        "active": True,
        "active_le": maintenant,
        "verifie_le": maintenant,
    }
    _ecrire(donnees)
    return etat()


def _revalider_si_besoin(donnees: dict) -> dict:
    if donnees.get("code", "").startswith("PREVIA-"):
        return donnees
    if time.time() - donnees.get("verifie_le", 0) < INTERVALLE_REVALIDATION_S:
        return donnees
    try:
        resultat = _verifier_en_ligne(donnees["code"])
    except CodeInvalide:
        return donnees
    if not resultat.get("valide"):
        return donnees  # code introuvable côté serveur -- garde le dernier état connu plutôt que couper direct
    donnees = {
        **donnees,
        "active": bool(resultat.get("active")),
        "code_expire_le": resultat.get("code_expire_le") or donnees.get("code_expire_le"),
        "verifie_le": time.time(),
    }
    _ecrire(donnees)
    return donnees


def etat() -> dict:
    """Statut de la licence de cette installation, calculable ENTIÈREMENT
    hors ligne (voir docstring du module) :
      - "non_amorce" : jamais activée
      - "active"     : code valide, actif, pas expiré -- `jours_restants` fourni
      - "expiree"    : code_expire_le dépassé (horloge locale)
      - "desactivee" : dernier état connu = désactivée côté previa-SV
    """
    donnees = _lire()
    if donnees is None:
        return {"statut": "non_amorce"}

    donnees = _revalider_si_besoin(donnees)

    maintenant = time.time()
    expire_le = donnees.get("code_expire_le")
    if expire_le and maintenant > expire_le:
        return {"statut": "expiree", "code_expire_le": expire_le}
    if not donnees.get("active", True):
        return {"statut": "desactivee", "code_expire_le": expire_le}

    jours_restants = int((expire_le - maintenant) // 86400) if expire_le else None
    return {"statut": "active", "code_expire_le": expire_le, "jours_restants": jours_restants}
