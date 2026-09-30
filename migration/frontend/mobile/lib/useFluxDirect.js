import { useEffect, useRef, useState } from 'react';
import { RTCPeerConnection, RTCSessionDescription, RTCIceCandidate } from 'react-native-webrtc';
import { API_BASE } from '../api';

// Même serveur STUN que côté web (voir frontend/web/src/pages/camera.jsx,
// CONFIG_ICE) — aide à établir la connexion WebRTC, ne voit jamais la
// vidéo elle-même.
const CONFIG_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

function urlSignalisation(chemin) {
  // API_BASE vaut "http://<ip>:8080" (voir api.js) — même hôte, même
  // port, juste le protocole WebSocket à la place.
  return `${API_BASE.replace('http://', 'ws://')}${chemin}`;
}

// Équivalent mobile de frontend/web/src/lib/useFluxDirect.js — même
// protocole de signalisation (voir Infrastructure/signalisation_webrtc.py
// côté backend, routes /cameras/{id}/direct/regarder), mais avec
// react-native-webrtc à la place de l'API WebRTC native du navigateur
// (react-native-webrtc en imite l'essentiel : RTCPeerConnection,
// RTCSessionDescription, RTCIceCandidate). Renvoie un vrai MediaStream
// natif — au composant appelant de faire `stream.toURL()` pour
// l'afficher via <RTCView streamURL={...} /> (pas de <video> sur
// mobile).
export function useFluxDirect(idCamera) {
  const [stream, setStream] = useState(null);

  useEffect(() => {
    setStream(null);
    if (!idCamera || !API_BASE || typeof RTCPeerConnection !== 'function') return;

    let ws;
    try {
      ws = new WebSocket(urlSignalisation(`/cameras/${idCamera}/direct/regarder`));
    } catch (e) {
      return; // pas grave, le composant appelant retombe sur l'image statique
    }

    const pc = new RTCPeerConnection(CONFIG_ICE);

    pc.ontrack = (evt) => {
      if (evt.streams && evt.streams[0]) setStream(evt.streams[0]);
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
