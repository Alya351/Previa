import { useEffect, useRef, useState } from 'react';
import { urlDirectRegarder } from '../api.js';

// Même serveur STUN que côté émetteur (voir camera.jsx, CONFIG_ICE) —
// aide à établir la connexion WebRTC, ne voit jamais la vidéo
// elle-même.
const CONFIG_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

// Se connecte à .../cameras/{id}/direct/regarder (voir
// Infrastructure/signalisation_webrtc.py côté backend) et négocie une
// vraie connexion vidéo WebRTC avec la caméra qui émet — pas une image
// qui se met à jour, un vrai flux vidéo continu (MediaStream), exactement
// comme un appel vidéo. Renvoie `null` tant que la connexion n'est pas
// établie (caméra pas encore en train d'émettre, négociation en
// cours...) : à qui utilise ce hook de retomber sur l'image statique
// habituelle (GET .../image) dans ce cas-là.
export function useFluxDirect(idCamera) {
  const [stream, setStream] = useState(null);

  useEffect(() => {
    setStream(null);
    if (!idCamera) return;

    let ws;
    try {
      ws = new WebSocket(urlDirectRegarder(idCamera));
    } catch (e) {
      return; // pas grave, le composant appelant retombe sur l'image statique
    }

    const pc = new RTCPeerConnection(CONFIG_ICE);

    pc.ontrack = (evt) => {
      setStream(evt.streams[0]);
    };

    pc.onicecandidate = (evt) => {
      if (evt.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'ice', candidat: evt.candidate }));
      }
    };

    ws.onmessage = async (evt) => {
      let message;
      try { message = JSON.parse(evt.data); } catch (e) { return; }

      if (message.type === 'offre') {
        // La caméra a créé une offre pour NOUS spécifiquement (voir
        // signalisation_webrtc.py, qui route les messages par id de
        // spectateur) — on y répond par une réponse SDP.
        try {
          await pc.setRemoteDescription(new RTCSessionDescription(message.sdp));
          const reponse = await pc.createAnswer();
          await pc.setLocalDescription(reponse);
          ws.send(JSON.stringify({ type: 'reponse', sdp: pc.localDescription }));
        } catch (e) { /* négociation ratée, pas grave, retombe sur l'image statique */ }
      } else if (message.type === 'ice' && message.candidat) {
        try { await pc.addIceCandidate(new RTCIceCandidate(message.candidat)); }
        catch (e) { /* candidat arrivé trop tard, sans gravité */ }
      }
      // "bienvenue" : rien à faire, juste informatif côté serveur.
    };

    return () => {
      ws.close();
      pc.close();
    };
  }, [idCamera]);

  return stream;
}

export default useFluxDirect;
