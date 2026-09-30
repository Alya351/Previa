import React, { useEffect, useRef, useState } from 'react';
import { DetectionOverlay } from './DetectionOverlay.jsx';

// Affiche le flux vidéo (RTSP/MJPEG continu, WebRTC ou Image de secours) avec superposition
// en temps réel des cadres HUD de détection (Rouge pour Suspect, Vert pour Autorisé).
export function FluxCamera({ stream, imageRepli, alt, className, style, onError, onLoad, detections = [], onVideoRef }) {
  const videoRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(imageRepli);
  const [useFallbackSnapshot, setUseFallbackSnapshot] = useState(false);

  useEffect(() => {
    setImgSrc(imageRepli);
    setUseFallbackSnapshot(false);
  }, [imageRepli]);

  // Vérifier si le flux WebRTC contient une vraie piste vidéo active
  const hasActiveWebRtcTrack = Boolean(
    stream &&
    stream.getVideoTracks &&
    stream.getVideoTracks().some((track) => track.enabled && track.readyState === 'live')
  );

  useEffect(() => {
    if (videoRef.current && hasActiveWebRtcTrack) {
      videoRef.current.srcObject = stream || null;
      if (onVideoRef) {
        onVideoRef(videoRef.current);
      }
    }
  }, [stream, hasActiveWebRtcTrack, onVideoRef]);

  const handleImgError = (e) => {
    if (onError) onError(e);
    // Auto-réessaie le flux vidéo continu MJPEG avec un timestamp anti-cache
    setTimeout(() => {
      if (imageRepli) {
        const sep = imageRepli.includes('?') ? '&' : '?';
        setImgSrc(`${imageRepli.split('?')[0]}${sep}retry=${Date.now()}`);
      }
    }, 1500);
  };

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {hasActiveWebRtcTrack ? (
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className={className}
          style={style}
          onLoadedMetadata={onLoad}
          onError={onError}
        />
      ) : (
        <img
          src={imgSrc || imageRepli}
          alt={alt}
          className={className}
          style={style}
          onError={handleImgError}
          onLoad={onLoad}
        />
      )}

      {/* Cadres de détection HUD superposés (Visages suspects / autorisés) */}
      <DetectionOverlay detections={detections} />
    </div>
  );
}

export default FluxCamera;

