"""Détecte une INTRUSION dans la zone dessinée par caméra (voir
zoneCam/enregitre.py) — pour CHAQUE personne détectée par le modèle YOLO
de segmentation (déjà chargé et déjà exécuté par on_voit_qui.py, AUCUN
modèle de plus tourné ici : on réutilise sa boîte englobante, déjà
calculée), on teste si son point d'appui au sol (bas-centre de la
boîte, PAS son centre — une personne debout dans la zone doit compter
même si sa tête dépasse largement au-dessus) tombe DANS le polygone de
la zone.

Le polygone est stocké en FRACTIONS (0..1) de l'image (voir
enregitre.py) — remis à l'échelle en pixels ICI, à partir des
dimensions RÉELLES de la frame analysée, pour rester exact quelle que
soit la résolution de la caméra. Test géométrique via
cv2.pointPolygonTest (OpenCV, déjà une dépendance du projet) — pas
besoin d'une bibliothèque de géométrie en plus (shapely...).

Construit sur le MÊME principe que rodeur.py/infiltre.py/abandonne.py/
feu_fume.py — pas un système à part :
- N'alerte QUE sur un changement de statut (entrée/sortie de zone), pas
  à chaque appel tant que la personne y reste (voir _dernier_statut).
- Pour une personne pas encore identifiée (pid=None — arrive : voir
  on_voit_qui.py, cas "sans_visage"/embedding corps illisible), on
  réutilise TEL QUEL rodeur.assigner_zone_anonyme (même mécanisme que
  le suivi anonyme du rôdage) comme clé de suivi, plutôt que d'inventer
  un deuxième système de suivi par position.
- profil_suspect.py reçoit l'événement (uniquement pour une identité
  RÉELLE — voir profil_suspect.est_identite_reelle), visible depuis
  n'importe quelle caméra, comme rôdage/infiltration.
- rapport_cam.py reçoit l'événement dans l'historique DE LA caméra qui
  a vu l'intrusion.
- Alertes/alertes.py reçoit une alerte avec son propre type ISOLÉ,
  "intrusion_zone" (ajouté à TYPES_VALIDES) — jamais mélangée aux
  autres types d'alerte, filtrable/identifiable à part.

Contrairement au rôdage (qui exige une présence prolongée avant de
confirmer), une intrusion dans une zone interdite est signalée DÈS LE
PREMIER appel où la personne y est détectée — l'urgence d'une présence
au mauvais endroit ne justifie pas d'attendre une confirmation par
plusieurs observations."""
import numpy as np
import cv2

from fonctionnalites.Alertes import alertes, comparaison_ia
from fonctionnalites.ComportementsSupects import profil_suspect, rodeur
from fonctionnalites.Infrastructure import rapport_cam
from fonctionnalites.zoneCam import enregitre as zone_registre

# Ne loggue/alerte un événement d'intrusion QUE quand le statut CHANGE —
# id_camera -> {cle_suivi -> bool}.
_dernier_statut: dict[str, dict[str, bool]] = {}

# Cache du polygone déjà mis à l'échelle en pixels, pour ne pas relire
# le fichier JSON de la zone ni refaire le calcul à CHAQUE personne
# détectée sur CHAQUE frame — invalidé dès que le polygone source
# (fractions) ou les dimensions de la frame changent.
_cache_polygone: dict[str, tuple] = {}  # id_camera -> (signature, polygone_px)


def _polygone_pixels(id_camera: str, frame_shape: tuple) -> np.ndarray | None:
    """Le polygone de la zone de `id_camera`, remis à l'échelle en pixels
    pour une frame de `frame_shape` (H, W, ...) — None si aucune zone
    n'est enregistrée pour cette caméra."""
    zone = zone_registre.lire_zone(id_camera)
    if zone is None:
        _cache_polygone.pop(id_camera, None)
        return None

    h, w = frame_shape[0], frame_shape[1]
    signature = (tuple((p["x"], p["y"]) for p in zone["points"]), h, w)

    cache = _cache_polygone.get(id_camera)
    if cache is not None and cache[0] == signature:
        return cache[1]

    polygone = np.array(
        [[[p["x"] * w, p["y"] * h]] for p in zone["points"]], dtype=np.float32,
    )  # forme (N, 1, 2) attendue par cv2.pointPolygonTest
    _cache_polygone[id_camera] = (signature, polygone)
    return polygone


def _point_dans_zone(polygone: np.ndarray, point: tuple) -> bool:
    """Vrai si `point` (x, y en pixels) est À L'INTÉRIEUR du polygone —
    cv2.pointPolygonTest renvoie >0 dedans, 0 pile sur le bord, <0
    dehors ; on compte le bord comme dedans (>= 0)."""
    return cv2.pointPolygonTest(polygone, (float(point[0]), float(point[1])), False) >= 0


def evaluer(
    id_camera: str, pid: str | None, box: list, centroid: tuple,
    diagonale_frame: float, frame_shape: tuple, now: float,
) -> dict:
    """Cœur du module — appelé pour CHAQUE personne détectée sur CHAQUE
    caméra (voir on_voit_qui.py > analyser()). Renvoie {"intrusion": bool,
    "statut": str, "avis_ia": dict | None}. `box` : [x1, y1, x2, y2] en
    pixels de LA MÊME frame que `frame_shape` (déjà calculée par
    on_voit_qui.py, aucun modèle relancé ici)."""
    polygone = _polygone_pixels(id_camera, frame_shape)
    if polygone is None:
        return {"intrusion": False, "statut": "pas_de_zone", "avis_ia": None}

    x1, y1, x2, y2 = box
    point_au_sol = ((x1 + x2) / 2, y2)  # bas-centre de la boîte : où la personne touche le sol
    intrusion = _point_dans_zone(polygone, point_au_sol)
    statut = "intrusion_detectee" if intrusion else "hors_zone"

    cle_suivi = pid if pid is not None else rodeur.assigner_zone_anonyme(
        id_camera, centroid, diagonale_frame, now,
    )

    statuts_camera = _dernier_statut.setdefault(id_camera, {})
    ancien = statuts_camera.get(cle_suivi)
    avis_ia = None
    if ancien != intrusion and (ancien is not None or intrusion):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "intrusion_zone",
            "pid": pid,
            "evenement": statut,
            "horodatage": now,
        })
        if intrusion:
            if pid is not None and profil_suspect.est_identite_reelle(pid):
                profil_suspect.signaler(pid, id_camera, "intrusion_zone", {})

            phrase = "Intrusion en zone non autorisée : une personne est entrée dans une zone surveillée définie comme non autorisée."
            avis_ia = comparaison_ia.comparer(phrase)

            # Alerte isolée (voir Alertes/alertes.py, TYPES_VALIDES) —
            # son propre type, jamais mélangé aux autres.
            alertes.enregistrer_alerte("intrusion_zone", id_camera, pid, phrase, avis_ia, now)
    statuts_camera[cle_suivi] = intrusion

    return {"intrusion": intrusion, "statut": statut, "avis_ia": avis_ia}
