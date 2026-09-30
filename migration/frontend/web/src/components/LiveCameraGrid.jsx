import React from 'react';
import { VideoOff, Cctv } from 'lucide-react';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from './FluxCamera.jsx';

// `cameras` : branché sur les vraies caméras enregistrées (voir
// GET /vue-ensemble côté pages/admin.jsx) — remplace les 6 caméras
// fictives d'origine.
function CartePreviewCamera({ cam, onSelectCamera }) {
  const streamDirect = useFluxDirect(cam.urlFlux ? null : cam.id);

  const handleClick = () => {
    if (onSelectCamera) onSelectCamera(cam);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      handleClick();
    }
  };

  return (
    <div
      className="camera-preview-card"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      title={`Cliquer pour inspecter ${cam.name} (${cam.location || 'Zone'})`}
      aria-label={`Inspecter le flux de la caméra ${cam.name}`}
    >
      {/* LIVE BLUE PILL BADGE */}
      <div className="camera-live-badge" aria-label="Statut en direct">
        <span className="live-indicator-dot" aria-hidden="true" />
        <span>LIVE</span>
      </div>

      <FluxCamera
        stream={streamDirect}
        imageRepli={cam.urlFlux ? `/cameras/${cam.id}/flux` : cam.image}
        alt={cam.name}
        className="camera-feed-img"
      />

      {/* BOTTOM NAME OVERLAY BAR */}
      <div className="camera-name-overlay">
        <span>{cam.name}</span>
      </div>
    </div>
  );
}

export function LiveCameraGrid({ cameras = [], isLoading = false, onSelectCamera }) {
  if (isLoading) {
    return (
      <div className="live-camera-section">
        <div className="section-heading">
          <span>Flux en direct</span>
        </div>
        <div className="live-cameras-grid">
          {[1, 2, 3, 4].map((n) => (
            <div key={n} className="camera-preview-card skeleton-card" aria-hidden="true">
              <div className="skeleton-shimmer" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (cameras.length === 0) {
    return (
      <div className="live-camera-section">
        <div className="section-heading">
          <span>Flux en direct</span>
        </div>
        <div 
          style={{ 
            background: '#ffffff', 
            border: '1px dashed #cbd5e1', 
            borderRadius: '16px', 
            padding: '36px 20px', 
            textAlign: 'center', 
            display: 'flex', 
            flexDirection: 'column', 
            alignItems: 'center', 
            gap: '12px' 
          }}
        >
          <div style={{ width: '48px', height: '48px', borderRadius: '12px', background: '#f1f5f9', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            <VideoOff size={24} />
          </div>
          <div>
            <h4 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
              Aucune caméra connectée
            </h4>
            <p style={{ margin: '4px 0 0 0', color: 'var(--ink-muted)', fontSize: '0.86rem' }}>
              Ajoutez ou configurez une caméra dans l'onglet <strong>Organisation</strong> pour visualiser les flux en temps réel.
            </p>
          </div>
        </div>
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
