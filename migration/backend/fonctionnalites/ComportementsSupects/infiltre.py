"""Détecte une personne découverte À L'INTÉRIEUR du bâtiment sans avoir
JAMAIS été vue passer par un point d'ENTRÉE surveillé (voir `est_entree`
dans fonctionnalites/cam/camera/camera.py) — "on ne l'a pas vue entrer,
et elle est quand même à l'intérieur".

Construit sur tout ce qui existe déjà, pas un nouveau système à part :
- L'IDENTITÉ (pid) est globale (voir on_voit_qui.py, identify_face/
  identify_body) — donc on peut savoir, peu importe la caméra qui la
  voit MAINTENANT, si CETTE personne a DÉJÀ été vue, n'importe quand,
  n'importe où dans le bâtiment, par une caméra marquée "entrée".
- Le registre fonctionnalites/cam/ dit quelles caméras sont des entrées.
- profil_suspect.py reçoit l'événement quand une infiltration est
  confirmée (visible depuis n'importe quelle caméra, comme le reste).
- rapport_cam.py reçoit l'événement dans l'historique DE LA caméra qui
  vient de découvrir la personne.

Logique : à chaque personne identifiée (voir evaluer(), appelé depuis
on_voit_qui.py) —
  - si la caméra qui la voit EST une entrée : elle vient (probablement)
    d'entrer normalement -> marquée "vue à une entrée", plus jamais
    suspectée d'infiltration ensuite (voir marquer_vu_a_une_entree) ;
  - sinon, si elle a DÉJÀ été vue à une entrée avant (peu importe
    quand/où) -> chemin plausible, rien d'anormal ;
  - sinon -> jamais vue entrer nulle part, mais pourtant à l'intérieur :
    infiltration suspectée.

Stockage : un fichier JSON par personne, migration/db/entrees_vues/<pid>.json
— volontairement séparé de profil_suspect.py (qui liste des ÉVÉNEMENTS
suspects) : celui-ci retient un simple FAIT neutre ("vue à une entrée, et
quand") qui ne change jamais de nature, pas un jugement."""
import json
import threading
from collections import defaultdict
from pathlib import Path

from fonctionnalites.Alertes import alertes, comparaison_ia
from fonctionnalites.ComportementsSupects import profil_suspect
from fonctionnalites.Infrastructure import rapport_cam

ENTREES_VUES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "entrees_vues"

_verrous: dict[str, threading.Lock] = defaultdict(threading.Lock)

# Ne loggue un événement d'infiltration/résolution QUE quand le statut
# CHANGE (même principe que rodeur.py/abandonne.py/feu_fume.py) — pas à
# chaque appel tant que ça reste vrai ou reste faux.
_dernier_statut: dict[str, dict] = {}  # id_camera -> {pid -> bool}


def _chemin(pid: str) -> Path:
    ENTREES_VUES_DIR.mkdir(parents=True, exist_ok=True)
    return ENTREES_VUES_DIR / f"{pid}.json"


def a_deja_vu_une_entree(pid: str) -> bool:
    """Vrai si `pid` a déjà été vu, n'importe quand, par une caméra
    marquée "entrée" — voir marquer_vu_a_une_entree."""
    return _chemin(pid).exists()


def marquer_vu_a_une_entree(pid: str, id_camera: str, now: float) -> None:
    """Enregistre que `pid` vient d'être vu par une caméra "entrée" — dès
    cet appel, a_deja_vu_une_entree(pid) devient (et reste) vrai. Ne fait
    rien pour une zone anonyme (voir profil_suspect.est_identite_reelle,
    même garde-fou que profil_suspect.py — une zone_id n'a pas de sens
    d'une caméra à l'autre, donc pas de "vue à une entrée" possible)."""
    if not profil_suspect.est_identite_reelle(pid):
        return
    with _verrous[pid]:
        chemin = _chemin(pid)
        premiere_fois = now
        if chemin.exists():
            with open(chemin, encoding="utf-8") as f:
                premiere_fois = json.load(f).get("premiere_entree_vue_le", now)
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump({
                "pid": pid,
                "premiere_entree_vue_le": premiere_fois,
                "derniere_entree_vue_le": now,
                "derniere_camera_entree": id_camera,
            }, f, ensure_ascii=False, indent=2)


def evaluer(id_camera: str, pid: str, est_camera_entree: bool, now: float) -> dict:
    """Cœur du module — appelé pour CHAQUE personne identifiée sur
    CHAQUE caméra (voir on_voit_qui.py). Renvoie {"infiltre": bool,
    "statut": str}. Sans effet pour une zone anonyme (voir
    profil_suspect.est_identite_reelle)."""
    if not profil_suspect.est_identite_reelle(pid):
        return {"infiltre": False, "statut": "identite_non_reelle"}

    if est_camera_entree:
        marquer_vu_a_une_entree(pid, id_camera, now)
        statut = "entree_normale"
    elif a_deja_vu_une_entree(pid):
        statut = "normal"
    else:
        statut = "infiltration_suspectee"

    infiltre = statut == "infiltration_suspectee"

    statuts_camera = _dernier_statut.setdefault(id_camera, {})
    ancien = statuts_camera.get(pid)
    avis_ia = None
    if ancien != infiltre and (ancien is not None or infiltre):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "infiltration",
            "pid": pid,
            "evenement": statut,
            "horodatage": now,
        })
        if infiltre:
            profil_suspect.signaler(pid, id_camera, "infiltration_suspectee", {})

            # Deuxième avis (voir comparaison_ia.py) — pas de contrainte
            # de vitesse ici (contrairement à feu_fume.py) : une
            # infiltration mérite un vrai second avis validé par la base
            # de référence.
            phrase = "Une personne a été découverte à l'intérieur du bâtiment sans être jamais passée par une entrée surveillée."
            avis_ia = comparaison_ia.comparer(phrase)

            # Alerte isolée (voir Alertes/alertes.py) — "ce qui nous
            # intéresse le plus", avec l'avis IA persisté.
            alertes.enregistrer_alerte("infiltration", id_camera, pid, phrase, avis_ia, now)
    statuts_camera[pid] = infiltre

    return {"infiltre": infiltre, "statut": statut, "avis_ia": avis_ia}
