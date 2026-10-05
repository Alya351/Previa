"""Service unifié et optimisé de diffusion vidéo RTSP et d'analyse IA pour caméras IP.

Architecture Découplée & Basse Latence :
1. UN SEUL processus FFmpeg permanent en arrière-plan par caméra IP.
2. Buffer de dernière trame à TAILLE STRICTE = 1 (remplacement instantané, drop immédiat des images obsolètes).
3. Découplage complet : Le flux vidéo (MJPEG ~20 FPS) lit directement le buffer de taille 1 pour le navigateur,
   tandis que l'analyse IA (Worker autonome ~2 FPS) dépile la trame la plus récente sans bloquer le stream.
4. Élimination totale du spawn répété de processus FFmpeg (capturer_snapshot_unique en boucle supprimé).
"""
import os
import shutil
import subprocess
import threading
import time
from typing import Generator, Optional

from fonctionnalites.Infrastructure import derniere_image

# --- GESTION DU BUFFER TAILLE = 1 PAR CAMÉRA ---
_buffer_derniere_frame: dict[str, bytes] = {}
_buffer_lock = threading.Lock()

# --- GESTION DES PROCESSUS FFMPEG ET THREADS PAR CAMÉRA ---
_processus_ffmpeg: dict[str, subprocess.Popen] = {}
_threads_lecture: dict[str, threading.Thread] = {}
_workers_ai: dict[str, threading.Thread] = {}
_events_arret: dict[str, threading.Event] = {}

# --- GESTION DE L'ANALYSE IA ASYNCHRONE ---
_analyses_actives = set()
_analyses_lock = threading.Lock()
_derniere_analyse_ts = {}


def trouver_ffmpeg() -> Optional[str]:
    """Localise l'exécutable ffmpeg sur le système (priorité au dossier local du projet, puis PATH système)."""
    # 1. Vérifier dans le projet sous outils/ffmpeg/bin/ (pour exécution portable autonome sans installation)
    racine_projet = Path(__file__).resolve().parent.parent.parent.parent.parent
    local_ffmpeg = racine_projet / "outils" / "ffmpeg" / "bin" / ("ffmpeg.exe" if os.name == "nt" else "ffmpeg")
    if local_ffmpeg.exists():
        return str(local_ffmpeg)

    # 2. Recherche dans le PATH système
    dans_path = shutil.which("ffmpeg")
    if dans_path:
        return dans_path

    # 3. Chemins standards Windows
    chemins_connus = [
        r"C:\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files\ffmpeg\bin\ffmpeg.exe",
        r"C:\Program Files (x86)\ffmpeg\bin\ffmpeg.exe",
    ]
    for c in chemins_connus:
        if os.path.exists(c):
            return c
    return None

def verifier_support_v4l2m2m() -> bool:
    """Vérifie si les nœuds matériels V4L2 M2M du Raspberry Pi (/dev/video10...25) existent sous Linux."""
    if os.name == "nt":
        return False
    return any(os.path.exists(f"/dev/video{i}") for i in range(10, 25))


_opt_timeout_cache = {}


def _option_timeout_rtsp(ffmpeg: str) -> str:
    """Détermine dynamiquement si l'option FFmpeg est -stimeout (FFmpeg 4.x/Raspberry Pi) ou -timeout (FFmpeg 5.x+/PC)."""
    if ffmpeg not in _opt_timeout_cache:
        try:
            out = subprocess.run([ffmpeg, "-hide_banner", "-h", "demuxer=rtsp"], capture_output=True, text=True, timeout=5).stdout
            _opt_timeout_cache[ffmpeg] = "-stimeout" if "stimeout" in out else "-timeout"
        except Exception:
            _opt_timeout_cache[ffmpeg] = "-timeout"
    return _opt_timeout_cache[ffmpeg]


def normaliser_url_rtsp(url: str) -> str:
    """Normalise l'URL RTSP en séparant par le DERNIER @ (pour conserver les @ dans les mots de passe et les encoder en %40)."""
    if not url or not isinstance(url, str):
        return ""
    u = url.strip()
    if not u.lower().startswith("rtsp://"):
        return u

    import urllib.parse
    try:
        scheme, reste = u.split("://", 1)
        autorite, sep, chemin = reste.partition("/")
        auth, arobase, hote = autorite.rpartition("@")  # Le DERNIER @ sépare l'hôte/IP de l'authentification
        if not arobase or ":" not in auth:
            return u
        user, password = auth.split(":", 1)
        user_enc = urllib.parse.quote(urllib.parse.unquote(user), safe="")
        pwd_enc = urllib.parse.quote(urllib.parse.unquote(password), safe="")
        return f"{scheme}://{user_enc}:{pwd_enc}@{hote}{sep}{chemin}"
    except Exception:
        return u


def tester_connexion_rtsp(url_flux: str, timeout_sec: int = 5) -> dict:
    """Teste si l'URL RTSP/HTTP de la caméra IP est accessible et renvoie une trame valide."""
    if not url_flux or not url_flux.strip():
        return {"ok": False, "erreur": "URL de la caméra vide"}

    ffmpeg = trouver_ffmpeg()
    url_norm = normaliser_url_rtsp(url_flux)

    # 1. Option universelle avec FFmpeg (Essai avec URL normalisée puis URL brute en fallback)
    urls_a_tester = [url_norm]
    if url_flux.strip() != url_norm:
        urls_a_tester.append(url_flux.strip())

    err_msg = ""
    if ffmpeg:
        for u in urls_a_tester:
            cmd_base = [ffmpeg, "-hide_banner", "-loglevel", "error"]
            if u.lower().startswith("rtsp://"):
                cmd = cmd_base + [
                    "-fflags", "nobuffer",
                    "-flags", "low_delay",
                    "-rtsp_transport", "tcp",
                    "-timeout", "3000000",
                    "-i", u,
                    "-vframes", "1",
                    "-an",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-"
                ]
            else:
                cmd = cmd_base + [
                    "-timeout", "3000000",
                    "-i", u,
                    "-vframes", "1",
                    "-an",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-"
                ]

            try:
                proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout_sec)
                if proc.returncode == 0 and len(proc.stdout) > 500:
                    return {"ok": True, "taille_image": len(proc.stdout)}

                # Fallback UDP si TCP échoue
                if u.lower().startswith("rtsp://"):
                    cmd_udp = cmd_base + [
                        "-rtsp_transport", "udp",
                        "-timeout", "3000000",
                        "-i", u,
                        "-vframes", "1",
                        "-an",
                        "-f", "image2pipe",
                        "-vcodec", "mjpeg",
                        "-"
                    ]
                    proc_udp = subprocess.run(cmd_udp, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout_sec)
                    if proc_udp.returncode == 0 and len(proc_udp.stdout) > 500:
                        return {"ok": True, "taille_image": len(proc_udp.stdout)}
                err_msg = proc.stderr.decode("utf-8", errors="ignore")[-250:]
            except Exception as exc:
                err_msg = f"Erreur capture FFmpeg : {exc}"

    # 2. Fallback universel OpenCV
    try:
        import cv2
        for u in urls_a_tester:
            cap = cv2.VideoCapture(u)
            if cap.isOpened():
                ret, frame = cap.read()
                cap.release()
                if ret and frame is not None:
                    _, buf = cv2.imencode('.jpg', frame)
                    return {"ok": True, "taille_image": len(buf), "methode": "opencv"}
            cap.release()
    except Exception as exc:
        err_msg = f"OpenCV : {exc}"

    return {"ok": False, "erreur": f"Impossible de lire le flux (FFmpeg & OpenCV) : {err_msg or 'Caméra injoignable (vérifiez identifiants et mot de passe)'}"}




def capturer_snapshot_unique(url_flux: str, timeout_sec: int = 4) -> Optional[bytes]:
    """Capture une seule image JPEG fraîche (utilisé uniquement comme fallback/test)."""
    ffmpeg = trouver_ffmpeg()
    if not ffmpeg or not url_flux:
        return None

    url = normaliser_url_rtsp(url_flux)
    cmd = [
        ffmpeg,
        "-hide_banner",
        "-loglevel", "error",
        "-fflags", "nobuffer",
        "-flags", "low_delay",
        "-rtsp_transport", "tcp",
        "-timeout", "3000000",
        "-probesize", "32768",
        "-analyzeduration", "0",
        "-i", url,
        "-vframes", "1",
        "-an",
        "-f", "image2pipe",
        "-vcodec", "mjpeg",
        "-"
    ]

    try:
        proc = subprocess.run(
            cmd,
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            timeout=timeout_sec
        )
        if proc.returncode == 0 and len(proc.stdout) > 100:
            return proc.stdout
    except Exception:
        pass
    return None


_stats_ticks_ia: dict[str, dict] = {}


def obtenir_sante_ia(id_camera: str) -> dict:
    """Renvoie les statistiques de santé du worker IA (taux de ticks ignorés / exécutés)."""
    with _analyses_lock:
        stats = _stats_ticks_ia.get(id_camera, {})
        totaux = stats.get("totaux", 0)
        ignores = stats.get("ignores", 0)
        taux_drop = round((ignores / max(1, totaux)) * 100.0, 1) if totaux > 0 else 0.0
        return {
            "ticks_totaux": totaux,
            "ticks_ignores": ignores,
            "taux_drop_pourcent": taux_drop,
            "sante_ia_ok": taux_drop < 20.0,
        }


def declencher_analyse_asynchrone(id_camera_ou_url: str, jpg_bytes: bytes) -> None:
    """Déclenche de façon asynchrone l'analyse IA (YOLO + Face ID + Objets) sur la trame la plus récente."""
    if not jpg_bytes or len(jpg_bytes) < 500:
        return

    maintenant = time.time()
    if maintenant - _derniere_analyse_ts.get(id_camera_ou_url, 0) < 0.45:
        return

    with _analyses_lock:
        st = _stats_ticks_ia.setdefault(id_camera_ou_url, {"totaux": 0, "ignores": 0, "reset_ts": maintenant})
        st["totaux"] += 1

        # Réinitialisation de la fenêtre glissante d'une minute + log de contrôle de santé
        if maintenant - st["reset_ts"] >= 60.0:
            taux_drop = (st["ignores"] / max(1, st["totaux"])) * 100.0
            if taux_drop >= 20.0:
                print(f"[rtsp_service] ⚠️ AVERTISSEMENT SANTÉ IA ({id_camera_ou_url}) : {taux_drop:.1f}% de ticks d'analyse ignorés sur 60s (contention CPU/inférence).", flush=True)
            st["totaux"] = 1
            st["ignores"] = 0
            st["reset_ts"] = maintenant

        if id_camera_ou_url in _analyses_actives:
            st["ignores"] += 1
            return
        _analyses_actives.add(id_camera_ou_url)

    def _tache_analyse():
        try:
            import cv2
            import numpy as np
            from fonctionnalites.DetectionPrincipal.on_voit_quoi import analyser as analyser_quoi
            from fonctionnalites.DetectionPrincipal.on_voit_qui import analyser as analyser_qui
            from fonctionnalites.Infrastructure import etat_persistant

            frame = cv2.imdecode(np.frombuffer(jpg_bytes, np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                analyser_quoi(id_camera_ou_url, frame)
                analyser_qui(id_camera_ou_url, frame)
                etat_persistant.sauvegarder_si_temps()
        except Exception as exc:
            import traceback
            print(f"[rtsp_service] Erreur analyse IA {id_camera_ou_url} : {exc}", flush=True)
            traceback.print_exc()
            _derniere_analyse_ts[id_camera_ou_url] = time.time() + 2.0
        finally:
            if _derniere_analyse_ts.get(id_camera_ou_url, 0) < time.time():
                _derniere_analyse_ts[id_camera_ou_url] = time.time()
            with _analyses_lock:
                _analyses_actives.discard(id_camera_ou_url)

    thread = threading.Thread(target=_tache_analyse, daemon=True)
    thread.start()


def demarrer_worker_camera(id_camera: str, url_flux: str) -> None:
    """Démarre le processus FFmpeg PERMANENT unique et les workers pour cette caméra."""
    if not url_flux or not url_flux.strip():
        return

    # Si déjà en cours d'exécution, ne rien faire
    if id_camera in _events_arret and not _events_arret[id_camera].is_set():
        return

    ffmpeg = trouver_ffmpeg()
    if not ffmpeg:
        print(f"[rtsp_service] Impossible d'ouvrir la caméra {id_camera} : FFmpeg non trouvé.", flush=True)
        return

    evt_arret = threading.Event()
    _events_arret[id_camera] = evt_arret

    url_norm = normaliser_url_rtsp(url_flux)
    # 1. Thread de capture vidéo continu (FFmpeg unique + Fallback OpenCV -> Buffer de taille 1)
    def _boucle_capture_ffmpeg():
        print(f"[rtsp_service] 🚀 Démarrage capture continue pour {id_camera} ({url_norm})", flush=True)
        import cv2

        tenter_hw = verifier_support_v4l2m2m()

        url_a_utiliser = url_norm
        try:
            transport_opt = "tcp"
            while not evt_arret.is_set():
                if ffmpeg:
                    hw_opts = ["-c:v", "h264_v4l2m2m"] if tenter_hw else []
                    opt_timeout = _option_timeout_rtsp(ffmpeg)
                    cmd = [
                        ffmpeg,
                        "-hide_banner",
                        "-loglevel", "warning",
                        "-rtsp_transport", transport_opt,
                        opt_timeout, "3000000",
                        "-probesize", "32768",
                        "-analyzeduration", "0",
                        "-i", url_a_utiliser,
                        "-an",
                        "-vf", "scale=854:-1",
                        "-f", "image2pipe",
                        "-vcodec", "mjpeg",
                        "-q:v", "5",
                        "-r", "20",
                        "-"
                    ]
                    try:
                        proc = subprocess.Popen(
                            cmd,
                            stdout=subprocess.PIPE,
                            stderr=subprocess.PIPE,
                            bufsize=65536
                        )
                        _processus_ffmpeg[id_camera] = proc
                        tampon = b""
                        reussi = False

                        while not evt_arret.is_set():
                            morceau = proc.stdout.read(65536)
                            if not morceau:
                                break
                            tampon += morceau

                            # Si le tampon devient trop volumineux (> 1 Mo), purger les images obsolètes
                            if len(tampon) > 1000000:
                                dernier_start = tampon.rfind(b"\xff\xd8")
                                if dernier_start != -1:
                                    tampon = tampon[dernier_start:]
                                else:
                                    tampon = b""

                            # Extraire uniquement la TOUTE DERNIÈRE image JPEG complète (Saut direct des trames périmées acumulées)
                            fin_dernier = tampon.rfind(b"\xff\xd9")
                            if fin_dernier != -1:
                                debut_dernier = tampon.rfind(b"\xff\xd8", 0, fin_dernier)
                                if debut_dernier != -1:
                                    jpg = tampon[debut_dernier : fin_dernier + 2]
                                    tampon = tampon[fin_dernier + 2:]
                                    reussi = True

                                    with _buffer_lock:
                                        _buffer_derniere_frame[id_camera] = jpg

                                    derniere_image.enregistrer(id_camera, jpg)

                        if proc.poll() is None:
                            try:
                                proc.terminate()
                            except Exception:
                                pass

                        if not reussi:
                            try:
                                err_out = proc.stderr.read(2048).decode(errors="ignore") if proc.stderr else ""
                                if err_out:
                                    print(f"[rtsp_service] ⚠️ Erreur FFmpeg pour {id_camera} : {err_out.strip()}", flush=True)
                            except Exception:
                                pass
                            # Tester l'URL brute exacte de l'utilisateur si l'URL normalisée a échoué
                            url_a_utiliser = url_flux.strip() if url_a_utiliser == url_norm else url_norm
                            transport_opt = "udp" if transport_opt == "tcp" else "tcp"
                            if tenter_hw:
                                print(f"[rtsp_service] ⚠️ HW decoder v4l2m2m inactif ou incompatible pour {id_camera} — repli automatique en décodage logiciel CPU.", flush=True)
                                tenter_hw = False
                            time.sleep(1.0)
                            continue

                        if reussi and not evt_arret.is_set():
                            continue
                    except Exception as e:
                        print(f"[rtsp_service] Reconnexion FFmpeg CLI {id_camera} : {e}", flush=True)
                        if tenter_hw:
                            tenter_hw = False

                # Tentative 2 : Fallback OpenCV cv2.VideoCapture (Compatibilité maximale tous protocoles, Qualité HD 90%)
                if evt_arret.is_set():
                    break

                try:
                    cap = cv2.VideoCapture(url_flux.strip())
                    if cap.isOpened():
                        while not evt_arret.is_set():
                            ret, frame = cap.read()
                            if ret and frame is not None:
                                ok_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                                if ok_enc:
                                    jpg_bytes = buf.tobytes()
                                    with _buffer_lock:
                                        _buffer_derniere_frame[id_camera] = jpg_bytes
                                    derniere_image.enregistrer(id_camera, jpg_bytes)
                                time.sleep(0.04)  # ~25 FPS
                            else:
                                time.sleep(0.2)
                                break
                        cap.release()
                except Exception as e:
                    print(f"[rtsp_service] Erreur fallback OpenCV {id_camera} : {e}", flush=True)

                time.sleep(1.0)
        finally:
            if id_camera in _processus_ffmpeg:
                p = _processus_ffmpeg.pop(id_camera, None)
                if p:
                    try:
                        p.terminate()
                    except Exception:
                        pass

    # 2. Thread d'analyse IA périodique (Consomme la trame la plus récente sans bloquer la vidéo)
    def _boucle_analyse_ia():
        print(f"[rtsp_service] 🧠 Démarrage worker IA autonome pour {id_camera}", flush=True)
        while not evt_arret.is_set():
            time.sleep(0.75)  # Cadence ~1.3 FPS pour l'IA (optimisé Raspberry Pi / CPU)
            with _buffer_lock:
                jpg = _buffer_derniere_frame.get(id_camera)
            if jpg:
                declencher_analyse_asynchrone(id_camera, jpg)

    th_cap = threading.Thread(target=_boucle_capture_ffmpeg, daemon=True)
    th_ai = threading.Thread(target=_boucle_analyse_ia, daemon=True)
    _threads_lecture[id_camera] = th_cap
    _workers_ai[id_camera] = th_ai

    th_cap.start()
    th_ai.start()


def arreter_worker_camera(id_camera: str) -> None:
    """Arrête le worker et le processus FFmpeg d'une caméra."""
    if id_camera in _events_arret:
        _events_arret[id_camera].set()
        _events_arret.pop(id_camera, None)

    if id_camera in _processus_ffmpeg:
        proc = _processus_ffmpeg.pop(id_camera, None)
        if proc:
            try:
                proc.terminate()
            except Exception:
                pass


def generer_flux_mjpeg(id_camera: str, url_flux: str) -> Generator[bytes, None, None]:
    """Générateur de flux MJPEG ultra-basse latence pour le navigateur Web.
    Consomme directement le buffer de taille 1 alimenté par le processus FFmpeg unique.
    """
    if url_flux and url_flux.strip():
        demarrer_worker_camera(id_camera, url_flux)

    dernière_trame_envoyée = None
    inactif_compteur = 0

    while True:
        with _buffer_lock:
            jpg = _buffer_derniere_frame.get(id_camera)

        if jpg and jpg != dernière_trame_envoyée:
            dernière_trame_envoyée = jpg
            inactif_compteur = 0
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpg)).encode() + b"\r\n\r\n"
                + jpg
                + b"\r\n"
            )
            time.sleep(0.02)  # ~50 FPS max cap pour la réactivité
        else:
            time.sleep(0.01)  # 10ms réactivité de scrutation
            inactif_compteur += 1
            # Toutes les ~6 secondes sans image, s'assurer que le worker tourne toujours
            if inactif_compteur % 600 == 0:
                if url_flux and url_flux.strip():
                    demarrer_worker_camera(id_camera, url_flux)

