"""Réinitialisation complète d'une installation PREVIA — efface TOUTES
les données locales (comptes, bâtiments/pièces/caméras, alertes,
profils, état comportemental, licence...) pour repartir d'une
installation vierge, comme au tout premier lancement (voir
users/defaultAdmin.py : après un reboot, POST /utilisateurs/amorcer
redevient possible — un code d'amorçage sera de nouveau exigé pour
recréer le premier admin, exactement comme au premier jour).

Utilisée par la page /reboot du frontend web (voir App.jsx côté React)
— DÉLIBÉRÉMENT accessible sans connexion : pensée pour le scénario où
justement plus personne ne peut se connecter (mot de passe perdu, admin
par défaut supprimé par erreur...) et où il faut pouvoir repartir de
zéro sans passer par un compte existant. Irréversible, aucune
confirmation côté serveur au-delà de l'appel HTTP lui-même — la
confirmation ("es-tu sûr ?") est du ressort du frontend."""
import shutil
from pathlib import Path

# Même racine que USERS_DIR dans users/compte.py (Path(__file__)....
# parent x4) : "toutes les données" = tout ce dossier, pas juste les
# comptes — users/ n'est qu'un sous-dossier parmi d'autres ici.
DOSSIER_DB = Path(__file__).resolve().parent.parent.parent.parent / "db"


def reinitialiser() -> None:
    """Vide DOSSIER_DB (fichiers ET sous-dossiers), sans le supprimer
    lui-même — le volume Docker (previa_db) doit rester monté au même
    endroit après coup."""
    if not DOSSIER_DB.exists():
        return
    for element in DOSSIER_DB.iterdir():
        if element.is_dir():
            shutil.rmtree(element)
        else:
            element.unlink()
