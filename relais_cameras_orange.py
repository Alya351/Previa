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

import time
import threading
import cv2
import requests
import urllib3

# Désactiver les avertissements SSL pour le certificat autosigné d'AWS
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

# Configuration du Serveur AWS
SERVEUR_AWS = "https://16.171.13.89:8012"

# Taille et qualité des images envoyées (connexion mobile : rester léger)
LARGEUR_ENVOI = 960
QUALITE_JPEG = 62

# Apercu fluide : images par seconde envoyees sans analyse
FPS_APERCU = 4.0
# Analyse IA : une image toutes les N secondes par camera
DELAI_ANALYSE_S = 1.5

# Configuration des Caméras Réelles d'Orange
CAMERAS = [
    {
        "nom": "Camera_Interne",
        "id": "7711bf8da3d94380b0024768615aa691",
        # URLs possibles (testées automatiquement dans l'ordre)
        "urls": [
            "rtsp://admin:11Avril2002@@192.168.11.101:554/Streaming/Channels/102",
            "rtsp://admin:11Avril2002@@192.168.11.101:554/Streaming/Channels/101",
            "rtsp://admin:admin@192.168.11.102:554/11",
            "rtsp://admin:11Avril2002@@192.168.11.102:554/Streaming/Channels/101"
        ],
        "fps_cible": 4.0
    },
    {
        "nom": "Camera_Exterieure",
        "id": "8929369b01524ff79190bdc37d60be92",
        "urls": [
            "rtsp://admin:11Avril2002@@192.168.11.103:554/Streaming/Channels/102",
            "rtsp://admin:11Avril2002@@192.168.11.103:554/Streaming/Channels/101",
            "rtsp://admin:admin@192.168.11.103:554/11"
        ],
        "fps_cible": 4.0
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

        while True:
            t_debut = time.time()
            for _ in range(2):
                cap.grab()
            ret, frame = cap.read()
            if not ret or frame is None:
                print(f"[{nom}] Perte de trame. Reconnexion...")
                break

            hauteur, largeur = frame.shape[:2]
            if largeur > LARGEUR_ENVOI:
                echelle = LARGEUR_ENVOI / float(largeur)
                frame = cv2.resize(frame, (LARGEUR_ENVOI, int(hauteur * echelle)), interpolation=cv2.INTER_AREA)

            succes, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, QUALITE_JPEG])
            if not succes:
                continue
            jpeg_bytes = jpeg_buf.tobytes()

            # 1. Apercu : rapide, sans IA
            try:
                t_envoi = time.time()
                session.post(endpoint_trame, files={"file": ("frame.jpg", jpeg_bytes, "image/jpeg")},
                             verify=False, timeout=8.0)
                etat["envois"] += 1
                etat["cumul"] += time.time() - t_envoi
                if etat["envois"] % 25 == 0:
                    moyenne = etat["cumul"] / etat["envois"]
                    print(f"[{nom}] {len(jpeg_bytes)//1024} Ko par image — envoi moyen {moyenne:.2f}s", flush=True)
            except Exception:
                pass

            # 2. Analyse : en arriere-plan, a cadence reduite
            if (time.time() - etat["derniere_analyse"] >= DELAI_ANALYSE_S) and not analyse_en_cours.is_set():
                analyse_en_cours.set()
                etat["derniere_analyse"] = time.time()
                threading.Thread(target=analyser, args=(jpeg_bytes,), daemon=True).start()

            reste = delai - (time.time() - t_debut)
            if reste > 0:
                time.sleep(reste)

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
