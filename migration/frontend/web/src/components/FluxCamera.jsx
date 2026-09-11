import React, { useEffect, useRef } from 'react';

// Affiche le vrai flux vidéo WebRTC (voir lib/useFluxDirect.js) quand
// il est disponible (`stream`), sinon l'image statique de repli
// (`imageRepli`, GET .../image) — utilisé par LiveCameraGrid,
// CameraViewModal et l'onglet Caméras (pages/admin.jsx). `srcObject`
// n'est pas un attribut HTML standard, React ne le gère pas comme prop
// directe sur <video> : il faut le poser à la main via une ref, d'où ce
// petit composant plutôt que de dupliquer ce useEffect trois fois.
export function FluxCamera({ stream, imageRepli, alt, className, style, onError, onLoad }) {
  const videoRef = useRef(null);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.srcObject = stream || null;
    }
  }, [stream]);

  if (stream) {
    return (
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
    );
  }

  return (
    <img
      src={imageRepli}
      alt={alt}
      className={className}
      style={style}
      onError={onError}
      onLoad={onLoad}
    />
  );
}

export default FluxCamera;
