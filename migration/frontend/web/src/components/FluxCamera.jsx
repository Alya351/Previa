import React, { useCallback, useEffect, useRef, useState } from 'react';
import { RefreshCw } from 'lucide-react';
import { DetectionOverlay } from './DetectionOverlay.jsx';

// Délai au-delà duquel une caméra qui n'envoie aucune image est déclarée hors ligne.
const DELAI_HORS_LIGNE_MS = 15000;

// Affiche le flux vidéo (RTSP/MJPEG continu, WebRTC ou Image de secours) avec superposition
// en temps réel des cadres HUD de détection (Rouge pour Suspect, Vert pour Autorisé).
//
// Suivi d'état (15/11/2026) : le composant sait si une image arrive réellement.
//   'connexion'  : en attente de la première image (0 à 15 s)
//   'direct'     : au moins une image a été reçue
//   'hors_ligne' : aucune image après 15 s (les tentatives continuent en arrière-plan)
// L'état est remonté au parent via `onStatusChange`. L'écran « Signal indisponible »
// n'est affiché que si `afficherEtat` est vrai (aperçus du tableau de bord) : les autres
// écrans gardent exactement leur rendu d'origine.
export function FluxCamera({
  stream, imageRepli, alt, className, style, onError, onLoad, detections = [], onVideoRef,
  onStatusChange, afficherEtat = false,
}) {
  const videoRef = useRef(null);
  const minuterieRef = useRef(null);
  const [imgSrc, setImgSrc] = useState(imageRepli);
  const [etat, setEtat] = useState('connexion');
  const [tentative, setTentative] = useState(0);

  // Vérifier si le flux WebRTC contient une vraie piste vidéo active
  const hasActiveWebRtcTrack = Boolean(
    stream &&
    stream.getVideoTracks &&
    stream.getVideoTracks().some((track) => track.enabled && track.readyState === 'live')
  );

  // Nouvelle source (ou nouvelle tentative) : on repart en « connexion » et on arme le délai.
  useEffect(() => {
    setImgSrc(imageRepli);
    setEtat(hasActiveWebRtcTrack ? 'direct' : 'connexion');
    if (minuterieRef.current) clearTimeout(minuterieRef.current);
    if (!hasActiveWebRtcTrack) {
      minuterieRef.current = setTimeout(() => {
        setEtat((actuel) => (actuel === 'direct' ? 'direct' : 'hors_ligne'));
      }, DELAI_HORS_LIGNE_MS);
    }
    return () => { if (minuterieRef.current) clearTimeout(minuterieRef.current); };
  }, [imageRepli, hasActiveWebRtcTrack, tentative]);

  useEffect(() => {
    if (onStatusChange) onStatusChange(etat);
  }, [etat, onStatusChange]);

  useEffect(() => {
    if (videoRef.current && hasActiveWebRtcTrack) {
      videoRef.current.srcObject = stream || null;
      if (onVideoRef) {
        onVideoRef(videoRef.current);
      }
    }
  }, [stream, hasActiveWebRtcTrack, onVideoRef]);

  const handleImgLoad = (e) => {
    if (minuterieRef.current) clearTimeout(minuterieRef.current);
    setEtat('direct');
    if (onLoad) onLoad(e);
  };

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

  const reessayer = useCallback((e) => {
    e.stopPropagation(); // ne pas ouvrir la caméra en cliquant sur le bouton
    setTentative((n) => n + 1);
  }, []);

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden' }}>
      {hasActiveWebRtcTrack ? (
        <video
          ref={videoRef}
          crossOrigin="anonymous"
          autoPlay
          playsInline
          muted
          className={className}
          style={style}
          onLoadedMetadata={(e) => { setEtat('direct'); if (onLoad) onLoad(e); }}
          onError={onError}
        />
      ) : (
        <img
          crossOrigin="anonymous"
          src={imgSrc || imageRepli}
          alt={alt}
          className={className}
          style={afficherEtat && etat !== 'direct' ? { ...style, visibility: 'hidden' } : style}
          onError={handleImgError}
          onLoad={handleImgLoad}
        />
      )}

      {/* Écran « Signal indisponible » (aperçus du tableau de bord uniquement) */}
      {afficherEtat && etat === 'hors_ligne' && (
        <div
          style={{
            position: 'absolute', inset: 0, zIndex: 1,
            display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
            gap: '6px', padding: '30px 10px 30px', textAlign: 'center',
            background: '#091124', color: '#ffffff',
          }}
        >
          <span style={{ fontSize: '0.8rem', fontWeight: 700 }}>Signal indisponible</span>
          <button
            type="button"
            onClick={reessayer}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: '5px', marginTop: '2px',
              background: '#0284c7', color: '#ffffff', border: 'none', borderRadius: '6px',
              padding: '5px 10px', fontSize: '0.72rem', fontWeight: 700, cursor: 'pointer',
            }}
          >
            <RefreshCw size={12} aria-hidden="true" /> Réessayer
          </button>
        </div>
      )}

      {/* Cadres de détection HUD superposés (Visages suspects / autorisés) */}
      <DetectionOverlay detections={detections} />
    </div>
  );
}

export default FluxCamera;
