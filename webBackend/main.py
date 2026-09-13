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
import time

import bcrypt
import requests
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, EmailStr

FIREBASE_DATABASE_URL = "https://iplocal-ac419-default-rtdb.firebaseio.com"

# Secret de base de données (Firebase Console -> Paramètres du projet ->
# Comptes de service -> Secrets de base de données [ancien mode], ou
# absent si le projet n'en a pas/plus généré) -- permet un accès complet
# à Realtime Database MÊME avec des règles fermées au public, sans passer
# par un compte de service complet. Optionnel : voir _params() plus bas,
# le backend fonctionne sans (juste soumis aux mêmes règles qu'un accès
# public), à fournir via variable d'environnement, jamais en dur ici.
FIREBASE_DATABASE_SECRET = os.environ.get("FIREBASE_DATABASE_SECRET", "")

NOEUD_COMPTES = "comptes"

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


def _lire_compte(cle: str) -> dict | None:
    reponse = requests.get(
        f"{FIREBASE_DATABASE_URL}/{NOEUD_COMPTES}/{cle}.json",
        params=_params(),
        timeout=8,
    )
    reponse.raise_for_status()
    return reponse.json()  # None si rien à cette clé


def _ecrire_compte(cle: str, donnees: dict) -> None:
    reponse = requests.put(
        f"{FIREBASE_DATABASE_URL}/{NOEUD_COMPTES}/{cle}.json",
        params=_params(),
        json=donnees,
        timeout=8,
    )
    reponse.raise_for_status()


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


@app.post("/inscription", response_model=Compte, summary="Crée un compte (Realtime Database, pas de Firebase Auth)")
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

    return Compte(
        id=cle,
        prenom=donnees.prenom.strip(),
        nom=donnees.nom.strip(),
        entreprise=donnees.entreprise.strip(),
        email=email,
    )


@app.post("/connexion", response_model=Compte, summary="Vérifie un compte (Realtime Database, pas de Firebase Auth)")
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

    return Compte(
        id=cle,
        prenom=compte["prenom"],
        nom=compte["nom"],
        entreprise=compte.get("entreprise", ""),
        email=compte["email"],
    )
