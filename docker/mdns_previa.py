"""Annonce PREVIA sur le réseau local via mDNS (previa.local) — pour que
les téléphones et les futures caméras physiques trouvent le serveur tout
seuls, sans qu'un humain aille chercher une IP à chaque changement de
réseau (voir la conversation : "les caméras qui vont venir" n'ont pas
d'écran pour scanner un QR code, il leur faut une vraie découverte
automatique).

Tourne DÉLIBÉRÉMENT sur la machine hôte, PAS dans un conteneur Docker :
sur Windows/Mac, Docker Desktop tourne dans une VM cachée, et le trafic
multicast (ce qu'utilise mDNS) n'en sort jamais vers le vrai réseau
local — exactement le problème déjà rencontré avec `network_mode: host`
pour le reste de la stack (voir docker-compose.yml), qu'on avait
justement abandonné pour cette raison. Un `pip install zeroconf` (pure
Python, aucune dépendance sur avahi/Bonjour du système) suffit ici parce
que ce script s'exécute directement sur le réseau de la vraie machine.

Utilisation :
    python3 mdns_previa.py [port_https] [port_http_mobile]
(par défaut 5173 et 8080, les mêmes que docker-compose.yml/nginx.conf)

Une fois lancé, `previa.local` (résolu directement par macOS/Linux/iOS
sans rien à installer ; sur Windows il faut Bonjour, souvent absent par
défaut — limite connue, voir README) répond à la même IP que celle
retournée par _ip_locale() côté backend (même technique de détection).
"""
import json
import socket
import sys
import time
from pathlib import Path

from zeroconf import IPVersion, ServiceBrowser, ServiceInfo, ServiceListener, Zeroconf

# Fichier lu par le backend (voir Infrastructure/esp_decouverte.py côté
# Python et docker-compose.yml pour le montage en lecture seule dans le
# conteneur) pour la page admin "configAlerte" — liste des ESP32 alarme
# trouvés sur le réseau. Écrit ICI, dans ce script hôte, pour la même
# raison que previa.local est annoncé ici plutôt que dans le conteneur
# backend : le multicast (ce qu'utilise mDNS, annonce ET recherche) ne
# sort pas de la VM Docker Desktop cachée sur Windows/Mac.
FICHIER_ESP_DECOUVERTS = Path(__file__).resolve().parent / "esp_decouverts.json"


def ip_locale() -> str | None:
    """Même technique que _ip_locale() dans
    migration/backend/fonctionnalites/main/main.py — une connexion UDP
    "à vide" force l'OS à choisir la bonne interface de sortie."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("1.1.1.1", 80))
        return s.getsockname()[0]
    finally:
        s.close()


class EcouteurEsp(ServiceListener):
    """Maintient `FICHIER_ESP_DECOUVERTS` à jour avec les ESP32 alarme
    présents sur le réseau (service `_previaalarme._tcp.local.`, voir
    demarrerMdnsClient() dans migration/arduino/esp/esp.ino). Ne lit PAS
    l'état de chaque ESP ici (pas d'appel HTTP bloquant dans les
    callbacks zeroconf) — juste de quoi les lister ; la page admin
    interroge ensuite chaque ESP directement pour son état/ses réseaux
    (CORS déjà ouvert côté firmware, voir ajouterEntetesCors())."""

    def __init__(self):
        # Clé = nom d'instance mDNS brut donné par zeroconf (ex.
        # "previa-alarme-A1B2C3._previaalarme._tcp.local.") — le même
        # identifiant traverse add/update/remove, pas besoin de le
        # retraduire depuis les propriétés TXT pour savoir quoi retirer.
        self.appareils = {}

    def _ecrire(self):
        try:
            FICHIER_ESP_DECOUVERTS.write_text(json.dumps(list(self.appareils.values())))
        except OSError as e:
            print(f"[mdns] impossible d'écrire {FICHIER_ESP_DECOUVERTS} : {e}", flush=True)

    def _maj(self, zc: Zeroconf, type_: str, name: str):
        info = zc.get_service_info(type_, name)
        if info is None or not info.parsed_addresses():
            return
        proprietes = {
            (k.decode() if isinstance(k, bytes) else k): (v.decode() if isinstance(v, bytes) else v)
            for k, v in (info.properties or {}).items()
        }
        id_appareil = proprietes.get("id") or name
        self.appareils[name] = {
            "id": id_appareil,
            "ip": info.parsed_addresses()[0],
            "hote": info.server.rstrip("."),
            "ssid": proprietes.get("ssid", ""),
        }
        self._ecrire()
        print(f"[mdns] ESP alarme détecté : {id_appareil} -> {self.appareils[name]['ip']}", flush=True)

    def add_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        self._maj(zc, type_, name)

    def update_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        self._maj(zc, type_, name)

    def remove_service(self, zc: Zeroconf, type_: str, name: str) -> None:
        if self.appareils.pop(name, None) is not None:
            self._ecrire()
            print(f"[mdns] ESP alarme disparu : {name}", flush=True)


def main() -> None:
    port_https = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    port_http_mobile = int(sys.argv[2]) if len(sys.argv) > 2 else 8080

    ip = ip_locale()
    if ip is None:
        print("[mdns] aucun réseau détecté, annonce mDNS annulée", flush=True)
        return

    # `interfaces=[ip]`, PAS la valeur par défaut (InterfaceChoice.All) :
    # sans ça, zeroconf écoute/répond aussi via les ponts Docker locaux
    # (docker0, docker_default, ...) présents sur cette même machine —
    # observé en vrai : après un `docker compose down` puis `up` (qui
    # recrée le pont), le résolveur mDNS minimal de glibc (mdns4_minimal,
    # voir /etc/nsswitch.conf) s'est mis à répondre "previa.local" ->
    # 172.19.0.1 (l'adresse du pont) au lieu de la vraie IP réseau,
    # probablement parce que la requête a bouclé via cette interface-là.
    # En restreignant explicitement à la vraie interface réseau, plus de
    # réponse possible depuis une interface interne à Docker.
    zc = Zeroconf(ip_version=IPVersion.V4Only, interfaces=[ip])
    adresse = socket.inet_aton(ip)

    # Le "server" (previa.local.) est ce qui permet à un simple
    # `fetch('https://previa.local:5173')` de fonctionner sur macOS/
    # Linux/iOS — la résolution DNS système gère `.local` nativement.
    # Le service _previa._tcp.local. en plus permet une DÉCOUVERTE
    # active (parcourir "qu'est-ce qui existe sur le réseau ?"), utile
    # pour Android (qui ne résout pas `.local` tout seul dans une
    # requête réseau classique, voir mobile/lib/decouverte.js) et pour
    # de futures caméras physiques qui chercheraient "un serveur previa"
    # sans connaître son nom à l'avance.
    info = ServiceInfo(
        "_previa._tcp.local.",
        "PREVIA Security._previa._tcp.local.",
        addresses=[adresse],
        port=port_https,
        properties={"http_mobile": str(port_http_mobile)},
        server="previa.local.",
    )

    try:
        zc.register_service(info, allow_name_change=True)
    except Exception as exc:
        print(f"[mdns] Avertissement enregistrement service : {exc}", flush=True)
    print(f"[mdns] previa.local -> {ip} annoncé (HTTPS web:{port_https}, HTTP mobile:{port_http_mobile})", flush=True)

    # Recherche active des ESP32 alarme (voir EcouteurEsp ci-dessus) —
    # tourne en tâche de fond via son propre thread interne à zeroconf,
    # ré-écrit FICHIER_ESP_DECOUVERTS à chaque appareil vu/perdu.
    FICHIER_ESP_DECOUVERTS.write_text("[]")  # vide au démarrage, pas de fantômes d'une session précédente
    ecouteur = EcouteurEsp()
    ServiceBrowser(zc, "_previaalarme._tcp.local.", ecouteur)
    print("[mdns] recherche des ESP32 alarme (_previaalarme._tcp.local.) démarrée", flush=True)

    # Reboucle toutes les 30s pour détecter un changement de réseau (Wi-Fi
    # différent, IP réattribuée par le DHCP, etc.) — sans ça, `ip_locale()`
    # n'était appelée qu'une fois au tout début, et l'annonce continuait de
    # pointer vers l'ancienne IP tant que le script n'était pas relancé à
    # la main.
    #
    # `unregister_service` PUIS `register_service` d'une ServiceInfo TOUTE
    # NEUVE, pas `zc.update_service(info)` sur l'objet muté en place :
    # testé isolément (voir conversation) et `update_service` laisse les
    # deux adresses (ancienne + nouvelle) visibles à la fois côté client
    # tant que l'ancien enregistrement n'a pas expiré de son propre TTL —
    # potentiellement plusieurs minutes où un téléphone pourrait retomber
    # sur la mauvaise IP. Désenregistrer explicitement envoie un vrai
    # paquet "goodbye" qui retire l'ancienne adresse tout de suite.
    INTERVALLE_VERIF_S = 30
    try:
        while True:
            time.sleep(INTERVALLE_VERIF_S)
            try:
                nouvelle_ip = ip_locale()
            except OSError:
                # Réseau momentanément indisponible (bascule Wi-Fi en
                # cours, etc.) — on garde l'ancienne IP et on retente
                # dans INTERVALLE_VERIF_S secondes, pas la peine de
                # planter l'annonceur pour un blip transitoire.
                nouvelle_ip = None
            if nouvelle_ip and nouvelle_ip != ip:
                print(f"[mdns] changement détecté : {ip} -> {nouvelle_ip}, redémarrage de l'annonceur", flush=True)
                # Recrée aussi `zc` lui-même, pas juste la ServiceInfo :
                # il est lié (`interfaces=[ip]`, voir plus haut) à
                # l'ancienne adresse précisément pour éviter de répondre
                # via le pont Docker — s'il changeait de réseau sans être
                # recréé, il resterait attaché à une interface qui n'a
                # peut-être plus cette IP.
                try:
                    zc.unregister_service(info)
                except Exception:
                    pass
                zc.close()

                ip = nouvelle_ip
                zc = Zeroconf(ip_version=IPVersion.V4Only, interfaces=[ip])
                info = ServiceInfo(
                    "_previa._tcp.local.",
                    "PREVIA Security._previa._tcp.local.",
                    addresses=[socket.inet_aton(ip)],
                    port=port_https,
                    properties={"http_mobile": str(port_http_mobile)},
                    server="previa.local.",
                )
                try:
                    zc.register_service(info, allow_name_change=True)
                except Exception as exc:
                    print(f"[mdns] Avertissement enregistrement service : {exc}", flush=True)
                ServiceBrowser(zc, "_previaalarme._tcp.local.", ecouteur)
                print(f"[mdns] previa.local -> {ip} annoncé (HTTPS web:{port_https}, HTTP mobile:{port_http_mobile})", flush=True)
    except KeyboardInterrupt:
        pass
    finally:
        print("[mdns] arrêt, retrait de l'annonce...", flush=True)
        zc.unregister_service(info)
        zc.close()


if __name__ == "__main__":
    main()
