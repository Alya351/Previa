"""Détecte les premiers signes de comportement suspect d'une personne, sur
deux signaux indépendants (chacun avec sa propre mémoire par personne) :

1. RÔDAGE (position) : reste dans la même petite zone de l'image pendant
   un temps prolongé, revue plusieurs fois distinctes — pas juste un
   passage rapide qui traverse le cadre. Suivi via le centroïde de la
   personne (donné par on_voit_qui.py) au fil des appels séparés dans le
   temps, jamais sur la foi d'une seule image.

   Complément ANONYME (assigner_zone_anonyme + evalue_rodeur) : une
   personne trop petite/loin de la caméra n'atteint jamais le seuil de
   confiance nécessaire pour une identité complète (visage/corps) —
   constaté en conditions réelles sur une vraie vidéo de rôdage suivi d'un
   vol (confiance mesurée à 0.10-0.33, largement sous le seuil de 0.5 next
   utilisé pour l'identité). Plutôt que de perdre le signal, une détection
   à SEUIL BAS mais SANS identité est quand même suivie par position, et
   rattachée à une "zone" (pas une personne) si elle revient au même
   endroit d'un appel à l'autre. La confiance individuelle basse est
   compensée par l'exigence de répétition dans le temps (même principe que
   partout ailleurs dans ce projet : un vote isolé ne suffit jamais, c'est
   la récurrence qui confirme) — un faux positif isolé sur un arbre ne
   revient pas 5 fois au même endroit sur 60 secondes.

2. REGARD (orientation de tête) : semble scanner les alentours plutôt que
   rester concentrée dans une direction. Suivi via le yaw calculé par
   InsightFace à partir des landmarks 3D du visage (module
   'landmark_3d_68', vraie estimation 3D contre une forme de visage
   moyenne de référence — vérifié sur de vraies photos avant d'écrire ce
   module, pas une approximation géométrique maison). Ne s'applique
   qu'aux personnes avec un visage détecté — sans visage, pas de
   landmarks, pas d'orientation de tête possible.

Architecture multi-caméra : le rôdage et le regard sont des signaux
SPATIAUX (position/orientation dans l'image d'UNE caméra précise) — toute
la mémoire (voir _positions, _zones_anonymes, _yaws, etc.) est donc
indexée par id_camera EN PREMIER, puis par pid (ou zone_id). L'IDENTITÉ
(pid) reste globale (voir on_voit_qui.py, reconnue par visage/apparence
quelle que soit la caméra) — mais son rôdage est jugé indépendamment sur
chaque caméra où elle apparaît : une personne vue simultanément par deux
caméras a deux évaluations de rôdage indépendantes, une par caméra, ce
qui est correct (la "zone" où elle rôde n'a de sens que dans le cadrage
d'une seule caméra).

Les deux signaux enregistrent un événement horodaté dans le rapport DE LA
CAMÉRA concernée (voir rapport_cam.py) à chaque CHANGEMENT d'état, pas à
chaque appel."""
import uuid
from collections import deque

from fonctionnalites.Infrastructure import rapport_cam

from fonctionnalites.Alertes import alertes, comparaison_ia
from fonctionnalites.ComportementsSupects import profil_suspect
from fonctionnalites.Infrastructure import etat_persistant

# Phrases lisibles envoyées à traiteComportement/ (voir comparaison_ia.py)
# pour chaque statut de rôdage confirmé — mêmes mots que ceux déjà
# utilisés côté admin (voir badgeRodeur() du tableau de bord), pour rester
# cohérent avec ce que l'opérateur voit à l'écran.
RODEUR_PHRASE_FR = {
    "confirme": "rôde de façon suspecte",
    "prolonge": "rôde de façon suspecte depuis un temps prolongé",
    "a_verifier_trop_stable": "reste immobile de façon suspecte depuis très longtemps, à vérifier",
}

# --- Rôdage (position) ---------------------------------------------------

# ============================================================
# CALIBRATION "DÉMO" (PC local, sans le Pi) — valeurs volontairement
# réduites pour qu'un rôdage se confirme en secondes devant un public
# plutôt qu'en minutes. Constaté en conditions réelles : les seuils
# d'origine (60s minimum, jusqu'à 10 min pour les paliers) sont pensés
# pour une vraie surveillance en continu, pas pour un test en direct —
# personne n'attend une minute immobile devant l'écran pendant une démo.
# À REMONTER avant un vrai déploiement non supervisé (Pi, longue durée) :
# ces valeurs courtes rendraient un usage réel bien plus bruyant (plus de
# faux positifs sur quelqu'un qui s'arrête juste un instant).
# ============================================================

# Fenêtre glissante d'observation des positions récentes. Doit rester
# PLUS LONGUE que RODEUR_DUREE_A_VERIFIER_S (plus bas) — sinon ce palier
# ne serait jamais atteignable, les positions les plus anciennes étant
# oubliées avant.
RODEUR_FENETRE_S = 120.0  # 2 min (était 900.0 / 15 min)

# Temps minimum passé dans la même petite zone, DANS cette fenêtre, pour
# suspecter un rôdeur — pas juste quelqu'un qui traverse le cadre une
# fois.
RODEUR_DUREE_MIN_S = 8.0  # 8s (était 60.0)

# Rayon max autour du centre de gravité des positions récentes pour dire
# "reste dans la même zone", en fraction de la DIAGONALE de l'image (pas
# en pixels fixes) — reste valable quelle que soit la résolution/le
# cadrage de la caméra, pas besoin de retoucher ce seuil si la caméra
# change. Relevé (0.10 -> 0.20) après un test réel : un "va-et-vient" au
# même endroit implique un peu de mouvement (marcher, se tourner) — pas
# rester parfaitement immobile — et 0.10 rejetait à tort une présence
# prolongée de plusieurs minutes avec un rayon mesuré de 178 à 277px
# (trop strict pour du mouvement normal dans un coin de pièce).
RODEUR_RAYON_MAX_FRACTION = 0.20

# Nombre minimum d'observations distinctes dans la fenêtre avant de
# juger — une seule image ne suffit jamais à conclure.
RODEUR_OBSERVATIONS_MIN = 3  # était 5 — 3 reste une vraie répétition, pas un coup isolé

# Paliers de sévérité au-delà du seuil de confirmation — un rôdage qui
# dure plus longtemps mérite plus d'attention, mais un rôdage QUASI SANS
# INTERRUPTION pendant très longtemps devient au contraire suspect pour
# une autre raison : une vraie personne bouge, sort du cadre, change de
# posture de temps en temps — une présence parfaitement continue
# ressemble davantage à un objet fixe mal détecté (voir la fusion
# assistée par le modèle général, _corrobore_par_modele_general dans
# on_voit_qui.py) qu'à un comportement humain réel.
RODEUR_DUREE_PROLONGE_S = 20.0         # 20s (était 180.0 / 3 min) : passe en "prolongé"
RODEUR_DUREE_A_VERIFIER_S = 60.0       # 60s (était 600.0 / 10 min) : à vérifier

# Tout ce qui suit est indexé par id_camera EN PREMIER, puis par pid (ou
# zone_id pour les détections anonymes) — voir docstring du module.
_positions: dict[str, dict] = {}              # id_camera -> {pid -> deque[(timestamp, x, y)]}
_dernier_statut_rodeur: dict[str, dict] = {}   # id_camera -> {pid -> str}
_dernier_avis_ia_rodeur: dict[str, dict] = {}  # id_camera -> {pid -> dict|None}


def observer_position(id_camera: str, pid: str, centroid: tuple, now: float) -> None:
    """Ajoute cette position à l'historique de suivi de `pid` SUR CETTE
    CAMÉRA, purge les positions trop anciennes (hors fenêtre) et les
    identités plus suivies du tout (évite une croissance illimitée en
    mémoire)."""
    positions_camera = _positions.setdefault(id_camera, {})
    statuts_camera = _dernier_statut_rodeur.setdefault(id_camera, {})
    objets_proches_camera = _objets_proches.setdefault(id_camera, {})

    expires = [p for p, pos in positions_camera.items() if not pos or now - pos[-1][0] > RODEUR_FENETRE_S]
    for p in expires:
        del positions_camera[p]
        statuts_camera.pop(p, None)
        objets_proches_camera.pop(p, None)

    dq = positions_camera.setdefault(pid, deque())
    dq.append((now, centroid[0], centroid[1]))
    while dq and now - dq[0][0] > RODEUR_FENETRE_S:
        dq.popleft()


def evalue_rodeur(id_camera: str, pid: str, now: float, diagonale_frame: float, assis: bool = False) -> dict:
    """Dit si `pid` a l'air de rôder SUR CETTE CAMÉRA : reste dans une
    petite zone depuis un moment, revu plusieurs fois distinctes dans la
    fenêtre récente. `diagonale_frame` : diagonale en pixels de l'image
    analysée, pour exprimer la zone en fraction de l'image plutôt qu'en
    pixels fixes (portable quelle que soit la résolution de la caméra).

    `assis` : posture confirmée (voir qui_fait_quoi.py) — une personne
    ASSISE qui reste au même endroit longtemps est très probablement en
    train d'attendre normalement (arrêt de bus, salle d'attente, bureau),
    pas en train de rôder. Sans cette distinction, les deux comportements
    sont indiscernables par la seule position (bug constaté : quelqu'un
    simplement assis à attendre était signalé comme rôdeur). La position
    continue d'être suivie normalement — seule l'interprétation finale
    change."""
    dq = _positions.get(id_camera, {}).get(pid)
    if not dq or len(dq) < RODEUR_OBSERVATIONS_MIN:
        return {"rodeur": False, "statut": "pas_assez_d_observations", "vu": len(dq) if dq else 0}

    statuts_camera = _dernier_statut_rodeur.setdefault(id_camera, {})
    avis_camera = _dernier_avis_ia_rodeur.setdefault(id_camera, {})

    xs = [p[1] for p in dq]
    ys = [p[2] for p in dq]
    cx, cy = sum(xs) / len(xs), sum(ys) / len(ys)
    rayon = max(((x - cx) ** 2 + (y - cy) ** 2) ** 0.5 for x, y in zip(xs, ys))
    duree = dq[-1][0] - dq[0][0]

    rayon_max = RODEUR_RAYON_MAX_FRACTION * diagonale_frame
    immobile_longtemps = rayon <= rayon_max and duree >= RODEUR_DUREE_MIN_S
    rode = immobile_longtemps and not assis

    if rode:
        if duree >= RODEUR_DUREE_A_VERIFIER_S:
            statut = "a_verifier_trop_stable"
        elif duree >= RODEUR_DUREE_PROLONGE_S:
            statut = "prolonge"
        else:
            statut = "confirme"
    elif immobile_longtemps and assis:
        statut = "assis_probablement_attente"
    else:
        statut = "normal"

    ancien = statuts_camera.get(pid)
    if ancien != statut and (ancien is not None or rode):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "rodeur",
            "pid": pid,
            "evenement": f"rodeur_{statut}" if rode else "rodeur_termine",
            "horodatage": now,
        })

        # Deuxième avis (voir comparaison_ia.py) UNIQUEMENT à la
        # confirmation d'un rôdage (pas à chaque appel, pas quand ça
        # redevient "normal") — phrase construite à partir du statut et
        # de la durée réellement mesurés, pas un texte générique.
        #
        # Pas d'envoi e-mail/WhatsApp ici (contrairement à l'ancien
        # backend/) : ces canaux ont été jugés pas prioritaires à garder
        # pour cette migration — voir fonctionnalites/Alertes, qui ne
        # contient que comparaison_ia.py.
        if rode and statut in RODEUR_PHRASE_FR:
            phrase = f"Une personne {RODEUR_PHRASE_FR[statut]} depuis {round(duree)} secondes dans la même zone restreinte."
            avis_camera[pid] = comparaison_ia.comparer(phrase)

            # Profil global (voir profil_suspect.py) : sans effet sur une
            # zone anonyme (pid = "zone_...") — seule une identité réelle
            # peut être retrouvée par une AUTRE caméra.
            profil_suspect.signaler(pid, id_camera, f"rodeur_{statut}", {"depuis_secondes": round(duree)})

            # Alerte isolée (voir Alertes/alertes.py) — "ce qui nous
            # intéresse le plus", avec l'avis IA persisté, pas juste
            # renvoyé une fois dans la réponse. pid=None pour une zone
            # anonyme (pas une identité de personne à proprement parler).
            pid_alerte = pid if profil_suspect.est_identite_reelle(pid) else None
            alertes.enregistrer_alerte("rodeur", id_camera, pid_alerte, phrase, avis_camera[pid], now)
    statuts_camera[pid] = statut

    return {
        "rodeur": rode,
        "statut": statut,
        "depuis_secondes": round(duree, 1),
        "zone_rayon_px": round(rayon, 1),
        "avis_ia": avis_camera.get(pid),
    }


# --- Corrélation avec un objet qui disparaît (indice de vol) --------------

# Objets dont la disparition après un rôdage à proximité est un signal
# fort — motivé par un cas réel : quelqu'un a rôdé près d'un vélo, puis
# l'a pris (voir on_voit_qui.py, appelant observer_objets_proches /
# evalue_disparition_objet pour chaque personne/zone en rôdage actif).
OBJETS_SENSIBLES_FR = {"vélo", "moto", "voiture", "sac à dos", "sac à main", "valise"}

# Distance (fraction de la diagonale) pour dire qu'un objet est "proche"
# d'une personne/zone en train de rôder.
OBJET_PROCHE_FRACTION = 0.25

# Délai de grâce avant de dire qu'un objet a vraiment disparu (pas juste
# raté sur UNE image) — même logique que partout ailleurs : un signal
# isolé ne suffit jamais, il faut une confirmation par la répétition.
# Réduit pour la démo PC (était 10.0), même logique que les seuils de
# rôdage plus haut.
OBJET_DISPARITION_DELAI_S = 5.0

_objets_proches: dict[str, dict] = {}  # id_camera -> {pid -> {track_id_objet: {"label": str, "last_vu": float}}}


def observer_objets_proches(id_camera: str, pid: str, position: tuple, objets_actuels: dict, diagonale_frame: float, now: float) -> None:
    """Pendant un rôdage actif (confirmé ou plus) SUR CETTE CAMÉRA, note
    quels objets sensibles (voir OBJETS_SENSIBLES_FR, eux-mêmes rapportés
    par CETTE MÊME caméra — voir on_voit_quoi.py) sont visibles à
    proximité de `position` — sert ensuite à repérer si l'un d'eux
    disparaît (voir evalue_disparition_objet). `objets_actuels` : le dict
    "objets" tel qu'écrit par on_voit_quoi.py (rapportCam/<id_camera>/etat.json,
    clé "vueActuelle"), avec la position de chaque instance."""
    seuil = OBJET_PROCHE_FRACTION * diagonale_frame
    suivi_camera = _objets_proches.setdefault(id_camera, {})
    suivi = suivi_camera.setdefault(pid, {})
    for label, info in objets_actuels.items():
        if label not in OBJETS_SENSIBLES_FR:
            continue
        for instance in info.get("instances", []):
            pos_objet = instance.get("position")
            if pos_objet is None:
                continue
            d = ((position[0] - pos_objet[0]) ** 2 + (position[1] - pos_objet[1]) ** 2) ** 0.5
            if d <= seuil:
                suivi[instance["id"]] = {"label": label, "last_vu": now}


def evalue_disparition_objet(id_camera: str, pid: str, objets_actuels: dict, now: float) -> list:
    """Vérifie si un objet vu proche pendant le rôdage de `pid` SUR CETTE
    CAMÉRA a disparu depuis (plus dans les objets actuellement suivis PAR
    CETTE CAMÉRA, depuis au moins OBJET_DISPARITION_DELAI_S) — signal de
    vol possible.

    Jusqu'ici, cet indice n'allait nulle part d'utile : une ligne dans
    l'historique que personne ne regarde en direct, pas d'e-mail, pas de
    WhatsApp, pas d'avis IA, et côté admin il ressortait fondu dans le
    badge générique "ALERTE MANUELLE ACTIVE" (faux — rien de manuel ici)
    sans même nommer l'objet. Un vol détecté qui ne prévient personne ne
    sert à rien — mêmes canaux que abandonne.py, déclenchés ici au moment
    exact où la disparition est confirmée."""
    suivi = _objets_proches.get(id_camera, {}).get(pid)
    if not suivi:
        return []

    ids_presents = {
        instance["id"]
        for info in objets_actuels.values()
        for instance in info.get("instances", [])
    }

    disparus = []
    for obj_id, info in list(suivi.items()):
        if obj_id in ids_presents:
            continue
        if now - info["last_vu"] < OBJET_DISPARITION_DELAI_S:
            continue

        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "objet_proche_disparu",
            "pid": pid,
            "evenement": "objet_proche_disparu",
            "objet": info["label"],
            "horodatage": now,
        })

        phrase = (
            f"Un objet ({info['label']}) a disparu alors qu'une personne rôdait "
            f"juste à côté quelques secondes plus tôt — vol possible."
        )
        avis_ia = comparaison_ia.comparer(phrase)
        # Pas d'envoi e-mail/WhatsApp ici non plus — voir la note plus
        # haut dans evalue_rodeur().

        # Profil global (voir profil_suspect.py) — même garde-fou zone
        # anonyme que dans evalue_rodeur().
        profil_suspect.signaler(pid, id_camera, "objet_proche_disparu", {"objet": info["label"]})

        # Alerte isolée (voir Alertes/alertes.py) — voir la note dans
        # evalue_rodeur() pour le choix de pid_alerte.
        pid_alerte = pid if profil_suspect.est_identite_reelle(pid) else None
        alertes.enregistrer_alerte("objet_disparu", id_camera, pid_alerte, phrase, avis_ia, now)

        disparus.append({"label": info["label"], "id": obj_id, "avis_ia": avis_ia})
        del suivi[obj_id]  # signalé une fois, pas à chaque appel suivant

    return disparus


# Tolérance pour dire qu'une nouvelle détection anonyme (sans identité,
# seuil de confiance bas) appartient à la MÊME zone qu'une détection
# anonyme précédente, SUR LA MÊME CAMÉRA — plus stricte que
# RODEUR_RAYON_MAX_FRACTION, pour ne pas mélanger deux zones proches mais
# distinctes faute d'identité pour les départager.
ZONE_ANONYME_DISTANCE_FRACTION = 0.05

_zones_anonymes: dict[str, dict] = {}  # id_camera -> {zone_id -> {"centroid": tuple, "last_seen": float}}


def assigner_zone_anonyme(id_camera: str, centroid: tuple, diagonale_frame: float, now: float) -> str:
    """Rattache une détection à faible confiance (pas d'identité fiable —
    sujet trop petit/loin) à une zone anonyme existante SUR CETTE CAMÉRA
    si elle est proche d'une détection anonyme récente de LA MÊME
    caméra, sinon en crée une nouvelle. Le zone_id renvoyé s'utilise
    ensuite avec observer_position/evalue_rodeur exactement comme un pid
    normal (avec le même id_camera)."""
    zones_camera = _zones_anonymes.setdefault(id_camera, {})

    expires = [zid for zid, info in zones_camera.items() if now - info["last_seen"] > RODEUR_FENETRE_S]
    for zid in expires:
        del zones_camera[zid]

    seuil = ZONE_ANONYME_DISTANCE_FRACTION * diagonale_frame
    for zone_id, info in zones_camera.items():
        d = ((centroid[0] - info["centroid"][0]) ** 2 + (centroid[1] - info["centroid"][1]) ** 2) ** 0.5
        if d <= seuil:
            info["centroid"] = centroid
            info["last_seen"] = now
            return zone_id

    zone_id = f"zone_{uuid.uuid4().hex[:8]}"
    zones_camera[zone_id] = {"centroid": centroid, "last_seen": now}
    return zone_id


# --- Regard (orientation de tête) -----------------------------------------

# Fenêtre glissante d'observation de l'orientation de la tête.
REGARD_FENETRE_S = 60.0

# Amplitude minimale de variation du yaw (degrés, max - min sur la
# fenêtre) pour dire que la tête a vraiment scanné les alentours plutôt
# que le bruit normal d'une tête qui reste à peu près face à la caméra.
# Valeur de départ raisonnable, pas calibrée sur des heures de vraies
# données — à ajuster si trop/pas assez sensible en conditions réelles.
REGARD_VARIATION_MIN_DEG = 30.0

# Nombre minimum d'observations distinctes avant de juger.
REGARD_OBSERVATIONS_MIN = 4

_yaws: dict[str, dict] = {}                  # id_camera -> {pid -> deque[(timestamp, yaw_degres)]}
_dernier_statut_regard: dict[str, dict] = {}  # id_camera -> {pid -> bool}


def observer_orientation(id_camera: str, pid: str, yaw_deg: float, now: float) -> None:
    """Ajoute cette mesure d'orientation à l'historique de `pid` SUR
    CETTE CAMÉRA, purge les mesures trop anciennes et les identités plus
    suivies du tout."""
    yaws_camera = _yaws.setdefault(id_camera, {})
    statuts_camera = _dernier_statut_regard.setdefault(id_camera, {})

    expires = [p for p, ys in yaws_camera.items() if not ys or now - ys[-1][0] > REGARD_FENETRE_S]
    for p in expires:
        del yaws_camera[p]
        statuts_camera.pop(p, None)

    dq = yaws_camera.setdefault(pid, deque())
    dq.append((now, yaw_deg))
    while dq and now - dq[0][0] > REGARD_FENETRE_S:
        dq.popleft()


def evalue_regard(id_camera: str, pid: str, now: float) -> dict:
    """Dit si `pid` semble scanner les alentours (tête qui bouge
    beaucoup) SUR CETTE CAMÉRA — et enregistre un événement horodaté
    dans le rapport de cette caméra à chaque CHANGEMENT d'état, pas à
    chaque appel."""
    dq = _yaws.get(id_camera, {}).get(pid)
    if not dq or len(dq) < REGARD_OBSERVATIONS_MIN:
        return {"scanne": False, "statut": "pas_assez_d_observations", "vu": len(dq) if dq else 0}

    statuts_camera = _dernier_statut_regard.setdefault(id_camera, {})

    yaws = [y for _, y in dq]
    amplitude = max(yaws) - min(yaws)
    scanne = amplitude >= REGARD_VARIATION_MIN_DEG

    ancien = statuts_camera.get(pid)
    if ancien != scanne and (ancien is not None or scanne):
        rapport_cam.ajouter_historique(id_camera, {
            "type_evenement": "regard",
            "pid": pid,
            "evenement": "scanne_autour_detecte" if scanne else "scanne_autour_termine",
            "horodatage": now,
        })
    statuts_camera[pid] = scanne

    return {
        "scanne": scanne,
        "statut": "confirme" if scanne else "normal",
        "amplitude_deg": round(amplitude, 1),
    }


# --- Persistance (voir etat_persistant.py) ---------------------------------

# Volontairement PAS inclus ici : _objets_proches. Ses clés internes sont
# des track_id du tracker YOLO général (on_voit_quoi.py), qui ne survit
# pas non plus à un redémarrage et redistribue des ids à zéro — restaurer
# une ancienne entrée créerait un risque de fausse alerte de VOL juste
# après un redémarrage (un objet toujours là, mais renuméroté, semblerait
# "disparu"). Mieux vaut repartir à zéro sur cette partie précise. Voir
# etat_persistant.py pour l'explication complète.
def _etat_json() -> dict:
    return {
        "positions": {
            id_camera: {pid: [list(p) for p in dq] for pid, dq in positions_camera.items()}
            for id_camera, positions_camera in _positions.items()
        },
        "dernier_statut_rodeur": {
            id_camera: dict(statuts_camera) for id_camera, statuts_camera in _dernier_statut_rodeur.items()
        },
        "dernier_avis_ia_rodeur": {
            id_camera: dict(avis_camera) for id_camera, avis_camera in _dernier_avis_ia_rodeur.items()
        },
        "zones_anonymes": {
            id_camera: {
                zid: {"centroid": list(info["centroid"]), "last_seen": info["last_seen"]}
                for zid, info in zones_camera.items()
            }
            for id_camera, zones_camera in _zones_anonymes.items()
        },
        "yaws": {
            id_camera: {pid: [list(p) for p in dq] for pid, dq in yaws_camera.items()}
            for id_camera, yaws_camera in _yaws.items()
        },
        "dernier_statut_regard": {
            id_camera: dict(statuts_camera) for id_camera, statuts_camera in _dernier_statut_regard.items()
        },
    }


def _charger_etat_json(data: dict) -> None:
    global _positions, _dernier_statut_rodeur, _dernier_avis_ia_rodeur
    global _zones_anonymes, _yaws, _dernier_statut_regard
    _positions = {
        id_camera: {
            pid: deque((v[0], v[1], v[2]) for v in vals)
            for pid, vals in positions_camera.items()
        }
        for id_camera, positions_camera in data.get("positions", {}).items()
    }
    _dernier_statut_rodeur = {
        id_camera: dict(statuts_camera) for id_camera, statuts_camera in data.get("dernier_statut_rodeur", {}).items()
    }
    _dernier_avis_ia_rodeur = {
        id_camera: dict(avis_camera) for id_camera, avis_camera in data.get("dernier_avis_ia_rodeur", {}).items()
    }
    _zones_anonymes = {
        id_camera: {
            zid: {"centroid": tuple(info["centroid"]), "last_seen": info["last_seen"]}
            for zid, info in zones_camera.items()
        }
        for id_camera, zones_camera in data.get("zones_anonymes", {}).items()
    }
    _yaws = {
        id_camera: {
            pid: deque((v[0], v[1]) for v in vals)
            for pid, vals in yaws_camera.items()
        }
        for id_camera, yaws_camera in data.get("yaws", {}).items()
    }
    _dernier_statut_regard = {
        id_camera: dict(statuts_camera) for id_camera, statuts_camera in data.get("dernier_statut_regard", {}).items()
    }


etat_persistant.enregistrer("rodeur", _etat_json, _charger_etat_json)
