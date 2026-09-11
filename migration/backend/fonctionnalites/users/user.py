"""Comptes USER de PREVIA — un user est un compte RESTREINT : il ne verra
que les notifications/alertes (voir /utilisateurs/notifications à venir),
pas le reste de l'API (détection, création de comptes...), contrairement
à un admin (accès complet, voir admin.py).

Le stockage, le hachage du mot de passe et la logique générique vivent
dans compte.py (partagés avec admin.py et defaultAdmin.py) — ce fichier
n'a que la logique propre au rôle "user", avec le rôle "user" imposé à
chaque appel (impossible de modifier/supprimer un admin par ce fichier)."""
from fonctionnalites.users import compte


def creer_utilisateur_standard(nom: str, prenom: str, email: str, mot_de_passe: str) -> dict:
    """Crée un compte user (restreint aux notifications). Ne vérifie
    aucun droit lui-même — c'est à la route de main.py de s'assurer que
    l'appelant est déjà un admin avant d'appeler cette fonction."""
    return compte.creer_utilisateur(nom, prenom, email, mot_de_passe, role="user")


def lister_utilisateurs_standard() -> list[dict]:
    """Tous les comptes user (mot de passe exclu) — pas les admins."""
    return compte.lister_par_role("user")


def supprimer_utilisateur_standard(id_utilisateur: str) -> bool:
    """Supprime un compte user. False si l'id n'existe pas ou n'est PAS
    un user (protège un admin d'être supprimé par cette voie)."""
    return compte.supprimer_utilisateur(id_utilisateur, role_attendu="user")


def modifier_utilisateur_standard(
    id_utilisateur: str,
    nom: str | None = None,
    prenom: str | None = None,
    email: str | None = None,
    mot_de_passe: str | None = None,
) -> dict | None:
    """Modifie un compte user existant. None si l'id n'existe pas ou
    n'est pas un user."""
    return compte.modifier_utilisateur(
        id_utilisateur, role_attendu="user", nom=nom, prenom=prenom, email=email, mot_de_passe=mot_de_passe,
    )
