"""Service d'enregistrement automatique de clips vidéo de preuve (10s) pour alertes d'incident.
Maintient un tampon circulaire glissant des dernières images par caméra pour assembler
automatiquement un clip vidéo MP4 dès qu'une alerte critique est déclenchée.
"""
import collections
import os
import shutil
import subprocess
import threading
import time
from pathlib import Path
from typing import Optional

CLIPS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "clips"
TAMPON_DUREE_SEC = 10.0  # 10 secondes de vidéo (5s avant + 5s après)
TAMPON_MAX_FRAMES = 150  # ~15 FPS x 10s

_verrou = threading.Lock()
# id_camera -> collections.deque([(timestamp, bytes), ...])
_tampons_cameras = collections.defaultdict(lambda: collections.deque(maxlen=TAMPON_MAX_FRAMES))


def ajouter_trame(id_camera: str, jpg_bytes: bytes) -> None:
    """Ajoute une trame vidéo au tampon circulaire glissant de la caméra."""
    if not jpg_bytes:
        return
    with _verrou:
        _tampons_cameras[id_camera].append((time.time(), jpg_bytes))


def chemin_clip(id_alerte: str) -> Path:
    """Chemin du fichier vidéo MP4 de l'alerte."""
    return CLIPS_DIR / f"{id_alerte}.mp4"


def trouver_ffmpeg() -> Optional[str]:
    dans_path = shutil.which("ffmpeg")
    if dans_path:
        return dans_path
    chemins_connus = [
        r"C:\Users\alyak\.vscode\extensions\kilocode.kilo-code-7.5.15-win32-x64\bin\ffmpeg.exe",
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
    ]
    for c in chemins_connus:
        if os.path.exists(c):
            return c
    return None


def enregistrer_clip(id_alerte: str, id_camera: str) -> Optional[Path]:
    """Assemble les trames récentes de la caméra en un fichier vidéo MP4 durable."""
    CLIPS_DIR.mkdir(parents=True, exist_ok=True)
    fichier_sortie = chemin_clip(id_alerte)

    with _verrou:
        trames = list(_tampons_cameras[id_camera])

    if not trames or len(trames) < 3:
        return None

    ffmpeg = trouver_ffmpeg()
    if not ffmpeg:
        return None

    # Création du fichier MP4 via FFmpeg en injectant les JPEG dans stdin
    cmd = [
        ffmpeg,
        "-y",
        "-hide_banner",
        "-loglevel", "error",
        "-f", "image2pipe",
        "-framerate", "12",
        "-i", "-",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-preset", "veryfast",
        str(fichier_sortie),
    ]

    try:
        proc = subprocess.Popen(cmd, stdin=subprocess.PIPE, stderr=subprocess.DEVNULL)
        for _, jpg in trames:
            proc.stdin.write(jpg)
        proc.stdin.close()
        proc.wait(timeout=5)
        if fichier_sortie.exists() and fichier_sortie.stat().st_size > 1000:
            print(f"[clips_service] Clip d'alerte généré : {fichier_sortie.name}", flush=True)
            return fichier_sortie
    except Exception as exc:
        print(f"[clips_service] Erreur génération clip {id_alerte} : {exc}", flush=True)

    return None


def lire_clip(id_alerte: str) -> Optional[bytes]:
    """Lit le fichier vidéo MP4 d'une alerte s'il existe."""
    fichier = chemin_clip(id_alerte)
    if fichier.exists():
        return fichier.read_bytes()
    return None
