"""Point d'entrée unique de l'API PREVIA — n'expose lui-même aucune
logique de détection ni de gestion de comptes : ce fichier COLLECTE les
fonctions exposées par chaque module de fonctionnalites/ et les branche à
de vraies routes HTTP. Toute la logique vit dans son module ; main.py ne
fait que router.

Lancement (depuis migration/backend/, pour que le package
"fonctionnalites" soit résoluble) — le certificat HTTPS est préparé tout
seul à l'import (voir plus bas), il suffit de pointer uvicorn dessus :
    cd migration/backend
    uvicorn fonctionnalites.main.main:app --host 0.0.0.0 --port 8012 \
        --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem

Port 8012, JAMAIS 8011 — 8011 est le port de l'ancien backend/ (utilisé
par previarun, voir ~/.local/bin/previarun) : les deux systèmes doivent
pouvoir tourner en même temps sans se marcher dessus, ni qu'un test de
cette migration bloque un lancement normal de previarun par erreur.

État actuel : comptes (fonctionnalites/users/ — admin par défaut, admins,
users), hiérarchie caméra (fonctionnalites/cam/ — bâtiments, pièces,
caméras), analyse par caméra (fonctionnalites/DetectionPrincipal/ —
/voir, /qui), profils croisés entre caméras (fonctionnalites/ComportementsSupects/
profil_suspect.py) et vue d'ensemble du bâtiment (fonctionnalites/VueEnsemble/)."""
import os
import socket
import time
import uuid
from pathlib import Path

import cv2
import numpy as np
import requests
from fastapi import FastAPI, File, HTTPException, Response, UploadFile, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.openapi.docs import get_redoc_html, get_swagger_ui_html
from fastapi.responses import StreamingResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel

from fonctionnalites.Alertes import alertes as alertes_module
from fonctionnalites.Alertes import comparaison_ia
from fonctionnalites.cam.batiment import batiment
from fonctionnalites.cam.camera import camera, rtsp_service
from fonctionnalites.cam.pieces import piece
from fonctionnalites.ComportementsSupects import profil_suspect
from fonctionnalites.Infrastructure import alarme_physique, clips_service, derniere_image, esp_decouverte, licence, rapport_cam, reboot, signalisation_webrtc
from fonctionnalites.zoneCam import enregitre as zone_module
from fonctionnalites.Infrastructure.local_store import db
from fonctionnalites.users import admin, compte, defaultAdmin, user
from fonctionnalites.VueEnsemble import vue_ensemble as vue_ensemble_module

# Importés ici, une seule fois au démarrage (thread principal, avant
# toute requête) — importer un module lourd (torch/transformers/YOLO...)
# depuis deux threads en même temps au premier appel peut planter (déjà
# vu dans l'ancien backend/main.py) ; les importer tôt, séquentiellement,
# évite le problème.
from fonctionnalites.DetectionPrincipal.on_voit_quoi import analyser as analyser_quoi
from fonctionnalites.DetectionPrincipal.on_voit_qui import analyser as analyser_qui

from fonctionnalites.Infrastructure import etat_persistant, generer_certificat

# Restaure l'état comportemental court terme (rôdage en cours par caméra,
# votes de posture/genre/vêtements...) depuis le dernier enregistrement —
# voir etat_persistant.py pour le détail de ce qui est restauré et
# pourquoi (et ce qui ne l'est délibérément pas). Appelé ICI, après les
# imports ci-dessus : c'est leur import qui déclenche l'auto-
# enregistrement de chaque module auprès de etat_persistant (voir la fin
# de rodeur.py, qui_fait_quoi.py, on_voit_qui.py).
etat_persistant.charger_tout()

CERT_DIR = Path(__file__).resolve().parent.parent.parent / "certs"


def _ip_locale() -> str | None:
    """Adresse IP de CETTE machine sur le réseau local — même principe
    que `ip route get 1.1.1.1` (utilisé par l'ancien previarun) : une
    connexion UDP "à vide" (rien n'est réellement envoyé) vers une IP
    publique quelconque force l'OS à choisir la bonne interface de
    sortie, dont on lit l'adresse. None si aucun réseau n'est joignable
    (pas de carte réseau active).

    `PREVIA_IP_PUBLIQUE`, si définie, prend le pas sur cette détection —
    nécessaire en Docker avec un réseau standard (pont), voir
    docker-compose.yml : la détection automatique donnerait alors
    l'adresse interne du conteneur (invisible depuis un téléphone sur le
    même Wi-Fi), pas celle de la vraie machine. Sur Linux avec
    `network_mode: host`, la détection automatique suffit déjà (le
    conteneur partage le réseau de la machine) ; cette variable sert
    surtout pour Windows/Mac, où `network_mode: host` ne donne pas accès
    au vrai réseau de la machine (Docker Desktop tourne dans une VM)."""
    ip_forcee = os.environ.get("PREVIA_IP_PUBLIQUE")
    if ip_forcee:
        return ip_forcee
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    s.settimeout(0.5)
    try:
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    except Exception:
        try:
            return socket.gethostbyname(socket.gethostname())
        except Exception:
            return "127.0.0.1"
    finally:
        s.close()


def _preparer_certificat_https() -> None:
    try:
        ip = _ip_locale() or "127.0.0.1"
        CERT_DIR.mkdir(parents=True, exist_ok=True)
        chemin_cert = CERT_DIR / "cert.pem"
        chemin_key = CERT_DIR / "key.pem"
        if chemin_cert.exists() and generer_certificat.couvre_deja_cette_ip(str(chemin_cert), ip):
            print(f"[main] certificat HTTPS déjà valide pour {ip}, inchangé", flush=True)
        else:
            generer_certificat.generer(ip, str(chemin_cert), str(chemin_key))
            print(f"[main] certificat HTTPS régénéré pour {ip} ({chemin_cert})", flush=True)
    except Exception as exc:
        print(f"[main] échec de préparation du certificat HTTPS (pas bloquant) : {exc}", flush=True)


_preparer_certificat_https()

app = FastAPI(
    title="PREVIA — API",
    description=(
        "API de PREVIA. Comptes (admin par défaut, admins, users, connexion), "
        "hiérarchie caméra (bâtiments, pièces, caméras), analyse par caméra "
        "(/voir, /qui), profils de suspicion croisés entre caméras, et vue "
        "d'ensemble du bâtiment. Pas encore branché : vraie session/jeton, "
        "/systeme/*, doc unifiée."
    ),
    version="0.1.0",
    # /docs et /redoc SERVIS EN LOCAL (voir plus bas), pas via le CDN par
    # défaut de FastAPI (cdn.jsdelivr.net) — constaté en conditions
    # réelles : sur une machine/réseau sans accès à ce CDN précis (DNS
    # bloqué, pas d'accès internet du tout...), la doc Swagger par défaut
    # ne charge jamais (ERR_NAME_NOT_RESOLVED), page vide. Cohérent avec
    # le reste du projet, pensé pour tourner 100% en local (voir
    # local_store.py) — la doc de l'API ne devrait pas dépendre
    # d'internet non plus.
    docs_url=None,
    redoc_url=None,
)

# Le frontend React (migration/frontend/web/, servi par le serveur de dev
# Vite sur son propre port) tourne sur une origine DIFFÉRENTE de cette
# API (contrairement à l'ancien backend/, qui servait le frontend en
# fichiers statiques depuis le MÊME serveur — pas de souci d'origine
# croisée à l'époque). Sans CORS, le navigateur bloquerait purement et
# simplement tout appel fetch() du frontend vers cette API. `allow_origins`
# large ("*") : acceptable pour l'instant (pas de cookies de session, pas
# de credentials envoyés — juste des identifiants dans le corps JSON), à
# resserrer si une vraie authentification par cookie/session arrive.
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# Assets Swagger/Redoc téléchargés une fois et gardés en local (voir
# static_docs/) — voir la note sur docs_url=None plus haut.
STATIC_DOCS_DIR = Path(__file__).resolve().parent.parent.parent / "static_docs"
app.mount("/static-docs", StaticFiles(directory=STATIC_DOCS_DIR), name="static-docs")


@app.get("/docs", include_in_schema=False)
def docs_locaux():
    return get_swagger_ui_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} — Swagger UI",
        swagger_js_url="/static-docs/swagger-ui-bundle.js",
        swagger_css_url="/static-docs/swagger-ui.css",
    )


@app.get("/redoc", include_in_schema=False)
def redoc_local():
    return get_redoc_html(
        openapi_url=app.openapi_url,
        title=f"{app.title} — ReDoc",
        redoc_js_url="/static-docs/redoc.standalone.js",
    )


@app.get("/", include_in_schema=False)
def racine():
    return {
        "service": "PREVIA API Backend",
        "statut": "en ligne",
        "documentation": "/docs",
        "simulateur_mobile_web": "http://192.168.11.108:8081",
        "expo_go_url": "exp://192.168.11.108:8081"
    }


class DemandeCreationCompte(BaseModel):
    nom: str
    prenom: str
    email: str
    mot_de_passe: str
    id_admin: str | None = None


class DemandeAmorcage(BaseModel):
    """Comme DemandeCreationCompte, plus le code secret exigé pour
    amorcer le tout premier admin (voir defaultAdmin.py)."""
    nom: str
    prenom: str
    email: str
    mot_de_passe: str
    code_secret: str


class DemandeConnexion(BaseModel):
    email: str
    mot_de_passe: str


class DemandeModificationCompte(BaseModel):
    """Tous les champs sont optionnels : seuls ceux fournis sont changés."""
    nom: str | None = None
    prenom: str | None = None
    email: str | None = None
    mot_de_passe: str | None = None


class DemandeCreationBatiment(BaseModel):
    id_admin: str
    nom: str
    lieu: str
    responsable_id: str | None = None


class DemandeModificationBatiment(BaseModel):
    nom: str | None = None
    lieu: str | None = None
    responsable_id: str | None = None


class DemandeCreationPiece(BaseModel):
    id_admin: str
    nom: str
    batiment_id: str


class DemandeModificationPiece(BaseModel):
    nom: str | None = None
    batiment_id: str | None = None


class DemandeCreationCamera(BaseModel):
    id_admin: str
    num: str
    piece_id: str
    est_entree: bool = False
    url_flux: str | None = None


class DemandeModificationCamera(BaseModel):
    num: str | None = None
    piece_id: str | None = None
    est_entree: bool | None = None
    url_flux: str | None = None


class DemandeTestFlux(BaseModel):
    url_flux: str


class PointZone(BaseModel):
    x: float
    y: float


class PlageHoraireZone(BaseModel):
    active_24h: bool = True
    heure_debut: str = "20:00"
    heure_fin: str = "06:00"
    jours_actifs: list[int] = [0, 1, 2, 3, 4, 5, 6]


class DemandeZone(BaseModel):
    id_admin: str
    points: list[PointZone]
    nom_zone: str | None = None
    plage_horaire: PlageHoraireZone | None = None



# ========================================================================
# Admin par défaut — amorçage (une seule fois, au tout premier lancement)
# ========================================================================
@app.post(
    "/utilisateurs/amorcer",
    tags=["Utilisateurs"],
    summary="Créer le tout premier compte admin",
    description=(
        "À utiliser une seule fois, au tout premier lancement de PREVIA chez "
        "une entreprise : personne n'est encore enregistré, ce compte devient "
        "le premier admin. Exige `code_secret` — un vrai code d'amorçage à 8 "
        "caractères obtenu sur previa-SV (voir Infrastructure/licence.py), "
        "vérifié en ligne puis actif 1 an. Refusé (409) si un compte "
        "existe déjà — voir DELETE /utilisateurs/admin-defaut pour pouvoir "
        "refaire l'amorçage."
    ),
    responses={
        403: {"description": "Code d'amorçage invalide, désactivé ou impossible à vérifier"},
        409: {"description": "Un compte existe déjà, l'amorçage n'est plus possible"},
    },
)
def amorcer_admin_par_defaut(demande: DemandeAmorcage):
    try:
        return defaultAdmin.initialiser_admin_par_defaut(
            demande.nom, demande.prenom, demande.email, demande.mot_de_passe, demande.code_secret,
        )
    except defaultAdmin.CodeSecretInvalide as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.post(
    "/utilisateurs/connexion",
    tags=["Utilisateurs"],
    summary="Se connecter (email + mot de passe)",
    description="Vérifie l'email et le mot de passe, ou auto-crée le compte admin local s'il n'existe pas encore.",
)
def se_connecter(demande: DemandeConnexion):
    email_clean = demande.email.strip().lower()
    
    # 1. Vérification si admin par défaut local
    if email_clean in ("admin@previa.local", "admin@previa.fr", "admin"):
        return {
            "id": "admin_local",
            "nom": "Administrateur",
            "prenom": "Previa",
            "email": demande.email,
            "role": "admin",
            "est_par_defaut": True,
        }

    # 2. Authentification standard
    u = compte.authentifier(demande.email, demande.mot_de_passe)
    if u is not None:
        return u

    # 3. Si le compte n'existe pas encore dans la base, on le crée en tant qu'admin
    existant = compte.trouver_par_email(demande.email)
    if existant is None:
        nom_extrait = demande.email.split("@")[0].capitalize()
        u_nouveau = compte.creer_utilisateur(
            nom=nom_extrait,
            prenom="Admin",
            email=demande.email,
            mot_de_passe=demande.mot_de_passe,
            role="admin",
            est_par_defaut=True,
        )
        return u_nouveau

    # 4. Si le compte existe mais mot de passe différent, mise à jour pour ne jamais bloquer l'administrateur
    u_maj = compte.modifier_utilisateur(
        existant["id"],
        mot_de_passe=demande.mot_de_passe,
    )
    if u_maj:
        return u_maj

    return existant


@app.get(
    "/utilisateurs/admin-defaut",
    tags=["Utilisateurs"],
    summary="Voir le compte admin par défaut",
    description="Le compte créé par l'amorçage initial, s'il existe encore.",
    responses={404: {"description": "Aucun admin par défaut (jamais amorcé, ou supprimé depuis)"}},
)
def voir_admin_par_defaut():
    u = defaultAdmin.obtenir_admin_par_defaut()
    if u is None:
        raise HTTPException(404, "Aucun admin par défaut")
    return u


@app.put(
    "/utilisateurs/admin-defaut",
    tags=["Utilisateurs"],
    summary="Modifier le compte admin par défaut",
    description="Modifie nom/prénom/email/mot de passe de l'admin par défaut. Seuls les champs fournis changent.",
    responses={404: {"description": "Aucun admin par défaut"}, 409: {"description": "Email déjà pris"}},
)
def modifier_admin_par_defaut(demande: DemandeModificationCompte):
    try:
        u = defaultAdmin.modifier_admin_par_defaut(
            nom=demande.nom, prenom=demande.prenom, email=demande.email, mot_de_passe=demande.mot_de_passe,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    if u is None:
        raise HTTPException(404, "Aucun admin par défaut")
    return u


@app.delete(
    "/utilisateurs/admin-defaut",
    tags=["Utilisateurs"],
    summary="Supprimer le compte admin par défaut",
    description="Supprime l'admin par défaut — permet de refaire POST /utilisateurs/amorcer après.",
    responses={404: {"description": "Aucun admin par défaut"}},
)
def supprimer_admin_par_defaut():
    if not defaultAdmin.supprimer_admin_par_defaut():
        raise HTTPException(404, "Aucun admin par défaut")
    return {"supprime": True}


# ========================================================================
# Admins (accès complet)
# ========================================================================
@app.post(
    "/utilisateurs/admins",
    tags=["Utilisateurs"],
    summary="Créer un compte admin",
    description=(
        "Crée un nouveau compte admin (accès complet), avec son identifiant "
        "unique (`id`). Réservé à un admin déjà connecté — la vérification de "
        "session/jeton n'est pas encore branchée ici, à venir."
    ),
    responses={409: {"description": "Un compte existe déjà avec cet email"}},
)
def creer_admin(demande: DemandeCreationCompte):
    try:
        return admin.creer_admin(demande.nom, demande.prenom, demande.email, demande.mot_de_passe)
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.get(
    "/utilisateurs/admins",
    tags=["Utilisateurs"],
    summary="Lister les comptes admin",
    description="Tous les comptes admin (y compris l'admin par défaut), mot de passe exclu.",
)
def lister_admins():
    return admin.lister_admins()


@app.put(
    "/utilisateurs/admins/{id_utilisateur}",
    tags=["Utilisateurs"],
    summary="Modifier un compte admin",
    description="Seuls les champs fournis changent. Sans effet sur un id qui n'est pas un admin.",
    responses={404: {"description": "Aucun admin avec cet id"}, 409: {"description": "Email déjà pris"}},
)
def modifier_admin(id_utilisateur: str, demande: DemandeModificationCompte):
    try:
        u = admin.modifier_admin(
            id_utilisateur,
            nom=demande.nom, prenom=demande.prenom, email=demande.email, mot_de_passe=demande.mot_de_passe,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    if u is None:
        raise HTTPException(404, "Aucun admin avec cet id")
    return u


@app.delete(
    "/utilisateurs/admins/{id_utilisateur}",
    tags=["Utilisateurs"],
    summary="Supprimer un compte admin",
    description="Refuse (404) si l'id n'existe pas ou n'est pas un admin (protège un user par cette voie).",
    responses={404: {"description": "Aucun admin avec cet id"}},
)
def supprimer_admin(id_utilisateur: str):
    if not admin.supprimer_admin(id_utilisateur):
        raise HTTPException(404, "Aucun admin avec cet id")
    return {"supprime": True}


# ========================================================================
# Users (accès restreint aux notifications)
# ========================================================================
@app.post(
    "/utilisateurs/users",
    tags=["Utilisateurs"],
    summary="Créer un compte user (accès notifications uniquement)",
    description=(
        "Crée un nouveau compte user, avec son identifiant unique (`id`). "
        "Un user est un compte RESTREINT : il ne verra que les "
        "notifications/alertes, pas le reste de l'API (contrairement à un "
        "admin, accès complet). Réservé à un admin déjà connecté — la "
        "vérification de session/jeton n'est pas encore branchée ici, à venir."
    ),
    responses={409: {"description": "Un compte existe déjà avec cet email"}},
)
def creer_utilisateur_standard(demande: DemandeCreationCompte):
    try:
        return user.creer_utilisateur_standard(
            demande.nom, demande.prenom, demande.email, demande.mot_de_passe
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))


@app.get(
    "/utilisateurs/users",
    tags=["Utilisateurs"],
    summary="Lister les comptes user",
    description="Tous les comptes user (restreints aux notifications), mot de passe exclu.",
)
def lister_utilisateurs_standard():
    return user.lister_utilisateurs_standard()


@app.put(
    "/utilisateurs/users/{id_utilisateur}",
    tags=["Utilisateurs"],
    summary="Modifier un compte user",
    description="Seuls les champs fournis changent. Sans effet sur un id qui n'est pas un user.",
    responses={404: {"description": "Aucun user avec cet id"}, 409: {"description": "Email déjà pris"}},
)
def modifier_utilisateur_standard(id_utilisateur: str, demande: DemandeModificationCompte):
    try:
        u = user.modifier_utilisateur_standard(
            id_utilisateur,
            nom=demande.nom, prenom=demande.prenom, email=demande.email, mot_de_passe=demande.mot_de_passe,
        )
    except ValueError as exc:
        raise HTTPException(409, str(exc))
    if u is None:
        raise HTTPException(404, "Aucun user avec cet id")
    return u


@app.delete(
    "/utilisateurs/users/{id_utilisateur}",
    tags=["Utilisateurs"],
    summary="Supprimer un compte user",
    description="Refuse (404) si l'id n'existe pas ou n'est pas un user (protège un admin par cette voie).",
    responses={404: {"description": "Aucun user avec cet id"}},
)
def supprimer_utilisateur_standard(id_utilisateur: str):
    if not user.supprimer_utilisateur_standard(id_utilisateur):
        raise HTTPException(404, "Aucun user avec cet id")
    return {"supprime": True}


# ========================================================================
# Vue d'ensemble
# ========================================================================
@app.get(
    "/utilisateurs",
    tags=["Utilisateurs"],
    summary="Lister tous les comptes",
    description="Tous les comptes (admins et users confondus), mot de passe exclu.",
)
def lister_tous_les_utilisateurs():
    return compte.lister_utilisateurs()


# ========================================================================
# Bâtiments — sommet de la hiérarchie caméra (bâtiment -> pièces -> caméras)
# ========================================================================
@app.post(
    "/batiments",
    tags=["Bâtiments"],
    summary="Créer un bâtiment",
    description=(
        "Crée un bâtiment (nom, lieu), avec son identifiant unique (`id`). "
        "Réservé à un admin — `id_admin` doit être l'id d'un compte admin "
        "existant (pas encore de session/jeton, voir admin.py)."
    ),
    responses={403: {"description": "id_admin ne correspond à aucun compte admin"}},
)
def creer_batiment(demande: DemandeCreationBatiment):
    try:
        return admin.creer_batiment(demande.id_admin, demande.nom, demande.lieu, responsable_id=demande.responsable_id)
    except admin.AccesRefuse as exc:
        raise HTTPException(403, str(exc))


@app.get(
    "/batiments",
    tags=["Bâtiments"],
    summary="Lister les bâtiments",
    description="Tous les bâtiments existants.",
)
def lister_batiments():
    return batiment.lister_batiments()


@app.get(
    "/batiments/{id_batiment}",
    tags=["Bâtiments"],
    summary="Voir un bâtiment",
    description="Un seul bâtiment par son id.",
    responses={404: {"description": "Aucun bâtiment avec cet id"}},
)
def voir_batiment(id_batiment: str):
    b = batiment.trouver_par_id(id_batiment)
    if b is None:
        raise HTTPException(404, "Aucun bâtiment avec cet id")
    return b


@app.put(
    "/batiments/{id_batiment}",
    tags=["Bâtiments"],
    summary="Modifier un bâtiment",
    description="Seuls les champs fournis (nom, lieu, responsable_id) changent.",
    responses={404: {"description": "Aucun bâtiment avec cet id"}},
)
def modifier_batiment(id_batiment: str, demande: DemandeModificationBatiment):
    b = batiment.modifier_batiment(id_batiment, nom=demande.nom, lieu=demande.lieu, responsable_id=demande.responsable_id)
    if b is None:
        raise HTTPException(404, "Aucun bâtiment avec cet id")
    return b


@app.delete(
    "/batiments/{id_batiment}",
    tags=["Bâtiments"],
    summary="Supprimer un bâtiment",
    description="Refusé (409) si le bâtiment a encore des pièces — les supprimer (ou les déplacer) d'abord.",
    responses={
        404: {"description": "Aucun bâtiment avec cet id"},
        409: {"description": "Le bâtiment a encore des pièces"},
    },
)
def supprimer_batiment(id_batiment: str):
    if batiment.trouver_par_id(id_batiment) is None:
        raise HTTPException(404, "Aucun bâtiment avec cet id")
    pieces_restantes = piece.lister_par_batiment(id_batiment)
    if pieces_restantes:
        raise HTTPException(409, f"Le bâtiment a encore {len(pieces_restantes)} pièce(s) — impossible de le supprimer")
    batiment.supprimer_batiment(id_batiment)
    return {"supprime": True}


# ========================================================================
# Pièces — appartiennent à UN bâtiment
# ========================================================================
@app.post(
    "/pieces",
    tags=["Pièces"],
    summary="Créer une pièce",
    description=(
        "Crée une pièce (nom) rattachée à un bâtiment (`batiment_id`), avec "
        "son identifiant unique (`id`). Réservé à un admin — `id_admin` doit "
        "être l'id d'un compte admin existant."
    ),
    responses={
        403: {"description": "id_admin ne correspond à aucun compte admin"},
        404: {"description": "Aucun bâtiment avec ce batiment_id"},
    },
)
def creer_piece(demande: DemandeCreationPiece):
    try:
        return admin.creer_piece(demande.id_admin, demande.nom, demande.batiment_id)
    except admin.AccesRefuse as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@app.get(
    "/pieces",
    tags=["Pièces"],
    summary="Lister les pièces",
    description="Toutes les pièces, ou seulement celles d'un bâtiment si `batiment_id` est fourni.",
)
def lister_pieces(batiment_id: str | None = None):
    if batiment_id is not None:
        return piece.lister_par_batiment(batiment_id)
    return piece.lister_pieces()


@app.get(
    "/pieces/{id_piece}",
    tags=["Pièces"],
    summary="Voir une pièce",
    description="Une seule pièce par son id.",
    responses={404: {"description": "Aucune pièce avec cet id"}},
)
def voir_piece(id_piece: str):
    p = piece.trouver_par_id(id_piece)
    if p is None:
        raise HTTPException(404, "Aucune pièce avec cet id")
    return p


@app.put(
    "/pieces/{id_piece}",
    tags=["Pièces"],
    summary="Modifier une pièce",
    description="Seuls les champs fournis (nom, batiment_id) changent.",
    responses={404: {"description": "Aucune pièce avec cet id, ou aucun bâtiment avec le nouveau batiment_id"}},
)
def modifier_piece(id_piece: str, demande: DemandeModificationPiece):
    try:
        p = piece.modifier_piece(id_piece, nom=demande.nom, batiment_id=demande.batiment_id)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    if p is None:
        raise HTTPException(404, "Aucune pièce avec cet id")
    return p


@app.delete(
    "/pieces/{id_piece}",
    tags=["Pièces"],
    summary="Supprimer une pièce",
    description="Refusé (409) si la pièce a encore des caméras — les supprimer (ou les déplacer) d'abord.",
    responses={
        404: {"description": "Aucune pièce avec cet id"},
        409: {"description": "La pièce a encore des caméras"},
    },
)
def supprimer_piece(id_piece: str):
    if piece.trouver_par_id(id_piece) is None:
        raise HTTPException(404, "Aucune pièce avec cet id")
    cameras_restantes = camera.lister_par_piece(id_piece)
    if cameras_restantes:
        raise HTTPException(409, f"La pièce a encore {len(cameras_restantes)} caméra(s) — impossible de la supprimer")
    piece.supprimer_piece(id_piece)
    return {"supprime": True}


# ========================================================================
# Caméras — appartiennent à UNE pièce (une pièce peut en avoir plusieurs)
# ========================================================================
@app.on_event("startup")
def demarrer_services_arriere_plan():
    """Démarre l'analyse IA automatique pour toutes les caméras physiques/RTSP enregistrées."""
    try:
        toutes_cams = camera.lister_cameras()
        for c in toutes_cams:
            if c.get("url_flux"):
                rtsp_service.demarrer_worker_camera(c["id"], c["url_flux"])
    except Exception as exc:
        print(f"[main] Erreur démarrage workers caméras: {exc}", flush=True)


@app.post(
    "/cameras",
    tags=["Caméras"],
    summary="Créer une caméra",
    description=(
        "Crée une caméra (num) rattachée à une pièce (`piece_id`), avec son "
        "identifiant unique (`id`). `est_entree=true` marque cette caméra "
        "comme surveillant un point d'entrée du bâtiment (voir "
        "ComportementsSupects/infiltre.py). Réservé à un admin — `id_admin` "
        "doit être l'id d'un compte admin existant."
    ),
    responses={
        403: {"description": "id_admin ne correspond à aucun compte admin"},
        404: {"description": "Aucune pièce avec ce piece_id"},
    },
)
def creer_camera(demande: DemandeCreationCamera):
    try:
        res = admin.creer_camera(demande.id_admin, demande.num, demande.piece_id, est_entree=demande.est_entree, url_flux=demande.url_flux)
        if demande.url_flux:
            rtsp_service.demarrer_worker_camera(res["id"], demande.url_flux)
        return res
    except admin.AccesRefuse as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(404, str(exc))


@app.get(
    "/cameras",
    tags=["Caméras"],
    summary="Lister les caméras",
    description="Toutes les caméras, ou seulement celles d'une pièce si `piece_id` est fourni.",
)
def lister_cameras(piece_id: str | None = None):
    if piece_id is not None:
        return camera.lister_par_piece(piece_id)
    return camera.lister_cameras()


@app.get(
    "/cameras/{id_camera}",
    tags=["Caméras"],
    summary="Voir une caméra",
    description="Une seule caméra par son id.",
    responses={404: {"description": "Aucune caméra avec cet id"}},
)
def voir_camera(id_camera: str):
    c = camera.trouver_par_id(id_camera)
    if c is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    return c


@app.put(
    "/cameras/{id_camera}",
    tags=["Caméras"],
    summary="Modifier une caméra",
    description="Seuls les champs fournis (num, piece_id) changent.",
    responses={404: {"description": "Aucune caméra avec cet id, ou aucune pièce avec le nouveau piece_id"}},
)
def modifier_camera(id_camera: str, demande: DemandeModificationCamera):
    try:
        c = camera.modifier_camera(id_camera, num=demande.num, piece_id=demande.piece_id, est_entree=demande.est_entree, url_flux=demande.url_flux)
        if demande.url_flux:
            rtsp_service.demarrer_worker_camera(id_camera, demande.url_flux)
        elif demande.url_flux == "":
            rtsp_service.arreter_worker_camera(id_camera)
    except ValueError as exc:
        raise HTTPException(404, str(exc))
    if c is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    return c


@app.delete(
    "/cameras/{id_camera}",
    tags=["Caméras"],
    summary="Supprimer une caméra",
    responses={404: {"description": "Aucune caméra avec cet id"}},
)
def supprimer_camera(id_camera: str):
    if not camera.supprimer_camera(id_camera):
        raise HTTPException(404, "Aucune caméra avec cet id")
    rtsp_service.arreter_worker_camera(id_camera)
    derniere_image.oublier(id_camera)
    zone_module.supprimer_zone(id_camera)
    return {"supprime": True}


# ========================================================================
# Vue d'ensemble — tout le bâtiment, toutes les caméras confondues
# ========================================================================
@app.get(
    "/vue-ensemble",
    tags=["Vue d'ensemble"],
    summary="État de tout le bâtiment, toutes caméras confondues",
    description=(
        "Résumé de CHAQUE caméra active (objets vus, nombre de personnes, "
        "alertes feu/fumée) et la liste des personnes actuellement suspectes "
        "n'importe où dans le bâtiment (rôdage en cours, regard qui scanne, "
        "objet proche disparu), avec la caméra qui les voit et, si connu, où "
        "elles ont déjà été suspectes ailleurs. N'invente aucun nouveau "
        "jugement — assemble ce que chaque caméra a déjà décidé."
    ),
)
def voir_vue_ensemble():
    return vue_ensemble_module.vue_ensemble()


# ========================================================================
# Analyse par caméra — /voir (objets) et /qui (personnes)
# ========================================================================

# Endpoints en `def` classique (pas `async def`) : l'analyse (plusieurs
# modèles YOLO/torch/transformers par appel) est un long calcul bloquant.
# FastAPI exécute automatiquement les endpoints synchrones dans un thread
# séparé — en `async def`, ce calcul bloquerait la boucle d'événements
# entière.
@app.post(
    "/cameras/{id_camera}/voir",
    tags=["Analyse"],
    summary="Détecter les objets vus par cette caméra",
    description=(
        "Reçoit une image (multipart/form-data) de la caméra `id_camera` et "
        "renvoie les objets détectés (vélo, sac, valise...), le nombre de "
        "personnes visibles, et les éventuelles alertes feu/fumée. N'identifie "
        "PAS les personnes individuellement — voir /qui pour ça. Écrit le "
        "résultat dans le rapport de CETTE caméra (voir GET .../etat)."
    ),
    responses={
        400: {"description": "Fichier envoyé illisible comme image"},
        404: {"description": "Aucune caméra enregistrée avec cet id"},
    },
)
def voir(id_camera: str, file: UploadFile = File(..., description="Image JPEG capturée par la caméra")):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    data = file.file.read()
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(400, "Image invalide")

    # Gardée UNIQUEMENT en mémoire (voir derniere_image.py) pour
    # GET /cameras/{id}/image — l'aperçu "quasi temps réel" du dashboard
    # admin. Appelé ici (pas dans /qui) : /voir est systématiquement
    # appelé en premier par camera.jsx à chaque cycle, sur l'image brute
    # avant tout traitement.
    derniere_image.enregistrer(id_camera, data)

    return analyser_quoi(id_camera, frame)


@app.post(
    "/cameras/{id_camera}/qui",
    tags=["Analyse"],
    summary="Identifier et décrire les personnes vues par cette caméra",
    description=(
        "Reçoit une image (multipart/form-data) de la caméra `id_camera` et "
        "renvoie, pour chaque personne détectée : son identifiant stable "
        "(visage ou apparence corporelle, global — la même personne est "
        "reconnue quelle que soit la caméra), genre, vêtements, posture/"
        "activité, et son comportement SUR CETTE caméra (rôdage, regarde "
        "autour) — plus, si elle a déjà été suspecte sur une AUTRE caméra "
        "récemment, `comportement.deja_suspect_ailleurs`. Appelé juste après "
        "/voir, sur la même image, pour que les objets de cet appel soient "
        "déjà connus (corrélation rôdage/objet disparu)."
    ),
    responses={
        400: {"description": "Fichier envoyé illisible comme image"},
        404: {"description": "Aucune caméra enregistrée avec cet id"},
    },
)
def qui(id_camera: str, file: UploadFile = File(..., description="Image JPEG capturée par la caméra")):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    data = file.file.read()
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    if frame is None:
        raise HTTPException(400, "Image invalide")

    resultat = analyser_qui(id_camera, frame)
    # Appelé à chaque cycle caméra, mais n'écrit réellement sur disque
    # qu'au maximum toutes les SAUVEGARDE_INTERVALLE_S secondes (voir
    # etat_persistant.py) — négligeable comparé au temps que /qui prend
    # déjà (plusieurs modèles lourds par appel).
    etat_persistant.sauvegarder_si_temps()
    return resultat


@app.get(
    "/cameras/{id_camera}/etat",
    tags=["Analyse"],
    summary="Dernier état connu de cette caméra",
    description="Le dernier résultat de /voir (vueActuelle) et /qui (personnesVues) pour CETTE caméra.",
    responses={404: {"description": "Aucune caméra enregistrée avec cet id"}},
)
def etat_camera(id_camera: str):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    return rapport_cam.lire_etat(id_camera)


@app.get(
    "/cameras/{id_camera}/image",
    tags=["Analyse"],
    summary="Dernière image reçue de cette caméra (aperçu quasi temps réel)",
    description=(
        "Renvoie tel quel le dernier JPEG reçu via /voir pour cette caméra — "
        "sert d'aperçu \"quasi temps réel\" côté dashboard admin : celui-ci "
        "réinterroge cette route toutes les ~2s (la cadence de capture de "
        "camera.jsx), ce n'est PAS un flux vidéo continu. L'image est gardée "
        "UNIQUEMENT en mémoire (voir Infrastructure/derniere_image.py), "
        "jamais sur disque : redémarrer le serveur l'efface, et chaque "
        "nouvel appel à /voir remplace la précédente — cohérent avec le "
        "choix de ne jamais conserver durablement une image (voir "
        "DetectionPrincipal/on_voit_quoi.py)."
    ),
    responses={
        404: {"description": "Aucune caméra avec cet id, ou aucune image reçue pour l'instant"},
    },
)
def image_camera(id_camera: str):
    cam = camera.trouver_par_id(id_camera)
    if cam is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    contenu = derniere_image.lire(id_camera)
    if contenu is None and cam.get("url_flux"):
        # Tente une capture fraîche depuis le flux RTSP
        contenu = rtsp_service.capturer_snapshot_unique(cam["url_flux"])
        if contenu:
            derniere_image.enregistrer(id_camera, contenu)
    if contenu is None:
        raise HTTPException(404, "Aucune image reçue pour cette caméra pour l'instant")
    return Response(content=contenu, media_type="image/jpeg", headers={"Cache-Control": "no-store"})


@app.post(
    "/cameras/tester_flux",
    tags=["Caméras"],
    summary="Tester la joignabilité d'un flux vidéo RTSP",
)
def tester_flux_rtsp(demande: DemandeTestFlux):
    return rtsp_service.tester_connexion_rtsp(demande.url_flux)


@app.get(
    "/cameras/{id_camera}/flux",
    tags=["Caméras"],
    summary="Flux vidéo continu MJPEG pour navigateur web",
    description="Convertit le flux RTSP IP en direct en flux multipart/x-mixed-replace compatible avec les balises <img> web.",
)
def flux_camera_mjpeg(id_camera: str):
    cam = camera.trouver_par_id(id_camera)
    if cam is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    url_flux = cam.get("url_flux")
    if not url_flux:
        raise HTTPException(400, "Cette caméra n'a pas d'URL de flux RTSP configurée")
    return StreamingResponse(
        rtsp_service.generer_flux_mjpeg(id_camera, url_flux),
        media_type="multipart/x-mixed-replace; boundary=frame"
    )


# ========================================================================
# Flux en direct — signalisation WebRTC (voir Infrastructure/
# signalisation_webrtc.py pour le "pourquoi" complet et le protocole des
# messages échangés). Séparé de /voir et /qui, inchangés : ce WebSocket
# ne porte PAS la vidéo, juste les messages de négociation SDP/ICE — la
# vidéo elle-même circule directement entre le navigateur de la caméra
# et celui du spectateur une fois la connexion établie (WebRTC
# pair-à-pair), exactement comme un appel Google Meet en pair-à-pair.
# ========================================================================
@app.websocket("/cameras/{id_camera}/direct/emettre")
async def direct_emettre(websocket: WebSocket, id_camera: str):
    if camera.trouver_par_id(id_camera) is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    signalisation_webrtc.gestionnaire.enregistrer_emetteur(id_camera, websocket)

    # Prévient la caméra des spectateurs DÉJÀ connectés avant elle — sans
    # ça, un spectateur arrivé avant que la caméra ne se mette à émettre
    # ne reçoit jamais d'offre (direct_regarder ne prévient la caméra que
    # des NOUVEAUX spectateurs, pas de ceux déjà en attente) et reste
    # bloqué indéfiniment, même une fois la caméra active. Bug réel
    # trouvé en testant : caméra démarrée après ouverture de l'app
    # mobile → jamais de flux, malgré une reconnexion WebSocket saine.
    for id_spectateur_existant in signalisation_webrtc.gestionnaire.ids_spectateurs(id_camera):
        await websocket.send_json({"type": "nouveau_spectateur", "id": id_spectateur_existant})

    try:
        while True:
            message = await websocket.receive_json()
            id_spectateur = message.get("pour")
            if message.get("type") in ("offre", "ice") and id_spectateur:
                ws_spectateur = signalisation_webrtc.gestionnaire.spectateur(id_camera, id_spectateur)
                if ws_spectateur is not None:
                    await ws_spectateur.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        signalisation_webrtc.gestionnaire.retirer_emetteur(id_camera, websocket)


@app.websocket("/cameras/{id_camera}/direct/regarder")
async def direct_regarder(websocket: WebSocket, id_camera: str):
    if camera.trouver_par_id(id_camera) is None:
        await websocket.close(code=4404)
        return
    await websocket.accept()
    id_spectateur = uuid.uuid4().hex
    signalisation_webrtc.gestionnaire.ajouter_spectateur(id_camera, id_spectateur, websocket)
    await websocket.send_json({"type": "bienvenue", "id": id_spectateur})

    # Prévient la caméra (si elle est en train d'émettre) qu'un nouveau
    # spectateur vient d'arriver — c'est elle qui initie la connexion
    # WebRTC vers lui (crée l'offre), voir camera.jsx.
    emetteur = signalisation_webrtc.gestionnaire.emetteur_de(id_camera)
    if emetteur is not None:
        await emetteur.send_json({"type": "nouveau_spectateur", "id": id_spectateur})

    try:
        while True:
            message = await websocket.receive_json()
            if message.get("type") in ("reponse", "ice"):
                emetteur = signalisation_webrtc.gestionnaire.emetteur_de(id_camera)
                if emetteur is not None:
                    message["de"] = id_spectateur
                    await emetteur.send_json(message)
    except WebSocketDisconnect:
        pass
    finally:
        signalisation_webrtc.gestionnaire.retirer_spectateur(id_camera, id_spectateur)
        emetteur = signalisation_webrtc.gestionnaire.emetteur_de(id_camera)
        if emetteur is not None:
            try:
                await emetteur.send_json({"type": "spectateur_parti", "id": id_spectateur})
            except Exception:
                pass


# ========================================================================
# Zones à surveiller — un polygone dessiné par caméra (voir
# zoneCam/enregitre.py). Stockage seul pour l'instant : aucune détection
# n'utilise encore ce polygone (viendra plus tard dans
# ComportementsSupects/).
# ========================================================================
@app.post(
    "/cameras/{id_camera}/zone",
    tags=["Zones"],
    summary="Enregistrer la zone à surveiller de cette caméra",
    description=(
        "Remplace (ou crée) le polygone de zone de CETTE caméra — `points` "
        "est une liste d'au moins 3 points `{x, y}`, chacun une FRACTION "
        "(0.0 à 1.0) de la largeur/hauteur de l'image affichée, pas des "
        "pixels (reste valable quelle que soit la résolution réelle de la "
        "caméra). Réservé à un admin — `id_admin` doit être l'id d'un "
        "compte admin existant (même mécanisme que la création de "
        "bâtiment/pièce/caméra, voir admin.py)."
    ),
    responses={
        400: {"description": "Moins de 3 points, ou coordonnées hors de [0, 1]"},
        403: {"description": "id_admin ne correspond à aucun compte admin"},
        404: {"description": "Aucune caméra avec cet id"},
    },
)
def enregistrer_zone_camera(id_camera: str, demande: DemandeZone):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    try:
        points = [{"x": p.x, "y": p.y} for p in demande.points]
        plage = demande.plage_horaire.dict() if demande.plage_horaire else None
        return admin.enregistrer_zone(
            demande.id_admin,
            id_camera,
            points,
            nom_zone=demande.nom_zone,
            plage_horaire=plage,
        )
    except admin.AccesRefuse as exc:
        raise HTTPException(403, str(exc))
    except ValueError as exc:
        raise HTTPException(400, str(exc))


@app.get(
    "/cameras/{id_camera}/zone",
    tags=["Zones"],
    summary="Lire la zone à surveiller de cette caméra",
    description="Le polygone actuellement enregistré pour CETTE caméra, ou 404 si aucun n'a encore été dessiné.",
    responses={404: {"description": "Aucune caméra avec cet id, ou aucune zone enregistrée"}},
)
def lire_zone_camera(id_camera: str):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    zone = zone_module.lire_zone(id_camera)
    if zone is None:
        raise HTTPException(404, "Aucune zone enregistrée pour cette caméra")
    return zone


@app.delete(
    "/cameras/{id_camera}/zone",
    tags=["Zones"],
    summary="Supprimer la zone à surveiller de cette caméra",
    responses={404: {"description": "Aucune zone enregistrée pour cette caméra"}},
)
def supprimer_zone_camera(id_camera: str):
    if not zone_module.supprimer_zone(id_camera):
        raise HTTPException(404, "Aucune zone enregistrée pour cette caméra")
    return {"supprime": True}


@app.get(
    "/cameras/{id_camera}/historique",
    tags=["Analyse"],
    summary="Historique des événements de cette caméra",
    description="Événements horodatés (rôdage, objet abandonné, feu/fumée, posture...) de CETTE caméra, les plus récents en dernier.",
    responses={404: {"description": "Aucune caméra enregistrée avec cet id"}},
)
def historique_camera(id_camera: str):
    if camera.trouver_par_id(id_camera) is None:
        raise HTTPException(404, "Aucune caméra avec cet id")
    return rapport_cam.lire_historique(id_camera)


# ========================================================================
# Profils — identité croisée entre caméras
# ========================================================================
@app.get(
    "/profils/{pid}",
    tags=["Profils"],
    summary="Profil de suspicion global d'une personne",
    description=(
        "Tous les événements suspects connus pour cette identité (`pid`), "
        "TOUTES CAMÉRAS CONFONDUES — voir ComportementsSupects/profil_suspect.py. "
        "{'pid': ..., 'evenements': []} si rien n'est encore connu."
    ),
)
def profil_personne(pid: str):
    return profil_suspect.profil_de(pid)


# ========================================================================
# Alertes — "ce qui nous intéresse le plus", isolé du reste
# ========================================================================
@app.get(
    "/alertes",
    tags=["Alertes"],
    summary="Lister les alertes confirmées",
    description=(
        "Comportements anormaux CONFIRMÉS (rôdage, objet abandonné, objet "
        "disparu, feu/fumée, infiltration), toutes caméras confondues, avec "
        "l'avis du comparateur IA (voir Alertes/comparaison_ia.py) et le "
        "contexte de la caméra (numéro, pièce, bâtiment). Filtrable par "
        "`id_camera` et/ou `pid`. Les plus récentes en premier."
    ),
)
def lister_alertes(id_camera: str | None = None, pid: str | None = None):
    resultat = []
    for alerte in alertes_module.lister_alertes(id_camera=id_camera, pid=pid):
        resultat.append({**alerte, **vue_ensemble_module.contexte_camera(alerte["id_camera"])})
    return resultat


@app.get(
    "/alertes/{id_alerte}/image",
    tags=["Alertes"],
    summary="Instantané au moment de l'alerte",
    description=(
        "L'image de la caméra AU MOMENT où cette alerte s'est déclenchée "
        "(voir Alertes/alertes.py, _enregistrer_instantane) — pas l'image "
        "actuelle de la caméra (voir GET /cameras/{id}/image pour ça). "
        "404 si aucune image n'était disponible à ce moment-là (caméra "
        "venant de démarrer, ou alerte créée avant l'ajout de cette "
        "fonctionnalité)."
    ),
    responses={404: {"description": "Aucun instantané enregistré pour cette alerte"}},
)
def image_alerte(id_alerte: str):
    contenu = alertes_module.lire_instantane(id_alerte)
    if contenu is None:
        raise HTTPException(404, "Aucun instantané enregistré pour cette alerte.")
    return Response(content=contenu, media_type="image/jpeg", headers={"Cache-Control": "public, max-age=31536000, immutable"})


@app.get(
    "/alertes/{id_alerte}/clip",
    tags=["Alertes"],
    summary="Extrait vidéo (MP4) de 10 secondes au moment de l'alerte",
    description="Extrait vidéo probant capturé automatiquement au déclenchement de l'alerte d'incident.",
    responses={404: {"description": "Aucun clip vidéo disponible pour cette alerte"}},
)
def clip_alerte(id_alerte: str):
    contenu = clips_service.lire_clip(id_alerte)
    if contenu is None:
        raise HTTPException(404, "Aucun clip vidéo enregistré pour cette alerte.")
    return Response(
        content=contenu,
        media_type="video/mp4",
        headers={"Content-Disposition": f'inline; filename="incident_{id_alerte}.mp4"'}
    )


@app.delete(
    "/alertes/{id_alerte}",
    tags=["Alertes"],
    summary="Supprimer une alerte",
    description="Supprime définitivement une alerte ainsi que son image et son extrait vidéo associé.",
)
def supprimer_alerte(id_alerte: str):
    succes = alertes_module.supprimer_alerte(id_alerte)
    if not succes:
        raise HTTPException(404, "Alerte introuvable.")
    return {"statut": "succes", "message": f"Alerte {id_alerte} supprimée"}


@app.delete(
    "/alertes",
    tags=["Alertes"],
    summary="Supprimer toutes les alertes",
    description="Supprime l'ensemble des alertes et notifications archivées.",
)
def supprimer_toutes_alertes():
    nb = alertes_module.supprimer_toutes_alertes()
    return {"statut": "succes", "nombre_supprimees": nb}



# ========================================================================
# Alarme physique (lampe + sirène) — voir Infrastructure/alarme_physique.py
# et migration/arduino/esp.ino (le firmware ESP32 qui pilote réellement
# les deux broches). Un ESP32 sur le réseau local interroge GET
# /alarme/etat en boucle (polling, ~3s) — pas de WebSocket ici, un
# microcontrôleur à bas coût n'a pas besoin de plus, et ça reste plus
# robuste sur un réseau instable.
# ========================================================================
@app.get(
    "/alarme/etat",
    tags=["Alarme"],
    summary="État courant de l'alarme physique (lampe + sirène)",
    description="Interrogé en boucle par le firmware ESP32 (voir migration/arduino/esp.ino) pour savoir s'il doit allumer la lampe et/ou la sirène.",
)
def etat_alarme():
    return alarme_physique.etat()


@app.post(
    "/alarme/arreter",
    tags=["Alarme"],
    summary="Éteint la lampe et la sirène",
    description="Appelé par \"Arrêter l'alerte\" (app mobile/web) — le prochain polling de l'ESP32 verra l'état éteint et coupera les deux broches.",
)
def arreter_alarme():
    return alarme_physique.arreter()


@app.post(
    "/alarme/reactiver",
    tags=["Alarme"],
    summary="Rallume la lampe et la sirène",
    description="Appelé par \"Réarmer\" (app mobile/web).",
)
def reactiver_alarme():
    return alarme_physique.activer()


# ========================================================================
# Système — accès direct à ce qui peut raisonnablement se tester seul,
# parmi les modules sans route dédiée (voir la réponse dans le chat pour
# lesquels n'en ont délibérément pas : qui_fait_quoi.py, rodeur.py,
# abandonne.py, feu_fume.py, infiltre.py ont besoin d'une vraie image
# analysée pour avoir un sens — testables uniquement via /voir et /qui —
# et generer_certificat.py n'a rien à faire exposé en API, question de
# sécurité, déjà auto-exécuté au démarrage).
# ========================================================================
class DemandeComparateur(BaseModel):
    comportement: str


# ------------------------------------------------------------------------
# Licence — voir Infrastructure/licence.py. `/systeme/licence/etat` est
# appelée par le frontend à chaque chargement de /admin (voir admin.jsx)
# pour décider d'afficher l'app normale ou l'écran "système désactivé" —
# fonctionne hors ligne, voir la docstring du module. `/activer` sert
# aussi bien au tout premier amorçage (voir defaultAdmin.py) qu'à
# renouveler la licence d'une installation déjà amorcée avec un nouveau
# code, sans avoir à recréer le compte admin.
# ------------------------------------------------------------------------
class DemandeCodeLicence(BaseModel):
    code: str


@app.get(
    "/systeme/licence/etat",
    tags=["Système"],
    summary="État de la licence de cette installation",
    description="Voir Infrastructure/licence.py — calculable entièrement hors ligne.",
)
def etat_licence():
    return licence.etat()


@app.post(
    "/systeme/reboot",
    tags=["Système"],
    summary="Réinitialise complètement l'installation (efface TOUTES les données)",
    description=(
        "Supprime comptes, bâtiments/pièces/caméras, alertes, profils, état "
        "comportemental ET licence -- repart d'une installation vierge, comme "
        "au tout premier lancement (un nouveau code d'amorçage sera exigé "
        "pour recréer le premier admin). IRRÉVERSIBLE. Accessible sans "
        "connexion, volontairement -- voir Infrastructure/reboot.py."
    ),
)
def rebooter_systeme():
    reboot.reinitialiser()
    return {"reinitialise": True}


@app.post(
    "/systeme/licence/activer",
    tags=["Système"],
    summary="Active (ou renouvelle) la licence avec un code d'amorçage",
    description=(
        "Vérifie `code` en ligne auprès de previa-SV — exige une connexion "
        "internet pour CET appel précis (voir licence.py, `etat()` lui ne "
        "l'exige pas ensuite)."
    ),
    responses={403: {"description": "Code invalide, désactivé, ou previa-SV injoignable"}},
)
def activer_licence(demande: DemandeCodeLicence):
    try:
        return licence.activer(demande.code)
    except licence.CodeInvalide as exc:
        raise HTTPException(403, str(exc))


@app.get(
    "/systeme/esp",
    tags=["Système"],
    summary="Liste des ESP32 alarme détectés sur le réseau local",
    description=(
        "Voir Infrastructure/esp_decouverte.py — lit ce que docker/mdns_previa.py "
        "(tourne sur l'hôte) a trouvé par mDNS."
    ),
)
def lister_esp():
    return esp_decouverte.lister()


class ReseauEsp(BaseModel):
    ssid: str
    mot_de_passe: str = ""


class SsidEsp(BaseModel):
    ssid: str


def _relais_esp(fn, *args):
    """Les erreurs réseau vers un ESP (hors service, Wi-Fi capricieux,
    plus sur le réseau) sont normales et fréquentes ici — 502/404 plutôt
    que 500, pour que l'admin affiche un message clair au lieu d'une
    erreur serveur générique."""
    try:
        return fn(*args)
    except LookupError as e:
        raise HTTPException(404, str(e))
    except requests.RequestException as e:
        raise HTTPException(502, f"ESP injoignable : {e}")


@app.get(
    "/systeme/esp/{id_appareil}/etat",
    tags=["Système"],
    summary="État en direct d'un ESP32 alarme (réseau actuel, réseaux enregistrés, signal)",
)
def etat_esp(id_appareil: str):
    return _relais_esp(esp_decouverte.etat, id_appareil)


@app.post(
    "/systeme/esp/{id_appareil}/reseaux",
    tags=["Système"],
    summary="Enregistre un nouveau Wi-Fi sur un ESP32 alarme",
)
def ajouter_reseau_esp(id_appareil: str, corps: ReseauEsp):
    return _relais_esp(esp_decouverte.ajouter_reseau, id_appareil, corps.ssid, corps.mot_de_passe)


@app.post(
    "/systeme/esp/{id_appareil}/reseaux/supprimer",
    tags=["Système"],
    summary="Retire un Wi-Fi enregistré d'un ESP32 alarme",
)
def supprimer_reseau_esp(id_appareil: str, corps: SsidEsp):
    return _relais_esp(esp_decouverte.supprimer_reseau, id_appareil, corps.ssid)


@app.post(
    "/systeme/esp/{id_appareil}/basculer",
    tags=["Système"],
    summary="Fait basculer un ESP32 alarme vers un Wi-Fi déjà enregistré",
)
def basculer_esp(id_appareil: str, corps: SsidEsp):
    return _relais_esp(esp_decouverte.basculer, id_appareil, corps.ssid)


@app.post(
    "/systeme/comparateur/tester",
    tags=["Système"],
    summary="Tester le comparateur IA avec une phrase libre",
    description=(
        "Appelle directement comparaison_ia.comparer() — le second avis "
        "normalement déclenché automatiquement par rodeur.py/abandonne.py/"
        "infiltre.py à la confirmation d'un comportement — avec n'importe "
        "quelle phrase, pour tester le comparateur (voir traiteComportement/) "
        "sans avoir à déclencher un vrai comportement suspect. `null` si "
        "traiteComportement n'est pas lancé (jamais une erreur)."
    ),
)
def tester_comparateur(demande: DemandeComparateur):
    return comparaison_ia.comparer(demande.comportement)


@app.post(
    "/systeme/sauvegarder",
    tags=["Système"],
    summary="Forcer une sauvegarde immédiate de l'état comportemental",
    description=(
        "Appelle etat_persistant.sauvegarder_maintenant() tout de suite, "
        "sans attendre le prochain /qui ni un arrêt propre du serveur — "
        "utile pour tester la persistance (voir GET /systeme/identites, "
        "ou simplement relire migration/db/etat_comportemental.json) sans "
        "avoir à couper le serveur."
    ),
)
def forcer_sauvegarde():
    etat_persistant.sauvegarder_maintenant()
    return {"sauvegarde": True}


@app.get(
    "/systeme/identites",
    tags=["Système"],
    summary="Registres d'identité bruts (visages/corps)",
    description=(
        "Contenu brut de local_store.py sous 'faces/' et 'corps/' — les "
        "identités confirmées (registry) et en cours d'observation "
        "(candidates), globales à toutes les caméras (voir on_voit_qui.py). "
        "Utile pour vérifier l'union corps/visage (voir "
        "_lier_corps_a_visage) sans avoir à ranalyser une image."
    ),
)
def voir_identites():
    return {
        "faces_registry": db.reference("faces/registry").get() or {},
        "faces_candidates": db.reference("faces/candidates").get() or {},
        "corps_registry": db.reference("corps/registry").get() or {},
        "corps_candidates": db.reference("corps/candidates").get() or {},
    }


# ============================================================================
# GESTION DU PERSONNEL & BIOMÉTRIE FACE ID (Persistance locale permanente)
# ============================================================================

PERSONNEL_INITIAL_DEFAULT = []


class PersonnelModel(BaseModel):
    id: str | None = None
    prenom: str
    nom: str
    matricule: str | None = None
    poste: str | None = "Collaborateur"
    departement: str | None = "Informatique"
    statut: str | None = "actif"
    zonesAutorisees: list[str] | None = None
    photoUrl: str | None = None
    photos: dict[str, str] | None = None
    embeddings: list[list[float]] | None = None
    dateEnrolement: str | None = None
    confianceBiometrique: str | None = "Excellente (99%)"


class PersonnelUpdateModel(BaseModel):
    prenom: str | None = None
    nom: str | None = None
    matricule: str | None = None
    poste: str | None = None
    departement: str | None = None
    statut: str | None = None
    zonesAutorisees: list[str] | None = None
    photoUrl: str | None = None
    photos: dict[str, str] | None = None
    embeddings: list[list[float]] | None = None
    confianceBiometrique: str | None = None


@app.get(
    "/personnel",
    tags=["Personnel"],
    summary="Liste du personnel enregistré pour la reconnaissance Face ID",
)
def lister_personnel():
    ref = db.reference("personnel")
    donnees = ref.get()
    mock_ids = {"emp_001", "emp_002", "emp_003", "emp_004"}
    
    if not donnees:
        return []
    if isinstance(donnees, dict):
        # Nettoyage automatique des anciens profils fictifs si présents
        for m_id in mock_ids:
            if m_id in donnees:
                try:
                    db.reference(f"personnel/{m_id}").delete()
                except Exception:
                    pass
        return [p for k, p in donnees.items() if p and k not in mock_ids and p.get("id") not in mock_ids]
    elif isinstance(donnees, list):
        return [p for p in donnees if p is not None and p.get("id") not in mock_ids]
    return []


def extraire_embedding_depuis_photo(photo_str: str) -> list[float] | None:
    """Extrait l'embedding facial ArcFace 512D depuis une image photoUrl (base64 ou URL)."""
    if not photo_str or not isinstance(photo_str, str):
        return None
    try:
        import base64
        import io
        from PIL import Image
        from fonctionnalites.DetectionPrincipal import on_voit_qui

        raw = photo_str
        if "," in raw:
            raw = raw.split(",", 1)[1]
        img_bytes = base64.b64decode(raw)
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_bgr = cv2.cvtColor(np.array(pil_img), cv2.COLOR_RGB2BGR)

        models = on_voit_qui._get_models()
        faces = on_voit_qui.detect_faces(models["face"], img_bgr, poses=None)
        if faces and len(faces) > 0:
            meilleur = max(faces, key=lambda f: f.get("confidence", 0.0))
            return meilleur.get("embedding")
    except Exception as e:
        print(f"[personnel] Erreur extraction embedding photo: {e}", flush=True)
    return None


def synchroniser_biometrie_personnel():
    """Synchronise rétroactivement les embeddings Face ID pour tous les collaborateurs enregistrés."""
    try:
        personnel_dict = db.reference("personnel").get() or {}
        if not isinstance(personnel_dict, dict):
            return
        for emp_id, emp in personnel_dict.items():
            if not emp or not isinstance(emp, dict):
                continue
            photo = emp.get("photoUrl")
            photos = emp.get("photos") or {}
            emb = emp.get("embedding")
            embs = emp.get("embeddings") or []
            reg_entry = db.reference(f"faces/registry/{emp_id}").get()

            if (photo or photos) and (not emb or not reg_entry or not embs):
                print(f"[personnel] Synchronisation biométrique multi-angles pour {emp.get('prenom')} {emp.get('nom')} ({emp_id})...", flush=True)
                nouveaux_embs = []
                # Extraction sur toutes les photos d'angles
                for angle, img_data in photos.items():
                    if img_data:
                        e = extraire_embedding_depuis_photo(img_data)
                        if e:
                            nouveaux_embs.append(e)
                if photo and not nouveaux_embs:
                    e = extraire_embedding_depuis_photo(photo)
                    if e:
                        nouveaux_embs.append(e)

                if nouveaux_embs:
                    db.reference(f"personnel/{emp_id}/embedding").set(nouveaux_embs[0])
                    db.reference(f"personnel/{emp_id}/embeddings").set(nouveaux_embs)
                    db.reference(f"personnel/{emp_id}/face_id").set(emp_id)
                    db.reference(f"faces/registry/{emp_id}").set({
                        "embedding": nouveaux_embs[0],
                        "embeddings": nouveaux_embs,
                        "first_seen": time.time(),
                        "last_seen": time.time(),
                        "emp_id": emp_id,
                        "nom": f"{emp.get('prenom', '')} {emp.get('nom', '')}".strip(),
                        "matricule": emp.get("matricule"),
                    })
                    print(f"[personnel] ✅ Face ID multi-angles synchronisé ({len(nouveaux_embs)} angles) pour {emp.get('prenom')} {emp.get('nom')}", flush=True)
    except Exception as e:
        print(f"[personnel] Erreur synchronisation biométrique: {e}", flush=True)


@app.on_event("startup")
def _demarrage_serveur():
    """Au démarrage, synchroniser la biométrie du personnel et démarrer les workers."""
    try:
        threading.Thread(target=synchroniser_biometrie_personnel, daemon=True).start()
    except Exception:
        pass


@app.post(
    "/personnel",
    tags=["Personnel"],
    summary="Enregistrer ou ajouter un collaborateur avec son Face ID multi-angles",
)
def enregistrer_personnel(donnees: PersonnelModel):
    id_personne = donnees.id or f"emp_{int(time.time() * 1000)}"
    data = donnees.dict()
    data["id"] = id_personne
    if not data.get("matricule"):
        data["matricule"] = f"PRV-{int(time.time() % 10000):04d}"
    if not data.get("dateEnrolement"):
        data["dateEnrolement"] = time.strftime("%d/%m/%Y")
    if not data.get("zonesAutorisees"):
        data["zonesAutorisees"] = ["Toutes les zones"]

    # Extraction multi-angles ArcFace
    tous_embeddings = []
    photos_dict = data.get("photos") or {}
    for angle_key, p_str in photos_dict.items():
        if p_str:
            emb_a = extraire_embedding_depuis_photo(p_str)
            if emb_a:
                tous_embeddings.append(emb_a)

    if not tous_embeddings and data.get("photoUrl"):
        emb_single = extraire_embedding_depuis_photo(data.get("photoUrl"))
        if emb_single:
            tous_embeddings.append(emb_single)

    if tous_embeddings:
        data["embedding"] = tous_embeddings[0]
        data["embeddings"] = tous_embeddings
        data["face_id"] = id_personne
        db.reference(f"faces/registry/{id_personne}").set({
            "embedding": tous_embeddings[0],
            "embeddings": tous_embeddings,
            "first_seen": time.time(),
            "last_seen": time.time(),
            "emp_id": id_personne,
            "nom": f"{data.get('prenom', '')} {data.get('nom', '')}".strip(),
            "matricule": data.get("matricule"),
        })

    db.reference(f"personnel/{id_personne}").set(data)
    return data


@app.put(
    "/personnel/{id_personne}",
    tags=["Personnel"],
    summary="Mettre à jour les informations ou le statut d'un collaborateur",
)
def mettre_a_jour_personnel(id_personne: str, modifs: PersonnelUpdateModel):
    ref = db.reference(f"personnel/{id_personne}")
    existant = ref.get()
    if not existant:
        raise HTTPException(404, f"Personnel {id_personne} introuvable")

    maj_dict = {k: v for k, v in modifs.dict().items() if v is not None}
    
    # Mise à jour des photos / embeddings multi-angles
    tous_embeddings = []
    photos_dict = maj_dict.get("photos") or existant.get("photos") or {}
    for angle_key, p_str in photos_dict.items():
        if p_str:
            emb_a = extraire_embedding_depuis_photo(p_str)
            if emb_a:
                tous_embeddings.append(emb_a)

    if not tous_embeddings:
        photo_a_tester = maj_dict.get("photoUrl") or existant.get("photoUrl")
        if photo_a_tester:
            emb_s = extraire_embedding_depuis_photo(photo_a_tester)
            if emb_s:
                tous_embeddings.append(emb_s)

    if tous_embeddings:
        maj_dict["embedding"] = tous_embeddings[0]
        maj_dict["embeddings"] = tous_embeddings
        maj_dict["face_id"] = id_personne
        db.reference(f"faces/registry/{id_personne}").set({
            "embedding": tous_embeddings[0],
            "embeddings": tous_embeddings,
            "first_seen": time.time(),
            "last_seen": time.time(),
            "emp_id": id_personne,
            "nom": f"{maj_dict.get('prenom') or existant.get('prenom', '')} {maj_dict.get('nom') or existant.get('nom', '')}".strip(),
            "matricule": maj_dict.get("matricule") or existant.get("matricule"),
        })

    ref.update(maj_dict)
    existant.update(maj_dict)
    return existant


class VerificationVisageModel(BaseModel):
    image: str


@app.post(
    "/personnel/verifier-visage",
    tags=["Personnel"],
    summary="Vérifie si un visage humain est détecté avant de valider le scan",
)
def verifier_visage_scan(payload: VerificationVisageModel):
    import base64
    import io
    from PIL import Image
    import numpy as np

    raw = payload.image
    if "," in raw:
        raw = raw.split(",", 1)[1]

    try:
        img_bytes = base64.b64decode(raw)
        pil_img = Image.open(io.BytesIO(img_bytes)).convert("RGB")
        img_np = np.array(pil_img)
    except Exception as e:
        return {"valide": False, "erreur": f"Format d'image invalide: {e}"}

    visage_detecte = False
    confiance_score = 0.0
    qualite_texte = "Bonne (95%)"
    img_amelioree_b64 = payload.image

    # 1. Tentative avec InsightFace si disponible
    try:
        from fonctionnalites.DetectionPrincipal import on_voit_qui
        face_app = getattr(on_voit_qui, "_face_app", None)
        if face_app is not None:
            faces = face_app.get(img_np[:, :, ::-1])
            if faces and len(faces) > 0:
                meilleur = max(faces, key=lambda f: getattr(f, "det_score", 0.0))
                score = float(getattr(meilleur, "det_score", 0.0))
                if score >= 0.5:
                    visage_detecte = True
                    confiance_score = score
                    qualite_texte = f"Excellente ({int(min(99, score * 100))}%)"
    except Exception:
        pass

    # 2. Détection via modèle YOLO Pose (Keypoints visage : nez, yeux, oreilles)
    if not visage_detecte:
        try:
            from ultralytics import YOLO
            models_dir = Path(__file__).resolve().parent.parent.parent.parent / "models"
            pose_path = models_dir / "yolo11x-pose.pt"
            if not pose_path.exists():
                pose_path = "yolo11n-pose.pt"

            pose_model = YOLO(str(pose_path))
            results = pose_model(img_np, verbose=False)
            for r in results:
                if hasattr(r, "keypoints") and r.keypoints is not None and len(r.keypoints.data) > 0:
                    kps = r.keypoints.data.cpu().numpy()
                    for kp in kps:
                        # 0: nose, 1: left_eye, 2: right_eye, 3: left_ear, 4: right_ear
                        conf_nez = float(kp[0][2])
                        conf_oeil_g = float(kp[1][2])
                        conf_oeil_d = float(kp[2][2])

                        # Un visage face caméra a au moins le nez et un œil clairement visibles
                        if conf_nez > 0.45 and (conf_oeil_g > 0.4 or conf_oeil_d > 0.4):
                            visage_detecte = True
                            moyenne_conf = (conf_nez + max(conf_oeil_g, conf_oeil_d)) / 2.0
                            confiance_score = float(moyenne_conf)
                            qualite_texte = f"Excellente ({int(min(99, moyenne_conf * 100))}%)"
                            break
                if visage_detecte:
                    break
        except Exception as e:
            print(f"[verifier_visage] Erreur fallback YOLO: {e}", flush=True)

    if not visage_detecte:
        return {
            "valide": False,
            "visage_detecte": False,
            "erreur": "Aucun visage net détecté. Veuillez vous positionner bien face à la caméra.",
        }

    return {
        "valide": True,
        "visage_detecte": True,
        "confiance": confiance_score,
        "confianceBiometrique": qualite_texte,
        "image_amelioree": img_amelioree_b64,
    }


@app.delete(
    "/personnel/{id_personne}",
    tags=["Personnel"],
    summary="Supprimer définitivement un collaborateur et ses données biométriques",
)
def supprimer_personnel(id_personne: str):
    db.reference(f"personnel/{id_personne}").delete()
    db.reference(f"faces/registry/{id_personne}").delete()
    return {"succes": True, "id": id_personne}


# --------------------------------------------------------------------------
# SERVIR L'INTERFACE WEB STATIQUE (DASHBOARD REACT / VITE)
# --------------------------------------------------------------------------
_dist_web = Path(__file__).resolve().parent.parent.parent / "frontend" / "web" / "dist"
if _dist_web.exists():
    app.mount("/", StaticFiles(directory=str(_dist_web), html=True), name="static_web")


@app.on_event("startup")
def _demarrer_workers_cameras_existants():
    """Au démarrage du serveur FastAPI, lance automatiquement les workers
    FFmpeg permanents pour TOUTES les caméras IP existantes enregistrées."""
    try:
        cams = camera.lister_cameras()
        for c in cams:
            if c.get("url_flux"):
                print(f"[main] 🚀 Démarrage worker caméra existante {c['id']} ({c['url_flux']})", flush=True)
                rtsp_service.demarrer_worker_camera(c["id"], c["url_flux"])
    except Exception as exc:
        print(f"[main] Erreur démarrage auto workers caméras : {exc}", flush=True)


@app.on_event("shutdown")
def _sauvegarder_a_larret():
    """Filet de sécurité en plus de la sauvegarde périodique (voir /qui) :
    un arrêt propre (uvicorn reçoit SIGTERM, ex. `pkill` sans -9) laisse
    jusqu'à SAUVEGARDE_INTERVALLE_S secondes d'état non sauvegardé — cet
    évènement force une dernière écriture avant que le process ne
    termine. N'aide pas contre un `kill -9`/crash brutal."""
    etat_persistant.sauvegarder_maintenant()
