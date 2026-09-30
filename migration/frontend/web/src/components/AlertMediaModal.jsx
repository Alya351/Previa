import React, { useState, useEffect } from 'react';
import { X, Camera, Film, Download, Trash2, ShieldAlert, AlertTriangle, Check, ExternalLink } from 'lucide-react';
import { urlImageAlerte, urlClipAlerte } from '../api.js';

export function AlertMediaModal({ alerte, onClose, onDelete, onGoToCamera }) {
  const [activeTab, setActiveTab] = useState('photo'); // 'photo' | 'video'
  const [imgError, setImgError] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  if (!alerte) return null;

  const id = alerte.id || alerte.id_alerte;
  const imageUrl = alerte.imageUrl || urlImageAlerte(id);
  const clipUrl = urlClipAlerte(id);
  const isCrit = alerte.critique || ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(alerte.type_evenement || alerte.rawType);
  const typeLabel = alerte.type || alerte.title || 'Incident de sécurité';
  const cameraLabel = alerte.cam || alerte.cameraName || `Caméra #${alerte.id_camera || '—'}`;
  const desc = alerte.desc || alerte.description || '';
  const dateStr = alerte.date ? `${alerte.date} à ${alerte.time}` : (alerte.timeAgo || (alerte.horodatage ? new Date(alerte.horodatage * 1000).toLocaleString('fr-FR') : 'à l\'instant'));

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15, 23, 42, 0.82)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 99999,
        padding: '16px',
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: '#ffffff',
          borderRadius: '20px',
          width: '100%',
          maxWidth: '720px',
          maxHeight: '92vh',
          overflowY: 'auto',
          boxShadow: '0 25px 60px rgba(0,0,0,0.35)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          padding: '24px',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* EN-TÊTE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <span
                style={{
                  background: isCrit ? '#fee2e2' : '#fef3c7',
                  color: isCrit ? '#b91c1c' : '#b45309',
                  padding: '3px 9px',
                  borderRadius: '6px',
                  fontSize: '0.74rem',
                  fontWeight: 800,
                  display: 'flex',
                  alignItems: 'center',
                  gap: '4px',
                }}
              >
                {isCrit ? <ShieldAlert size={12} /> : <AlertTriangle size={12} />}
                {isCrit ? 'URGENCE CRITIQUE' : 'COMPORTEMENT SUSPECT'}
              </span>
              <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                {dateStr}
              </span>
            </div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
              {typeLabel}
            </h2>
            <p style={{ fontSize: '0.86rem', color: 'var(--ink-secondary)', margin: '4px 0 0 0' }}>
              📍 <strong>{cameraLabel}</strong> {alerte.location ? `· ${alerte.location}` : ''}
            </p>
          </div>

          <button
            onClick={onClose}
            style={{
              background: '#f1f5f9',
              border: 'none',
              borderRadius: '50%',
              width: '36px',
              height: '36px',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--ink-muted)',
              transition: 'all 0.15s ease',
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* ONGLETS MÉDIA : PHOTO OU VIDÉO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px' }}>
          <div style={{ display: 'flex', background: '#f1f5f9', padding: '4px', borderRadius: '12px', gap: '4px' }}>
            <button
              onClick={() => setActiveTab('photo')}
              style={{
                background: activeTab === 'photo' ? '#ffffff' : 'transparent',
                color: activeTab === 'photo' ? '#0284c7' : 'var(--ink-muted)',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'photo' ? '0 2px 6px rgba(0,0,0,0.08)' : 'none',
              }}
            >
              <Camera size={15} />
              <span>Photo de l'incident</span>
            </button>
            <button
              onClick={() => setActiveTab('video')}
              style={{
                background: activeTab === 'video' ? '#0284c7' : 'transparent',
                color: activeTab === 'video' ? '#ffffff' : 'var(--ink-muted)',
                border: 'none',
                padding: '7px 16px',
                borderRadius: '8px',
                fontSize: '0.84rem',
                fontWeight: 700,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: activeTab === 'video' ? '0 2px 6px rgba(2,132,199,0.35)' : 'none',
              }}
            >
              <Film size={15} />
              <span>Extrait Vidéo (10s)</span>
            </button>
          </div>

          {/* LIENS DE TÉLÉCHARGEMENT */}
          <div style={{ display: 'flex', gap: '8px' }}>
            {activeTab === 'photo' ? (
              <a
                href={imageUrl}
                download={`capture_${id}.jpg`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  color: 'var(--ink-secondary)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Download size={13} />
                <span>Télécharger la photo</span>
              </a>
            ) : (
              <a
                href={clipUrl}
                download={`video_intrusion_${id}.mp4`}
                target="_blank"
                rel="noreferrer"
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  color: 'var(--ink-secondary)',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 600,
                  textDecoration: 'none',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '5px',
                }}
              >
                <Download size={13} />
                <span>Télécharger la vidéo</span>
              </a>
            )}
          </div>
        </div>

        {/* LECTEUR MÉDIA PRINCIPAL */}
        <div
          style={{
            position: 'relative',
            width: '100%',
            height: '360px',
            borderRadius: '16px',
            overflow: 'hidden',
            background: '#0b1120',
            border: '1px solid #1e293b',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}
        >
          {activeTab === 'photo' ? (
            !imgError ? (
              <img
                src={imageUrl}
                alt="Preuve incident"
                onError={() => setImgError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                <Camera size={36} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Capture photo instantanée non disponible</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', opacity: 0.7 }}>La caméra n'avait pas encore transmis de trame au moment précis de l'alerte.</p>
              </div>
            )
          ) : (
            !videoError ? (
              <video
                key={clipUrl}
                src={clipUrl}
                controls
                autoPlay
                onError={() => setVideoError(true)}
                style={{ width: '100%', height: '100%', objectFit: 'contain' }}
              />
            ) : (
              <div style={{ textAlign: 'center', color: '#94a3b8', padding: '20px' }}>
                <Film size={36} style={{ margin: '0 auto 8px auto', opacity: 0.5 }} />
                <p style={{ margin: 0, fontSize: '0.9rem' }}>Extrait vidéo non disponible ou en cours de finalisation</p>
                <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', opacity: 0.7 }}>Consultez l'onglet Photo pour voir l'instantané de la détection.</p>
              </div>
            )
          )}
        </div>

        {/* DÉTAILS CONTEXTUELS */}
        <div style={{ background: '#f8fafc', borderRadius: '12px', padding: '14px 18px', border: '1px solid var(--border-light)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--ink-muted)', textTransform: 'uppercase', marginBottom: '4px' }}>
            Description de l'incident
          </div>
          <div style={{ fontSize: '0.88rem', fontWeight: 600, color: 'var(--ink-primary)', lineHeight: 1.5 }}>
            {desc || 'Aucun détail supplémentaire renseigné pour cet événement.'}
          </div>
        </div>

        {/* ACTIONS INFÉRIEURES */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '10px', marginTop: '4px' }}>
          <div>
            {onDelete && (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onDelete(alerte);
                }}
                style={{
                  background: '#fef2f2',
                  color: '#b91c1c',
                  border: '1px solid #fecaca',
                  padding: '9px 16px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer',
                }}
              >
                <Trash2 size={15} />
                <span>Supprimer cet incident</span>
              </button>
            )}
          </div>

          <div style={{ display: 'flex', gap: '10px' }}>
            {onGoToCamera && (
              <button
                type="button"
                onClick={() => {
                  onGoToCamera(alerte.id_camera || alerte.camId);
                  onClose();
                }}
                style={{
                  background: '#f0f9ff',
                  color: '#0284c7',
                  border: '1px solid #bae6fd',
                  padding: '9px 18px',
                  borderRadius: '10px',
                  fontWeight: 700,
                  fontSize: '0.84rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                }}
              >
                <ExternalLink size={15} />
                <span>Voir la Caméra en Direct</span>
              </button>
            )}

            <button
              type="button"
              onClick={onClose}
              style={{
                background: '#0284c7',
                color: '#ffffff',
                border: 'none',
                padding: '9px 22px',
                borderRadius: '10px',
                fontWeight: 700,
                fontSize: '0.85rem',
                cursor: 'pointer',
              }}
            >
              Fermer
            </button>
          </div>
        </div>

      </div>
    </div>
  );
}

export default AlertMediaModal;
