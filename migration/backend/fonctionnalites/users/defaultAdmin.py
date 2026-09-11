"""Amorçage et gestion du tout premier compte admin de PREVIA.

Une entreprise qui télécharge PREVIA n'a personne d'enregistré au
départ — pas de "grand boss" connu à l'avance côté code. Ce module crée
CE premier admin (nom, prénom, email, mot de passe), marqué
`est_par_defaut` (voir compte.creer_utilisateur) pour pouvoir le
retrouver ensuite précisément parmi les autres admins : une seule fois,
au tout premier lancement. Si un compte existe déjà (admin ou user),
l'amorçage est refusé — voir la route /utilisateurs/amorcer dans
main.py.

Une fois ce premier admin créé, c'est lui qui crée les suivants (voir
admin.creer_admin) et les comptes user restreints (voir
user.creer_utilisateur_standard). Ce module garde quand même
lister/modifier/supprimer POUR ce compte précis — utile par exemple pour
en réinitialiser le mot de passe, ou le supprimer pour pouvoir refaire
l'amorçage si la toute première saisie était une erreur.

CODE_SECRET : un deuxième verrou en plus de "aucun compte n'existe
encore" — n'importe qui pourrait sinon amorcer le tout premier admin
d'une installation PREVIA fraîchement téléchargée avant le vrai
propriétaire. Valeur par défaut volontairement simple ("2026") : première
étape, à revoir (config par installation, pas une constante partagée par
tout le monde) avant un vrai déploiement — voir la remarque du même type
déjà faite ailleurs dans ce projet (ex. les seuils "CALIBRATION DÉMO" de
rodeur.py)."""
from fonctionnalites.users import compte

CODE_SECRET_PAR_DEFAUT = "2026"


class CodeSecretInvalide(Exception):
    """`code_secret` ne correspond pas à CODE_SECRET_PAR_DEFAUT — à
    distinguer d'un ValueError "déjà amorcé" pour que main.py puisse
    répondre 403 plutôt que 409."""


def initialiser_admin_par_defaut(nom: str, prenom: str, email: str, mot_de_passe: str, code_secret: str) -> dict:
    """Crée le premier admin — uniquement si `code_secret` est correct ET
    qu'aucun compte n'existe encore. Lève CodeSecretInvalide si le code
    est faux, ValueError si un compte existe déjà (déjà amorcé)."""
    if code_secret != CODE_SECRET_PAR_DEFAUT:
        raise CodeSecretInvalide("Code secret incorrect.")
    if compte.lister_utilisateurs():
        raise ValueError(
            "Un compte existe déjà — l'amorçage du premier admin n'est possible qu'une seule fois."
        )
    return compte.creer_utilisateur(nom, prenom, email, mot_de_passe, role="admin", est_par_defaut=True)


def obtenir_admin_par_defaut() -> dict | None:
    """Le compte admin créé par l'amorçage initial (mot de passe exclu),
    ou None s'il a depuis été supprimé (ou si l'amorçage n'a jamais eu
    lieu)."""
    for u in compte.lister_utilisateurs():
        if u.get("est_par_defaut"):
            return u
    return None


def supprimer_admin_par_defaut() -> bool:
    """Supprime le compte admin par défaut — permet de refaire
    l'amorçage (POST /utilisateurs/amorcer) en cas d'erreur au premier
    lancement. Ne supprime QUE ce compte précis, jamais un admin créé
    ensuite normalement. False s'il n'y a pas de compte par défaut."""
    u = obtenir_admin_par_defaut()
    if u is None:
        return False
    return compte.supprimer_utilisateur(u["id"], role_attendu="admin")


def modifier_admin_par_defaut(
    nom: str | None = None,
    prenom: str | None = None,
    email: str | None = None,
    mot_de_passe: str | None = None,
) -> dict | None:
    """Modifie le compte admin par défaut. None s'il n'y en a pas."""
    u = obtenir_admin_par_defaut()
    if u is None:
        return None
    return compte.modifier_utilisateur(
        u["id"], role_attendu="admin", nom=nom, prenom=prenom, email=email, mot_de_passe=mot_de_passe,
    )
