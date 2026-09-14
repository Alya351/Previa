"""Backend du site vitrine PREVIA (previa-SV, voir /home/rakine/osc/web) et
de son admin (/previaAdmin) — API UNIQUE sous /api/v1 (une seule couche,
pas de doublon "ancien format" + "format spec frontend" : fusionnés).

Pourquoi un backend alors que Firebase peut être appelé directement
depuis le navigateur : la demande explicite était "pas de Firebase Auth,
juste une collection" — mais Realtime Database avec des règles ouvertes
(".read": true, ".write": true) veut dire que N'IMPORTE QUI connaissant
l'URL peut lire TOUS les comptes, hash de mot de passe inclus. En
passant par ce backend à la place, les règles Realtime Database peuvent
rester complètement fermées au public (accès uniquement par la clé
secrète de la base, gardée ici, jamais envoyée au navigateur) — le
hash lui-même ne quitte donc jamais ce serveur.

Aucun SDK Firebase Admin ici : pas de compte de service fourni (juste la
config web publique, voir FIREBASE_DATABASE_URL) — on parle à Realtime
Database directement via son API REST (chaque nœud + ".json" ; voir
https://firebase.google.com/docs/reference/rest/database), avec
`?auth=FIREBASE_DATABASE_SECRET` pour l'accès admin si le secret est
fourni (voir plus bas), sinon en public (fallback pratique en dev, mais
alors aussi ouvert que l'était l'appel direct depuis le navigateur).

Format de réponse : l'équipe frontend a fourni un cahier des charges
(Previa_Specifications_APIs_Backend.pdf) qui suppose un système bien
plus large que celui qui existe réellement (abonnements payants,
paiement Mobile Money, 2FA TOTP, refresh tokens, rôle OPERATEUR, audit
log...) -- RIEN de tout ça n'est construit ici, volontairement : PREVIA
n'a pas de facturation, un code d'amorçage est validé gratuitement par
un admin, pas acheté. Ce qui EST repris de ce document : le préfixe
/api/v1 et l'enveloppe de réponse ({"success": true, "data": ...} /
{"success": false, "error": {...}}), pour toutes les routes qui
correspondent à une fonctionnalité réelle -- une seule implémentation,
consommée à la fois par previa-SV (web/lib/*.ts) et par
migration/backend (Infrastructure/licence.py, pour /amorcage/verifier)."""
import base64
import os
import secrets
import string
import time
from datetime import datetime, timedelta, timezone

import bcrypt
import jwt
import requests
from dotenv import load_dotenv
from fastapi import FastAPI, Header
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, EmailStr

load_dotenv()  # webBackend/.env en local (JWT_SECRET) -- sur Render,
# la vraie variable d'environnement du service prend le relais, ce
# fichier n'existe pas là-bas (jamais commité, voir .gitignore).

FIREBASE_DATABASE_URL = "https://iplocal-ac419-default-rtdb.firebaseio.com"

# Session de connexion : un jeton signé (JWT), pas de state côté serveur
# à gérer (pas de table "sessions") -- juste l'email + une date
# d'expiration, signés avec ce secret pour empêcher toute falsification.
# Un seul jeton, 10 jours (PAS le couple access 15min/refresh 7j du
# cahier des charges -- ce modèle de session n'existe pas ici, le
# reconstruire n'apporterait rien sans un vrai besoin de révocation
# fine). MÊME secret requis en local (.env) et sur Render (variable
# d'environnement JWT_SECRET) : sans ça, un déploiement qui tourne avec
# un secret différent de celui qui a signé un jeton le rejette comme
# invalide, et tout le monde serait déconnecté à chaque redéploiement.
JWT_SECRET = os.environ.get("JWT_SECRET", "")
if not JWT_SECRET:
    raise RuntimeError(
        "JWT_SECRET manquant -- voir webBackend/.env en local, "
        "ou la variable d'environnement du service sur Render."
    )
JWT_ALGORITHME = "HS256"
DUREE_SESSION = timedelta(days=10)

# Secret de base de données (Firebase Console -> Paramètres du projet ->
# Comptes de service -> Secrets de base de données [ancien mode], ou
# absent si le projet n'en a pas/plus généré) -- permet un accès complet
# à Realtime Database MÊME avec des règles fermées au public, sans passer
# par un compte de service complet. Optionnel : voir _params() plus bas,
# le backend fonctionne sans (juste soumis aux mêmes règles qu'un accès
# public), à fournir via variable d'environnement, jamais en dur ici.
FIREBASE_DATABASE_SECRET = os.environ.get("FIREBASE_DATABASE_SECRET", "")

NOEUD_COMPTES = "comptes"
NOEUD_OTP_AMORCAGE = "otp_amorcage"
NOEUD_DEMANDES_AMORCAGE = "demandes_amorcage"

DUREE_OTP = timedelta(minutes=10)
DUREE_CODE_AMORCAGE = timedelta(days=365)

app = FastAPI(title="PREVIA — Backend site vitrine")

# CORS ouvert aux origines de dev de previa-SV (Next.js) -- à restreindre
# au vrai domaine une fois déployé.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ========================================================================
# Enveloppe de réponse -- {"success": true, "data": ..., "meta": {...}}
# en succès, {"success": false, "error": {"code", "message", "details"}}
# en erreur (levée via ErreurAPI plutôt que HTTPException, pour que
# l'exception handler ci-dessous la mette dans l'enveloppe automatiquement
# -- chaque route n'a donc qu'à `raise ErreurAPI(...)`, jamais à
# construire la réponse d'erreur elle-même).
# ========================================================================
def _succes(data, **meta_extra) -> dict:
    meta = {"timestamp": datetime.now(timezone.utc).isoformat()}
    meta.update(meta_extra)
    return {"success": True, "data": data, "meta": meta}


class ErreurAPI(Exception):
    def __init__(self, status_code: int, code: str, message: str, details: list | None = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


@app.exception_handler(ErreurAPI)
def _gerer_erreur_api(request, exc: ErreurAPI):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


# ========================================================================
# Accès Realtime Database (REST)
# ========================================================================
def _params() -> dict:
    return {"auth": FIREBASE_DATABASE_SECRET} if FIREBASE_DATABASE_SECRET else {}


def _email_vers_cle(email: str) -> str:
    """Même encodage que emailVersCle() côté frontend
    (web/lib/comptes.ts) -- les clés Realtime Database ne peuvent pas
    contenir `. # $ [ ] /`, l'email (qui contient toujours un point) est
    donc encodé en base64url avant de servir de clé. Ça permet une
    lecture directe par email (GET en O(1)) plutôt qu'une requête
    orderByChild sur tout le nœud à chaque connexion."""
    normalise = email.strip().lower()
    b64 = base64.urlsafe_b64encode(normalise.encode("utf-8")).decode("ascii")
    return b64.rstrip("=")


def _lire_noeud(chemin: str) -> dict | None:
    reponse = requests.get(f"{FIREBASE_DATABASE_URL}/{chemin}.json", params=_params(), timeout=8)
    reponse.raise_for_status()
    return reponse.json()  # None si rien à ce chemin


def _ecrire_noeud(chemin: str, donnees: dict) -> None:
    reponse = requests.put(f"{FIREBASE_DATABASE_URL}/{chemin}.json", params=_params(), json=donnees, timeout=8)
    reponse.raise_for_status()


def _supprimer_noeud(chemin: str) -> None:
    reponse = requests.delete(f"{FIREBASE_DATABASE_URL}/{chemin}.json", params=_params(), timeout=8)
    reponse.raise_for_status()


def _lire_compte(cle: str) -> dict | None:
    return _lire_noeud(f"{NOEUD_COMPTES}/{cle}")


def _ecrire_compte(cle: str, donnees: dict) -> None:
    _ecrire_noeud(f"{NOEUD_COMPTES}/{cle}", donnees)


# ========================================================================
# Comptes & authentification
# ========================================================================
class Compte(BaseModel):
    id: str
    prenom: str
    nom: str
    entreprise: str
    email: str
    role: str = "user"  # "user" | "admin"
    cree_le: float | None = None


class DonneesInscription(BaseModel):
    prenom: str
    nom: str
    entreprise: str = ""
    email: EmailStr
    mot_de_passe: str


class DonneesConnexion(BaseModel):
    email: EmailStr
    mot_de_passe: str


class DonneesProfil(BaseModel):
    prenom: str | None = None
    nom: str | None = None
    entreprise: str | None = None


class DonneesMotDePasse(BaseModel):
    currentPassword: str
    newPassword: str


def _compte_depuis_donnees(cle: str, data: dict) -> Compte:
    return Compte(
        id=cle,
        prenom=data["prenom"],
        nom=data["nom"],
        entreprise=data.get("entreprise", ""),
        email=data["email"],
        role=data.get("role", "user"),
        cree_le=data.get("cree_le"),
    )


def _creer_token(email: str) -> str:
    maintenant = datetime.now(timezone.utc)
    return jwt.encode(
        {"sub": email, "iat": maintenant, "exp": maintenant + DUREE_SESSION},
        JWT_SECRET,
        algorithm=JWT_ALGORITHME,
    )


def _email_depuis_token(autorisation: str | None) -> str:
    """`autorisation` = en-tête "Authorization: Bearer <jeton>" tel que
    reçu par FastAPI (voir Header(None) sur les routes protégées)."""
    if not autorisation or not autorisation.startswith("Bearer "):
        raise ErreurAPI(401, "NOT_AUTHENTICATED", "Non connecté.")
    jeton = autorisation.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(jeton, JWT_SECRET, algorithms=[JWT_ALGORITHME])
    except jwt.ExpiredSignatureError:
        raise ErreurAPI(401, "SESSION_EXPIRED", "Session expirée, reconnecte-toi.")
    except jwt.InvalidTokenError:
        raise ErreurAPI(401, "SESSION_INVALID", "Session invalide.")
    return payload["sub"]


def _compte_connecte(autorisation: str | None) -> tuple[str, dict]:
    """(cle, donnees) du compte associé au jeton -- lève ErreurAPI si le
    compte a depuis été supprimé (jeton valide mais compte disparu)."""
    email = _email_depuis_token(autorisation)
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None:
        raise ErreurAPI(401, "SESSION_INVALID", "Session invalide.")
    return cle, compte


def _exiger_admin(autorisation: str | None) -> tuple[str, dict]:
    """Comme _compte_connecte, mais exige en plus le rôle "admin" --
    utilisé par toutes les routes /admin/*."""
    cle, compte = _compte_connecte(autorisation)
    if compte.get("role") != "admin":
        raise ErreurAPI(403, "NOT_ADMIN", "Réservé aux administrateurs.")
    return cle, compte


@app.post("/api/v1/auth/register", summary="Crée un compte")
def inscription(donnees: DonneesInscription):
    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)

    if len(donnees.mot_de_passe) < 8:
        raise ErreurAPI(400, "PASSWORD_TOO_SHORT", "Le mot de passe doit faire au moins 8 caractères.")
    if _lire_compte(cle) is not None:
        raise ErreurAPI(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.")

    hash_ = bcrypt.hashpw(donnees.mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    maintenant = time.time()
    _ecrire_compte(cle, {
        "prenom": donnees.prenom.strip(),
        "nom": donnees.nom.strip(),
        "entreprise": donnees.entreprise.strip(),
        "email": email,
        "mot_de_passe_hash": hash_,
        "cree_le": maintenant,
    })

    compte = _compte_depuis_donnees(cle, {
        "prenom": donnees.prenom.strip(), "nom": donnees.nom.strip(),
        "entreprise": donnees.entreprise.strip(), "email": email, "cree_le": maintenant,
    })
    return _succes({"user": compte, "accessToken": _creer_token(email)})


@app.post("/api/v1/auth/login", summary="Vérifie email + mot de passe, renvoie le compte et un jeton")
def connexion(donnees: DonneesConnexion):
    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None or not bcrypt.checkpw(donnees.mot_de_passe.encode("utf-8"), compte["mot_de_passe_hash"].encode("utf-8")):
        raise ErreurAPI(401, "INVALID_CREDENTIALS", "E-mail ou mot de passe incorrect.")
    return _succes({"user": _compte_depuis_donnees(cle, compte), "accessToken": _creer_token(email)})


@app.get("/api/v1/user/profile", summary="Compte du jeton de session fourni")
def profil(authorization: str | None = Header(None)):
    cle, compte = _compte_connecte(authorization)
    return _succes(_compte_depuis_donnees(cle, compte))


@app.put("/api/v1/user/profile", summary="Modifie prenom/nom/entreprise du compte connecté")
def modifier_profil(donnees: DonneesProfil, authorization: str | None = Header(None)):
    cle, compte = _compte_connecte(authorization)
    for champ in ("prenom", "nom", "entreprise"):
        valeur = getattr(donnees, champ)
        if valeur is not None:
            compte[champ] = valeur.strip()
    _ecrire_compte(cle, compte)
    return _succes(_compte_depuis_donnees(cle, compte))


@app.put("/api/v1/user/password", summary="Change le mot de passe du compte connecté")
def changer_mot_de_passe(donnees: DonneesMotDePasse, authorization: str | None = Header(None)):
    cle, compte = _compte_connecte(authorization)
    if not bcrypt.checkpw(donnees.currentPassword.encode("utf-8"), compte["mot_de_passe_hash"].encode("utf-8")):
        raise ErreurAPI(400, "WRONG_PASSWORD", "Ancien mot de passe incorrect.")
    if len(donnees.newPassword) < 8:
        raise ErreurAPI(400, "PASSWORD_TOO_SHORT", "Le mot de passe doit faire au moins 8 caractères.")
    compte["mot_de_passe_hash"] = bcrypt.hashpw(donnees.newPassword.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    _ecrire_compte(cle, compte)
    return _succes({"message": "Mot de passe mis à jour"})


@app.post("/api/v1/user/logout", summary="204 -- rien à invalider côté serveur (JWT sans état)")
def deconnexion(authorization: str | None = Header(None)):
    _email_depuis_token(authorization)  # 401 si pas connecté, comme le reste
    return JSONResponse(status_code=204, content=None)


# ========================================================================
# Code d'amorçage — voir components/code-amorcage/ côté frontend.
# Parcours : compte (déjà fait) -> demande d'un code (OTP à 4 chiffres
# pour confirmer l'intention) -> "en attente" -> un·e admin valide
# (génère le code 8 caractères, actif 1 an) -> le compte peut le
# récupérer/l'activer. Pas de vrai envoi d'e-mail/SMS pour l'OTP (aucun
# service configuré) -- le code généré est renvoyé directement dans la
# réponse, comme la bulle "MESSAGE - 4719 is your verification code" de
# la maquette servant de référence design : une simulation assumée, pas
# une vraie 2FA pour l'instant.
# ========================================================================
class DemandeAmorcage(BaseModel):
    statut: str  # "aucune" | "en_attente" | "validee" | "refusee"
    demandee_le: float | None = None
    code: str | None = None
    code_expire_le: float | None = None
    active: bool | None = None


class DonneesVerifOtp(BaseModel):
    otpCode: str


def _etat_demande(cle: str) -> DemandeAmorcage:
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None:
        return DemandeAmorcage(statut="aucune")
    return DemandeAmorcage(
        statut=demande["statut"],
        demandee_le=demande.get("demandee_le"),
        code=demande.get("code"),
        code_expire_le=demande.get("code_expire_le"),
        active=demande.get("active"),
    )


@app.get("/api/v1/user/bootstrap-requests/latest", summary="État de la demande de code du compte connecté")
def demande_actuelle(authorization: str | None = Header(None)):
    cle, _ = _compte_connecte(authorization)
    return _succes(_etat_demande(cle))


@app.get("/api/v1/user/bootstrap-requests/history", summary="Historique -- 0 ou 1 élément, une seule demande possible à la fois")
def historique_demandes(authorization: str | None = Header(None)):
    cle, _ = _compte_connecte(authorization)
    etat = _etat_demande(cle)
    return _succes([] if etat.statut == "aucune" else [etat])


@app.post("/api/v1/user/bootstrap-requests/send-otp", summary="Démarre une demande de code (envoie un OTP)")
def envoyer_otp(authorization: str | None = Header(None)):
    cle, _ = _compte_connecte(authorization)
    demande_existante = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande_existante is not None and demande_existante["statut"] in ("en_attente", "validee"):
        raise ErreurAPI(409, "REQUEST_ALREADY_EXISTS", "Tu as déjà une demande en cours ou un code actif.")

    otp = "".join(secrets.choice(string.digits) for _ in range(4))
    _ecrire_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}", {"code": otp, "expire_le": time.time() + DUREE_OTP.total_seconds()})
    return _succes({"otp": otp, "expiresInSeconds": int(DUREE_OTP.total_seconds())})


@app.post("/api/v1/user/bootstrap-requests/verify-otp", summary="Confirme l'OTP, place la demande en attente de validation admin")
def verifier_otp(donnees: DonneesVerifOtp, authorization: str | None = Header(None)):
    cle, compte = _compte_connecte(authorization)

    otp_stocke = _lire_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
    if otp_stocke is None:
        raise ErreurAPI(400, "NO_OTP_PENDING", "Aucune demande de code en cours -- redemande un code.")
    if time.time() > otp_stocke["expire_le"]:
        _supprimer_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
        raise ErreurAPI(400, "OTP_EXPIRED", "Code expiré -- redemande un code.")
    if donnees.otpCode.strip() != otp_stocke["code"]:
        raise ErreurAPI(401, "OTP_INVALID", "Code incorrect.")

    _supprimer_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", {
        "email": compte["email"], "statut": "en_attente", "demandee_le": time.time(),
        "code": None, "code_expire_le": None, "active": False,
    })
    return _succes({"verified": True, "demande": _etat_demande(cle)})


@app.get("/api/v1/user/bootstrap-code", summary="Code d'amorçage -- seulement si la demande a été validée par un admin")
def code_amorcage(authorization: str | None = Header(None)):
    cle, _ = _compte_connecte(authorization)
    etat = _etat_demande(cle)
    if etat.statut != "validee":
        raise ErreurAPI(404, "NO_CODE_YET", "Pas encore de code d'amorçage disponible.")
    return _succes(etat)


class VerificationCode(BaseModel):
    valide: bool
    active: bool
    code_expire_le: float | None = None


@app.get(
    "/api/v1/amorcage/verifier",
    summary="Vérifie un code d'amorçage (public, sans jeton)",
    description=(
        "Appelée par une installation PREVIA (migration/backend, voir "
        "Infrastructure/licence.py) pour activer sa licence -- PAS par le "
        "site vitrine, qui n'a donc pas de session utilisateur à présenter "
        "ici : volontairement public, ne renvoie que le strict nécessaire "
        "(jamais l'email associé)."
    ),
)
def verifier_code_amorcage(code: str):
    code_normalise = code.strip().upper()
    toutes = _lire_noeud(NOEUD_DEMANDES_AMORCAGE) or {}
    for demande in toutes.values():
        if demande.get("statut") == "validee" and demande.get("code") == code_normalise:
            return _succes(VerificationCode(valide=True, active=bool(demande.get("active")), code_expire_le=demande.get("code_expire_le")))
    return _succes(VerificationCode(valide=False, active=False, code_expire_le=None))


# ========================================================================
# Admin — voir components/admin/ côté frontend (page /previaAdmin, pas
# liée depuis la navigation publique). Toutes les routes ci-dessous
# exigent le rôle "admin" (voir _exiger_admin plus haut) ; le tout
# premier admin (khaliskone1@gmail.com) a été promu directement en base,
# à la main -- pas de route pour ça, volontairement (un self-service de
# "devenir admin" n'a pas de sens). Un seul rôle admin (pas de
# SUPERADMIN/OPERATEUR : cette distinction n'existe pas ici).
# ========================================================================
def _generer_code_amorcage() -> str:
    alphabet = string.ascii_uppercase + string.digits
    return "".join(secrets.choice(alphabet) for _ in range(8))


class CompteAdmin(BaseModel):
    """Vue admin d'un compte -- jamais le hash du mot de passe."""
    id: str
    prenom: str
    nom: str
    entreprise: str
    email: str
    role: str
    cree_le: float | None = None


class DemandeAdmin(BaseModel):
    cle: str
    email: str
    statut: str
    demandee_le: float | None = None
    code: str | None = None
    code_expire_le: float | None = None
    active: bool | None = None


class RoleDemande(BaseModel):
    role: str  # "user" | "admin"


class ActifDemande(BaseModel):
    active: bool


class DonneesCreationAdmin(BaseModel):
    prenom: str
    nom: str
    email: EmailStr
    mot_de_passe: str


@app.get("/api/v1/admin/comptes", summary="Liste tous les comptes (admin)")
def admin_lister_comptes(authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    tous = _lire_noeud(NOEUD_COMPTES) or {}
    return _succes([
        CompteAdmin(
            id=cle, prenom=data["prenom"], nom=data["nom"], entreprise=data.get("entreprise", ""),
            email=data["email"], role=data.get("role", "user"), cree_le=data.get("cree_le"),
        )
        for cle, data in tous.items()
    ])


@app.post("/api/v1/admin/comptes", summary="Crée directement un compte admin (admin)")
def admin_creer_compte(donnees: DonneesCreationAdmin, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)

    if len(donnees.mot_de_passe) < 8:
        raise ErreurAPI(400, "PASSWORD_TOO_SHORT", "Le mot de passe doit faire au moins 8 caractères.")
    if _lire_compte(cle) is not None:
        raise ErreurAPI(409, "EMAIL_TAKEN", "Un compte existe déjà avec cette adresse e-mail.")

    hash_ = bcrypt.hashpw(donnees.mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    maintenant = time.time()
    _ecrire_compte(cle, {
        "prenom": donnees.prenom.strip(), "nom": donnees.nom.strip(), "entreprise": "",
        "email": email, "mot_de_passe_hash": hash_, "role": "admin", "cree_le": maintenant,
    })
    return _succes(CompteAdmin(id=cle, prenom=donnees.prenom.strip(), nom=donnees.nom.strip(), entreprise="", email=email, role="admin", cree_le=maintenant))


@app.post("/api/v1/admin/comptes/{cle}/role", summary="Change le rôle d'un compte (admin)")
def admin_changer_role(cle: str, donnees: RoleDemande, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    if donnees.role not in ("user", "admin"):
        raise ErreurAPI(400, "INVALID_ROLE", "Rôle invalide.")

    compte = _lire_compte(cle)
    if compte is None:
        raise ErreurAPI(404, "ACCOUNT_NOT_FOUND", "Compte introuvable.")

    compte["role"] = donnees.role
    _ecrire_compte(cle, compte)
    return _succes(CompteAdmin(id=cle, prenom=compte["prenom"], nom=compte["nom"], entreprise=compte.get("entreprise", ""), email=compte["email"], role=compte["role"], cree_le=compte.get("cree_le")))


@app.get("/api/v1/admin/demandes", summary="Liste toutes les demandes de code (admin)")
def admin_lister_demandes(authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    toutes = _lire_noeud(NOEUD_DEMANDES_AMORCAGE) or {}
    return _succes([
        DemandeAdmin(
            cle=cle, email=data["email"], statut=data["statut"], demandee_le=data.get("demandee_le"),
            code=data.get("code"), code_expire_le=data.get("code_expire_le"), active=data.get("active"),
        )
        for cle, data in toutes.items()
    ])


def _demande_admin(cle: str, demande: dict) -> DemandeAdmin:
    return DemandeAdmin(cle=cle, **{k: demande.get(k) for k in ("email", "statut", "demandee_le", "code", "code_expire_le", "active")})


@app.post("/api/v1/admin/demandes/{cle}/valider", summary="Valide une demande : génère le code 8 caractères, 1 an (admin)")
def admin_valider_demande(cle: str, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None:
        raise ErreurAPI(404, "REQUEST_NOT_FOUND", "Demande introuvable.")

    demande["statut"] = "validee"
    demande["code"] = _generer_code_amorcage()
    demande["code_expire_le"] = time.time() + DUREE_CODE_AMORCAGE.total_seconds()
    demande["active"] = True
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)
    return _succes(_demande_admin(cle, demande))


@app.post("/api/v1/admin/demandes/{cle}/refuser", summary="Refuse une demande (admin)")
def admin_refuser_demande(cle: str, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None:
        raise ErreurAPI(404, "REQUEST_NOT_FOUND", "Demande introuvable.")

    demande["statut"] = "refusee"
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)
    return _succes(_demande_admin(cle, demande))


@app.post("/api/v1/admin/demandes/{cle}/actif", summary="Active/désactive un code déjà validé (admin)")
def admin_basculer_actif(cle: str, donnees: ActifDemande, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None or demande.get("statut") != "validee":
        raise ErreurAPI(404, "NO_VALIDATED_CODE", "Aucun code validé pour cette demande.")

    demande["active"] = donnees.active
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)
    return _succes(_demande_admin(cle, demande))
