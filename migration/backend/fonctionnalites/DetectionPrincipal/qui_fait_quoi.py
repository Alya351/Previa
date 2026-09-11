"""Attribue une posture/activité à CHAQUE personne individuellement (pas
une action générale de la scène) : pour chaque identifiant de personne
(donné par on_voit_qui.py) SUR UNE CAMÉRA DONNÉE, un jugement géométrique
sur CHAQUE image individuelle, confirmé par un vote qui s'accumule au fil
du temps — même principe que le genre dans on_voit_qui.py.

Architecture multi-caméra : la posture/activité est jugée à partir du
squelette détecté dans l'image de CETTE caméra précisément (positions en
pixels propres à son cadrage) — mélanger les observations de deux
caméras différentes pour la MÊME personne (pid, identité globale — voir
on_voit_qui.py) n'aurait aucun sens : "en mouvement" est jugé par
déplacement du centroïde d'un appel à l'autre (voir _en_mouvement), et
deux caméras n'ont pas le même repère de coordonnées. La mémoire (voir
_memoire, _historique_centroides) est donc indexée par id_camera EN
PREMIER, puis par pid — la même personne suivie par deux caméras a deux
entrées de mémoire indépendantes, une par caméra.

Deux axes INDÉPENDANTS, pas un seul choix parmi options concurrentes :
- POSITION du corps : debout / assis(e) / marche / allongé(e).
- ACTIVITÉ des mains : tient un objet / utilise un téléphone / mains
  libres — indépendante de la position.

Historique de deux échecs réels, pour ne pas les refaire :

1. SlowFast (reconnaissance de mouvement vidéo) a été essayé puis retiré :
   son résultat "confirmé" changeait complètement à chaque nouveau
   jugement (waxing legs -> shaving head -> shining shoes -> arm
   wrestling..., sur une seule session) — pas fiable du tout avec notre
   capture éparse (une image toutes les ~2s, alors qu'il attend un vrai
   flux à ~30 images/s).

2. CLIP (zero-shot, une phrase parmi 4 par axe) a ensuite été essayé, puis
   retiré à son tour : constaté en conditions réelles que le résultat
   était imprécis sur l'activité (le point qui compte le plus pour
   détecter un comportement suspect, voir ComportementsSupects/rodeur.py) —
   CLIP compare une image à une description générale, il ne mesure rien
   de précis sur le corps.

Ce qui remplace les deux : un SQUELETTE (points-clés du corps, modèle de
pose YOLO, voir on_voit_qui.py qui le fait tourner et attribue chaque
squelette à la bonne personne) et une mesure GÉOMÉTRIQUE dessus — angle du
torse par rapport à la verticale, flexion du genou, distance entre les
poignets et les oreilles ou un objet détecté à proximité. Chaque jugement
est explicable (on peut dire PORQUOI le système pense "assis" : parce que
l'angle du genou est de tant de degrés) — pas une boîte noire qui associe
une image à la phrase la plus proche dans son vocabulaire.

Deux limites honnêtes de cette approche :
- Elle a besoin d'un squelette exploitable (torse + hanches visibles au
  minimum) — une personne mal cadrée ou très partiellement visible ne
  donne pas de jugement plutôt qu'un jugement au hasard (voir statut
  "en_observation").
- "Marche" est déduit du DÉPLACEMENT réel du centre de la personne d'un
  appel à l'autre (voir _en_mouvement), pas de la posture des jambes sur
  une image isolée (débout et marche se ressemblent trop sur une seule
  image figée).

Historique du comportement : à chaque CHANGEMENT de position OU
d'activité confirmée (pas à chaque appel), une entrée horodatée est
ajoutée dans le rapport DE CETTE CAMÉRA (voir rapport_cam.py), conservée
sans limite de durée (jusqu'à MAX_HISTORIQUE, voir rapport_cam.py), pour
permettre d'étudier après coup le comportement d'une personne dans le
temps."""
import math
from collections import deque

from fonctionnalites.Infrastructure import rapport_cam

from fonctionnalites.Alertes import comparaison_ia
from fonctionnalites.Infrastructure import etat_persistant

# Indices des points-clés COCO-17, format standard Ultralytics pose.
NEZ, OEIL_G, OEIL_D, OREILLE_G, OREILLE_D = 0, 1, 2, 3, 4
EPAULE_G, EPAULE_D = 5, 6
COUDE_G, COUDE_D = 7, 8
POIGNET_G, POIGNET_D = 9, 10
HANCHE_G, HANCHE_D = 11, 12
GENOU_G, GENOU_D = 13, 14
CHEVILLE_G, CHEVILLE_D = 15, 16

CONF_POINT_MIN = 0.5  # un point-clé sous ce score n'est pas considéré fiable

# Torse plus proche de l'horizontale que de la verticale au-delà de cet
# angle : la personne est allongée.
ANGLE_ALLONGE_MIN_DEG = 55.0

# Genou plié en deçà de cet angle (180° = jambe droite) : la personne est
# assise plutôt que debout.
ANGLE_GENOU_ASSIS_MAX_DEG = 140.0

# Vitesse de déplacement du centre de la personne, en fraction de la
# diagonale de l'image par seconde, au-delà de laquelle on considère
# qu'elle marche plutôt que reste debout immobile.
VITESSE_MARCHE_MIN_FRACTION = 0.015

# Marge (fraction de la diagonale) entre un poignet et SON épaule pour
# dire que la main est "levée haut" plutôt que juste au-dessus de
# l'épaule par du bruit de mesure — voir _classifier_position
# (escalade). Valeur de départ raisonnable (pas calibrée sur des heures
# de vraies données) — à ajuster si trop/pas assez sensible en usage
# réel, même statut que REGARD_VARIATION_MIN_DEG dans rodeur.py.
ESCALADE_MAIN_AU_DESSUS_EPAULE_FRACTION = 0.05

# Distance poignet/oreille (fraction de la diagonale) qui trahit le geste
# "téléphone à l'oreille", même sans détecter l'objet lui-même (petit,
# souvent raté par le modèle général).
GESTE_TELEPHONE_FRACTION = 0.06

# Distance poignet/objet détecté (fraction de la diagonale) pour dire que
# la personne tient cet objet.
OBJET_PROCHE_MAIN_FRACTION = 0.08

POSITION_HISTORIQUE_TAILLE = 5  # nb d'observations gardées pour juger le mouvement

# Fenêtre RÉCENTE (pas depuis toujours) sur laquelle la position/activité
# confirmée est jugée : un comportement humain change en quelques
# secondes (une personne repose son téléphone, se lève...), donc les
# votes doivent pouvoir "vieillir" et disparaître, pas s'accumuler sans
# fin. Bug constaté en conditions réelles avec un simple compteur
# cumulatif : un geste bref détecté "utilise un téléphone" restait
# affiché indéfiniment ensuite, même longtemps après que la personne ait
# reposé les mains — rien ne faisait jamais redescendre son score face aux
# observations plus récentes.
FENETRE_TAILLE = 6  # nb de dernières observations gardées par axe
VOTES_MIN = 3  # nombre de votes, DANS cette fenêtre récente, avant de confirmer

POSITION_FR = {
    "debout": "debout, immobile",
    "assis": "assis(e)",
    "marche": "en train de marcher",
    "allonge": "allongé(e) au sol",
    "escalade": "en train d'escalader/grimper",
}
ACTIVITE_FR = {
    "telephone": "utilise un téléphone",
    "tient_objet": "tient un objet",
    "mains_libres": "mains libres, rien de particulier",
}

# Une identité pas revue depuis ce délai est oubliée — sans ça, chaque
# candidat éphémère jamais confirmé (un passage furtif dans le cadre)
# resterait en mémoire pour toujours sur une session longue, qui est le
# mode d'usage normal ici (caméra qui tourne en continu).
MEMOIRE_EXPIRY_S = 3600.0

# Tout ce qui suit est indexé par id_camera EN PREMIER, puis par pid —
# voir docstring du module.
# id_camera -> {pid -> {"position_recentes": deque, "activite_recentes": deque, "last_seen": float}}
_memoire: dict[str, dict] = {}
# id_camera -> {pid -> deque[(t, (x, y))]}, pour juger le mouvement (voir _en_mouvement)
_historique_centroides: dict[str, dict] = {}


def _point(keypoints, idx):
    if keypoints is None:
        return None
    x, y, c = keypoints[idx]
    return (float(x), float(y)) if c >= CONF_POINT_MIN else None


def _milieu(a, b):
    if a is None or b is None:
        return None
    return ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2)


def _distance(a, b):
    return ((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2) ** 0.5


def _angle_par_rapport_vertical(vecteur):
    dx, dy = vecteur
    return math.degrees(math.atan2(abs(dx), abs(dy) + 1e-6))


def _angle_articulation(a, sommet, b):
    """Angle au point `sommet`, entre les segments sommet->a et
    sommet->b — 180° = jambe droite, plus petit = jambe pliée."""
    v1 = (a[0] - sommet[0], a[1] - sommet[1])
    v2 = (b[0] - sommet[0], b[1] - sommet[1])
    n1, n2 = (v1[0] ** 2 + v1[1] ** 2) ** 0.5, (v2[0] ** 2 + v2[1] ** 2) ** 0.5
    if n1 < 1e-6 or n2 < 1e-6:
        return None
    cos_a = max(-1.0, min(1.0, (v1[0] * v2[0] + v1[1] * v2[1]) / (n1 * n2)))
    return math.degrees(math.acos(cos_a))


def _en_mouvement(id_camera, pid, centroid, diagonale_frame, now):
    """Compare la position actuelle à la plus ancienne conservée pour
    cette personne SUR CETTE CAMÉRA — un vrai déplacement dans le temps,
    pas une posture de jambes sur une image isolée (voir docstring du
    module)."""
    hist_camera = _historique_centroides.setdefault(id_camera, {})
    hist = hist_camera.setdefault(pid, deque(maxlen=POSITION_HISTORIQUE_TAILLE))
    resultat = False
    if len(hist) >= 2:
        t0, c0 = hist[0]
        dt = now - t0
        if dt > 0.5:
            vitesse = _distance(c0, centroid) / dt
            resultat = vitesse >= VITESSE_MARCHE_MIN_FRACTION * diagonale_frame
    hist.append((now, centroid))
    return resultat


def _classifier_position(id_camera, keypoints, centroid, diagonale_frame, pid, now):
    epaule_g, epaule_d = _point(keypoints, EPAULE_G), _point(keypoints, EPAULE_D)
    epaule = _milieu(epaule_g, epaule_d)
    hanche = _milieu(_point(keypoints, HANCHE_G), _point(keypoints, HANCHE_D))
    if epaule is None or hanche is None:
        return None  # pas assez de points fiables pour juger

    # Escalade : les DEUX poignets nettement au-dessus de LEUR épaule
    # respective (agripper un point d'appui au-dessus de soi) — posture
    # distinctive, rarement tenue longtemps pour une autre raison au
    # quotidien (contrairement à une seule main levée : saluer, s'étirer).
    # Vérifiée en priorité, avant même "allongé" : quelqu'un en train
    # d'escalader peut avoir le torse penché à un angle qui ressemblerait
    # sinon à "allongé" selon le cadrage de la caméra. Comble un vrai
    # trou : "escalade de clôture" existe déjà comme cas suspect dans les
    # données d'entraînement du comparateur IA (voir
    # traiteComportement/exemples_csv/suspect.csv, S0005/S0013), mais rien
    # ici ne pouvait jusque-là la reconnaître réellement — seules
    # debout/assis(e)/marche/allongé(e) existaient.
    poignet_g, poignet_d = _point(keypoints, POIGNET_G), _point(keypoints, POIGNET_D)
    if poignet_g is not None and poignet_d is not None and epaule_g is not None and epaule_d is not None:
        seuil = ESCALADE_MAIN_AU_DESSUS_EPAULE_FRACTION * diagonale_frame
        # y plus petit = plus haut dans l'image (repère image standard)
        mains_levees = poignet_g[1] < epaule_g[1] - seuil and poignet_d[1] < epaule_d[1] - seuil
        if mains_levees:
            return "escalade"

    angle_torse = _angle_par_rapport_vertical((hanche[0] - epaule[0], hanche[1] - epaule[1]))
    if angle_torse >= ANGLE_ALLONGE_MIN_DEG:
        return "allonge"

    # Un vrai déplacement prime sur la posture des jambes : quelqu'un qui
    # marche a par moments les jambes presque droites (milieu de foulée),
    # ce qui ressemblerait sinon à "debout".
    if _en_mouvement(id_camera, pid, centroid, diagonale_frame, now):
        return "marche"

    genou = _milieu(_point(keypoints, GENOU_G), _point(keypoints, GENOU_D))
    cheville = _milieu(_point(keypoints, CHEVILLE_G), _point(keypoints, CHEVILLE_D))
    if genou is not None and cheville is not None:
        angle_genou = _angle_articulation(hanche, genou, cheville)
        if angle_genou is not None and angle_genou < ANGLE_GENOU_ASSIS_MAX_DEG:
            return "assis"

    return "debout"


def _classifier_activite(keypoints, objets_actuels, diagonale_frame):
    poignets = [p for p in (_point(keypoints, POIGNET_G), _point(keypoints, POIGNET_D)) if p is not None]
    if not poignets:
        return None  # pas assez de points fiables pour juger

    oreilles = [p for p in (_point(keypoints, OREILLE_G), _point(keypoints, OREILLE_D)) if p is not None]
    seuil_geste = GESTE_TELEPHONE_FRACTION * diagonale_frame
    for poignet in poignets:
        for oreille in oreilles:
            if _distance(poignet, oreille) <= seuil_geste:
                return "telephone"

    seuil_objet = OBJET_PROCHE_MAIN_FRACTION * diagonale_frame
    proche_telephone, proche_autre = False, False
    for label, info in (objets_actuels or {}).items():
        for instance in info.get("instances", []):
            position = instance.get("position")
            if position is None:
                continue
            if any(_distance(poignet, position) <= seuil_objet for poignet in poignets):
                if label == "téléphone portable":
                    proche_telephone = True
                else:
                    proche_autre = True

    if proche_telephone:
        return "telephone"
    if proche_autre:
        return "tient_objet"
    return "mains_libres"


def observer(id_camera: str, pid: str, keypoints, centroid: tuple, objets_actuels: dict, diagonale_frame: float, now: float) -> None:
    """Juge cette seule image (DE CETTE CAMÉRA) sur les deux axes
    (position + activité) à partir du squelette détecté (voir
    on_voit_qui.py) et ajoute cette observation à la fenêtre RÉCENTE de
    cette personne SUR CETTE CAMÉRA pour chacun (voir FENETRE_TAILLE —
    les observations trop anciennes sont automatiquement oubliées, pas
    cumulées à vie). `keypoints` peut être None (personne détectée mais
    pose non attribuée à cet appel) : rien n'est ajouté, mais la mémoire
    existante n'est pas perdue."""
    memoire_camera = _memoire.setdefault(id_camera, {})
    hist_camera = _historique_centroides.setdefault(id_camera, {})

    expires = [p for p, m in memoire_camera.items() if now - m["last_seen"] > MEMOIRE_EXPIRY_S]
    for p in expires:
        del memoire_camera[p]
        hist_camera.pop(p, None)

    if keypoints is None:
        return

    position = _classifier_position(id_camera, keypoints, centroid, diagonale_frame, pid, now)
    activite = _classifier_activite(keypoints, objets_actuels, diagonale_frame)
    if position is None and activite is None:
        return

    entry = memoire_camera.setdefault(pid, {
        "position_recentes": deque(maxlen=FENETRE_TAILLE),
        "activite_recentes": deque(maxlen=FENETRE_TAILLE),
        "last_seen": now,
    })
    entry["last_seen"] = now
    if position is not None:
        entry["position_recentes"].append(position)
    if activite is not None:
        entry["activite_recentes"].append(activite)


def _meilleur_vote(recentes: deque) -> tuple:
    """Le plus fréquent DANS la fenêtre récente (pas depuis toujours) —
    voir FENETRE_TAILLE."""
    if not recentes:
        return None, 0
    compte = {}
    for v in recentes:
        compte[v] = compte.get(v, 0) + 1
    cle, n = max(compte.items(), key=lambda kv: kv[1])
    return (cle, n) if n >= VOTES_MIN else (None, n)


def action_de(id_camera: str, pid: str, now: float) -> dict:
    """Renvoie la position ET l'activité confirmées pour cette personne
    SUR CETTE CAMÉRA (indépendantes l'une de l'autre — voir docstring du
    module), et enregistre un historique horodaté dans le rapport de
    cette caméra à chaque CHANGEMENT de l'une ou l'autre — pas à chaque
    appel."""
    memoire_camera = _memoire.setdefault(id_camera, {})
    entry = memoire_camera.setdefault(pid, {
        "position_recentes": deque(maxlen=FENETRE_TAILLE),
        "activite_recentes": deque(maxlen=FENETRE_TAILLE),
        "last_seen": now,
    })

    position, n_position = _meilleur_vote(entry["position_recentes"])
    activite, n_activite = _meilleur_vote(entry["activite_recentes"])
    position_fr = POSITION_FR.get(position)
    activite_fr = ACTIVITE_FR.get(activite)

    derniere = entry.get("derniere_enregistree", (None, None))
    if (position_fr, activite_fr) != derniere and (position_fr or activite_fr):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "posture",
            "pid": pid, "position": position_fr, "activite": activite_fr, "horodatage": now,
        })

        # Deuxième avis (voir comparaison_ia.py) UNIQUEMENT au moment où
        # position/activité viennent de se CONFIRMER (ou de changer), pas
        # à chaque appel — la base de référence sait aussi reconnaître un
        # comportement normal, ce n'est pas réservé aux cas suspects.
        morceaux = [m for m in (position_fr, activite_fr) if m]
        phrase = "Une personne est " + " et ".join(morceaux) + "."
        entry["avis_ia"] = comparaison_ia.comparer(phrase)

        entry["derniere_enregistree"] = (position_fr, activite_fr)

    if not entry["position_recentes"] and not entry["activite_recentes"]:
        statut = "pas_assez_d_images"
    elif position_fr is None and activite_fr is None:
        statut = "en_observation"
    else:
        statut = "confirme"

    return {"posture": {
        "position": position_fr,
        "activite": activite_fr,
        "statut": statut,
        "vu": max(n_position, n_activite),
        "avis_ia": entry.get("avis_ia"),
    }}


def est_assis(id_camera: str, pid: str) -> bool:
    """Vrai si la POSITION confirmée de `pid` SUR CETTE CAMÉRA est
    "assis(e)" — utilisé par ComportementsSupects/rodeur.py pour ne pas
    confondre une personne qui attend normalement (assise) avec un
    rôdeur."""
    entry = _memoire.get(id_camera, {}).get(pid)
    if not entry:
        return False
    position, _ = _meilleur_vote(entry["position_recentes"])
    return position == "assis"


# --- Persistance (voir etat_persistant.py) ---------------------------------
# Sûr à restaurer : indexé par id_camera puis `pid` (identité
# visage/corps, stable d'un redémarrage à l'autre — contrairement aux
# track_id du tracker d'objets général, voir la note dans rodeur.py).
def _etat_json() -> dict:
    return {
        "memoire": {
            id_camera: {
                pid: {
                    "position_recentes": list(m["position_recentes"]),
                    "activite_recentes": list(m["activite_recentes"]),
                    "last_seen": m["last_seen"],
                }
                for pid, m in memoire_camera.items()
            }
            for id_camera, memoire_camera in _memoire.items()
        },
        "historique_centroides": {
            id_camera: {
                pid: [[t, list(c)] for t, c in hist]
                for pid, hist in hist_camera.items()
            }
            for id_camera, hist_camera in _historique_centroides.items()
        },
    }


def _charger_etat_json(data: dict) -> None:
    global _memoire, _historique_centroides
    _memoire = {}
    for id_camera, memoire_camera in data.get("memoire", {}).items():
        _memoire[id_camera] = {}
        for pid, m in memoire_camera.items():
            _memoire[id_camera][pid] = {
                "position_recentes": deque(m.get("position_recentes", []), maxlen=FENETRE_TAILLE),
                "activite_recentes": deque(m.get("activite_recentes", []), maxlen=FENETRE_TAILLE),
                "last_seen": m["last_seen"],
            }
    _historique_centroides = {
        id_camera: {
            pid: deque(((t, tuple(c)) for t, c in hist), maxlen=POSITION_HISTORIQUE_TAILLE)
            for pid, hist in hist_camera.items()
        }
        for id_camera, hist_camera in data.get("historique_centroides", {}).items()
    }


etat_persistant.enregistrer("qui_fait_quoi", _etat_json, _charger_etat_json)
