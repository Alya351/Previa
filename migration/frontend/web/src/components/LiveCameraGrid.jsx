import React, { useState } from 'react';
import { VideoOff, Cctv } from 'lucide-react';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from './FluxCamera.jsx';
import { useProfil, nomOngletConfiguration } from '../lib/profilContext.js';

// `cameras` : branché sur les vraies caméras enregistrées (voir
// GET /vue-ensemble côté pages/admin.jsx) — remplace les 6 caméras
// fictives d'origine.
function CartePreviewCamera({ cam, onSelectCamera }) {
  const streamDirect = useFluxDirect(cam.urlFlux ? null : cam.id);
  // État réel du flux, remonté par FluxCamera : 'connexion' | 'direct' | 'hors_ligne'
  const [etatFlux, setEtatFlux] = useState('connexion');
  // Rafraîchissement propre à la vignette : l'aperçu ne dépend plus du
  // rechargement des données de la page (toutes les 2 s), mais de son
  // propre minuteur — le serveur reçoit ~2 images/s via /trame.

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
      {/* BADGE D'ÉTAT : « LIVE » seulement si une image arrive réellement */}
      {etatFlux === 'direct' && (
        <div className="camera-live-badge" aria-label="Statut en direct">
          <span className="live-indicator-dot" aria-hidden="true" />
          <span>LIVE</span>
        </div>
      )}
      {etatFlux === 'connexion' && (
        <div className="camera-live-badge" aria-label="Connexion en cours" style={{ background: 'rgba(100, 116, 139, 0.95)' }}>
          <span className="live-indicator-dot" aria-hidden="true" />
          <span>CONNEXION…</span>
        </div>
      )}
      {etatFlux === 'hors_ligne' && (
        <div className="camera-live-badge" aria-label="Caméra hors ligne" style={{ background: 'rgba(220, 38, 38, 0.95)' }}>
          <span className="live-indicator-dot" aria-hidden="true" style={{ animation: 'none' }} />
          <span>HORS LIGNE</span>
        </div>
      )}

      <FluxCamera
        stream={streamDirect}
        imageRepli={cam.urlFlux ? `/cameras/${cam.id}/flux` : cam.image}
        rafraichirMs={350}
        alt={cam.name}
        className="camera-feed-img"
        afficherEtat
        onStatusChange={setEtatFlux}
      />

      {/* BOTTOM NAME OVERLAY BAR */}
      <div className="camera-name-overlay" style={{ zIndex: 2 }}>
        <span>{cam.name}</span>
      </div>
    </div>
  );
}

export function LiveCameraGrid({ cameras = [], isLoading = false, onSelectCamera }) {
  const { profil } = useProfil();
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
              Ajoutez ou configurez une caméra dans l'onglet <strong>{nomOngletConfiguration(profil)}</strong> pour visualiser les flux en temps réel.
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
