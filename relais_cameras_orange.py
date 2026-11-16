#!/usr/bin/env python3
"""
PREVIA — Relais Direct des Caméras Physiques d'Orange vers le Serveur AWS EC2.
À lancer sur votre PC lorsque vous êtes à Orange Digital Center.

Fonctionnement :
1. Se connecte aux caméras réelles sur le réseau local (192.168.11.x)
2. Capture les trames en direct
3. Les transmet en temps réel vers votre serveur Cloud AWS (16.171.13.89)
4. L'IA sur AWS (YOLO11x + ArcFace) analyse le flux et l'affiche sur l'app web pour l'encadrant.
"""

import os
import time
import threading

# Lecture RTSP à faible latence : pas de mise en tampon côté FFmpeg
os.environ.setdefault("OPENCV_FFMPEG_CAPTURE_OPTIONS", "rtsp_transport;tcp|fflags;nobuffer|flags;low_delay")
import cv2
import requests
import urllib3

import emetteur_webrtc

# Désactiver les avertissements SSL pour le certificat autosigné d'AWS
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration du Serveur AWS
SERVEUR_AWS = "https://16.171.13.89:8012"

# Taille et qualité des images envoyées (connexion mobile : rester léger)
LARGEUR_ENVOI = 1024
QUALITE_JPEG = 68

# Apercu fluide : images par seconde envoyees sans analyse
FPS_APERCU = 4.0
# Analyse IA : une image toutes les N secondes par camera
DELAI_ANALYSE_S = 1.5
# Nombre d'envois d'apercu simultanes par camera
ENVOIS_PARALLELES = 3

# --- Vidéo en direct WebRTC (voir emetteur_webrtc.py) -----------------------
VIDEO_WEBRTC = True
SERVEUR_WSS = SERVEUR_AWS.replace("https://", "wss://")
LARGEUR_VIDEO = 640
# Aperçu JPEG réduit pendant que quelqu'un regarde la vidéo (économise le débit)
FPS_APERCU_PENDANT_VIDEO = 1.0
SERVEURS_ICE = [
    {"urls": "stun:stun.l.google.com:19302"},
    {"urls": ["turn:16.171.13.89:3478?transport=udp", "turn:16.171.13.89:3478?transport=tcp"],
     "username": "previa", "credential": "PreviaDHpycsD6PLrT0Wjz"},
]

# Configuration des Caméras Réelles d'Orange
CAMERAS = [
    {
        "nom": "Camera_Interne",
        "id": "7711bf8da3d94380b0024768615aa691",
        # URLs possibles (testées automatiquement dans l'ordre)
        "urls": [
            "rtsp://admin:11Avril2002@@192.168.11.101:554/Streaming/Channels/101",
            "rtsp://admin:admin@192.168.11.102:554/11",
            "rtsp://admin:11Avril2002@@192.168.11.102:554/Streaming/Channels/101"
        ],
        "fps_cible": 6.0
    },
    {
        "nom": "Camera_Exterieure",
        "id": "8929369b01524ff79190bdc37d60be92",
        "urls": [
            "rtsp://admin:11Avril2002@@192.168.11.103:554/Streaming/Channels/101",
            "rtsp://admin:admin@192.168.11.103:554/11"
        ],
        "fps_cible": 6.0
    }
]


def ouvrir_flux_camera(camera_info):
    """Tente d'ouvrir le flux RTSP en testant les différentes URLs possibles."""
    for url in camera_info["urls"]:
        print(f"[{camera_info['nom']}] Tentative de connexion sur : {url}")
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        try:
            cap.set(cv2.CAP_PROP_BUFFERSIZE, 1)
        except Exception:
            pass
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                print(f"[{camera_info['nom']}] Connecté avec succès sur : {url} !")
                return cap, url
            cap.release()
    return None, None


def worker_relais_camera(camera_info):
    """Lit une camera physique et envoie les trames a AWS.

    Deux cadences separees :
      - APERCU  : POST /trame a FPS_APERCU (aucun modele cote serveur) -> image fluide
      - ANALYSE : POST /voir (+ /qui) toutes les DELAI_ANALYSE_S secondes, dans un
                  thread a part, pour que l'attente de l'IA ne freine jamais la capture.
    """
    cam_id = camera_info["id"]
    nom = camera_info["nom"]
    delai = 1.0 / camera_info.get("fps_cible", FPS_APERCU)

    endpoint_trame = f"{SERVEUR_AWS}/cameras/{cam_id}/trame"
    endpoint_voir = f"{SERVEUR_AWS}/cameras/{cam_id}/voir"
    endpoint_qui = f"{SERVEUR_AWS}/cameras/{cam_id}/qui"

    session = requests.Session()
    analyse_en_cours = threading.Event()
    etat = {"derniere_analyse": 0.0, "compteur": 0, "envois": 0, "cumul": 0.0}

    envois_en_vol = threading.Semaphore(ENVOIS_PARALLELES)

    def envoyer_apercu(jpeg_bytes):
        try:
            t_envoi = time.time()
            session.post(endpoint_trame, files={"file": ("frame.jpg", jpeg_bytes, "image/jpeg")},
                         verify=False, timeout=8.0)
            etat["envois"] += 1
            etat["cumul"] += time.time() - t_envoi
            if etat["envois"] % 25 == 0:
                moyenne = etat["cumul"] / max(1, etat["envois"])
                print(f"[{nom}] {len(jpeg_bytes)//1024} Ko par image — envoi moyen {moyenne:.2f}s", flush=True)
        except Exception:
            pass
        finally:
            envois_en_vol.release()

    def analyser(jpeg_bytes):
        try:
            session.post(endpoint_voir, files={"file": ("frame.jpg", jpeg_bytes, "image/jpeg")},
                         verify=False, timeout=20.0)
            etat["compteur"] += 1
            if etat["compteur"] % 3 == 0:
                session.post(endpoint_qui, files={"file": ("frame.jpg", jpeg_bytes, "image/jpeg")},
                             verify=False, timeout=25.0)
        except Exception:
            pass
        finally:
            analyse_en_cours.clear()

    while True:
        cap, active_url = ouvrir_flux_camera(camera_info)
        if not cap:
            print(f"[{nom}] Aucune URL RTSP accessible. Nouvelle tentative dans 5 secondes...")
            time.sleep(5)
            continue

        print(f"[{nom}] Diffusion en cours vers AWS ({SERVEUR_AWS}) — apercu {camera_info.get('fps_cible', FPS_APERCU)} img/s, analyse toutes les {DELAI_ANALYSE_S}s")

        if VIDEO_WEBRTC and not etat.get("video_lancee"):
            etat["video_lancee"] = emetteur_webrtc.demarrer(SERVEUR_WSS, cam_id, nom, SERVEURS_ICE)

        # Un fil dédié lit la caméra EN CONTINU et ne garde que la dernière
        # image : si le traitement prend du retard, on saute des images au
        # lieu d'accumuler un décalage qui grandit sans fin.
        lecteur = {"image": None, "n": 0, "fin": False}

        def lire_camera(cap=cap, lecteur=lecteur):
            while not lecteur["fin"]:
                ok, img = cap.read()
                if not ok or img is None:
                    lecteur["fin"] = True
                    break
                lecteur["image"] = img
                lecteur["n"] += 1

        threading.Thread(target=lire_camera, daemon=True).start()

        dernier_apercu = 0.0
        deja_vu = 0
        stats = {"t": time.time(), "lues": 0, "traitees": 0}
        while True:
            if lecteur["fin"]:
                print(f"[{nom}] Perte de trame. Reconnexion...")
                break
            if lecteur["n"] == deja_vu:
                time.sleep(0.005)
                continue
            stats["lues"] += lecteur["n"] - deja_vu
            stats["traitees"] += 1
            deja_vu = lecteur["n"]
            frame = lecteur["image"]
            if time.time() - stats["t"] >= 30:
                duree = time.time() - stats["t"]
                print(f"[{nom}] Caméra : {stats['lues']/duree:.0f} img/s reçues, {stats['traitees']/duree:.0f} img/s traitées (le reste est sauté, pas de retard)", flush=True)
                stats.update({"t": time.time(), "lues": 0, "traitees": 0})
            maintenant = time.time()
            hauteur, largeur = frame.shape[:2]

            # 0. Vidéo WebRTC : image réduite publiée pour l'émetteur
            if etat.get("video_lancee"):
                h_video = int(hauteur * LARGEUR_VIDEO / float(largeur)) // 2 * 2
                emetteur_webrtc.publier_image(cam_id, cv2.resize(frame, (LARGEUR_VIDEO, h_video), interpolation=cv2.INTER_AREA))

            regarde_en_video = emetteur_webrtc.spectateurs.get(cam_id, 0) > 0
            fps_apercu = FPS_APERCU_PENDANT_VIDEO if regarde_en_video else camera_info.get("fps_cible", FPS_APERCU)
            apercu_du = maintenant - dernier_apercu >= 1.0 / fps_apercu
            analyse_due = (maintenant - etat["derniere_analyse"] >= DELAI_ANALYSE_S) and not analyse_en_cours.is_set()
            if not (apercu_du or analyse_due):
                continue

            if largeur > LARGEUR_ENVOI:
                echelle = LARGEUR_ENVOI / float(largeur)
                frame = cv2.resize(frame, (LARGEUR_ENVOI, int(hauteur * echelle)), interpolation=cv2.INTER_AREA)
            succes, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, QUALITE_JPEG])
            if not succes:
                continue
            jpeg_bytes = jpeg_buf.tobytes()

            # 1. Aperçu JPEG (secours si la vidéo ne passe pas + statut "connectée")
            if apercu_du and envois_en_vol.acquire(blocking=False):
                dernier_apercu = maintenant
                threading.Thread(target=envoyer_apercu, args=(jpeg_bytes,), daemon=True).start()

            # 2. Analyse IA en arrière-plan
            if analyse_due:
                analyse_en_cours.set()
                etat["derniere_analyse"] = maintenant
                threading.Thread(target=analyser, args=(jpeg_bytes,), daemon=True).start()

        cap.release()
        time.sleep(2)



def main():
    print("=" * 65)
    print("  PREVIA — RELAIS CAMÉRAS PHYSIQUES ORANGE ➔ AWS")
    print(f"  Serveur Cloud Cible : {SERVEUR_AWS}")
    print("=" * 65)
    print("Vérifiez que votre PC est connecté :")
    print(" 1. Au Wi-Fi du routeur des caméras (pour lire le flux)")
    print(" 2. À Internet (via Partage de connexion USB 4G)")
    print("=" * 65)

    threads = []
    for cam in CAMERAS:
        t = threading.Thread(target=worker_relais_camera, args=(cam,), daemon=True)
        t.start()
        threads.append(t)

    try:
        while True:
            time.sleep(1)
    except KeyboardInterrupt:
        print("\nArrêt du relais caméras.")


if __name__ == "__main__":
    main()
