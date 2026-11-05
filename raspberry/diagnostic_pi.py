#!/usr/bin/env python3
"""Diagnostic PREVIA a lancer SUR LE RASPBERRY (ou via LANCER_SUR_RASPBERRY.bat).

    sudo python3 ~/tech-impact/raspberry/diagnostic_pi.py [--rapide] [--attendre-modeles 240]

Verifie en ~1 minute ce qui peut faire "lacher" la presentation : memoire,
temperature, alimentation, services, ports ouverts, securite de l'API, modeles
IA reellement charges, sirene/lampe, charge video. Chaque ligne est
[OK] / [ATTENTION] / [ECHEC] / [INFO] ; code de sortie 1 s'il y a un [ECHEC].
Bibliotheque standard uniquement (aucune installation)."""
import argparse, json, os, platform, re, shutil, socket, ssl, statistics, subprocess, sys, time
import urllib.error, urllib.request

APP = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
COMPTE = {"OK": 0, "ATTENTION": 0, "ECHEC": 0}
CTX = ssl.create_default_context(); CTX.check_hostname = False; CTX.verify_mode = ssl.CERT_NONE


def ligne(niveau, texte, detail=""):
    if niveau in COMPTE:
        COMPTE[niveau] += 1
    print(f"  [{niveau}] {texte}" + (f"\n         -> {detail}" if detail else ""), flush=True)


def titre(t):
    print(f"\n=== {t}", flush=True)


def cmd(args, timeout=20):
    try:
        r = subprocess.run(args, capture_output=True, text=True, timeout=timeout)
        return (r.stdout or "") + (r.stderr or "") if r.returncode is not None else ""
    except Exception:
        return ""


def lire(chemin, defaut=""):
    try:
        return open(chemin, encoding="utf-8", errors="replace").read()
    except OSError:
        return defaut


def http(url, methode="GET", corps=None, timeout=8):
    """Retourne (code, ms, texte) ; code 0 si injoignable."""
    t = time.time()
    try:
        req = urllib.request.Request(url, data=corps, method=methode, headers={"Content-Type": "application/json"} if corps else {})
        with urllib.request.urlopen(req, context=CTX, timeout=timeout) as r:
            return r.status, (time.time() - t) * 1000, r.read(2000).decode("utf-8", "replace")
    except urllib.error.HTTPError as e:
        return e.code, (time.time() - t) * 1000, ""
    except Exception as e:
        return 0, (time.time() - t) * 1000, str(e)


def cpu_pct(secondes=3.0):
    def lire_stat():
        v = [int(x) for x in lire("/proc/stat").splitlines()[0].split()[1:8]]
        return sum(v), v[3] + v[4]
    t0, i0 = lire_stat(); time.sleep(secondes); t1, i1 = lire_stat()
    return 100.0 * (1 - (i1 - i0) / max(1, (t1 - t0)))


# ------------------------------------------------------------------ 1
def materiel(a):
    titre("1. Materiel : memoire, temperature, alimentation, disque")
    modele = lire("/proc/device-tree/model").strip("\x00\n ") or platform.platform()
    ligne("INFO", f"Machine : {modele} | {platform.machine()} | {os.cpu_count()} coeurs")
    if platform.machine() != "aarch64":
        ligne("ATTENTION", "Systeme non 64 bits (aarch64)", "PyTorch exige un Raspberry Pi OS 64 bits.")
    mem = {k: int(re.findall(r"\d+", v)[0]) for k, v in (l.split(":", 1) for l in lire("/proc/meminfo").splitlines() if ":" in l)}
    total, dispo, swap = mem.get("MemTotal", 0) / 1048576, mem.get("MemAvailable", 0) / 1048576, mem.get("SwapTotal", 0) / 1048576
    if total and total < 3.5:
        ligne("ECHEC", f"RAM {total:.1f} Go : insuffisant", "Les modeles IA demandent ~2,5 Go ; prevoir 4 Go minimum, 8 Go conseille.")
    elif total and total < 7:
        ligne("ATTENTION", f"RAM {total:.1f} Go (disponible {dispo:.1f} Go) : juste pour 3 cameras + IA", "8 Go conseille ; surveillez la memoire pendant la demo.")
    else:
        ligne("OK", f"RAM {total:.1f} Go (disponible {dispo:.1f} Go)")
    if swap < 0.5 and total < 7:
        ligne("ATTENTION", "Pas de swap/zram", "Un pic de memoire tuerait l'API sans prevenir. Raspberry Pi OS : 'sudo dphys-swapfile' ou zram.")
    else:
        ligne("OK", f"Swap {swap:.1f} Go")
    t = lire("/sys/class/thermal/thermal_zone0/temp").strip()
    if t.isdigit():
        deg = int(t) / 1000
        ligne("ECHEC" if deg >= 80 else "ATTENTION" if deg >= 70 else "OK", f"Temperature processeur {deg:.0f} C",
              "Au-dela de 80 C le Raspberry ralentit : ajoutez dissipateur/ventilateur." if deg >= 70 else "")
    th = cmd(["vcgencmd", "get_throttled"]).strip()
    m = re.search(r"0x([0-9a-fA-F]+)", th)
    if m:
        v = int(m.group(1), 16)
        if v & 0x1:
            ligne("ECHEC", "SOUS-TENSION en ce moment", "Alimentation insuffisante (officielle 5 V / 3 A requise) : le systeme va planter ou ralentir.")
        elif v & 0x5:
            ligne("ECHEC", "Processeur bride (tension/temperature)")
        elif v & 0x50000:
            ligne("ATTENTION", "Sous-tension ou bridage detecte depuis le demarrage", f"vcgencmd get_throttled = 0x{v:x} : changez l'alimentation/cable.")
        else:
            ligne("OK", "Alimentation et frequence stables (aucun bridage)")
    libre = shutil.disk_usage(APP).free / 1e9
    ligne("ATTENTION" if libre < 3 else "OK", f"Espace disque libre : {libre:.1f} Go")
    if not a.rapide:
        c = cpu_pct(3)
        ligne("ATTENTION" if c > 85 else "OK", f"Charge processeur actuelle : {c:.0f} % (charge moyenne {os.getloadavg()[0]:.1f})")


# ------------------------------------------------------------------ 2
def services():
    titre("2. Services PREVIA")
    if "Failed to connect" in cmd(["systemctl", "is-active", "previa-api"]) or not shutil.which("systemctl"):
        ligne("ATTENTION", "systemd indisponible : services non verifies (machine de test ?)")
        return
    for s in ("previa-api", "previa-web"):
        etat = cmd(["systemctl", "is-active", s]).strip().splitlines()[-1:] or ["?"]
        show = cmd(["systemctl", "show", f"{s}.service", "-p", "NRestarts", "-p", "Environment", "-p", "MainPID"])
        if etat[0] != "active":
            ligne("ECHEC", f"{s} : {etat[0]}", f"journalctl -u {s} -n 60 --no-pager")
            continue
        n = re.search(r"NRestarts=(\d+)", show)
        ligne("ATTENTION" if n and int(n.group(1)) > 0 else "OK", f"{s} : actif" + (f" ({n.group(1)} redemarrage(s) depuis le lancement)" if n and int(n.group(1)) else ""),
              "Des redemarrages signifient des plantages : voir le journal." if n and int(n.group(1)) else "")
        if "PREVIA_MODE_DEV=1" in show:
            ligne("ECHEC", f"{s} : MODE DEVELOPPEMENT ACTIF (PREVIA_MODE_DEV=1)", "N'importe quel mot de passe est accepte. A retirer du service.")
    activ = cmd(["systemctl", "is-enabled", "previa-api"]).strip()
    ligne("OK" if activ == "enabled" else "ATTENTION", f"Demarrage automatique : {activ or 'inconnu'}")


# ------------------------------------------------------------------ 3
def reseau_et_securite():
    titre("3. Reponse reseau, ports ouverts et securite")
    tmps = []
    for _ in range(10):
        code, ms, _t = http("https://127.0.0.1:8012/alarme/etat"); tmps.append(ms)
        if code != 200:
            break
    if code == 200:
        p95 = sorted(tmps)[int(len(tmps) * 0.9) - 1]
        ligne("OK" if p95 < 500 else "ATTENTION", f"API (8012) : repond, mediane {statistics.median(tmps):.0f} ms, p95 {p95:.0f} ms")
    else:
        ligne("ECHEC", "API (8012) injoignable", f"code {code}")
    for url, nom in (("https://127.0.0.1:5173/", "Web HTTPS (5173)"), ("http://127.0.0.1:8080/", "Web HTTP application mobile (8080)")):
        code, ms, _t = http(url)
        ligne("OK" if code == 200 else "ECHEC", f"{nom} : {'repond' if code == 200 else 'ne repond pas'} ({ms:.0f} ms)")
    ecoute = cmd(["ss", "-ltnH"])
    ports = sorted({int(l.split()[3].rsplit(":", 1)[1]) for l in ecoute.splitlines() if len(l.split()) >= 4 and not l.split()[3].startswith(("127.", "[::1]"))})
    attendus = {22, 5173, 8080, 8012, 80, 443}
    insolites = [p for p in ports if p not in attendus]
    ligne("INFO", f"Ports TCP ouverts sur le reseau : {ports}")
    if insolites:
        ligne("ATTENTION", f"Ports non prevus : {insolites}", "Fermez ce qui est inutile (sudo ss -ltnp pour voir quel programme).")
    pw = cmd(["sshd", "-T"], 10)
    if re.search(r"passwordauthentication yes", pw):
        ligne("INFO", "SSH accepte le mot de passe", "Utilise surtout par votre .bat ; changez le mot de passe par defaut avant un client.")
    code, _ms, _t = http("https://127.0.0.1:8012/utilisateurs/connexion", "POST", json.dumps({"email": "admin@previa.local", "mot_de_passe": "x" + str(time.time())}).encode())
    if code == 401:
        ligne("OK", "Connexion : un faux mot de passe est refuse (mode production)")
    elif code == 200:
        ligne("ECHEC", "Connexion : un faux mot de passe est ACCEPTE", "Mode developpement actif : retirez PREVIA_MODE_DEV du service.")
    elif code:
        ligne("ATTENTION", f"Connexion : reponse inattendue {code}")
    for chemin in ("/alertes", "/cameras"):
        code, _ms, _t = http("https://127.0.0.1:8012" + chemin)
        if code in (401, 403):
            ligne("OK", f"{chemin} : exige une connexion")
        elif code == 200:
            ligne("ECHEC", f"{chemin} : accessible SANS connexion")
        elif code:
            ligne("INFO", f"{chemin} : code {code}")


# ------------------------------------------------------------------ 4
REQUIS = ["yolo11n-seg.pt", "yolo11n-pose.pt", "clothing-yolov8s-seg.pt", "segformer-clothes/model.safetensors",
          "pedestrian-gender/model.safetensors", "osnet-reid/osnet_x1_0_msmt17.pth",
          "insightface/models/buffalo_l/det_10g.onnx", "insightface/models/buffalo_l/w600k_r50.onnx",
          "insightface/models/buffalo_l/genderage.onnx", "insightface/models/buffalo_l/1k3d68.onnx"]


def journal(n=4000):
    return cmd(["journalctl", "-u", "previa-api.service", "-n", str(n), "--no-pager", "-o", "cat"], 30)


def modeles(a):
    titre("4. Modeles IA : fichiers presents et chargement reel")
    base = os.path.join(APP, "migration", "models")
    manquants = [f for f in REQUIS if not os.path.exists(os.path.join(base, f))]
    if manquants:
        ligne("ECHEC", f"{len(manquants)} fichier(s) modele manquant(s)", ", ".join(manquants))
    else:
        ligne("OK", f"Les {len(REQUIS)} fichiers modeles necessaires sont presents")
    fin = time.time() + a.attendre_modeles
    j = journal()
    while "modèles prêts" not in j and time.time() < fin:
        print(f"    ... chargement des modeles en cours ({int(fin - time.time())} s max)", flush=True)
        time.sleep(15); j = journal()
    if "modèles prêts" in j:
        ligne("OK", "Les modeles IA sont charges (\"modeles prets\" dans le journal)")
    else:
        ligne("ATTENTION", "Pas de \"modeles prets\" dans le journal", "Normal juste apres le demarrage ; sinon : journalctl -u previa-api -n 200 --no-pager")
    degrade = sorted({re.sub(r"^.*?\[", "[", l).strip()[:140] for l in j.splitlines() if re.search(r"ignoré|non chargé|ModuleNotFoundError|ImportError|CUDA", l)})
    if degrade:
        for d in degrade[:8]:
            ligne("ATTENTION", f"Fonction desactivee : {d}")
    else:
        ligne("OK", "Aucun modele desactive silencieusement (aucun 'ignore' / 'non charge' dans le journal)")
    nb_tb = j.count("Traceback")
    ligne("ATTENTION" if nb_tb > 3 else "OK", f"Erreurs Python dans le journal : {nb_tb}")
    pid = (re.search(r"MainPID=(\d+)", cmd(["systemctl", "show", "previa-api.service", "-p", "MainPID"])) or [None, "0"])[1]
    if pid != "0":
        rss = 0
        for d in os.listdir("/proc"):
            if d.isdigit():
                st = lire(f"/proc/{d}/status")
                if d == pid or re.search(rf"PPid:\s*{pid}\b", st):
                    m = re.search(r"VmRSS:\s*(\d+)", st)
                    rss += int(m.group(1)) if m else 0
        ligne("INFO", f"Memoire utilisee par l'API PREVIA (modeles + cameras) : {rss / 1024:.0f} Mo")
    al = [l for l in j.splitlines() if "[alarme]" in l]
    if al:
        derniere = al[-1].split("[alarme]", 1)[1].strip()
        ligne("OK" if "mode GPIO" in derniere else "ATTENTION", f"Sirene/lampe : {derniere}",
              "" if "mode GPIO" in derniere else "Simulation = aucun relais pilote (normal sans materiel branche).")
    else:
        ligne("ATTENTION", "Etat sirene/lampe introuvable dans le journal")


# ------------------------------------------------------------------ 5
def video(a):
    titre("5. Video : ffmpeg et charge d'encodage par camera")
    ff = shutil.which("ffmpeg")
    if not ff:
        ligne("ECHEC", "ffmpeg absent : AUCUNE camera ne s'affichera", "sudo apt install ffmpeg")
        return
    ligne("OK", "ffmpeg present : " + (cmd([ff, "-version"]).splitlines() or ["?"])[0][:60])
    ligne("INFO" if "h264_v4l2m2m" in cmd([ff, "-hide_banner", "-decoders"]) else "ATTENTION",
          "Decodage H.264 materiel (v4l2m2m) " + ("disponible" if "h264_v4l2m2m" in cmd([ff, "-hide_banner", "-decoders"]) else "non disponible : decodage logiciel, plus de CPU"))
    if a.rapide:
        return
    def vitesse(fps_filtre):
        vf = (fps_filtre + "," if fps_filtre else "") + "scale=1280:720:flags=fast_bilinear"
        t = time.time()
        subprocess.run([ff, "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=30", "-t", "4",
                        "-vf", vf, "-f", "image2pipe", "-vcodec", "mjpeg", "-q:v", "2", "-"], stdout=subprocess.DEVNULL, timeout=120)
        return 4.0 / max(0.01, time.time() - t)
    cores = os.cpu_count() or 4
    for nom, filtre in (("30 images/s (sans limite)", ""), ("15 images/s (PREVIA_VIDEO_FPS=15)", "fps=15")):
        s = vitesse(filtre)
        charge = 3.0 / s
        niv = "ECHEC" if charge > 0.9 * cores else "ATTENTION" if charge > 0.5 * cores else "OK"
        ligne(niv, f"Encodage MJPEG 720p, {nom} : {s:.1f}x temps reel", f"3 cameras = environ {charge:.1f} coeur(s) sur {cores}, SANS compter decodage RTSP ni IA.")


# ------------------------------------------------------------------ 6
def internet():
    titre("6. Internet (information)")
    try:
        socket.gethostbyname("pypi.org"); ligne("INFO", "Internet disponible")
    except OSError:
        ligne("INFO", "Pas d'internet : sans importance pour l'usage, PREVIA fonctionne hors ligne")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--rapide", action="store_true", help="sans mesures longues (processeur, ffmpeg)")
    ap.add_argument("--attendre-modeles", type=int, default=0, help="secondes max a attendre le chargement des modeles")
    a = ap.parse_args()
    print("=" * 66 + "\n  DIAGNOSTIC PREVIA — " + time.strftime("%d/%m/%Y %H:%M:%S") + "\n" + "=" * 66)
    for f in (lambda: materiel(a), services, reseau_et_securite, lambda: modeles(a), lambda: video(a), internet):
        try:
            f()
        except Exception as exc:
            ligne("ATTENTION", f"Verification interrompue : {type(exc).__name__}: {exc}")
    print("\n" + "=" * 66)
    verdict = "PRET POUR LA DEMO" if COMPTE["ECHEC"] == 0 and COMPTE["ATTENTION"] == 0 else \
              "UTILISABLE, avec des points a surveiller" if COMPTE["ECHEC"] == 0 else "PROBLEMES BLOQUANTS : a corriger avant la demo"
    print(f"  {COMPTE['OK']} OK | {COMPTE['ATTENTION']} attention | {COMPTE['ECHEC']} echec  ->  {verdict}\n" + "=" * 66)
    sys.exit(1 if COMPTE["ECHEC"] else 0)


if __name__ == "__main__":
    main()
