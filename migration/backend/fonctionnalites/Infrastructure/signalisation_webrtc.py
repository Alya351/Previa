"""Passerelle de signalisation WebRTC pour le flux caméra en direct — voir
main.py (routes /cameras/{id}/direct/emettre et /cameras/{id}/direct/
regarder), camera.jsx (émetteur) et lib/useFluxDirect.js (spectateur).

Différent de l'ancienne approche (flux_direct.py, JPEG envoyés plusieurs
fois par seconde par WebSocket — retirée, ça saccadait comme un
diaporama rapide, pas une vraie vidéo) : ici, le WebSocket NE PORTE PAS
la vidéo. Il sert UNIQUEMENT à faire se rencontrer la caméra et chaque
spectateur (échange des messages SDP/ICE de la négociation WebRTC) —
une fois la connexion établie, la vidéo circule EN DIRECT entre le
navigateur de la caméra et celui du spectateur (WebRTC pair-à-pair),
plus jamais par ce serveur. C'est exactement comme ça que fonctionne un
appel Google Meet en pair-à-pair : un serveur de signalisation léger,
la vidéo elle-même ne le traverse pas.

Topologie : une caméra qui filme peut avoir PLUSIEURS spectateurs en
même temps (tableau de bord ouvert sur plusieurs appareils) — la caméra
crée une connexion WebRTC séparée PAR spectateur (mode "maillage"), ce
qui suffit largement pour quelques spectateurs sur un réseau local
(pas besoin d'un serveur de relais média (SFU) comme Meet en a un pour
des centaines de participants — hors de portée de ce projet, et inutile
ici)."""

from fastapi import WebSocket


class GestionnaireSignalisation:
    def __init__(self) -> None:
        # id_camera -> WebSocket de l'appareil qui filme (une seule
        # caméra "émettrice" à la fois par id_camera, cohérent avec
        # camera.jsx : un seul appareil filme pour une caméra donnée).
        self._emetteurs: dict[str, WebSocket] = {}
        # id_camera -> {id_spectateur: WebSocket} des navigateurs qui
        # regardent CETTE caméra en ce moment.
        self._spectateurs: dict[str, dict[str, WebSocket]] = {}

    # --- Émetteur (camera.jsx) ------------------------------------------

    def enregistrer_emetteur(self, id_camera: str, ws: WebSocket) -> None:
        self._emetteurs[id_camera] = ws

    def retirer_emetteur(self, id_camera: str, ws: WebSocket) -> None:
        if self._emetteurs.get(id_camera) is ws:
            self._emetteurs.pop(id_camera, None)

    def emetteur_de(self, id_camera: str) -> WebSocket | None:
        return self._emetteurs.get(id_camera)

    # --- Spectateurs (tableau de bord, modale caméra) --------------------

    def ajouter_spectateur(self, id_camera: str, id_spectateur: str, ws: WebSocket) -> None:
        self._spectateurs.setdefault(id_camera, {})[id_spectateur] = ws

    def retirer_spectateur(self, id_camera: str, id_spectateur: str) -> None:
        groupe = self._spectateurs.get(id_camera)
        if not groupe:
            return
        groupe.pop(id_spectateur, None)
        if not groupe:
            self._spectateurs.pop(id_camera, None)

    def spectateur(self, id_camera: str, id_spectateur: str) -> WebSocket | None:
        return self._spectateurs.get(id_camera, {}).get(id_spectateur)

    def ids_spectateurs(self, id_camera: str) -> list[str]:
        return list(self._spectateurs.get(id_camera, {}).keys())


# Instance unique, partagée par tout le processus (même principe que
# derniere_image.py) — état en mémoire, jamais persisté : une
# négociation WebRTC en cours n'a aucun sens à survivre à un redémarrage
# du serveur, chaque navigateur relancerait la négociation de toute
# façon en se reconnectant.
gestionnaire = GestionnaireSignalisation()
