import { useEffect, useState } from 'react';
import { API_BASE } from '../api';

const CONFIG_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export function useFluxDirect(idCamera) {
  const [stream, setStream] = useState(null);

  useEffect(() => {
    setStream(null);
    if (!idCamera || !API_BASE || typeof window === 'undefined' || !window.RTCPeerConnection) return;

    let ws;
    let pc;
    try {
      const url = `${API_BASE.replace('https://', 'wss://').replace('http://', 'ws://')}/cameras/${idCamera}/direct/regarder`;
      ws = new WebSocket(url);
    } catch (e) {
      return;
    }

    try {
      pc = new window.RTCPeerConnection(CONFIG_ICE);
      pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          setStream(event.streams[0]);
        }
      };

      ws.onmessage = async (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'offer') {
            await pc.setRemoteDescription(new RTCSessionDescription(msg));
            const answer = await pc.createAnswer();
            await pc.setLocalDescription(answer);
            ws.send(JSON.stringify(pc.localDescription));
          } else if (msg.candidate) {
            await pc.addIceCandidate(new RTCIceCandidate(msg.candidate));
          }
        } catch (err) {}
      };

      pc.onicecandidate = (event) => {
        if (event.candidate && ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ candidate: event.candidate }));
        }
      };
    } catch (err) {}

    return () => {
      try { ws?.close(); } catch (e) {}
      try { pc?.close(); } catch (e) {}
    };
  }, [idCamera]);

  return stream;
}

export default useFluxDirect;
