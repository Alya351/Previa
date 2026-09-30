from datetime import datetime, time as dtime
import math
import numpy as np
import cv2

from fonctionnalites.Alertes import alertes, comparaison_ia
from fonctionnalites.ComportementsSupects import profil_suspect, rodeur
from fonctionnalites.Infrastructure import rapport_cam
from fonctionnalites.zoneCam import enregitre as zone_registre

# Délai minimum hors-zone (en secondes) avant de réarmer une nouvelle alerte
# pour la même personne (évite le spam si la personne marche sur la ligne de démarcation)
COOLDOWN_REENTREE_S = 12.0

# Durée d'expiration d'une session de tracking sans détection (60s)
SESSION_EXPIRY_S = 60.0

# Sessions de suivi actives par caméra :
# id_camera -> session_id -> {
#   "en_zone": bool,
#   "alerte_envoyee": bool,
#   "premiere_intrusion_ts": float,
#   "derniere_vue_ts": float,
#   "derniere_sortie_ts": float | None,
#   "last_centroid": tuple,
#   "track_ids": set,
#   "pids": set,
# }
_sessions_suivi: dict[str, dict[str, dict]] = {}

# Cache du polygone mis à l'échelle en pixels : id_camera -> (signature, polygone_px)
_cache_polygone: dict[str, tuple] = {}


def est_zone_active_actuellement(zone: dict | None, horodatage: float | None = None) -> tuple[bool, str]:
    """Vérifie si la zone est actuellement active selon sa plage horaire configurée.
    Renvoie (est_active, description_statut).
    Gère les plages horaires nocturnes (ex: 20:00 -> 06:00) ainsi que le filtrage par jours."""
    if not zone:
        return False, "Aucune zone"

    plage = zone.get("plage_horaire")
    if not plage or plage.get("active_24h", True):
        return True, "Active (24h/24)"

    dt = datetime.fromtimestamp(horodatage) if horodatage else datetime.now()

    # 1. Vérification des jours actifs (0 = Lundi, 6 = Dimanche)
    jours_actifs = plage.get("jours_actifs")
    if isinstance(jours_actifs, list) and len(jours_actifs) > 0:
        if dt.weekday() not in jours_actifs:
            return False, f"Inactive ce jour ({dt.strftime('%A')})"

    # 2. Vérification de la tranche horaire
    heure_debut_str = plage.get("heure_debut", "20:00")
    heure_fin_str = plage.get("heure_fin", "06:00")

    try:
        h_deb, m_deb = map(int, str(heure_debut_str).split(":"))
        h_fin, m_fin = map(int, str(heure_fin_str).split(":"))
        t_deb = dtime(h_deb, m_deb)
        t_fin = dtime(h_fin, m_fin)
    except Exception:
        return True, "Active (Plage horaire par défaut)"

    t_now = dt.time()

    if t_deb <= t_fin:
        est_active = t_deb <= t_now <= t_fin
    else:
        est_active = t_now >= t_deb or t_now <= t_fin

    if est_active:
        return True, f"Active ({heure_debut_str} - {heure_fin_str})"
    else:
        return False, f"Hors plage horaire ({heure_debut_str} - {heure_fin_str})"


def _polygone_pixels(id_camera: str, frame_shape: tuple, zone: dict | None = None) -> np.ndarray | None:
    """Le polygone de la zone de `id_camera`, remis à l'échelle en pixels
    pour une frame de `frame_shape` (H, W, ...) — None si aucune zone
    n'est enregistrée pour cette caméra."""
    if zone is None:
        zone = zone_registre.lire_zone(id_camera)
    if zone is None or not zone.get("points"):
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
    cv2.pointPolygonTest renvoie >= 0 dedans ou sur le bord."""
    return cv2.pointPolygonTest(polygone, (float(point[0]), float(point[1])), False) >= 0


def _distance_euclidienne(p1: tuple, p2: tuple) -> float:
    return math.hypot(p1[0] - p2[0], p1[1] - p2[1])


def _resoudre_session(
    id_camera: str,
    track_id: int | str | None,
    pid: str | None,
    centroid: tuple,
    diagonale_frame: float,
    now: float,
) -> tuple[str, dict]:
    """Trouve ou initialise la session de suivi unique pour cet individu.
    Fusionne automatiquement les identifiants : Track ID YOLO, Face/Body PID, et proximité spatiale."""
    sessions = _sessions_suivi.setdefault(id_camera, {})

    # Nettoyage des sessions expirées (> 60s sans détection)
    expires = [sid for sid, s in sessions.items() if (now - s.get("derniere_vue_ts", 0)) > SESSION_EXPIRY_S]
    for sid in expires:
        sessions.pop(sid, None)

    session_trouvee_id = None

    # 1. Recherche par Track ID
    if track_id is not None:
        for sid, s in sessions.items():
            if track_id in s["track_ids"]:
                session_trouvee_id = sid
                break

    # 2. Recherche par PID si non trouvé
    if session_trouvee_id is None and pid is not None:
        for sid, s in sessions.items():
            if pid in s["pids"]:
                session_trouvee_id = sid
                break

    # 3. Recherche par proximité spatiale continue (< 8% diagonale, vu il y a < 4s)
    if session_trouvee_id is None and centroid is not None:
        seuil_dist = 0.08 * diagonale_frame
        meilleure_dist = float("inf")
        for sid, s in sessions.items():
            if (now - s.get("derniere_vue_ts", 0)) <= 4.0:
                dist = _distance_euclidienne(centroid, s["last_centroid"])
                if dist <= seuil_dist and dist < meilleure_dist:
                    meilleure_dist = dist
                    session_trouvee_id = sid

    # Création si nouvelle session
    if session_trouvee_id is None:
        if track_id is not None:
            session_trouvee_id = f"track-{track_id}"
        elif pid is not None:
            session_trouvee_id = f"pid-{pid}"
        else:
            session_trouvee_id = f"session-{now:.2f}-{int(centroid[0])}_{int(centroid[1])}"

        sessions[session_trouvee_id] = {
            "en_zone": False,
            "alerte_envoyee": False,
            "premiere_intrusion_ts": None,
            "derniere_vue_ts": now,
            "derniere_sortie_ts": None,
            "last_centroid": centroid,
            "track_ids": set(),
            "pids": set(),
        }

    sess = sessions[session_trouvee_id]
    sess["derniere_vue_ts"] = now
    sess["last_centroid"] = centroid
    if track_id is not None:
        sess["track_ids"].add(track_id)
    if pid is not None:
        sess["pids"].add(pid)

    return session_trouvee_id, sess


def evaluer(
    id_camera: str,
    pid: str | None,
    box: list,
    centroid: tuple,
    diagonale_frame: float,
    frame_shape: tuple,
    now: float,
    track_id: int | str | None = None,
) -> dict:
    """Cœur du module d'intrusion par zone.
    Garantit UNE SEULE alerte par intrusion (identifiée par Track ID / PID).
    Tant que l'individu reste dans la zone, aucune alerte doublon n'est générée."""
    zone = zone_registre.lire_zone(id_camera)
    if zone is None:
        return {"intrusion": False, "statut": "pas_de_zone", "avis_ia": None, "active": False}

    nom_zone = zone.get("nom_zone") or "Zone Surveillée"
    est_active, desc_statut = est_zone_active_actuellement(zone, now)

    polygone = _polygone_pixels(id_camera, frame_shape, zone=zone)
    if polygone is None:
        return {"intrusion": False, "statut": "pas_de_zone", "avis_ia": None, "active": False}

    session_id, session = _resoudre_session(
        id_camera, track_id, pid, centroid, diagonale_frame, now,
    )

    # Si la zone n'est pas active selon sa plage horaire (ex: heures d'ouverture normales)
    if not est_active:
        session["en_zone"] = False
        session["alerte_envoyee"] = False
        return {
            "intrusion": False,
            "statut": "hors_plage_horaire",
            "info_plage": desc_statut,
            "nom_zone": nom_zone,
            "session_id": session_id,
            "active": False,
            "avis_ia": None,
        }

    x1, y1, x2, y2 = box
    point_au_sol = ((x1 + x2) / 2.0, y2)  # bas-centre de la boîte : contact au sol
    point_milieu = ((x1 + x2) / 2.0, (y1 + y2) / 2.0)  # centroïde de la silhouette
    point_bas_tiers = ((x1 + x2) / 2.0, y1 + (y2 - y1) * 0.75)  # niveau bassin/jambes
    intrusion = (
        _point_dans_zone(polygone, point_au_sol)
        or _point_dans_zone(polygone, point_milieu)
        or _point_dans_zone(polygone, point_bas_tiers)
    )

    avis_ia = None
    alerte_declenchee = False

    if intrusion:
        # La personne est actuellement physiquement dans le polygone
        if not session["alerte_envoyee"]:
            # NOUVELLE INTRUSION CONFIRMÉE : on déclenche la 1ère et UNIQUE alerte
            session["en_zone"] = True
            session["alerte_envoyee"] = True
            session["premiere_intrusion_ts"] = now
            session["derniere_sortie_ts"] = None
            alerte_declenchee = True

            rapport_cam.ajouter_historique(id_camera, {
                "type_evenement": "intrusion_zone",
                "pid": pid,
                "track_id": track_id,
                "nom_zone": nom_zone,
                "evenement": "intrusion_detectee",
                "horodatage": now,
            })

            if pid is not None and profil_suspect.est_identite_reelle(pid):
                profil_suspect.signaler(pid, id_camera, "intrusion_zone", {"nom_zone": nom_zone, "track_id": track_id})

            phrase = (
                f"Intrusion en zone non autorisée ({nom_zone}) : individu (Track #{track_id or session_id}) "
                f"détecté dans la zone protégée ({desc_statut})."
            )
            avis_ia = comparaison_ia.comparer(phrase)

            # Enregistrement d'UNE SEULE alerte isolée dans le journal
            alertes.enregistrer_alerte("intrusion_zone", id_camera, pid, phrase, avis_ia, now)
            statut = "intrusion_detectee"
        else:
            # L'intrusion est DÉJÀ EN COURS : la personne reste dans la zone.
            # AUCUNE NOUVELLE ALERTE N'EST CRÉÉE.
            session["en_zone"] = True
            statut = "intrusion_en_cours"
    else:
        # La personne est hors de la zone
        if session["en_zone"]:
            session["en_zone"] = False
            session["derniere_sortie_ts"] = now

        # Si la personne est restée en dehors de la zone plus de COOLDOWN_REENTREE_S,
        # on réarme l'état pour qu'une éventuelle future entrée distincte produise une alerte.
        if session.get("derniere_sortie_ts") and (now - session["derniere_sortie_ts"]) > COOLDOWN_REENTREE_S:
            session["alerte_envoyee"] = False

        statut = "hors_zone"

    return {
        "intrusion": intrusion,
        "statut": statut,
        "alerte_declenchee": alerte_declenchee,
        "info_plage": desc_statut,
        "nom_zone": nom_zone,
        "session_id": session_id,
        "active": True,
        "avis_ia": avis_ia,
    }

