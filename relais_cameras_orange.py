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
        "fps_cible": 0.2
    },
    {
        "nom": "Camera_Exterieure",
        "id": "8929369b01524ff79190bdc37d60be92",
        "urls": [
            "rtsp://admin:11Avril2002@@192.168.11.103:554/Streaming/Channels/101",
            "rtsp://admin:admin@192.168.11.103:554/11"
        ],
        "fps_cible": 0.2
    }
]


def ouvrir_flux_camera(camera_info):
    """Tente d'ouvrir le flux RTSP en testant les différentes URLs possibles."""
    for url in camera_info["urls"]:
        print(f"[{camera_info['nom']}] Tentative de connexion sur : {url}")
        cap = cv2.VideoCapture(url, cv2.CAP_FFMPEG)
        if cap.isOpened():
            ret, frame = cap.read()
            if ret and frame is not None:
                print(f"[{camera_info['nom']}] Connecté avec succès sur : {url} !")
                return cap, url
            cap.release()
    return None, None


def worker_relais_camera(camera_info):
    """Thread autonome qui lit une caméra physique et envoie les trames à AWS."""
    cam_id = camera_info["id"]
    nom = camera_info["nom"]
    delai = 1.0 / camera_info.get("fps_cible", 2.0)

    endpoint_voir = f"{SERVEUR_AWS}/cameras/{cam_id}/voir"
    endpoint_qui = f"{SERVEUR_AWS}/cameras/{cam_id}/qui"

    compteur = 0

    while True:
        cap, active_url = ouvrir_flux_camera(camera_info)
        if not cap:
            print(f"[{nom}] Aucune URL RTSP accessible. Nouvelle tentative dans 5 secondes...")
            time.sleep(5)
            continue

        print(f"[{nom}] Diffusion en cours vers AWS ({SERVEUR_AWS})...")

        while True:
            t_debut = time.time()
            ret, frame = cap.read()

            if not ret or frame is None:
                print(f"[{nom}] Perte de trame. Reconnexion...")
                break

            # Encoder la trame en JPEG haute qualité
            succes, jpeg_buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 80])
            if not succes:
                continue

            jpeg_bytes = jpeg_buf.tobytes()

            try:
                # 1. Envoyer à /voir (mise à jour du flux en direct + détection objets/personnes)
                files = {"file": ("frame.jpg", jpeg_bytes, "image/jpeg")}
                resp_voir = requests.post(endpoint_voir, files=files, verify=False, timeout=3.0)

                # 2. Une fois sur deux, exécuter aussi /qui (Face ID & analyse comportementale)
                compteur += 1
                if compteur % 2 == 0:
                    files_qui = {"file": ("frame.jpg", jpeg_bytes, "image/jpeg")}
                    requests.post(endpoint_qui, files=files_qui, verify=False, timeout=3.0)

            except Exception as e:
                # Erreur temporaire réseau vers AWS (timeout léger)
                pass

            # Régulation du taux d'envoi (FPS)
            ecoule = time.time() - t_debut
            reste = delai - ecoule
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
