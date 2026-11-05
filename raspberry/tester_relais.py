#!/usr/bin/env python3
"""Test de câblage : allume la lampe puis la sirène, une par une.

À lancer SUR LE RASPBERRY, à la main, après avoir branché les relais :
    sudo systemctl stop previa-api          # libère les broches
    python3 ~/tech-impact/raspberry/tester_relais.py
    sudo systemctl start previa-api

Lit /etc/previa/gpio.env (mêmes réglages que PREVIA). Options :
    --lampe 17 --sirene 27 --actif-haut --auto (sans pause entre les étapes)
Débranchez ou couvrez la sirène si le bruit gêne : le test la fait sonner
1 seconde."""
import argparse
import os
import sys
import time


def lire_env(chemin="/etc/previa/gpio.env"):
    valeurs = {}
    try:
        for ligne in open(chemin, encoding="utf-8"):
            ligne = ligne.strip()
            if ligne and not ligne.startswith("#") and "=" in ligne:
                cle, val = ligne.split("=", 1)
                valeurs[cle.strip()] = val.strip()
    except OSError:
        pass
    return valeurs


env = lire_env()
ap = argparse.ArgumentParser()
ap.add_argument("--lampe", type=int, default=int(env.get("PREVIA_GPIO_LAMPE", os.environ.get("PREVIA_GPIO_LAMPE", 17))))
ap.add_argument("--sirene", type=int, default=int(env.get("PREVIA_GPIO_SIRENE", os.environ.get("PREVIA_GPIO_SIRENE", 27))))
ap.add_argument("--actif-haut", action="store_true", help="relais actif à 3,3 V (par défaut : actif à 0 V)")
ap.add_argument("--auto", action="store_true")
a = ap.parse_args()
actif_bas = not a.actif_haut and env.get("PREVIA_RELAIS_ACTIF_BAS", "1") not in ("0", "false", "non")

try:
    from gpiozero import OutputDevice
except ImportError:
    sys.exit("gpiozero absent : sudo apt install python3-gpiozero python3-lgpio")

try:
    lampe = OutputDevice(a.lampe, active_high=not actif_bas, initial_value=False)
    sirene = OutputDevice(a.sirene, active_high=not actif_bas, initial_value=False)
except Exception as exc:
    sys.exit(f"Impossible de prendre les broches ({exc}).\n"
             "-> PREVIA les utilise peut-être : sudo systemctl stop previa-api\n"
             "-> ou droits insuffisants : lancez avec sudo, ou ajoutez l'utilisateur au groupe gpio.")

print(f"Lampe = BCM{a.lampe}, sirène = BCM{a.sirene}, relais {'actif bas' if actif_bas else 'actif haut'}")


def etape(nom, appareil, duree):
    if not a.auto:
        input(f"\n[Entrée] pour allumer {nom} pendant {duree} s... ")
    print(f"  {nom} : ALLUMÉE")
    appareil.on()
    time.sleep(duree)
    appareil.off()
    print(f"  {nom} : éteinte")


try:
    etape("la LAMPE", lampe, 3)
    etape("la SIRÈNE", sirene, 1)
    print("\nSi une pièce a fait l'inverse (allumée au repos, éteinte pendant le test),")
    print("changez PREVIA_RELAIS_ACTIF_BAS dans /etc/previa/gpio.env, puis relancez ce test.")
    print("Si rien ne s'est passé : vérifiez l'alimentation 5 V du relais, la masse (GND) et les numéros de broches.")
finally:
    lampe.off()
    sirene.off()
    lampe.close()
    sirene.close()
