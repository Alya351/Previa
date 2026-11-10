# -*- coding: utf-8 -*-
"""tester_pi.py : batterie de tests EN LECTURE SEULE sur le Raspberry (rien n'est modifié).

Se connecte comme le lanceur (même .env, même détection), exécute des commandes de contrôle
et écrit tout le résultat dans scratch/resultat_tests_pi.txt (que Claude peut relire).
Aucun mot de passe n'est écrit dans le fichier. Les identifiants RTSP sont masqués.
"""
import datetime
import re
import sys
from pathlib import Path

import lancer_sur_raspberry as L

SORTIE = Path(L.LOCAL_DIR) / "scratch" / "resultat_tests_pi.txt"

CAMERA_TEST = "192.168.11.103"   # adresse vue dans le journal PREVIA

TESTS = [
    ("1. Système", [
        ("version", "uname -a"),
        ("uptime", "uptime"),
        ("mémoire (Mo)", "free -m"),
        ("température", "vcgencmd measure_temp"),
        ("alimentation (0x0 = OK)", "vcgencmd get_throttled"),
        ("disque", "df -h / | tail -1"),
    ]),
    ("2. Réseau", [
        ("interfaces", "ip -br addr"),
        ("routes", "ip route"),
        ("NetworkManager", "nmcli -t -f DEVICE,TYPE,STATE,CONNECTION device status"),
        ("Internet (204 = OK)", "curl -s -m 6 -o /dev/null -w '%{http_code}' http://connectivitycheck.gstatic.com/generate_204"),
    ]),
    ("3. Accès à distance (Tailscale)", [
        ("tailscale status", "tailscale status 2>&1 | head -8"),
        ("funnel", "tailscale funnel status 2>&1 | head -8"),
    ]),
    ("4. Services PREVIA", [
        ("actifs ?", "systemctl is-active previa-api previa-web"),
        ("redémarrages API", "systemctl show previa-api -p NRestarts -p ActiveEnterTimestamp"),
        ("API HTTPS 8012 /docs", "curl -sk -m 8 -o /dev/null -w '%{http_code} en %{time_total}s' https://127.0.0.1:8012/docs"),
        ("Web 5173", "curl -sk -m 8 -o /dev/null -w '%{http_code} en %{time_total}s' https://127.0.0.1:5173/"),
        ("Relais mobile 8080", "curl -s -m 8 -o /dev/null -w '%{http_code} en %{time_total}s' http://127.0.0.1:8080/"),
    ]),
    ("5. Caméras", [
        (f"ping {CAMERA_TEST}", f"ping -c 2 -W 2 {CAMERA_TEST} 2>&1 | tail -3"),
        (f"port RTSP 554 de {CAMERA_TEST}", f"timeout 4 bash -c 'echo > /dev/tcp/{CAMERA_TEST}/554' && echo ouvert || echo ferme"),
    ]),
    ("6. Charge processeur (top)", [
        ("processus les plus gourmands", "ps -eo pcpu,pmem,etime,comm --sort=-pcpu | head -8"),
        ("ffmpeg en cours", "pgrep -a ffmpeg | sed -E 's#rtsp://[^ @]*@#rtsp://***@#' | cut -c1-200 || true"),
    ]),
    ("7. Journal PREVIA (60 dernières lignes, sans mots de passe)", [
        ("journal", "journalctl -u previa-api -n 60 --no-pager 2>&1 | sed -E 's#rtsp://[^ @]*@#rtsp://***@#g' | cut -c1-220"),
    ]),
]


def executer(ssh, commande, sudo=False):
    cmd = f"sudo -S -p '' bash -lc {repr(commande)}" if sudo else commande
    try:
        stdin, stdout, stderr = ssh.exec_command(cmd, timeout=60)
        if sudo:
            stdin.write(L.PASSWORD + "\n")
            stdin.flush()
        sortie = stdout.read().decode("utf-8", errors="replace")
        erreur = stderr.read().decode("utf-8", errors="replace")
    except Exception as exc:
        return f"(échec : {exc})"
    texte = (sortie + ("\n" + erreur if erreur.strip() else "")).strip()
    return texte or "(aucune sortie)"


def main():
    L.verifier_mot_de_passe()
    hote = L.detecter_raspberry()
    if not hote:
        print("[!] Raspberry introuvable. Vérifiez qu'il est allumé et branché.")
        input("Entrée pour quitter...")
        return 1
    ssh = L.paramiko.SSHClient()
    ssh.set_missing_host_key_policy(L.paramiko.AutoAddPolicy())
    ssh.connect(hote, username=L.USERNAME, password=L.PASSWORD, timeout=10)

    lignes = [f"TESTS PREVIA (lecture seule) — {datetime.datetime.now():%d/%m/%Y %H:%M:%S} — Raspberry {hote}", ""]
    for titre, cmds in TESTS:
        lignes += ["=" * 70, titre, "=" * 70]
        for nom, cmd in cmds:
            sudo = cmd.startswith("journalctl")
            res = executer(ssh, cmd, sudo=sudo)
            res = res.replace(L.PASSWORD, "***") if L.PASSWORD else res
            lignes.append(f"--- {nom}")
            lignes.append(res)
            lignes.append("")
    ssh.close()

    texte = "\n".join(lignes)
    SORTIE.parent.mkdir(parents=True, exist_ok=True)
    SORTIE.write_text(texte, encoding="utf-8")
    print(texte)
    print(f"\n[OK] Résultat enregistré : {SORTIE}")
    return 0


if __name__ == "__main__":
    code = main()
    try:
        input("\nAppuyez sur Entrée pour fermer...")
    except Exception:
        pass
    sys.exit(code)
