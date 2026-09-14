"""Backend du site vitrine PREVIA (previa-SV, voir /home/rakine/osc/web) —
uniquement les routes /inscription et /connexion pour l'instant.

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
"""
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
from fastapi import APIRouter, FastAPI, Header, HTTPException
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
# MÊME secret requis en local (.env) et sur Render (variable
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


def _compte_depuis_donnees(cle: str, data: dict) -> "Compte":
    return Compte(
        id=cle,
        prenom=data["prenom"],
        nom=data["nom"],
        entreprise=data.get("entreprise", ""),
        email=data["email"],
        role=data.get("role", "user"),
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
    reçu par FastAPI (voir Header(None) sur /moi plus bas)."""
    if not autorisation or not autorisation.startswith("Bearer "):
        raise HTTPException(401, "Non connecté.")
    jeton = autorisation.removeprefix("Bearer ").strip()
    try:
        payload = jwt.decode(jeton, JWT_SECRET, algorithms=[JWT_ALGORITHME])
    except jwt.ExpiredSignatureError:
        raise HTTPException(401, "Session expirée, reconnecte-toi.")
    except jwt.InvalidTokenError:
        raise HTTPException(401, "Session invalide.")
    return payload["sub"]


class DonneesInscription(BaseModel):
    prenom: str
    nom: str
    entreprise: str = ""
    email: EmailStr
    mot_de_passe: str


class DonneesConnexion(BaseModel):
    email: EmailStr
    mot_de_passe: str


class Compte(BaseModel):
    id: str
    prenom: str
    nom: str
    entreprise: str
    email: str
    role: str = "user"  # "user" | "admin" -- voir /admin/* plus bas


class ReponseSession(BaseModel):
    """Réponse de /inscription et /connexion : le compte, ET un jeton
    valable 10 jours (voir DUREE_SESSION) -- le frontend le garde
    (localStorage) et le renvoie ensuite sur /moi pour rester connecté
    sans redemander le mot de passe à chaque visite."""
    compte: Compte
    token: str


@app.post("/inscription", response_model=ReponseSession, summary="Crée un compte (Realtime Database, pas de Firebase Auth)")
def inscription(donnees: DonneesInscription):
    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)

    if len(donnees.mot_de_passe) < 8:
        raise HTTPException(400, "Le mot de passe doit faire au moins 8 caractères.")

    if _lire_compte(cle) is not None:
        raise HTTPException(409, "Un compte existe déjà avec cette adresse e-mail.")

    hash_ = bcrypt.hashpw(donnees.mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("ascii")

    _ecrire_compte(cle, {
        "prenom": donnees.prenom.strip(),
        "nom": donnees.nom.strip(),
        "entreprise": donnees.entreprise.strip(),
        "email": email,
        "mot_de_passe_hash": hash_,
        "cree_le": time.time(),
    })

    return ReponseSession(
        compte=_compte_depuis_donnees(cle, {
            "prenom": donnees.prenom.strip(),
            "nom": donnees.nom.strip(),
            "entreprise": donnees.entreprise.strip(),
            "email": email,
        }),
        token=_creer_token(email),
    )


@app.post("/connexion", response_model=ReponseSession, summary="Vérifie un compte (Realtime Database, pas de Firebase Auth)")
def connexion(donnees: DonneesConnexion):
    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)

    compte = _lire_compte(cle)
    if compte is None:
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")

    valide = bcrypt.checkpw(
        donnees.mot_de_passe.encode("utf-8"),
        compte["mot_de_passe_hash"].encode("utf-8"),
    )
    if not valide:
        raise HTTPException(401, "E-mail ou mot de passe incorrect.")

    return ReponseSession(
        compte=_compte_depuis_donnees(cle, compte),
        token=_creer_token(email),
    )


@app.get("/moi", response_model=Compte, summary="Vérifie un jeton de session et renvoie le compte associé")
def moi(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)

    compte = _lire_compte(cle)
    if compte is None:
        # Jeton valide mais le compte a depuis été supprimé.
        raise HTTPException(401, "Session invalide.")

    return _compte_depuis_donnees(cle, compte)


def _exiger_admin(authorization: str | None) -> tuple[str, str]:
    """Comme _email_depuis_token, mais exige en plus que le compte ait le
    rôle "admin" -- utilisé par toutes les routes /admin/*. Retourne
    (email, cle) du compte admin qui fait l'appel."""
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None or compte.get("role") != "admin":
        raise HTTPException(403, "Réservé aux administrateurs.")
    return email, cle


# ========================================================================
# Code d'amorçage — voir components/code-amorcage/ côté frontend.
# Parcours : compte (déjà fait) -> demande d'un code (OTP à 4 chiffres
# pour confirmer l'intention, voir /amorcage/demander et /confirmer) ->
# "en attente" -> un·e admin valide (PAS encore construit ici,
# volontairement : demande explicite de le faire "après en admin" --
# exposer une route de validation MAINTENANT, sans aucun système de rôle
# admin pour la protéger, laisserait n'importe qui s'auto-valider un
# code. Le modèle de données ci-dessous (statut/code/code_expire_le/
# active) est déjà prêt pour ça : construire la route de validation plus
# tard n'est qu'un simple ajout, pas une refonte).
#
# Pas de vrai envoi d'e-mail/SMS pour l'OTP (aucun service configuré) --
# le code généré est renvoyé directement dans la réponse de
# /amorcage/demander, comme la bulle "MESSAGE - 4719 is your
# verification code" de la maquette servant de référence design : une
# simulation assumée, pas une vraie 2FA pour l'instant.
# ========================================================================
def _maintenant() -> float:
    return time.time()


class ReponseOTP(BaseModel):
    otp: str
    expire_dans_secondes: int


class ConfirmerOTP(BaseModel):
    code: str


class DemandeAmorcage(BaseModel):
    statut: str  # "aucune" | "en_attente" | "validee" | "refusee"
    demandee_le: float | None = None
    code: str | None = None
    code_expire_le: float | None = None
    active: bool | None = None


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


@app.post("/amorcage/demander", response_model=ReponseOTP, summary="Démarre une demande de code d'amorçage (envoie un OTP)")
def amorcage_demander(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)

    demande_existante = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande_existante is not None and demande_existante["statut"] in ("en_attente", "validee"):
        raise HTTPException(409, "Tu as déjà une demande en cours ou un code actif.")

    otp = "".join(secrets.choice(string.digits) for _ in range(4))
    _ecrire_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}", {
        "code": otp,
        "expire_le": _maintenant() + DUREE_OTP.total_seconds(),
    })

    return ReponseOTP(otp=otp, expire_dans_secondes=int(DUREE_OTP.total_seconds()))


@app.post("/amorcage/confirmer", response_model=DemandeAmorcage, summary="Confirme l'OTP et place la demande en attente de validation")
def amorcage_confirmer(donnees: ConfirmerOTP, authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)

    otp_stocke = _lire_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
    if otp_stocke is None:
        raise HTTPException(400, "Aucune demande de code en cours -- redemande un code.")
    if _maintenant() > otp_stocke["expire_le"]:
        _supprimer_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
        raise HTTPException(400, "Code expiré -- redemande un code.")
    if donnees.code.strip() != otp_stocke["code"]:
        raise HTTPException(401, "Code incorrect.")

    _supprimer_noeud(f"{NOEUD_OTP_AMORCAGE}/{cle}")
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", {
        "email": email,
        "statut": "en_attente",
        "demandee_le": _maintenant(),
        "code": None,
        "code_expire_le": None,
        "active": False,
    })

    return _etat_demande(cle)


@app.get("/amorcage/etat", response_model=DemandeAmorcage, summary="État de la demande de code d'amorçage du compte connecté")
def amorcage_etat(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)
    return _etat_demande(cle)


class VerificationCode(BaseModel):
    valide: bool
    active: bool
    code_expire_le: float | None = None


@app.get(
    "/amorcage/verifier",
    response_model=VerificationCode,
    summary="Vérifie un code d'amorçage (public, sans jeton)",
    description=(
        "Appelée par une installation PREVIA (migration/backend, voir "
        "Infrastructure/licence.py) pour activer sa licence -- PAS par le "
        "site vitrine, qui n'a donc pas de session utilisateur à présenter "
        "ici : volontairement public, ne renvoie que le strict nécessaire "
        "(jamais l'email associé)."
    ),
)
def amorcage_verifier(code: str):
    code_normalise = code.strip().upper()
    toutes = _lire_noeud(NOEUD_DEMANDES_AMORCAGE) or {}
    for demande in toutes.values():
        if demande.get("statut") == "validee" and demande.get("code") == code_normalise:
            return VerificationCode(
                valide=True,
                active=bool(demande.get("active")),
                code_expire_le=demande.get("code_expire_le"),
            )
    return VerificationCode(valide=False, active=False, code_expire_le=None)


# ========================================================================
# Admin — voir components/admin/ côté frontend (page /previaAdmin, pas
# liée depuis la navigation publique). Toutes les routes ci-dessous
# exigent le rôle "admin" (voir _exiger_admin plus haut) ; le tout
# premier admin (khaliskone1@gmail.com) a été promu directement en base,
# à la main -- pas de route pour ça, volontairement (un self-service de
# "devenir admin" n'a pas de sens).
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
    """Vue admin d'une demande de code -- inclut la clé (id du compte
    concerné), le frontend en a besoin pour cibler les actions
    valider/refuser/activer ci-dessous."""
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
    """Comme DonneesInscription (voir /inscription), sans `entreprise` --
    pas pertinent pour un compte créé directement par un autre admin."""
    prenom: str
    nom: str
    email: EmailStr
    mot_de_passe: str


@app.post(
    "/admin/comptes",
    response_model=CompteAdmin,
    summary="Crée directement un compte admin (admin)",
    description=(
        "Comme /inscription, mais réservée à un admin déjà connecté et crée "
        "directement le compte avec `role: \"admin\"` -- évite le détour "
        "inscription (role \"user\") + POST /admin/comptes/{cle}/role pour "
        "ajouter un admin de plus à l'équipe."
    ),
    responses={409: {"description": "Un compte existe déjà avec cette adresse e-mail"}},
)
def admin_creer_compte(donnees: DonneesCreationAdmin, authorization: str | None = Header(None)):
    _exiger_admin(authorization)

    email = donnees.email.strip().lower()
    cle = _email_vers_cle(email)

    if len(donnees.mot_de_passe) < 8:
        raise HTTPException(400, "Le mot de passe doit faire au moins 8 caractères.")
    if _lire_compte(cle) is not None:
        raise HTTPException(409, "Un compte existe déjà avec cette adresse e-mail.")

    hash_ = bcrypt.hashpw(donnees.mot_de_passe.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    maintenant = time.time()
    _ecrire_compte(cle, {
        "prenom": donnees.prenom.strip(),
        "nom": donnees.nom.strip(),
        "entreprise": "",
        "email": email,
        "mot_de_passe_hash": hash_,
        "role": "admin",
        "cree_le": maintenant,
    })

    return CompteAdmin(
        id=cle, prenom=donnees.prenom.strip(), nom=donnees.nom.strip(),
        entreprise="", email=email, role="admin", cree_le=maintenant,
    )


@app.get("/admin/comptes", response_model=list[CompteAdmin], summary="Liste tous les comptes (admin)")
def admin_lister_comptes(authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    tous = _lire_noeud(NOEUD_COMPTES) or {}
    return [
        CompteAdmin(
            id=cle,
            prenom=data["prenom"],
            nom=data["nom"],
            entreprise=data.get("entreprise", ""),
            email=data["email"],
            role=data.get("role", "user"),
            cree_le=data.get("cree_le"),
        )
        for cle, data in tous.items()
    ]


@app.post("/admin/comptes/{cle}/role", response_model=CompteAdmin, summary="Change le rôle d'un compte (admin)")
def admin_changer_role(cle: str, donnees: RoleDemande, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    if donnees.role not in ("user", "admin"):
        raise HTTPException(400, "Rôle invalide.")

    compte = _lire_compte(cle)
    if compte is None:
        raise HTTPException(404, "Compte introuvable.")

    compte["role"] = donnees.role
    _ecrire_compte(cle, compte)
    return CompteAdmin(
        id=cle,
        prenom=compte["prenom"],
        nom=compte["nom"],
        entreprise=compte.get("entreprise", ""),
        email=compte["email"],
        role=compte["role"],
        cree_le=compte.get("cree_le"),
    )


@app.get("/admin/demandes", response_model=list[DemandeAdmin], summary="Liste toutes les demandes de code (admin)")
def admin_lister_demandes(authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    toutes = _lire_noeud(NOEUD_DEMANDES_AMORCAGE) or {}
    return [
        DemandeAdmin(
            cle=cle,
            email=data["email"],
            statut=data["statut"],
            demandee_le=data.get("demandee_le"),
            code=data.get("code"),
            code_expire_le=data.get("code_expire_le"),
            active=data.get("active"),
        )
        for cle, data in toutes.items()
    ]


@app.post("/admin/demandes/{cle}/valider", response_model=DemandeAdmin, summary="Valide une demande : génère le code 8 caractères, 1 an (admin)")
def admin_valider_demande(cle: str, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None:
        raise HTTPException(404, "Demande introuvable.")

    demande["statut"] = "validee"
    demande["code"] = _generer_code_amorcage()
    demande["code_expire_le"] = _maintenant() + DUREE_CODE_AMORCAGE.total_seconds()
    demande["active"] = True
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)

    return DemandeAdmin(cle=cle, **{k: demande.get(k) for k in ("email", "statut", "demandee_le", "code", "code_expire_le", "active")})


@app.post("/admin/demandes/{cle}/refuser", response_model=DemandeAdmin, summary="Refuse une demande (admin)")
def admin_refuser_demande(cle: str, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None:
        raise HTTPException(404, "Demande introuvable.")

    demande["statut"] = "refusee"
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)
    return DemandeAdmin(cle=cle, **{k: demande.get(k) for k in ("email", "statut", "demandee_le", "code", "code_expire_le", "active")})


@app.post("/admin/demandes/{cle}/actif", response_model=DemandeAdmin, summary="Active/désactive un code déjà validé (admin)")
def admin_basculer_actif(cle: str, donnees: ActifDemande, authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    demande = _lire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}")
    if demande is None or demande.get("statut") != "validee":
        raise HTTPException(404, "Aucun code validé pour cette demande.")

    demande["active"] = donnees.active
    _ecrire_noeud(f"{NOEUD_DEMANDES_AMORCAGE}/{cle}", demande)
    return DemandeAdmin(cle=cle, **{k: demande.get(k) for k in ("email", "statut", "demandee_le", "code", "code_expire_le", "active")})


# ========================================================================
# /api/v1 — couche de COMPATIBILITÉ avec le cahier des specs remis par
# l'équipe frontend (Previa_Specifications_APIs_Backend.pdf). Ce document
# suppose un système bien plus large que celui qui existe réellement
# (abonnements payants, paiement Mobile Money Orange/MTN/Moov/Wave, 2FA
# TOTP, refresh tokens, rôles SUPERADMIN/OPERATEUR, journal d'audit...) --
# RIEN de tout ça n'est implémenté ici, volontairement : PREVIA n'a pas de
# facturation, un code d'amorçage est validé gratuitement par un admin,
# pas acheté. Construire une intégration paiement/2FA sans compte
# marchand réel (Wave/Orange/MTN) ou sans vrai besoin de double
# authentification n'aurait aucun sens.
#
# Ce qui EST fait ici : les routes de la spec qui correspondent à une
# fonctionnalité RÉELLE du backend sont exposées sous /api/v1/... avec
# les mêmes noms de chemin et la même enveloppe de réponse
# ({"success": true, "data": ...} / {"success": false, "error": {...}})
# que le document -- en s'appuyant sur EXACTEMENT la même logique que les
# routes historiques ci-dessus (aucune duplication de règles métier).
# Les routes sans équivalent réel (paiement, abonnements, 2FA, refresh
# token, audit log, rôle OPERATEUR...) sont ABSENTES plutôt que
# simulées -- une fausse route qui répond 200 sans rien faire serait pire
# qu'une 404 honnête.
#
# Les routes historiques (/inscription, /connexion, /admin/..., etc.)
# restent inchangées au-dessus : previa-SV (web/lib/*.ts) les appelle
# déjà en production, aucune raison de les toucher.
# ========================================================================
def _succes(data, **meta_extra) -> dict:
    meta = {"timestamp": datetime.now(timezone.utc).isoformat()}
    meta.update(meta_extra)
    return {"success": True, "data": data, "meta": meta}


class ErreurAPIv1(Exception):
    """Levée par les routes /api/v1/* à la place de HTTPException -- pour
    qu'elles seules (pas les routes historiques, inchangées) répondent
    dans l'enveloppe d'erreur {"success": false, "error": {...}} du
    document, sans toucher au format d'erreur {"detail": "..."} dont
    previa-SV dépend déjà ailleurs (web/lib/*.ts lit `data.detail`)."""
    def __init__(self, status_code: int, code: str, message: str, details: list | None = None):
        self.status_code = status_code
        self.code = code
        self.message = message
        self.details = details or []


@app.exception_handler(ErreurAPIv1)
def _gerer_erreur_api_v1(request, exc: ErreurAPIv1):
    return JSONResponse(
        status_code=exc.status_code,
        content={"success": False, "error": {"code": exc.code, "message": exc.message, "details": exc.details}},
    )


v1 = APIRouter(prefix="/api/v1", tags=["Compatibilité spec frontend (/api/v1)"])


# ------------------------------------------------------------------------
# Auth (visiteur)
# ------------------------------------------------------------------------
@v1.post("/auth/register", summary="= POST /inscription, enveloppe {success,data}")
def v1_register(donnees: DonneesInscription):
    try:
        reponse = inscription(donnees)  # même fonction, même règles (email unique, mdp >= 8)
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "REGISTER_FAILED", exc.detail)
    return _succes({"user": reponse.compte, "accessToken": reponse.token})


@v1.post("/auth/login", summary="= POST /connexion, enveloppe {success,data}")
def v1_login(donnees: DonneesConnexion):
    try:
        reponse = connexion(donnees)
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "INVALID_CREDENTIALS", exc.detail)
    return _succes({"user": reponse.compte, "accessToken": reponse.token})


# ------------------------------------------------------------------------
# User (client connecté) -- pas de refresh token : un seul jeton, 10
# jours (voir DUREE_SESSION), contrairement au couple access 15min /
# refresh 7j de la spec -- changer ce modèle de session casserait la
# connexion déjà en place sur previa-SV pour un gain qui ne correspond à
# aucun besoin exprimé.
# ------------------------------------------------------------------------
class DonneesProfil(BaseModel):
    prenom: str | None = None
    nom: str | None = None
    entreprise: str | None = None


class DonneesMotDePasse(BaseModel):
    currentPassword: str
    newPassword: str


@v1.get("/user/profile", summary="= GET /moi, enveloppe {success,data}")
def v1_profil(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None:
        raise ErreurAPIv1(401, "SESSION_INVALID", "Session invalide.")
    return _succes(_compte_depuis_donnees(cle, compte))


@v1.put("/user/profile", summary="Modifie prenom/nom/entreprise du compte connecté")
def v1_modifier_profil(donnees: DonneesProfil, authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None:
        raise ErreurAPIv1(401, "SESSION_INVALID", "Session invalide.")
    for champ in ("prenom", "nom", "entreprise"):
        valeur = getattr(donnees, champ)
        if valeur is not None:
            compte[champ] = valeur.strip()
    _ecrire_compte(cle, compte)
    return _succes(_compte_depuis_donnees(cle, compte))


@v1.put("/user/password", summary="Change le mot de passe du compte connecté")
def v1_changer_mot_de_passe(donnees: DonneesMotDePasse, authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    cle = _email_vers_cle(email)
    compte = _lire_compte(cle)
    if compte is None:
        raise ErreurAPIv1(401, "SESSION_INVALID", "Session invalide.")
    if not bcrypt.checkpw(donnees.currentPassword.encode("utf-8"), compte["mot_de_passe_hash"].encode("utf-8")):
        raise ErreurAPIv1(400, "WRONG_PASSWORD", "Ancien mot de passe incorrect.")
    if len(donnees.newPassword) < 8:
        raise ErreurAPIv1(400, "PASSWORD_TOO_SHORT", "Le mot de passe doit faire au moins 8 caractères.")
    compte["mot_de_passe_hash"] = bcrypt.hashpw(donnees.newPassword.encode("utf-8"), bcrypt.gensalt()).decode("ascii")
    _ecrire_compte(cle, compte)
    return _succes({"message": "Mot de passe mis à jour"})


@v1.post("/user/logout", summary="204 -- rien à invalider côté serveur (JWT sans état)")
def v1_deconnexion(authorization: str | None = Header(None)):
    _email_depuis_token(authorization)  # 401 si pas connecté, comme le reste
    return JSONResponse(status_code=204, content=None)


# ------------------------------------------------------------------------
# Code d'amorçage (bootstrap-requests / bootstrap-code) -- même parcours
# que /amorcage/*, juste republié sous les noms de la spec. `:id` dans
# les chemins de la spec n'a pas d'équivalent ici (une seule demande par
# compte à la fois, jamais un historique de plusieurs id) -- accepté
# dans l'URL pour matcher le chemin, jamais utilisé.
# ------------------------------------------------------------------------
class DonneesVerifOtp(BaseModel):
    otpCode: str


@v1.get("/user/bootstrap-requests/latest", summary="= GET /amorcage/etat")
def v1_demande_actuelle(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    return _succes(_etat_demande(_email_vers_cle(email)))


@v1.get("/user/bootstrap-requests/history", summary="Historique -- 0 ou 1 élément, voir docstring de section")
def v1_historique_demandes(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    etat = _etat_demande(_email_vers_cle(email))
    return _succes([] if etat.statut == "aucune" else [etat])


@v1.post("/user/bootstrap-requests/{id}/send-otp", summary="= POST /amorcage/demander")
def v1_envoyer_otp(id: str, authorization: str | None = Header(None)):
    try:
        return _succes(amorcage_demander(authorization))
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "OTP_REQUEST_FAILED", exc.detail)


@v1.post("/user/bootstrap-requests/{id}/verify-otp", summary="= POST /amorcage/confirmer")
def v1_verifier_otp(id: str, donnees: DonneesVerifOtp, authorization: str | None = Header(None)):
    try:
        etat = amorcage_confirmer(ConfirmerOTP(code=donnees.otpCode), authorization)
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "OTP_INVALID", exc.detail)
    return _succes({"verified": True, "demande": etat})


@v1.get("/user/bootstrap-code", summary="Code d'amorçage -- seulement si la demande est validée")
def v1_code_amorcage(authorization: str | None = Header(None)):
    email = _email_depuis_token(authorization)
    etat = _etat_demande(_email_vers_cle(email))
    if etat.statut != "validee":
        raise ErreurAPIv1(404, "NO_CODE_YET", "Pas encore de code d'amorçage disponible.")
    return _succes(etat)


# ------------------------------------------------------------------------
# Admin (back-office) -- pas de 2FA/TOTP (aucun système en place), pas de
# rôle OPERATEUR (seulement "user"/"admin", voir Compte.role) : un compte
# créé via /admin/users est toujours "admin", jamais un rôle intermédiaire
# qui n'existe pas dans ce backend.
# ------------------------------------------------------------------------
@v1.post("/admin/auth/login", summary="= POST /connexion + vérifie role=='admin'")
def v1_admin_login(donnees: DonneesConnexion):
    try:
        reponse = connexion(donnees)
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "INVALID_CREDENTIALS", exc.detail)
    if reponse.compte.role != "admin":
        raise ErreurAPIv1(403, "NOT_ADMIN", "Réservé aux administrateurs.")
    return _succes({"adminUser": reponse.compte, "accessToken": reponse.token, "role": "admin"})


@v1.get("/admin/auth/me", summary="= GET /moi, réservé admin")
def v1_admin_me(authorization: str | None = Header(None)):
    email, cle = _exiger_admin(authorization)
    return _succes(_compte_depuis_donnees(cle, _lire_compte(cle)))


@v1.get("/admin/clients", summary="Comptes role=='user' -- recherche + pagination simples")
def v1_admin_clients(
    authorization: str | None = Header(None),
    search: str = "", page: int = 1, limit: int = 20,
):
    _exiger_admin(authorization)
    tous = _lire_noeud(NOEUD_COMPTES) or {}
    clients = [
        _compte_depuis_donnees(cle, d) for cle, d in tous.items()
        if d.get("role", "user") == "user"
        and (not search or search.lower() in f"{d.get('prenom','')} {d.get('nom','')} {d.get('email','')}".lower())
    ]
    debut = (max(page, 1) - 1) * limit
    return _succes({"clients": clients[debut:debut + limit], "total": len(clients)})


@v1.get("/admin/demandes", summary="= GET /admin/demandes, enveloppe {success,data}")
def v1_admin_demandes(authorization: str | None = Header(None)):
    return _succes({"demandes": admin_lister_demandes(authorization)})


@v1.post("/admin/demandes/{id}/valider", summary="= POST /admin/demandes/{cle}/valider")
def v1_admin_valider(id: str, authorization: str | None = Header(None)):
    return _succes(admin_valider_demande(id, authorization))


@v1.post("/admin/demandes/{id}/refuser", summary="= POST /admin/demandes/{cle}/refuser")
def v1_admin_refuser(id: str, authorization: str | None = Header(None)):
    return _succes(admin_refuser_demande(id, authorization))


@v1.get("/admin/users", summary="Comptes role=='admin'")
def v1_admin_users(authorization: str | None = Header(None)):
    _exiger_admin(authorization)
    tous = _lire_noeud(NOEUD_COMPTES) or {}
    return _succes([_compte_depuis_donnees(cle, d) for cle, d in tous.items() if d.get("role") == "admin"])


@v1.post("/admin/users", summary="= POST /admin/comptes -- toujours role admin, pas d'OPERATEUR")
def v1_admin_creer_user(donnees: DonneesCreationAdmin, authorization: str | None = Header(None)):
    try:
        compte = admin_creer_compte(donnees, authorization)
    except HTTPException as exc:
        raise ErreurAPIv1(exc.status_code, "CREATE_ADMIN_FAILED", exc.detail)
    return _succes(compte)


app.include_router(v1)
