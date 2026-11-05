"""Alarme physique RÉELLE (lampe + sirène), pilotée directement par les
broches GPIO du Raspberry Pi, via une carte relais (voir
raspberry/CABLAGE_RELAIS.md pour le branchement).

Plus aucun microcontrôleur intermédiaire : le backend PREVIA, qui tourne
sur le Raspberry, allume et éteint lui-même les deux relais quand une
alerte critique se déclenche (alertes.py appelle `activer()`) ou quand
l'utilisateur appuie sur "Arrêter l'alerte" / "Réarmer" dans l'app
(routes /alarme/arreter et /alarme/reactiver dans main.py).

Deux modes, choisis automatiquement au démarrage :
  - "gpio"       : `gpiozero` est installé ET les broches sont
                   accessibles (Raspberry Pi) -> les relais sont pilotés.
  - "simulation" : sinon (PC de développement, Docker sans accès aux
                   GPIO, bibliothèque absente...) -> seul l'état en
                   mémoire change, rien n'est branché ; la raison est
                   affichée dans les logs et par GET /alarme/diagnostic.
Le serveur démarre donc TOUJOURS, avec ou sans Raspberry.

Réglages (variables d'environnement, voir /etc/previa/gpio.env sur le
Raspberry) :
  PREVIA_GPIO_LAMPE        numéro BCM de la broche du relais lampe   (17)
  PREVIA_GPIO_SIRENE       numéro BCM de la broche du relais sirène  (27)
  PREVIA_RELAIS_ACTIF_BAS  1 = le relais s'active quand la broche est à
                           0 V (cas de la plupart des cartes relais à
                           optocoupleur, valeur par défaut) ; 0 = il
                           s'active à 3,3 V
  PREVIA_GPIO              "off" pour forcer la simulation

État EN MÉMOIRE, pas persisté : un redémarrage du serveur remet lampe et
sirène à l'arrêt, ce qui est le comportement sûr par défaut."""

import atexit
import os
import threading

DUREE_MAX_SIRENE_SECONDES = 120  # 2 minutes maximum


def _entier_env(nom: str, defaut: int) -> int:
    try:
        return int(os.environ.get(nom, defaut))
    except (TypeError, ValueError):
        return defaut


BROCHE_LAMPE = _entier_env("PREVIA_GPIO_LAMPE", 17)
BROCHE_SIRENE = _entier_env("PREVIA_GPIO_SIRENE", 27)
RELAIS_ACTIF_BAS = os.environ.get("PREVIA_RELAIS_ACTIF_BAS", "1").strip().lower() not in ("0", "false", "non", "no")
GPIO_DESACTIVE = os.environ.get("PREVIA_GPIO", "auto").strip().lower() in ("off", "0", "non", "no", "simulation")

_verrou = threading.RLock()
_etat = {"lampe": False, "sirene": False}
_timer_extinction = None
_peripheriques: dict = {}  # {"lampe": OutputDevice, "sirene": OutputDevice} en mode gpio
_mode = "simulation"
_raison_simulation = ""


def _initialiser_gpio() -> None:
    """Tente de prendre le contrôle des deux broches. Ne lève jamais :
    en cas d'échec on reste en simulation et on dit pourquoi."""
    global _mode, _raison_simulation
    if GPIO_DESACTIVE:
        _raison_simulation = "PREVIA_GPIO=off (simulation demandée)"
        print(f"[alarme] mode simulation : {_raison_simulation}", flush=True)
        return
    lampe = sirene = None
    try:
        from gpiozero import OutputDevice  # import tardif : absent hors Raspberry

        # initial_value=False => relais au repos au démarrage, quelle que
        # soit la polarité (active_high=False inverse bien le niveau réel).
        lampe = OutputDevice(BROCHE_LAMPE, active_high=not RELAIS_ACTIF_BAS, initial_value=False)
        sirene = OutputDevice(BROCHE_SIRENE, active_high=not RELAIS_ACTIF_BAS, initial_value=False)
    except Exception as exc:  # bibliothèque absente, pas de GPIO, droits insuffisants...
        for p in (lampe, sirene):
            try:
                if p is not None:
                    p.close()
            except Exception:
                pass
        _raison_simulation = f"{type(exc).__name__}: {exc}"
        print(f"[alarme] mode simulation (GPIO indisponible) : {_raison_simulation}", flush=True)
        return
    _peripheriques["lampe"] = lampe
    _peripheriques["sirene"] = sirene
    _mode = "gpio"
    niveau = "actif bas" if RELAIS_ACTIF_BAS else "actif haut"
    print(
        f"[alarme] mode GPIO : lampe=BCM{BROCHE_LAMPE}, sirène=BCM{BROCHE_SIRENE} (relais {niveau})",
        flush=True,
    )


def _appliquer() -> None:
    """Reporte `_etat` sur les relais (sans effet en simulation)."""
    for nom, peripherique in _peripheriques.items():
        try:
            if _etat[nom]:
                peripherique.on()
            else:
                peripherique.off()
        except Exception as exc:
            print(f"[alarme] erreur GPIO ({nom}) : {exc}", flush=True)


def _tout_eteindre_a_la_sortie() -> None:
    with _verrou:
        _etat["lampe"] = False
        _etat["sirene"] = False
        _appliquer()
        for peripherique in _peripheriques.values():
            try:
                peripherique.close()
            except Exception:
                pass
        _peripheriques.clear()


_initialiser_gpio()
atexit.register(_tout_eteindre_a_la_sortie)


def etat() -> dict:
    with _verrou:
        return dict(_etat)


def diagnostic() -> dict:
    """Pour vérifier le branchement (GET /alarme/diagnostic) : dit si les
    relais sont réellement pilotés ou si l'on est en simulation."""
    with _verrou:
        return {
            "mode": _mode,
            "raison_simulation": _raison_simulation or None,
            "broche_lampe": BROCHE_LAMPE,
            "broche_sirene": BROCHE_SIRENE,
            "relais_actif_bas": RELAIS_ACTIF_BAS,
            "duree_max_sirene_secondes": DUREE_MAX_SIRENE_SECONDES,
            "etat": dict(_etat),
        }


def _extinction_automatique():
    global _timer_extinction
    with _verrou:
        _etat["lampe"] = False
        _etat["sirene"] = False
        _timer_extinction = None
        _appliquer()


def activer() -> dict:
    """Appelé quand une alerte CRITIQUE se déclenche.
    Allume lampe ET sirène et lance un minuteur d'extinction automatique à 2 min.
    """
    global _timer_extinction
    with _verrou:
        _etat["lampe"] = True
        _etat["sirene"] = True
        _appliquer()

        if _timer_extinction is not None:
            _timer_extinction.cancel()

        _timer_extinction = threading.Timer(DUREE_MAX_SIRENE_SECONDES, _extinction_automatique)
        _timer_extinction.daemon = True
        _timer_extinction.start()

        return dict(_etat)


def arreter() -> dict:
    """"Arrêter l'alerte" manuellement depuis le web ou le mobile."""
    global _timer_extinction
    with _verrou:
        if _timer_extinction is not None:
            _timer_extinction.cancel()
            _timer_extinction = None

        _etat["lampe"] = False
        _etat["sirene"] = False
        _appliquer()
        return dict(_etat)
