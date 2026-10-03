"""Liste des ESP32 alarme détectés sur le réseau local, et relais vers
leur API HTTP, pour la page admin "configAlerte" (voir
Sidebar.jsx/admin.jsx côté frontend).

Le VRAI travail de découverte (mDNS, service `_previaalarme._tcp.local.`
annoncé par chaque ESP32, voir demarrerMdnsClient() dans
migration/arduino/esp/esp.ino) se fait dans docker/mdns_previa.py, qui
tourne sur la machine HÔTE et pas dans ce conteneur — même raison que
previa.local est annoncé depuis l'hôte : le trafic multicast ne sort pas
de la VM Docker Desktop cachée sur Windows/Mac (voir la docstring de ce
script pour le détail). `lister()` ne fait que LIRE le fichier que
mdns_previa.py tient à jour, monté en lecture seule dans le conteneur
(voir docker-compose.yml, service backend, `esp_decouverts.json:ro`).

RELAIS, pas juste liste : chaque ESP a bien son API en CORS ouvert
(voir ajouterEntetesCors() dans esp.ino), donc le navigateur POURRAIT
l'appeler directement -- mais l'admin est servi en HTTPS (port 5173,
certificat auto-signé, voir docker/nginx.conf) et l'ESP répond en HTTP
simple (port 80, un microcontrôleur ne fait pas de TLS) : un appel
fetch() direct depuis une page HTTPS vers du HTTP est du "contenu
mixte", bloqué par tous les navigateurs modernes, silencieusement.
Ce backend, lui, n'est pas un navigateur : un appel serveur-à-serveur
HTTP n'a pas cette restriction, donc c'est ici qu'on relaie."""
import json
from pathlib import Path

import requests

FICHIER = Path("/app/esp_decouverts.json")
DELAI_S = 3  # un ESP32 sur un Wi-Fi capricieux ne doit pas bloquer la page admin


def lister() -> list[dict]:
    """Module ESP32 désactivé du périmètre."""
    return []


def _trouver_ip(id_appareil: str) -> str | None:
    for appareil in lister():
        if appareil.get("id") == id_appareil:
            return appareil.get("ip")
    return None


def etat(id_appareil: str) -> dict:
    ip = _trouver_ip(id_appareil)
    if ip is None:
        raise LookupError(f"ESP {id_appareil} non trouvé (plus sur le réseau ?)")
    reponse = requests.get(f"http://{ip}/api/etat", timeout=DELAI_S)
    reponse.raise_for_status()
    return reponse.json()


def ajouter_reseau(id_appareil: str, ssid: str, mot_de_passe: str) -> dict:
    ip = _trouver_ip(id_appareil)
    if ip is None:
        raise LookupError(f"ESP {id_appareil} non trouvé (plus sur le réseau ?)")
    reponse = requests.post(f"http://{ip}/api/reseaux", data={"ssid": ssid, "password": mot_de_passe}, timeout=DELAI_S)
    reponse.raise_for_status()
    return reponse.json()


def supprimer_reseau(id_appareil: str, ssid: str) -> dict:
    ip = _trouver_ip(id_appareil)
    if ip is None:
        raise LookupError(f"ESP {id_appareil} non trouvé (plus sur le réseau ?)")
    reponse = requests.post(f"http://{ip}/api/reseaux/supprimer", data={"ssid": ssid}, timeout=DELAI_S)
    reponse.raise_for_status()
    return reponse.json()


def basculer(id_appareil: str, ssid: str) -> dict:
    ip = _trouver_ip(id_appareil)
    if ip is None:
        raise LookupError(f"ESP {id_appareil} non trouvé (plus sur le réseau ?)")
    # L'ESP répond AVANT de couper le Wi-Fi pour basculer (voir
    # handleApiBasculer() dans esp.ino) -- ce timeout suffit largement.
    reponse = requests.post(f"http://{ip}/api/basculer", data={"ssid": ssid}, timeout=DELAI_S)
    reponse.raise_for_status()
    return reponse.json()
