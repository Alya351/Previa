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

# Module de détection d'objets abandonnés — DÉSACTIVÉ à la demande de l'utilisateur.

def observer(id_camera: str, track_id: int, nom_fr: str, centroid: tuple, personnes_centroides: list,
             diagonale_frame: float, now: float) -> None:
    """Détection d'objets abandonnés désactivée."""
    pass


def evalue(id_camera: str, track_id: int, now: float) -> dict:
    """Détection d'objets abandonnés désactivée."""
    return {
        "abandonne": False,
        "statut": "desactive",
        "depuis_secondes_sans_personne": 0.0,
        "avis_ia": None,
    }
