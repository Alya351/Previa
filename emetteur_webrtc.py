"""PREVIA — Émetteur vidéo WebRTC du relais caméras.

Pourquoi : envoyer des JPEG un par un vers AWS plafonne à ~3 images/s avec
une connexion mobile (chaque image repart entière). Ici on envoie une VRAIE
vidéo compressée (VP8) : seules les différences entre images circulent,
donc ~15 images/s fluides dans ~300 à 450 kbit/s.

Comment : le serveur PREVIA sert déjà de « standard téléphonique »
(route WebSocket /cameras/{id}/direct/emettre, voir signalisation_webrtc.py).
Ce module se branche dessus comme le ferait un téléphone qui filme :
  - le serveur annonce chaque nouveau spectateur (tableau de bord ouvert),
  - on lui envoie une offre WebRTC, il répond, on échange les candidats ICE,
  - la vidéo part ensuite directement vers son navigateur (en passant par
    le serveur TURN d'AWS si les deux réseaux ne peuvent pas se joindre).
Si quoi que ce soit échoue, le site retombe tout seul sur l'aperçu JPEG.
"""

import asyncio
import fractions
import json
import ssl
import threading
import time

import numpy as np

try:
    import av
    import websockets
    from aiortc import (RTCConfiguration, RTCIceServer, RTCPeerConnection,
                        RTCSessionDescription, VideoStreamTrack)
    from aiortc.codecs import vpx
    from aiortc.sdp import candidate_from_sdp

    # Débit vidéo adapté à une connexion mobile (bits par seconde)
    vpx.MIN_BITRATE = 150_000
    vpx.DEFAULT_BITRATE = 350_000
    vpx.MAX_BITRATE = 600_000
    DISPONIBLE = True
    ERREUR_IMPORT = None
except Exception as e:  # aiortc absent : le relais continue en mode JPEG
    DISPONIBLE = False
    ERREUR_IMPORT = e

FPS_VIDEO = 10

# Dernière image (déjà réduite) de chaque caméra, alimentée par le relais
_images: dict[str, np.ndarray] = {}
# Nombre de spectateurs vidéo connectés par caméra (le relais réduit
# l'aperçu JPEG quand la vidéo est regardée, pour économiser le débit)
spectateurs: dict[str, int] = {}


_horodatages: dict[str, float] = {}
# Au-delà, la caméra est considérée coupée : on n'envoie plus sa dernière image figée
DELAI_IMAGE_PERIMEE_S = 3.0


def publier_image(cam_id: str, image_bgr: np.ndarray) -> None:
    _images[cam_id] = image_bgr
    _horodatages[cam_id] = time.time()


def oublier_image(cam_id: str) -> None:
    _images.pop(cam_id, None)
    _horodatages.pop(cam_id, None)


if DISPONIBLE:
    class PisteCamera(VideoStreamTrack):
        """Piste vidéo qui lit la dernière image publiée par le relais."""

        kind = "video"

        def __init__(self, cam_id: str):
            super().__init__()
            self.cam_id = cam_id
            self._debut = None
            self._n = 0

        async def recv(self):
            if self._debut is None:
                self._debut = time.time()
            else:
                self._n += 1
                attente = self._debut + self._n / FPS_VIDEO - time.time()
                if attente > 0:
                    await asyncio.sleep(attente)
            image = _images.get(self.cam_id)
            if image is not None and time.time() - _horodatages.get(self.cam_id, 0.0) > DELAI_IMAGE_PERIMEE_S:
                image = None  # caméra coupée : écran noir plutôt qu'une image figée
            if image is None:
                image = np.zeros((360, 640, 3), dtype=np.uint8)
            trame = av.VideoFrame.from_ndarray(image, format="bgr24")
            trame.pts = int(self._n * 90000 / FPS_VIDEO)
            trame.time_base = fractions.Fraction(1, 90000)
            return trame


async def _boucle(serveur_wss: str, cam_id: str, nom: str, serveurs_ice: list) -> None:
    ctx = ssl.create_default_context()
    ctx.check_hostname = False
    ctx.verify_mode = ssl.CERT_NONE
    url = f"{serveur_wss}/cameras/{cam_id}/direct/emettre"
    config = RTCConfiguration(iceServers=[RTCIceServer(**s) for s in serveurs_ice])

    while True:
        pcs: dict[str, RTCPeerConnection] = {}

        async def fermer(sid):
            pc = pcs.pop(sid, None)
            if pc is not None:
                await pc.close()
            spectateurs[cam_id] = len(pcs)

        try:
            options = {"ssl": ctx} if url.startswith("wss://") else {}
            async with websockets.connect(url, ping_interval=20, max_size=None, **options) as ws:
                print(f"[{nom}] Vidéo en direct (WebRTC) : prête, en attente de spectateurs", flush=True)
                async for brut in ws:
                    try:
                        msg = json.loads(brut)
                    except ValueError:
                        continue
                    t = msg.get("type")

                    if t == "nouveau_spectateur":
                        sid = msg.get("id")
                        if not sid:
                            continue
                        await fermer(sid)
                        pc = RTCPeerConnection(configuration=config)
                        pcs[sid] = pc
                        spectateurs[cam_id] = len(pcs)
                        pc.addTrack(PisteCamera(cam_id))

                        def suivre(pc=pc, sid=sid):
                            @pc.on("connectionstatechange")
                            async def _etat():
                                if pc.connectionState == "connected":
                                    print(f"[{nom}] Spectateur connecté en vidéo ({len(pcs)} en tout)", flush=True)
                                elif pc.connectionState in ("failed", "closed"):
                                    if pcs.get(sid) is pc:
                                        await fermer(sid)
                        suivre()

                        offre = await pc.createOffer()
                        await pc.setLocalDescription(offre)  # rassemble aussi les candidats ICE
                        await ws.send(json.dumps({
                            "type": "offre", "pour": sid,
                            "sdp": {"type": pc.localDescription.type, "sdp": pc.localDescription.sdp},
                        }))

                    elif t == "reponse":
                        pc = pcs.get(msg.get("de"))
                        sdp = msg.get("sdp") or {}
                        if pc is not None and sdp.get("sdp"):
                            await pc.setRemoteDescription(RTCSessionDescription(sdp=sdp["sdp"], type=sdp.get("type", "answer")))

                    elif t == "ice":
                        pc = pcs.get(msg.get("de"))
                        c = msg.get("candidat") or {}
                        texte = c.get("candidate") or ""
                        if pc is not None and texte:
                            try:
                                cand = candidate_from_sdp(texte.split(":", 1)[1] if texte.startswith("candidate:") else texte)
                                cand.sdpMid = c.get("sdpMid")
                                cand.sdpMLineIndex = c.get("sdpMLineIndex")
                                await pc.addIceCandidate(cand)
                            except Exception:
                                pass

                    elif t == "spectateur_parti":
                        await fermer(msg.get("id"))
        except Exception as e:
            print(f"[{nom}] Vidéo WebRTC : connexion au serveur perdue ({e.__class__.__name__}), nouvel essai dans 5 s", flush=True)
        finally:
            for sid in list(pcs):
                try:
                    await fermer(sid)
                except Exception:
                    pass
        await asyncio.sleep(5)


def demarrer(serveur_wss: str, cam_id: str, nom: str, serveurs_ice: list) -> bool:
    """Lance l'émetteur vidéo d'une caméra dans un thread. Renvoie False si
    aiortc n'est pas installé (le relais continue alors en mode JPEG)."""
    if not DISPONIBLE:
        print(f"[{nom}] Vidéo WebRTC désactivée : {ERREUR_IMPORT}. Installez-la avec : pip install aiortc websockets", flush=True)
        return False
    threading.Thread(target=lambda: asyncio.run(_boucle(serveur_wss, cam_id, nom, serveurs_ice)),
                     daemon=True, name=f"webrtc-{nom}").start()
    return True
