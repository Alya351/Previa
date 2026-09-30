"""Socle commun à TOUS les comptes de PREVIA (admin ou user) — stockage
local (un fichier JSON par compte, sous migration/db/users/<id>.json) et
sécurité du mot de passe. Utilisé par admin.py, defaultAdmin.py et
user.py, qui n'ont eux que la logique propre à leur rôle.

Volontairement séparé de fonctionnalites/Infrastructure/local_store.py :
un compte utilisateur (identité, mot de passe) n'a rien à voir avec une
donnée de vision (vueActuelle, historique...), pas de raison de partager
le même fichier ni le même chemin.

Ne fait AUCUNE vérification de droits (pas de notion de "qui est
connecté" ici) — c'est aux routes de main.py de s'assurer qu'un appelant
a bien le rôle admin avant de créer un compte, et qu'un "user" n'accède
bien qu'aux notifications. La vérification de session/jeton n'est pas
encore construite (à venir)."""
import hashlib
import json
import os
import time
import uuid
from pathlib import Path

USERS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "users"

ROLES_VALIDES = {"admin", "user"}

# PBKDF2 fait partie de hashlib (bibliothèque standard) — pas besoin
# d'ajouter bcrypt/argon2 comme dépendance juste pour ça.
ITERATIONS_HASH = 200_000


def _hacher_mot_de_passe(mot_de_passe: str, sel: bytes | None = None) -> dict:
    sel = sel or os.urandom(16)
    hash_ = hashlib.pbkdf2_hmac("sha256", mot_de_passe.encode("utf-8"), sel, ITERATIONS_HASH)
    return {"sel": sel.hex(), "hash": hash_.hex()}


def _verifier_mot_de_passe(mot_de_passe: str, sel_hex: str, hash_hex: str) -> bool:
    sel = bytes.fromhex(sel_hex)
    recalcule = hashlib.pbkdf2_hmac("sha256", mot_de_passe.encode("utf-8"), sel, ITERATIONS_HASH)
    return recalcule.hex() == hash_hex


def _chemin(id_utilisateur: str) -> Path:
    return USERS_DIR / f"{id_utilisateur}.json"


def lister_utilisateurs() -> list[dict]:
    """Tous les comptes existants (admins + users), mot de passe exclu."""
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    utilisateurs = []
    for fichier in sorted(USERS_DIR.glob("*.json")):
        with open(fichier, encoding="utf-8") as f:
            u = json.load(f)
        u.pop("mot_de_passe", None)
        utilisateurs.append(u)
    return utilisateurs


def trouver_par_email(email: str) -> dict | None:
    """Compte complet (mot de passe haché inclus) par email — usage
    interne (connexion, vérification d'unicité), jamais renvoyé tel quel
    par une route."""
    USERS_DIR.mkdir(parents=True, exist_ok=True)
    email = email.strip().lower()
    for fichier in USERS_DIR.glob("*.json"):
        with open(fichier, encoding="utf-8") as f:
            u = json.load(f)
        if u.get("email", "").lower() == email:
            return u
    return None


def trouver_par_id(id_utilisateur: str) -> dict | None:
    """Compte complet (mot de passe haché inclus) par id — usage interne,
    jamais renvoyé tel quel par une route."""
    chemin = _chemin(id_utilisateur)
    if not chemin.exists():
        return None
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def lister_par_role(role: str) -> list[dict]:
    """Comptes existants d'UN rôle donné (admin ou user), mot de passe
    exclu — utilisé par admin.lister_admins() et
    user.lister_utilisateurs_standard()."""
    return [u for u in lister_utilisateurs() if u.get("role") == role]


def creer_utilisateur(
    nom: str, prenom: str, email: str, mot_de_passe: str, role: str, est_par_defaut: bool = False,
) -> dict:
    """Crée un compte (admin ou user) et l'écrit dans
    migration/db/users/<id>.json. Lève ValueError si le rôle est invalide
    ou si l'email est déjà pris. Ne vérifie aucun droit — voir docstring
    du module.

    `est_par_defaut` : marque ce compte comme LE compte créé par
    l'amorçage initial (voir defaultAdmin.py) — sert uniquement à le
    retrouver ensuite parmi les autres admins, aucun effet sur ses
    droits (un admin par défaut a les mêmes droits qu'un admin normal)."""
    if role not in ROLES_VALIDES:
        raise ValueError(f"Rôle invalide : {role!r} (attendu : {ROLES_VALIDES})")

    email = email.strip().lower()
    if trouver_par_email(email) is not None:
        raise ValueError(f"Un compte existe déjà avec l'email {email}")

    nom_str = nom.strip()
    prenom_str = prenom.strip()
    nom_complet = f"{prenom_str} {nom_str}".lower()

    # Empêcher les doublons d'admins ou d'utilisateurs avec le même nom complet
    for existant in lister_utilisateurs():
        e_nom = f"{existant.get('prenom', '')} {existant.get('nom', '')}".strip().lower()
        if e_nom == nom_complet:
            raise ValueError(f"Un compte pour '{prenom_str} {nom_str}' existe déjà.")

    utilisateur = {
        "id": uuid.uuid4().hex,
        "nom": nom_str,
        "prenom": prenom_str,
        "email": email,
        "role": role,
        "est_par_defaut": est_par_defaut,
        "mot_de_passe": _hacher_mot_de_passe(mot_de_passe),
        "cree_le": time.time(),
    }

    USERS_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(utilisateur["id"]), "w", encoding="utf-8") as f:
        json.dump(utilisateur, f, ensure_ascii=False, indent=2)

    public = dict(utilisateur)
    public.pop("mot_de_passe")
    return public


def supprimer_utilisateur(id_utilisateur: str, role_attendu: str | None = None) -> bool:
    """Supprime le compte `id_utilisateur`. Si `role_attendu` est fourni,
    refuse (renvoie False sans rien supprimer) si le compte n'a pas ce
    rôle — garde-fou pour qu'un endpoint "supprimer un user" ne puisse
    pas supprimer un admin par erreur, et inversement. Renvoie False si
    le compte n'existe pas."""
    u = trouver_par_id(id_utilisateur)
    if u is None:
        return False
    if role_attendu is not None and u.get("role") != role_attendu:
        return False
    _chemin(id_utilisateur).unlink()
    return True


def modifier_utilisateur(
    id_utilisateur: str,
    role_attendu: str | None = None,
    nom: str | None = None,
    prenom: str | None = None,
    email: str | None = None,
    mot_de_passe: str | None = None,
) -> dict | None:
    """Modifie un ou plusieurs champs d'un compte existant (seuls les
    champs non-None sont changés). Renvoie le compte mis à jour (sans
    mot de passe), ou None si le compte n'existe pas / n'a pas le rôle
    attendu. Lève ValueError si le nouvel email est déjà pris par un
    AUTRE compte."""
    u = trouver_par_id(id_utilisateur)
    if u is None:
        return None
    if role_attendu is not None and u.get("role") != role_attendu:
        return None

    if email is not None:
        nouvel_email = email.strip().lower()
        existant = trouver_par_email(nouvel_email)
        if existant is not None and existant["id"] != id_utilisateur:
            raise ValueError(f"Un compte existe déjà avec l'email {nouvel_email}")
        u["email"] = nouvel_email
    if nom is not None:
        u["nom"] = nom.strip()
    if prenom is not None:
        u["prenom"] = prenom.strip()
    if mot_de_passe is not None:
        u["mot_de_passe"] = _hacher_mot_de_passe(mot_de_passe)

    with open(_chemin(id_utilisateur), "w", encoding="utf-8") as f:
        json.dump(u, f, ensure_ascii=False, indent=2)

    public = dict(u)
    public.pop("mot_de_passe")
    return public


def authentifier(email: str, mot_de_passe: str) -> dict | None:
    """Vérifie email + mot de passe, renvoie le compte (sans le mot de
    passe) si valide, None sinon. Pas encore branché sur une route (pas
    de session/jeton construit) — prêt pour quand on s'y attaquera."""
    u = trouver_par_email(email)
    if u is None:
        return None
    if not _verifier_mot_de_passe(mot_de_passe, u["mot_de_passe"]["sel"], u["mot_de_passe"]["hash"]):
        return None
    public = dict(u)
    public.pop("mot_de_passe")
    return public
