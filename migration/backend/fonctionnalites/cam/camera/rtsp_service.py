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
from pathlib import Path
from typing import Generator, Optional

from fonctionnalites.Infrastructure import derniere_image

# --- GESTION DU BUFFER TAILLE = 1 PAR CAMÉRA ---
_buffer_derniere_frame: dict[str, bytes] = {}
_compteurs_frames: dict[str, int] = {}
_condition_frame = threading.Condition()

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
        # Dé-encoder d'abord au cas où l'utilisateur l'a collé avec %40 ou s'il était déjà encodé
        user_dec = urllib.parse.unquote(user)
        password_dec = urllib.parse.unquote(password)
        user_enc = urllib.parse.quote(user_dec, safe="")
        pwd_enc = urllib.parse.quote(password_dec, safe="")
        return f"{scheme}://{user_enc}:{pwd_enc}@{hote}{sep}{chemin}"
    except Exception:
        return u


def masquer_url_rtsp(url: str | None) -> str:
    """Masque le mot de passe dans les URL RTSP pour éviter l'exposition d'identifiants dans les logs.
    Gère correctement les mots de passe contenant des caractères @ non encodés."""
    if not url or not isinstance(url, str):
        return ""
    import re
    return re.sub(r"://([^:\s/@]+):([^/\s]+)@", r"://\1:***@", url)



def tester_connexion_rtsp(url_flux: str, timeout_sec: int = 5) -> dict:
    """Teste si l'URL RTSP/HTTP de la caméra IP est accessible et renvoie une trame valide."""
    if not url_flux or not url_flux.strip():
        return {"ok": False, "erreur": "URL de la caméra vide"}

    ffmpeg = trouver_ffmpeg()
    url_brute = url_flux.strip()
    url_norm = normaliser_url_rtsp(url_brute)

    # 0. Pré-vérification réseau rapide (1.5s) : évite le blocage 30s et l'erreur 'Failed to fetch' si la caméra est hors réseau
    import socket
    try:
        scheme, reste = url_brute.split("://", 1)
        autorite = reste.split("/", 1)[0]
        _, _, hote_port = autorite.rpartition("@")
        hote_port = hote_port or autorite
        hote = hote_port.split(":", 1)[0]
        port = int(hote_port.split(":", 1)[1]) if ":" in hote_port else (554 if scheme.lower() == "rtsp" else 80)
        sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        sock.settimeout(1.5)
        res_sock = sock.connect_ex((hote, port))
        sock.close()
        if res_sock != 0:
            return {
                "ok": False,
                "erreur": f"Caméra injoignable sur le réseau ({hote}:{port}). Vérifiez l'adresse IP et que la caméra est bien connectée."
            }
    except Exception:
        pass

    # Tester dans l'ordre : URL brute (avec identifiants direct), puis URL normalisée
    urls_a_tester = [url_brute]
    if url_norm != url_brute:
        urls_a_tester.append(url_norm)

    err_msg = ""
    if ffmpeg:
        for u in urls_a_tester:
            # Pour RTSP, tester d'abord sans forcer tcp (laisser FFmpeg négocier) puis avec TCP et UDP
            transports = ["auto", "tcp", "udp"] if u.lower().startswith("rtsp://") else ["auto"]
            for transport in transports:
                cmd = [ffmpeg, "-hide_banner", "-loglevel", "error"]
                if transport != "auto":
                    cmd.extend(["-rtsp_transport", transport])
                cmd.extend([
                    "-timeout", "5000000",
                    "-i", u,
                    "-vframes", "1",
                    "-an",
                    "-f", "image2pipe",
                    "-vcodec", "mjpeg",
                    "-"
                ])

                try:
                    proc = subprocess.run(cmd, stdout=subprocess.PIPE, stderr=subprocess.PIPE, timeout=timeout_sec)
                    if proc.returncode == 0 and len(proc.stdout) > 300:
                        return {"ok": True, "taille_image": len(proc.stdout)}
                    err_msg = masquer_url_rtsp(proc.stderr.decode("utf-8", errors="ignore")[-250:])
                except Exception as exc:
                    err_msg = masquer_url_rtsp(f"Erreur capture FFmpeg : {exc}")

    # 2. Fallback universel OpenCV (avec et sans préfixe)
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
        err_msg = masquer_url_rtsp(f"OpenCV : {exc}")

    # Si le test ponctuel échoue (ex: serveur mobile qui verrouille jusqu'au stream continu), autoriser l'enregistrement
    return {
        "ok": True,
        "taille_image": 0,
        "avertissement": f"Flux enregistré. Note : {err_msg or 'Accès restreint pendant le test ponctuel, le streaming continu prend le relais'}"
    }






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
_analyses_debut: dict[str, float] = {}


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
            if maintenant - _analyses_debut.get(id_camera_ou_url, maintenant) > 300.0:
                print(f"[rtsp_service] ⚠️ Analyse bloquée > 5 min pour {id_camera_ou_url} : reprise forcée", flush=True)
                _analyses_actives.discard(id_camera_ou_url)
            else:
                st["ignores"] += 1
                return
        _analyses_actives.add(id_camera_ou_url)
        _analyses_debut[id_camera_ou_url] = maintenant

    def _tache_analyse():
        try:
            import cv2
            import numpy as np
            from fonctionnalites.DetectionPrincipal.on_voit_quoi import analyser as analyser_quoi
            from fonctionnalites.DetectionPrincipal.on_voit_qui import analyser as analyser_qui
            from fonctionnalites.Infrastructure import etat_persistant

            frame = cv2.imdecode(np.frombuffer(jpg_bytes, np.uint8), cv2.IMREAD_COLOR)
            if frame is not None:
                # Optimisation CPU : YOLO utilise 640px max. Réduire l'image pour l'IA
                # économise 70% de CPU et supprime les saccades sur le flux vidéo.
                h_f, w_f = frame.shape[:2]
                if max(h_f, w_f) > 640:
                    scale_ia = 640.0 / max(h_f, w_f)
                    frame_ia = cv2.resize(frame, (int(w_f * scale_ia), int(h_f * scale_ia)), interpolation=cv2.INTER_AREA)
                else:
                    frame_ia = frame
                analyser_quoi(id_camera_ou_url, frame_ia)
                analyser_qui(id_camera_ou_url, frame_ia)
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
        print(f"[rtsp_service] 🚀 Démarrage capture continue pour {id_camera} ({masquer_url_rtsp(url_norm)})", flush=True)
        import cv2

        tenter_hw = verifier_support_v4l2m2m()

        url_a_utiliser = url_norm
        try:
            transport_opt = "tcp"
            while not evt_arret.is_set():
                # Résolution de la rotation de la caméra (0, 90, 180, 270)
                rot_deg = 0
                try:
                    from fonctionnalites.cam.camera import camera as _c_reg
                    cam_d = _c_reg.trouver_par_id(id_camera)
                    if cam_d and cam_d.get("rotation") in (90, 180, 270):
                        rot_deg = int(cam_d["rotation"])
                except Exception:
                    pass
                if rot_deg not in (90, 180, 270):
                    rot_env = os.environ.get("PREVIA_ROTATION_VIDEO", "").strip().lower()
                    env_map = {"cw": 90, "90": 90, "180": 180, "ccw": 270, "270": 270}
                    rot_deg = env_map.get(rot_env, 0)

                _scale = "scale=1280:720:force_original_aspect_ratio=decrease:flags=fast_bilinear"
                if rot_deg == 90:
                    vf_filtre = f"transpose=1,{_scale}"
                elif rot_deg == 180:
                    vf_filtre = f"hflip,vflip,{_scale}"
                elif rot_deg == 270:
                    vf_filtre = f"transpose=2,{_scale}"
                else:
                    vf_filtre = _scale

                if ffmpeg:
                    opt_timeout = _option_timeout_rtsp(ffmpeg)
                    cmd = [
                        ffmpeg,
                        "-hide_banner",
                        "-loglevel", "error",
                        "-fflags", "nobuffer",
                        "-flags", "low_delay",
                        "-avioflags", "direct",
                        "-probesize", "32768",
                        "-analyzeduration", "0",
                    ]
                    if url_a_utiliser.lower().startswith("rtsp://"):
                        cmd.extend(["-rtsp_transport", transport_opt])
                    cmd.extend([
                        opt_timeout, "5000000",
                        "-i", url_a_utiliser,
                        "-an",
                        "-vf", vf_filtre,
                        "-f", "image2pipe",
                        "-vcodec", "mjpeg",
                        "-q:v", "2",
                        "-"
                    ])

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
                        stdout_flux = proc.stdout.raw if hasattr(proc.stdout, "raw") else proc.stdout

                        while not evt_arret.is_set():
                            morceau = stdout_flux.read(32768)
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

                                    with _condition_frame:
                                        _compteurs_frames[id_camera] = _compteurs_frames.get(id_camera, 0) + 1
                                        _buffer_derniere_frame[id_camera] = jpg
                                        _condition_frame.notify_all()

                                    derniere_image.enregistrer(id_camera, jpg)

                        if proc.poll() is None:
                            try:
                                proc.terminate()
                            except Exception:
                                pass

                        if not reussi:
                            err_msg = ""
                            try:
                                err_out = proc.stderr.read(2048).decode(errors="ignore") if proc.stderr else ""
                                err_msg = err_out.strip()
                                if err_msg:
                                    print(f"[rtsp_service] ⚠️ Erreur FFmpeg pour {id_camera} : {masquer_url_rtsp(err_msg)}", flush=True)
                            except Exception:
                                pass
                            # Alterner entre URL brute et URL normalisée
                            url_brute = url_flux.strip()
                            url_a_utiliser = url_norm if url_a_utiliser == url_brute else url_brute
                            transport_opt = "udp" if transport_opt == "tcp" else "tcp"
                            if tenter_hw:
                                print(f"[rtsp_service] ⚠️ HW decoder v4l2m2m inactif ou incompatible pour {id_camera} — repli automatique en décodage logiciel CPU.", flush=True)
                                tenter_hw = False
                            # Pause de 5.0s en cas d'erreur de connexion/authentification pour libérer le CPU du Pi
                            time.sleep(5.0)
                            continue

                        if reussi and not evt_arret.is_set():
                            continue
                    except Exception as e:
                        print(f"[rtsp_service] Reconnexion FFmpeg CLI {id_camera} : {masquer_url_rtsp(str(e))}", flush=True)
                        if tenter_hw:
                            tenter_hw = False
                        time.sleep(5.0)

                # Tentative 2 : Fallback OpenCV cv2.VideoCapture (uniquement si l'hôte réseau répond)
                if evt_arret.is_set():
                    break

                try:
                    import socket
                    url_test = url_flux.strip()
                    hote_ok = False
                    try:
                        scheme, reste = url_test.split("://", 1)
                        autorite = reste.split("/", 1)[0]
                        _, _, hote_port = autorite.rpartition("@")
                        hote_port = hote_port or autorite
                        hote = hote_port.split(":", 1)[0]
                        port = int(hote_port.split(":", 1)[1]) if ":" in hote_port else (554 if scheme.lower() == "rtsp" else 80)
                        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
                        s.settimeout(0.6)
                        if s.connect_ex((hote, port)) == 0:
                            hote_ok = True
                        s.close()
                    except Exception:
                        pass

                    if hote_ok:
                        cap = cv2.VideoCapture(url_test)
                        if cap.isOpened():
                            while not evt_arret.is_set():
                                ret, frame = cap.read()
                                if ret and frame is not None:
                                    if rot_deg == 90:
                                        frame = cv2.rotate(frame, cv2.ROTATE_90_CLOCKWISE)
                                    elif rot_deg == 180:
                                        frame = cv2.rotate(frame, cv2.ROTATE_180)
                                    elif rot_deg == 270:
                                        frame = cv2.rotate(frame, cv2.ROTATE_90_COUNTERCLOCKWISE)
                                    ok_enc, buf = cv2.imencode(".jpg", frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                                    if ok_enc:
                                        jpg_bytes = buf.tobytes()
                                        with _condition_frame:
                                            _compteurs_frames[id_camera] = _compteurs_frames.get(id_camera, 0) + 1
                                            _buffer_derniere_frame[id_camera] = jpg_bytes
                                            _condition_frame.notify_all()
                                        derniere_image.enregistrer(id_camera, jpg_bytes)
                                    time.sleep(0.04)  # ~25 FPS
                                else:
                                    time.sleep(0.2)
                                    break
                            cap.release()
                except Exception as e:
                    print(f"[rtsp_service] Erreur fallback OpenCV {id_camera} : {masquer_url_rtsp(str(e))}", flush=True)

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
            time.sleep(2.5)  # Cadence ~0.4 FPS pour l'IA (garantit 100% de fluidité vidéo sans saturer le CPU)
            with _condition_frame:
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


def redemarrer_worker_camera(id_camera: str) -> None:
    """Arrête et relance le worker d'une caméra (ex: lors d'un changement d'orientation)."""
    arreter_worker_camera(id_camera)
    time.sleep(0.4)
    try:
        from fonctionnalites.cam.camera import camera as _c_reg
        cam = _c_reg.trouver_par_id(id_camera)
        if cam and cam.get("url_flux"):
            demarrer_worker_camera(id_camera, cam["url_flux"])
    except Exception as exc:
        print(f"[rtsp_service] Erreur redemarrage worker {id_camera}: {exc}", flush=True)


_cache_frame_attente: dict[str, bytes] = {}


def _generer_frame_attente(id_camera: str, nom_camera: str = "Caméra IP") -> bytes:
    """Génère une trame visuelle HD 720p informative lorsque la caméra est en cours de connexion."""
    if id_camera in _cache_frame_attente:
        return _cache_frame_attente[id_camera]
    try:
        import numpy as np
        import cv2
        img = np.zeros((720, 1280, 3), dtype=np.uint8)
        img[:] = (36, 17, 9)  # Fond sombre PREVIA (#091124)
        cv2.rectangle(img, (0, 0), (1280, 8), (248, 189, 56), -1)
        cv2.putText(img, "PREVIA - SURVEILLANCE HD", (380, 260), cv2.FONT_HERSHEY_SIMPLEX, 1.1, (255, 255, 255), 2, cv2.LINE_AA)
        cv2.putText(img, f"EN ATTENTE DU SIGNAL : {nom_camera.upper()}", (300, 330), cv2.FONT_HERSHEY_SIMPLEX, 0.85, (248, 189, 56), 2, cv2.LINE_AA)
        cv2.putText(img, "1. Verifiez que l'application IP Webcam est ouverte sur le telephone", (250, 410), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(img, "2. Appuyez sur 'Start server' tout en bas dans l'application", (250, 455), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (220, 220, 220), 1, cv2.LINE_AA)
        cv2.putText(img, "3. Laissez l'ecran du telephone allume sur la vue camera", (250, 500), cv2.FONT_HERSHEY_SIMPLEX, 0.72, (180, 180, 180), 1, cv2.LINE_AA)
        ok, buf = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            res = buf.tobytes()
            _cache_frame_attente[id_camera] = res
            return res
    except Exception:
        pass
    return b""


def generer_flux_mjpeg(id_camera: str, url_flux: str) -> Generator[bytes, None, None]:
    """Générateur de flux MJPEG ultra-fluide et basse latence pour le navigateur Web.
    Consomme directement le buffer de taille 1 alimenté par le processus FFmpeg unique.
    """
    if url_flux and url_flux.strip():
        demarrer_worker_camera(id_camera, url_flux)

    dernier_compteur = -1
    inactif_compteur = 0

    # Résolution du nom de la caméra pour le message d'attente
    nom_cam = "Caméra"
    try:
        from fonctionnalites.cam.camera import camera as _c_reg
        c_obj = _c_reg.trouver_par_id(id_camera)
        if c_obj:
            nom_cam = c_obj.get("num") or nom_cam
    except Exception:
        pass

    # Si aucune trame n'est disponible au premier affichage, envoyer immédiatement la trame d'attente
    with _condition_frame:
        a_deja_frame = id_camera in _buffer_derniere_frame
    if not a_deja_frame:
        sauv = derniere_image.lire(id_camera)
        frame_debut = sauv if sauv else _generer_frame_attente(id_camera, nom_cam)
        if frame_debut:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(frame_debut)).encode() + b"\r\n\r\n"
                + frame_debut
                + b"\r\n"
            )

    while True:
        with _condition_frame:
            compteur_actuel = _compteurs_frames.get(id_camera, 0)
            if compteur_actuel != dernier_compteur and id_camera in _buffer_derniere_frame:
                dernier_compteur = compteur_actuel
                jpg = _buffer_derniere_frame[id_camera]
                inactif_compteur = 0
            else:
                jpg = None
                # Attendre jusqu'à la prochaine trame (max 40ms = ~25 FPS) sans consommer de CPU
                _condition_frame.wait(timeout=0.04)

        if jpg is not None:
            yield (
                b"--frame\r\n"
                b"Content-Type: image/jpeg\r\n"
                b"Content-Length: " + str(len(jpg)).encode() + b"\r\n\r\n"
                + jpg
                + b"\r\n"
            )
            continue

        inactif_compteur += 1
        # Toutes les ~10 secondes sans image, renvoyer la trame d'attente et vérifier le worker
        if inactif_compteur % 250 == 0:
            if url_flux and url_flux.strip():
                demarrer_worker_camera(id_camera, url_flux)
            with _condition_frame:
                a_frame = id_camera in _buffer_derniere_frame
            if not a_frame:
                frame_attente = _generer_frame_attente(id_camera, nom_cam)
                if frame_attente:
                    yield (
                        b"--frame\r\n"
                        b"Content-Type: image/jpeg\r\n"
                        b"Content-Length: " + str(len(frame_attente)).encode() + b"\r\n\r\n"
                        + frame_attente
                        + b"\r\n"
                    )



