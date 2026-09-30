#!/usr/bin/env python3
"""
=============================================================================
PREVIA - LANCEUR UNIVERSEL 1-CLIC SUR RASPBERRY PI
=============================================================================
1. Recherche automatiquement le Raspberry Pi (mDNS, Ethernet, Wi-Fi local).
2. Synchronise les fichiers du projet en direct.
3. Démarre le serveur complet PREVIA sur le Raspberry Pi.
4. Affiche les logs en temps réel dans votre console.
5. Ouvre automatiquement l'interface web dans votre navigateur.
=============================================================================
"""

import os
import sys
import time
import shlex
import stat
import socket
import logging
import paramiko
import tarfile
import io
import webbrowser
import concurrent.futures
from pathlib import Path
try:
    from paramiko.rsakey import RSAKey
    paramiko.Transport._key_info['ssh-rsa'] = RSAKey
    paramiko.Transport._preferred_keys = ('rsa-sha2-512', 'rsa-sha2-256', 'ssh-rsa', 'ssh-dss', 'ecdsa-sha2-nistp256', 'ssh-ed25519')
except Exception:
    pass

# Réduire le bruit des exceptions SSH pendant le scan des sous-réseaux
logging.getLogger("paramiko").setLevel(logging.CRITICAL)

if sys.platform == 'win32':
    try:
        os.system('chcp 65001 >nul 2>&1')
    except Exception:
        pass

if hasattr(sys.stdout, 'reconfigure'):
    try:
        sys.stdout.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

USERNAME = "previa"
PASSWORD = "Sentinel2k26"
LOCAL_DIR = Path(__file__).resolve().parent

def executer_commande_distante(ssh, commande, sudo=False):
    commande_distante = f"sudo -S -p '' {commande}" if sudo else commande
    stdin, stdout, stderr = ssh.exec_command(commande_distante)
    if sudo:
        stdin.write(PASSWORD + "\n")
        stdin.flush()

    sortie = stdout.read().decode("utf-8", errors="replace")
    erreur = stderr.read().decode("utf-8", errors="replace")
    code = stdout.channel.recv_exit_status()
    if code != 0:
        details = erreur.strip() or sortie.strip() or commande
        raise RuntimeError(f"Commande distante echouee (code {code}) : {details}")
    return sortie

def get_local_subnets():
    """Détecte dynamiquement TOUS les sous-réseaux actifs sur le PC (Wi-Fi, Ethernet, Hotspot)."""
    subnets = ["192.168.11", "192.168.137", "169.254.180", "192.168.1", "10.154.71", "192.168.43", "172.20.10"]
    try:
        hostname = socket.gethostname()
        for ip in socket.gethostbyname_ex(hostname)[2]:
            if not ip.startswith("127."):
                parts = ip.split(".")
                if len(parts) == 4:
                    prefix = f"{parts[0]}.{parts[1]}.{parts[2]}"
                    if prefix not in subnets:
                        subnets.insert(0, prefix)
    except Exception:
        pass
    return subnets

def test_ssh_candidate(host):
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        s.settimeout(0.3)
        res = s.connect_ex((host, 22))
        s.close()
        if res == 0:
            client = paramiko.SSHClient()
            client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
            try:
                client.connect(host, username=USERNAME, password=PASSWORD, timeout=1.5, disabled_algorithms={'pubkeys': ['rsa-sha2-512', 'rsa-sha2-256']})
                client.close()
                return host
            except Exception:
                try:
                    client.connect(host, username=USERNAME, password=PASSWORD, timeout=1.5)
                    client.close()
                    return host
                except Exception:
                    client.close()
    except Exception:
        pass
    return None

def detecter_raspberry(max_tentatives=3):
    for tentative in range(1, max_tentatives + 1):
        if tentative > 1:
            print(f"\n[>] Tentative {tentative}/{max_tentatives} : recherche du Raspberry Pi...")
        else:
            print("\n[*] Recherche automatique du Raspberry Pi sur le réseau actif...")

        # 1. Résolution dynamique mDNS et IPs Hotspot Wi-Fi PREVIA-CAM
        direct_candidates = ["previa.local", "raspberrypi.local", "192.168.11.2", "192.168.11.233", "192.168.1.2", "192.168.137.233", "192.168.4.1", "169.254.180.233"]
        for host in direct_candidates:
            res = test_ssh_candidate(host)
            if res:
                print(f"  [+] Raspberry Pi trouve (Wi-Fi Hotspot / mDNS) : {res}")
                return res

        # 2. Détection automatique du réseau Wi-Fi actif de l'utilisateur
        subnets = get_local_subnets()
        all_ips = []
        for subnet in subnets:
            for i in range(1, 255):
                all_ips.append(f"{subnet}.{i}")

        print(f"  [>] Scan universel des reseaux relies au PC ({len(subnets)} sous-reseaux)...")
        with concurrent.futures.ThreadPoolExecutor(max_workers=100) as executor:
            futures = {executor.submit(test_ssh_candidate, ip): ip for ip in all_ips}
            for future in concurrent.futures.as_completed(futures):
                res = future.result()
                if res:
                    print(f"  [+] Raspberry Pi detecte automatiquement sur le réseau : {res}")
                    return res

        if tentative < max_tentatives:
            print("  [...] En attente de l'initialisation du reseau (5 secondes)...")
            time.sleep(5)

    return None

def verifier_stockage_pi(ssh):
    options = executer_commande_distante(
        ssh, 'findmnt -n -o OPTIONS --target "$HOME/tech-impact"'
    ).strip().split(",")
    if "ro" in options or "emergency_ro" in options:
        raise RuntimeError(
            "Le systeme de fichiers du Raspberry est en lecture seule "
            "(emergency_ro). Verifiez le stockage avant tout deploiement."
        )

def synchroniser_code(ssh):
    verifier_stockage_pi(ssh)
    print("\n[*] [1/3] Synchronisation du code vers le Raspberry Pi...")
    tar_stream = io.BytesIO()

    # Liste ciblée des dossiers et fichiers essentiels à synchroniser
    items_to_sync = [
        ("migration/backend", "migration/backend"),
        ("migration/frontend/web/dist", "migration/frontend/web/dist"),
        ("migration/frontend/web/src", "migration/frontend/web/src"),
        ("migration/frontend/web/serveur_web_https.py", "migration/frontend/web/serveur_web_https.py"),
        ("migration/db", "migration/db"),
        ("docker", "docker"),
        ("lancer_previa.py", "lancer_previa.py"),
    ]

    def filtrer_tar(membre):
        nom = membre.name.lower()
        # Exclure les dossiers et fichiers temporaires / lourds
        if '__pycache__' in nom or '.git' in nom or 'node_modules' in nom or '.pytest_cache' in nom:
            return None
        if nom.endswith('.mp4') or nom.endswith('.avi') or nom.endswith('.tar.gz') or nom.endswith('.onnx') or nom.endswith('.pt'):
            return None

        membre.mode |= stat.S_IWUSR
        if membre.isdir():
            membre.mode |= stat.S_IXUSR
        return membre

    with tarfile.open(fileobj=tar_stream, mode="w:gz") as tar:
        for rel_src, rel_dest in items_to_sync:
            src_path = LOCAL_DIR / rel_src
            if src_path.exists():
                tar.add(str(src_path), arcname=rel_dest, filter=filtrer_tar)

    tar_stream.seek(0)
    data = tar_stream.getvalue()
    print(f"  [+] Taille du transfert : {len(data) / (1024*1024):.2f} Mo")

    sftp = ssh.open_sftp()
    with sftp.file("/tmp/previa_sync.tar.gz", "wb") as f:
        f.write(data)
    sftp.close()

    # Extraction et redémarrage propre
    commande_extraction = (
        "mkdir -p ~/tech-impact && "
        "for path in migration/backend migration/frontend/web/dist "
        "migration/frontend/web/src docker; do "
        "[ ! -e \"$HOME/tech-impact/$path\" ] || chmod -R u+rwX \"$HOME/tech-impact/$path\" || true; "
        "done && "
        "tar -xzf /tmp/previa_sync.tar.gz --overwrite -m -C \"$HOME/tech-impact\"; "
        "status=$?; rm -f /tmp/previa_sync.tar.gz; exit $status"
    )
    executer_commande_distante(ssh, commande_extraction)
    print("  [OK] Code synchronise sur le Raspberry Pi !")

def synchroniser_modeles(ssh):
    verifier_stockage_pi(ssh)
    models_dir = LOCAL_DIR / "migration" / "models"
    if not models_dir.is_dir():
        raise FileNotFoundError(f"Dossier de modeles absent : {models_dir}")

    fichiers = sorted(path for path in models_dir.rglob("*") if path.is_file())
    if not fichiers:
        raise FileNotFoundError(f"Aucun modele IA trouve dans : {models_dir}")

    executer_commande_distante(ssh, "mkdir -p ~/tech-impact/migration/models")
    commande_inventaire = (
        "cd \"$HOME/tech-impact\" && "
        "find migration/models -type f -printf '%p\\t%s\\n'"
    )
    inventaire_pi = {}
    for ligne in executer_commande_distante(ssh, commande_inventaire).splitlines():
        relatif, taille = ligne.split("\t", 1)
        inventaire_pi[relatif] = int(taille)

    a_transferer = [
        (path.relative_to(LOCAL_DIR).as_posix(), path)
        for path in fichiers
        if inventaire_pi.get(path.relative_to(LOCAL_DIR).as_posix()) != path.stat().st_size
    ]
    if not a_transferer:
        print(f"  [OK] {len(fichiers)} fichiers de modeles presents, tailles verifiees.")
        return

    sftp = ssh.open_sftp()
    try:
        for relatif, path in a_transferer:
            destination = f"/home/{USERNAME}/tech-impact/{relatif}"
            dossier = destination.rsplit("/", 1)[0]
            morceaux = dossier.strip("/").split("/")
            courant = ""
            for morceau in morceaux:
                courant += f"/{morceau}"
                try:
                    sftp.stat(courant)
                except OSError:
                    sftp.mkdir(courant)

            temporaire = destination + ".previa-upload"
            sftp.put(str(path), temporaire)
            if sftp.stat(temporaire).st_size != path.stat().st_size:
                sftp.remove(temporaire)
                raise IOError(f"Transfert incomplet du modele : {relatif}")
            commande_remplacement = (
                f"mv -f -- {shlex.quote(temporaire)} {shlex.quote(destination)}"
            )
            executer_commande_distante(ssh, commande_remplacement)
    finally:
        sftp.close()

    print(f"  [OK] {len(a_transferer)} modele(s) synchronise(s) sur {len(fichiers)}.")

def executer_sur_pi(host):
    print(f"\n[>] [2/3] Connexion SSH a {host}...")
    ssh = paramiko.SSHClient()
    ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    try:
        ssh.connect(host, username=USERNAME, password=PASSWORD, timeout=10, disabled_algorithms={'pubkeys': ['rsa-sha2-512', 'rsa-sha2-256']})
    except Exception:
        ssh.connect(host, username=USERNAME, password=PASSWORD, timeout=10)

    synchroniser_code(ssh)
    synchroniser_modeles(ssh)

    print("\n[*] [3/3] Demarrage du systeme PREVIA sur le Raspberry Pi...")
    
    # Ouvrir l'interface dans le navigateur après 4 secondes
    url_web = f"https://{host}:5173"
    print(f"\n======================================================================")
    print(f"  PREVIA EST EN COURS D'EXECUTION SUR LE RASPBERRY PI ({host})")
    print(f"======================================================================")
    print(f"  [+] Interface Web (PC)   :  {url_web}")
    print(f"  [+] Lien mDNS            :  https://previa.local:5173")
    print(f"  [+] Documentation API    :  https://{host}:8012/docs")
    print(f"----------------------------------------------------------------------")
    print(f"  [!] Appuyez sur [Ctrl + C] pour stopper la console.")
    print(f"======================================================================\n")

    # Redémarrage propre du service central sur le Raspberry Pi
    etat_services = executer_commande_distante(
        ssh,
        "systemctl restart previa-api.service previa-web.service && "
        "systemctl is-active previa-api.service previa-web.service",
        sudo=True,
    )
    print(f"  [OK] Services PREVIA : {etat_services.strip().replace(chr(10), ', ')}")

    # Lancement de la surveillance des logs en direct
    cmd = "journalctl -u previa-api.service -u previa-web.service -f -n 25"
    stdin, stdout, stderr = ssh.exec_command(cmd, get_pty=True)

    # Ouvrir la page web automatiquement en tâche de fond
    def open_browser():
        time.sleep(2)
        try:
            webbrowser.open(url_web)
        except Exception:
            pass

    import threading
    threading.Thread(target=open_browser, daemon=True).start()

    try:
        while not stdout.channel.exit_status_ready():
            if stdout.channel.recv_ready():
                data = stdout.channel.recv(1024).decode("utf-8", errors="replace")
                sys.stdout.write(data)
                sys.stdout.flush()
            time.sleep(0.01)
    except KeyboardInterrupt:
        print("\n\n[!] Deconnexion de la console. Le serveur PREVIA continue de tourner en arriere-plan sur le Pi.")
    finally:
        ssh.close()

def main():
    print("======================================================================")
    print("      PREVIA - LANCEUR 1-CLIC SUR RASPBERRY PI")
    print("======================================================================")

    host = detecter_raspberry()
    if not host:
        print("\n[!] Impossible de trouver le Raspberry Pi.")
        print("    Verifiez que le Raspberry Pi est allume et branche (ou reseau Ethernet).")
        input("\nAppuyez sur Entree pour quitter...")
        sys.exit(1)

    executer_sur_pi(host)

if __name__ == "__main__":
    main()
