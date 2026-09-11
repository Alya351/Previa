"""État de l'alarme physique RÉELLE (lampe + sirène, voir
migration/arduino/esp.ino) — un ESP32 branché sur le réseau local
interroge GET /alarme/etat toutes les ~3s (voir main.py) et pilote deux
broches (une par équipement) selon ce que cet état dit.

Avant ce module, "Arrêter l'alerte" côté app mobile ne faisait QUE
changer un état local dans le téléphone (voir mobile/App.js,
handleStopAlert) — aucun équipement physique réel n'était relié, et
c'était documenté comme tel. Ce module est ce qui manquait pour que ce
ne soit plus le cas : un vrai état serveur, modifié par de vraies
requêtes (voir POST /alarme/arreter et /alarme/reactiver dans main.py),
lu par un vrai ESP32.

État EN MÉMOIRE, pas persisté — même choix que derniere_image.py : un
redémarrage du serveur remet lampe/sirène à l'arrêt, ce qui est le
comportement sûr par défaut (mieux vaut redémarrer "éteint" que
redémarrer avec une sirène qui recommence à sonner toute seule sans
qu'aucune alerte réelle ne soit en cours)."""

_etat = {"lampe": False, "sirene": False}


def etat() -> dict:
    return dict(_etat)


def activer() -> dict:
    """Appelé quand une alerte CRITIQUE se déclenche (voir
    Alertes/alertes.py, enregistrer_alerte) — allume lampe ET sirène."""
    _etat["lampe"] = True
    _etat["sirene"] = True
    return etat()


def arreter() -> dict:
    """"Arrêter l'alerte" — voir POST /alarme/arreter dans main.py,
    appelé par l'app mobile (handleStopAlert)."""
    _etat["lampe"] = False
    _etat["sirene"] = False
    return etat()
