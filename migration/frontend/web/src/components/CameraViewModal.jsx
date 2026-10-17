import React, { useState, useEffect } from 'react';
import {
  X,
  Camera,
  CheckCircle2,
  Radio
} from 'lucide-react';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from './FluxCamera.jsx';
import { API_BASE, chargerEtatCamera } from '../api.js';
import { mapPersonneApi } from '../lib/mappageCibles.js';

export function CameraViewModal({ camera, onClose }) {
  const isOffline = camera.status === 'Hors-ligne' || camera.offline;
  const [liveDetections, setLiveDetections] = useState(isOffline ? [] : (camera.detections || []));
  const [livePersonCount, setLivePersonCount] = useState(isOffline ? 0 : (camera.nombrePersonnes ?? 0));
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);
  const aUnFluxReseau = Boolean(camera.urlFlux || camera.url_flux);
  const streamDirect = useFluxDirect(aUnFluxReseau ? null : camera.id);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const imageUrlRepli = aUnFluxReseau
    ? `${API_BASE}/cameras/${camera.id}/flux`
    : (camera.image?.includes('?') ? `${camera.image}&t=${tick}` : `${camera.image}?t=${tick}`);

  // Polling temps réel de l'état IA de la caméra
  useEffect(() => {
    let enCours = false;
    const actualiserEtatCamera = async () => {
      if (enCours) return;
      enCours = true;
      try {
        const etat = await chargerEtatCamera(camera.id);
        if (etat) {
          const camCtx = {
            id_camera: camera.id,
            num: camera.name,
            location: camera.location,
          };
          const personnesVues = etat.personnesVues?.personnes || [];
          const mapped = personnesVues.map((p, idx) => mapPersonneApi(p, idx, camCtx));
          setLiveDetections(mapped);
          const cpt = mapped.length > 0
            ? mapped.length
            : (etat.personnesVues?.nombre_personnes || etat.vueActuelle?.nombre_personnes || 0);
          setLivePersonCount(cpt);
        } else {
          setLiveDetections([]);
          setLivePersonCount(0);
        }
      } catch (err) {
        setLiveDetections([]);
        setLivePersonCount(0);
      } finally {
        enCours = false;
      }
    };

    actualiserEtatCamera();
    const id = setInterval(actualiserEtatCamera, 600);
    return () => clearInterval(id);
  }, [camera.id, camera.name, camera.location]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const takeSnapshot = async () => {
    const nomFichier = `previa_snapshot_${camera.id}_${Date.now()}.jpg`;
    try {
      const res = await fetch(`${API_BASE}/cameras/${camera.id}/snapshot?t=${Date.now()}`);
      if (res.ok) {
        const blob = await res.blob();
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = nomFichier;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        setTimeout(() => URL.revokeObjectURL(url), 3000);
      }
    } catch (e) {
      console.warn('Snapshot modal error:', e);
    }
    showToast("Photo instantanée capturée et téléchargée.");
  };

  // Fermeture accessible avec la touche Echap
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div 
      className="modal-backdrop" 
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="camera-modal-title"
    >
      <div 
        className="modal-content animate-modal-in" 
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: '960px', width: '95%', background: '#091124', color: '#ffffff', borderRadius: '20px', overflow: 'hidden', boxShadow: '0 25px 60px rgba(0,0,0,0.5)' }}
      >
        {/* TOAST D'ACTION */}
        {toast && (
          <div 
            role="status"
            aria-live="polite"
            style={{
              position: 'absolute',
              top: '20px',
              left: '50%',
              transform: 'translateX(-50%)',
              background: '#0284c7',
              color: '#ffffff',
              padding: '10px 20px',
              borderRadius: '10px',
              fontSize: '0.85rem',
              fontWeight: 600,
              zIndex: 9999,
              boxShadow: '0 8px 20px rgba(0,0,0,0.3)',
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}
          >
            <CheckCircle2 size={16} />
            <span>{toast}</span>
          </div>
        )}

        {/* MODAL HEADER */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'rgba(2,132,199,0.2)', border: '1px solid #0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#38bdf8' }}>
              <Radio size={18} aria-hidden="true" />
            </div>
            <div>
              <h3 id="camera-modal-title" style={{ fontSize: '1.1rem', fontWeight: 700, margin: 0, color: '#ffffff' }}>
                {camera.name || camera.num || 'Caméra'}{camera.location ? ` : ${camera.location}` : ''}
              </h3>
              <span style={{ fontSize: '0.76rem', color: '#94a3b8' }}>
                Flux vidéo direct en haute définition
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button 
              onClick={onClose}
              aria-label="Fermer la vue caméra (Échap)"
              title="Fermer (Échap)"
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: 'none',
                color: '#ffffff',
                width: '34px',
                height: '34px',
                borderRadius: '50%',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* HUD VIDEO VIEWPORT */}
        <div style={{ position: 'relative', background: '#000000', aspectRatio: '16/9', overflow: 'hidden' }}>
          <FluxCamera
            stream={streamDirect}
            imageRepli={imageUrlRepli}
            alt={camera.name}
            detections={liveDetections}
            style={{ width: '100%', height: '100%', objectFit: 'contain' }}
          />

          {/* STREAM OVERLAY */}
          <div style={{ position: 'absolute', top: '14px', left: '16px', display: 'flex', gap: '8px', alignItems: 'center', zIndex: 10 }}>
            <span style={{ background: isOffline ? 'rgba(239, 68, 68, 0.95)' : 'rgba(2, 132, 199, 0.85)', color: '#ffffff', fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOffline ? '#ef4444' : '#ffffff' }} />
              {isOffline ? '⚠️ HORS-LIGNE' : 'EN DIRECT HD'}
            </span>
            <span style={{ background: 'rgba(9, 17, 36, 0.75)', color: '#ffffff', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
              {camera.location}
            </span>
          </div>

          {/* COMPTEUR EN DIRECT DE PERSONNES DÉTECTÉES */}
          {!isOffline && (
            <div
              style={{
                position: 'absolute',
                bottom: '16px',
                right: '16px',
                background: livePersonCount > 0 ? 'rgba(2, 132, 199, 0.9)' : 'rgba(9, 17, 36, 0.75)',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px',
                zIndex: 10
              }}
            >
              {livePersonCount} personne(s) détectée(s)
            </div>
          )}
        </div>

        {/* BOTTOM CONTROLS TOOLBAR */}
        <div style={{ padding: '14px 20px', background: '#091124', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={takeSnapshot}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              <Camera size={15} />
              <span>Prendre une photo</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}

export default CameraViewModal;
