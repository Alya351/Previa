"""Comptes ADMIN de PREVIA — un admin a un accès complet et peut créer
d'autres comptes (admin ou user restreint, voir user.py), ainsi que les
bâtiments/pièces/caméras (voir fonctionnalites/cam/). Voir compte.py pour
le stockage partagé (même fichier JSON par compte, juste un rôle
différent) et defaultAdmin.py pour la création/gestion du tout premier
admin.

Le rôle "admin" est imposé à chaque appel (impossible de modifier/
supprimer un user par ce fichier).

Pas encore de session/jeton de connexion construit — donc, pour les
actions réservées à un admin (créer un bâtiment/pièce/caméra), l'appelant
doit fournir l'`id_admin` de son propre compte, vérifié ici (_verifier_admin)
contre les comptes existants. À remplacer par une vraie vérification de
session quand l'authentification sera construite."""
from fonctionnalites.cam.batiment import batiment as _batiment
from fonctionnalites.cam.camera import camera as _camera
from fonctionnalites.cam.pieces import piece as _piece
from fonctionnalites.users import compte
from fonctionnalites.zoneCam import enregitre as _zone


class AccesRefuse(Exception):
    """`id_admin` ne correspond à aucun compte admin existant — à
    distinguer d'un ValueError "normal" (ex. batiment_id invalide) pour
    que main.py puisse répondre 403 plutôt que 404."""


def _verifier_admin(id_admin: str) -> None:
    """Lève AccesRefuse si `id_admin` ne correspond à aucun compte admin
    existant — garde-fou minimal en attendant une vraie session."""
    c = compte.trouver_par_id(id_admin)
    if c is None or c.get("role") != "admin":
        raise AccesRefuse("Seul un admin peut effectuer cette action.")


def creer_admin(nom: str, prenom: str, email: str, mot_de_passe: str) -> dict:
    """Crée un compte admin. Comme compte.creer_utilisateur(), ne vérifie
    aucun droit lui-même — c'est à la route de main.py de s'assurer que
    l'appelant est déjà un admin avant d'appeler cette fonction (pas
    encore de session/jeton construit pour le faire)."""
    return compte.creer_utilisateur(nom, prenom, email, mot_de_passe, role="admin")


def lister_admins() -> list[dict]:
    """Tous les comptes admin (mot de passe exclu) — y compris l'admin
    par défaut, voir defaultAdmin.obtenir_admin_par_defaut() pour le
    retrouver précisément lui."""
    return compte.lister_par_role("admin")


def supprimer_admin(id_utilisateur: str) -> bool:
    """Supprime un compte admin. False si l'id n'existe pas ou n'est PAS
    un admin (protège un user d'être supprimé par cette voie)."""
    return compte.supprimer_utilisateur(id_utilisateur, role_attendu="admin")


def modifier_admin(
    id_utilisateur: str,
    nom: str | None = None,
    prenom: str | None = None,
    email: str | None = None,
    mot_de_passe: str | None = None,
) -> dict | None:
    """Modifie un compte admin existant. None si l'id n'existe pas ou
    n'est pas un admin."""
    return compte.modifier_utilisateur(
        id_utilisateur, role_attendu="admin", nom=nom, prenom=prenom, email=email, mot_de_passe=mot_de_passe,
    )


# ------------------------------------------------------------------
# Création réservée à un admin : bâtiments, pièces, caméras
# ------------------------------------------------------------------
def creer_batiment(id_admin: str, nom: str, lieu: str) -> dict:
    """Crée un bâtiment — uniquement si `id_admin` est un compte admin
    existant. Lève ValueError sinon."""
    _verifier_admin(id_admin)
    return _batiment.creer_batiment(nom, lieu)


def creer_piece(id_admin: str, nom: str, batiment_id: str) -> dict:
    """Crée une pièce — uniquement si `id_admin` est un compte admin
    existant. Lève ValueError sinon (y compris si `batiment_id` est
    invalide, voir piece.creer_piece)."""
    _verifier_admin(id_admin)
    return _piece.creer_piece(nom, batiment_id)


def creer_camera(id_admin: str, num: str, piece_id: str, est_entree: bool = False) -> dict:
    """Crée une caméra — uniquement si `id_admin` est un compte admin
    existant. Lève ValueError sinon (y compris si `piece_id` est
    invalide, voir camera.creer_camera). `est_entree` : voir camera.py
    et ComportementsSupects/infiltre.py."""
    _verifier_admin(id_admin)
    return _camera.creer_camera(num, piece_id, est_entree=est_entree)


def enregistrer_zone(id_admin: str, id_camera: str, points: list[dict]) -> dict:
    """Enregistre (ou remplace) la zone à surveiller d'UNE caméra —
    uniquement si `id_admin` est un compte admin existant. Lève
    ValueError si `points` ne forme pas un polygone valide (voir
    zoneCam/enregitre.py) — configurer une zone est réservé aux admins,
    comme créer un bâtiment/pièce/caméra (pas une action "notification
    uniquement" pour un compte user)."""
    _verifier_admin(id_admin)
    return _zone.enregistrer_zone(id_camera, points)
