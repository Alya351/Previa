import React, { useState } from 'react';
import { X, Package, Eye, ShieldAlert, CheckCircle, AlertTriangle, Download, ShieldCheck, Volume2, Lightbulb, Users, Check, Video, Film } from 'lucide-react';
import { urlClipAlerte } from '../api.js';

// `situation` : construit par le parent (DashboardView) à partir d'une
// vraie cible (personne ou objet, voir mappageCibles.js) — remplace les
// 4 fiches fictives d'origine (modulesData). Même forme attendue :
// { title, subtitle, camera, location, duration, status, isUrgent,
//   actionSummary, image, idAlerte, details: [{label, val}] }.
export function PrecursorDetailModal({ situation, onClose, onActionConfirmed }) {
  const [activeAction, setActiveAction] = useState(null);
  const [actionDone, setActionDone] = useState(null);
  const [afficherVideo, setAfficherVideo] = useState(false);

  // Fermeture accessible avec la touche Echap
  React.useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const current = situation;
  if (!current) return null;

  const clipUrl = current.idAlerte ? urlClipAlerte(current.idAlerte) : null;

  const handleConfirmAction = (actionName) => {
    setActionDone(actionName);
    if (onActionConfirmed) {
      onActionConfirmed(actionName, current);
    }
    setTimeout(() => {
      onClose();
    }, 1200);
  };

  return (
    <div 
      className="modal-backdrop"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        background: 'rgba(9, 17, 36, 0.7)',
        backdropFilter: 'blur(6px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        padding: '20px'
      }}
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="precursor-modal-title"
    >
      <div 
        className="animate-modal-in"
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          maxWidth: '680px',
          width: '100%',
          maxHeight: '90vh',
          overflowY: 'auto',
          boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
          padding: '26px 30px'
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* HEADER */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '18px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span 
                style={{
                  fontSize: '0.75rem',
                  fontWeight: 800,
                  background: current.isUrgent ? '#fee2e2' : '#fef3c7',
                  color: current.isUrgent ? '#dc2626' : '#b45309',
                  padding: '3px 8px',
                  borderRadius: '5px'
                }}
              >
                {current.status}
              </span>
              <h2 id="precursor-modal-title" style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
                {current.title}
              </h2>
            </div>
            <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
              📍 {current.camera} · {current.location}
            </p>
          </div>

          <button 
            onClick={onClose}
            aria-label="Fermer les détails (Échap)"
            title="Fermer (Échap)"
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '34px',
              height: '34px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              color: 'var(--ink-secondary)'
            }}
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* IMAGE OU VIDEO PREVIEW */}
        <div style={{ borderRadius: '12px', overflow: 'hidden', height: '240px', position: 'relative', marginBottom: '18px', background: '#0b1120' }}>
          {afficherVideo && clipUrl ? (
            <video 
              src={clipUrl} 
              controls 
              autoPlay 
              style={{ width: '100%', height: '100%', objectFit: 'contain' }}
            />
          ) : (
            <>
              <img src={current.image} alt={current.title} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              <div style={{ position: 'absolute', bottom: '10px', left: '10px', background: 'rgba(9, 17, 36, 0.8)', color: '#fff', fontSize: '0.78rem', fontWeight: 700, padding: '4px 10px', borderRadius: '6px' }}>
                {current.duration}
              </div>
            </>
          )}

          {clipUrl && (
            <button
              onClick={() => setAfficherVideo(!afficherVideo)}
              style={{
                position: 'absolute',
                top: '10px',
                right: '10px',
                background: afficherVideo ? '#0284c7' : 'rgba(15, 23, 42, 0.85)',
                color: '#fff',
                border: '1px solid rgba(255,255,255,0.2)',
                padding: '6px 12px',
                borderRadius: '8px',
                fontSize: '0.78rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                cursor: 'pointer',
                backdropFilter: 'blur(4px)'
              }}
            >
              <Film size={14} />
              <span>{afficherVideo ? "Voir Photo" : "🎥 Voir Clip Vidéo (10s)"}</span>
            </button>
          )}
        </div>

        {/* STATUS ACTIONS BANNER */}
        <div style={{ background: current.isUrgent ? '#fef2f2' : '#fffbeb', border: `1px solid ${current.isUrgent ? '#fca5a5' : '#fde68a'}`, borderRadius: '12px', padding: '14px 16px', marginBottom: '18px' }}>
          <div style={{ fontSize: '0.86rem', fontWeight: 700, color: current.isUrgent ? '#991b1b' : '#92400e' }}>
            ⚡ Réaction automatique de la sécurité :
          </div>
          <div style={{ fontSize: '0.82rem', color: current.isUrgent ? '#b91c1c' : '#b45309', marginTop: '2px' }}>
            {current.actionSummary}
          </div>
        </div>

        {/* DETAILS TABLE */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '22px' }}>
          {current.details.map((d, idx) => (
            <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 12px', background: '#f8fafc', borderRadius: '8px', fontSize: '0.82rem' }}>
              <span style={{ color: 'var(--ink-muted)', fontWeight: 600 }}>{d.label}</span>
              <span style={{ color: 'var(--ink-primary)', fontWeight: 700 }}>{d.val}</span>
            </div>
          ))}
        </div>

        {/* ACTION BUTTONS */}
        <div style={{ display: 'flex', gap: '10px', justifyContent: 'flex-end', alignItems: 'center' }}>
          {clipUrl && (
            <a
              href={clipUrl}
              download={`preuve_alerte_${current.idAlerte || 'incident'}.mp4`}
              target="_blank"
              rel="noreferrer"
              style={{
                background: '#f1f5f9',
                color: '#334155',
                border: '1px solid #cbd5e1',
                padding: '10px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 600,
                textDecoration: 'none',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Download size={15} />
              <span>Télécharger la preuve MP4</span>
            </a>
          )}

          <button
            onClick={() => handleConfirmAction("Alerte vérifiée")}
            style={{
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Check size={16} />
            <span>{actionDone ? "Vérifié avec succès !" : "Marquer comme Vérifié"}</span>
          </button>
        </div>

      </div>
    </div>
  );
}

export default PrecursorDetailModal;
