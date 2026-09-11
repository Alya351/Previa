"""Détecte un objet potentiellement ABANDONNÉ : TOUT objet non-humain
détecté par le modèle général (voir on_voit_quoi.py, COCO_FR), suivi d'un
appel à l'autre (track_id du tracker général), et dont plus AUCUNE
personne ne s'est approchée depuis un certain temps.

Architecture multi-caméra : CHAQUE caméra a sa propre mémoire d'objets
suivis (voir _etat_objets, dict indexé par id_camera EN PREMIER) — un
track_id n'est unique QUE pour le tracker de sa propre caméra (voir
on_voit_quoi.py), donc mélanger les track_id de deux caméras différentes
sous la même clé mélangerait des objets sans rapport.

Principe : à chaque appel, on regarde si une personne est physiquement
proche de l'objet (même image, mêmes boîtes détectées) — si oui, on note
"vu avec quelqu'un maintenant". Le compteur d'abandon ne se déclenche que
si ça fait longtemps qu'on n'a plus vu personne à proximité, pas juste
"personne n'est là sur CETTE image précise".

Choix assumé : TOUS les objets sont suivis, SAUF le mobilier utilitaire
fixe (chaise, table, télé, évier...) qui n'est jamais vraiment
"abandonné" au sens propre — une chaise vide depuis 2 minutes n'a aucun
intérêt à être signalée comme un sac oublié (voir MOBILIER_EXCLU_FR).

Suivi de l'objet : repose sur le track_id du tracker général DE LA MÊME
CAMÉRA (_suivre_instances dans on_voit_quoi.py), qui inclut maintenant
une re-liaison position/classe pour survivre à une perte de suivi brève
— la mémoire d'abandon n'est donc plus réinitialisée à chaque occlusion
passagère."""
from fonctionnalites.Infrastructure import rapport_cam

from fonctionnalites.Alertes import alertes, comparaison_ia

# Mobilier/équipement fixe, jamais "abandonné" au sens propre (fait partie
# du décor, personne ne le porte ni ne l'oublie) — exclu du suivi
# d'abandon pour ne pas noyer les vrais signaux (sac, valise, téléphone
# oubliés...) sous du bruit permanent.
MOBILIER_EXCLU_FR = {
    "chaise", "canapé", "lit", "table à manger", "toilettes", "télé",
    "micro-ondes", "four", "grille-pain", "évier", "réfrigérateur", "banc",
    "feu de circulation", "bouche d'incendie", "panneau stop", "parcmètre",
}

# CALIBRATION "DÉMO" (PC local, sans le Pi) : réduit pour confirmer en
# secondes devant un public plutôt qu'en minutes — même logique que
# rodeur.py. À REMONTER avant un vrai déploiement non supervisé (un objet
# posé quelques secondes en vrai usage ne devrait pas être "abandonné").
# Temps sans personne proche avant de dire "abandonné".
ABANDON_DUREE_MIN_S = 10.0  # était 120.0 / 2 min

# Distance max (fraction de la diagonale de l'image) pour dire qu'une
# personne est "avec" l'objet — même logique que rodeur.py, portable
# quelle que soit la résolution de la caméra.
ABANDON_PROXIMITE_FRACTION = 0.15

# Une entrée pas revue du tout (avec ou sans personne) depuis ce délai est
# oubliée — le tracker a de toute façon perdu cet objet depuis longtemps.
ABANDON_FENETRE_S = 60.0  # était 300.0 — reste largement > ABANDON_DUREE_MIN_S

# Tout ce qui suit est indexé par id_camera EN PREMIER — voir docstring
# du module.
# id_camera -> {track_id -> {"label", "first_seen", "last_seen", "dernier_avec_personne"}}
_etat_objets: dict[str, dict] = {}
_dernier_statut: dict[str, dict] = {}   # id_camera -> {track_id -> bool}
_dernier_avis_ia: dict[str, dict] = {}  # id_camera -> {track_id -> dict|None}


def observer(id_camera: str, track_id: int, nom_fr: str, centroid: tuple, personnes_centroides: list,
             diagonale_frame: float, now: float) -> None:
    """Enregistre cette observation POUR CETTE CAMÉRA : si une personne
    est proche de l'objet à CET appel, on note "vu avec quelqu'un
    maintenant"."""
    objets_camera = _etat_objets.setdefault(id_camera, {})
    statuts_camera = _dernier_statut.setdefault(id_camera, {})

    expires = [tid for tid, e in objets_camera.items() if now - e["last_seen"] > ABANDON_FENETRE_S]
    for tid in expires:
        del objets_camera[tid]
        statuts_camera.pop(tid, None)

    if nom_fr in MOBILIER_EXCLU_FR:
        return

    entry = objets_camera.setdefault(
        track_id, {"label": nom_fr, "first_seen": now, "last_seen": now, "dernier_avec_personne": now},
    )
    entry["label"] = nom_fr
    entry["last_seen"] = now

    seuil = ABANDON_PROXIMITE_FRACTION * diagonale_frame
    proche = any(
        ((centroid[0] - px) ** 2 + (centroid[1] - py) ** 2) ** 0.5 <= seuil
        for px, py in personnes_centroides
    )
    if proche:
        entry["dernier_avec_personne"] = now


def evalue(id_camera: str, track_id: int, now: float) -> dict:
    """Dit si l'objet `track_id` DE CETTE CAMÉRA semble abandonné — et
    enregistre un événement horodaté dans l'historique de cette caméra à
    chaque CHANGEMENT d'état."""
    entry = _etat_objets.get(id_camera, {}).get(track_id)
    if entry is None:
        return {"abandonne": False, "statut": "non_suivi"}

    statuts_camera = _dernier_statut.setdefault(id_camera, {})
    avis_camera = _dernier_avis_ia.setdefault(id_camera, {})

    depuis_sans_personne = now - entry["dernier_avec_personne"]
    abandonne = depuis_sans_personne >= ABANDON_DUREE_MIN_S

    ancien = statuts_camera.get(track_id)
    if ancien != abandonne and (ancien is not None or abandonne):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "objet_abandonne",
            "objet": f"objet_{track_id}",
            "evenement": "objet_abandonne_detecte" if abandonne else "objet_recupere",
            "label": entry["label"],
            "horodatage": now,
        })

        # Deuxième avis (voir comparaison_ia.py) UNIQUEMENT à la
        # confirmation de l'abandon, pas à chaque appel.
        #
        # Pas d'envoi e-mail/WhatsApp ici (contrairement à l'ancien
        # backend/) : ces canaux ont été jugés pas prioritaires à garder
        # pour cette migration — voir fonctionnalites/Alertes, qui
        # contient comparaison_ia.py ET alertes.py (stockage isolé).
        if abandonne:
            phrase = (
                f"Un objet ({entry['label']}) a été déposé puis abandonné, "
                f"sans personne à proximité depuis {round(depuis_sans_personne)} secondes."
            )
            avis_camera[track_id] = comparaison_ia.comparer(phrase)
            # pid=None : un track_id d'objet n'est pas une identité de
            # personne (voir Alertes/alertes.py).
            alertes.enregistrer_alerte("objet_abandonne", id_camera, None, phrase, avis_camera[track_id], now)
    statuts_camera[track_id] = abandonne

    return {
        "abandonne": abandonne,
        "statut": "confirme" if abandonne else "normal",
        "depuis_secondes_sans_personne": round(depuis_sans_personne, 1),
        "avis_ia": avis_camera.get(track_id),
    }
