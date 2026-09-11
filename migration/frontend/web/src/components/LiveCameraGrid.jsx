import React from 'react';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from './FluxCamera.jsx';

// `cameras` : branché sur les vraies caméras enregistrées (voir
// GET /vue-ensemble côté pages/admin.jsx) — remplace les 6 caméras
// fictives d'origine.
//
// Chaque carte se connecte à son propre flux direct (voir
// lib/useFluxDirect.js, Infrastructure/flux_direct.py côté backend) —
// beaucoup plus fluide que l'ancien rafraîchissement de <img src>
// toutes les 2s. Tant qu'aucune image n'est encore arrivée par ce flux
// (caméra pas encore en train d'émettre), retombe sur `cam.image`
// (GET .../image, l'aperçu "quasi temps réel" existant) — jamais
// d'icône cassée, juste un peu moins fluide en attendant.
function CartePreviewCamera({ cam, onSelectCamera }) {
  const streamDirect = useFluxDirect(cam.id);

  return (
    <div
      className="camera-preview-card"
      onClick={() => onSelectCamera && onSelectCamera(cam)}
      title={`Cliquer pour inspecter ${cam.name}`}
    >
      {/* LIVE BLUE PILL BADGE */}
      <div className="camera-live-badge">
        <span>LIVE</span>
      </div>

      <FluxCamera
        stream={streamDirect}
        imageRepli={cam.image}
        alt={cam.name}
        className="camera-feed-img"
        onError={(e) => { e.currentTarget.style.visibility = 'hidden'; }}
        onLoad={(e) => { e.currentTarget.style.visibility = 'visible'; }}
      />

      {/* BOTTOM NAME OVERLAY BAR */}
      <div className="camera-name-overlay">
        <span>{cam.name}</span>
      </div>
    </div>
  );
}

export function LiveCameraGrid({ cameras = [], onSelectCamera }) {
  if (cameras.length === 0) {
    return (
      <div className="live-camera-section">
        <div className="section-heading"><span>Flux en direct</span></div>
        <p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem' }}>
          Aucune caméra enregistrée pour l'instant — voir Organisation / Configuration pour en créer une.
        </p>
      </div>
    );
  }

  return (
    <div className="live-camera-section">
      <div className="section-heading">
        <span>Flux en direct</span>
      </div>

      <div className="live-cameras-grid">
        {cameras.map((cam) => (
          <CartePreviewCamera key={cam.id} cam={cam} onSelectCamera={onSelectCamera} />
        ))}
      </div>
    </div>
  );
}

export default LiveCameraGrid;
