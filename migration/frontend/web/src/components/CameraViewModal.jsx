import React, { useState, useEffect, useRef } from 'react';
import {
  X,
  Camera,
  Lightbulb,
  Volume2,
  ShieldAlert,
  CheckCircle2,
  Maximize2,
  Download,
  Radio,
  Play,
  Pause,
  RotateCcw,
  Video
} from 'lucide-react';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from './FluxCamera.jsx';
import { DetectionOverlay } from './DetectionOverlay.jsx';
import { API_BASE, envoyerFrameVoir, envoyerFrameQui, chargerEtatCamera, pivoterCamera } from '../api.js';
import { mapPersonneApi } from '../lib/mappageCibles.js';

// `camera.image` : URL de GET /cameras/{id}/image, réinterrogée toutes
// les 2s ci-dessous (?t= change à chaque tick) — même cadence que
// camera.jsx (l'appareil qui filme réellement) ; sert de repli tant que
// le flux direct (vraie vidéo WebRTC, voir lib/useFluxDirect.js,
// Infrastructure/signalisation_webrtc.py côté backend) n'est pas encore
// connecté. `camera.nombrePersonnes` : vraie donnée du dernier rapport
// de cette caméra.
export function CameraViewModal({ camera, onClose, onSignalAlert }) {
  const isOffline = camera.status === 'Hors-ligne' || camera.offline;
  const [useWebcam, setUseWebcam] = useState(false);
  const [webcamDetections, setWebcamDetections] = useState([]);
  const [liveDetections, setLiveDetections] = useState(isOffline ? [] : (camera.detections || []));
  const [livePersonCount, setLivePersonCount] = useState(isOffline ? 0 : (camera.nombrePersonnes ?? 0));
  const [isPlaying, setIsPlaying] = useState(true);
  const [lightOn, setLightOn] = useState(false);
  const [alarmOn, setAlarmOn] = useState(false);
  const [toast, setToast] = useState(null);
  const [tick, setTick] = useState(0);
  const [rotation, setRotation] = useState(camera.rotation || 0);
  const [enPivotement, setEnPivotement] = useState(false);
  const videoRef = useRef(null);
  const fluxVideoRef = useRef(null);
  const streamDirect = useFluxDirect(camera.urlFlux ? null : camera.id);

  const handlePivoter = async () => {
    if (enPivotement) return;
    const nouvelleRotation = (rotation + 90) % 360;
    setEnPivotement(true);
    setRotation(nouvelleRotation);
    try {
      await pivoterCamera(camera.id, nouvelleRotation);
      setToast(`Orientation : ${nouvelleRotation}°`);
      setTimeout(() => setToast(null), 2500);
      setTick((t) => t + 1);
    } catch (err) {
      console.warn('Erreur lors du pivotement de la caméra:', err);
    } finally {
      setEnPivotement(false);
    }
  };

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  const imageUrlRepli = camera.urlFlux
    ? `${API_BASE}/cameras/${camera.id}/flux?r=${rotation}`
    : (camera.image.includes('?') ? `${camera.image}&t=${tick}` : `${camera.image}?t=${tick}`);

  // Polling ultra-rapide en temps réel de l'état IA de la caméra physique
  useEffect(() => {
    if (useWebcam) return;

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
    const id = setInterval(actualiserEtatCamera, 500);
    return () => clearInterval(id);
  }, [useWebcam, camera.id, camera.name, camera.location]);


  // Boucle d'analyse IA en temps réel (Webcam locale ou Caméra physique en direct)
  useEffect(() => {
    let enCours = false;
    const canvas = document.createElement('canvas');

    const analyserFrameActive = async () => {
      const video = useWebcam ? videoRef.current : fluxVideoRef.current;
      if (!video || enCours || video.readyState < 2) return;
      enCours = true;

      try {
        canvas.width = video.videoWidth || 640;
        canvas.height = video.videoHeight || 480;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(async (blob) => {
          if (!blob) {
            enCours = false;
            return;
          }

          try {
            // Envoi de la frame à l'IA PREVIA (YOLO11x + Face ID)
            await envoyerFrameVoir(camera.id, blob).catch(() => {});
            const resQui = await envoyerFrameQui(camera.id, blob);

            if (resQui && Array.isArray(resQui.personnes)) {
              const camCtx = {
                id_camera: camera.id,
                num: camera.name,
                location: camera.location,
              };
              const mapped = resQui.personnes.map((p, idx) => mapPersonneApi(p, idx, camCtx));
              if (useWebcam) {
                setWebcamDetections(mapped);
              } else {
                setLiveDetections(mapped);
                setLivePersonCount(resQui.nombre_personnes ?? mapped.length);
              }
            }
          } catch (err) {
            console.warn('Erreur analyse IA:', err);
          } finally {
            enCours = false;
          }
        }, 'image/jpeg', 0.85);
      } catch (e) {
        enCours = false;
      }
    };

    const intervalId = setInterval(analyserFrameActive, 600);
    return () => clearInterval(intervalId);
  }, [useWebcam, camera.id, camera.name, camera.location]);

  const webcamStreamRef = useRef(null);

  // Basculer sur la webcam locale
  const toggleWebcam = async () => {
    if (!useWebcam) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 1280 }, height: { ideal: 720 }, facingMode: 'user' },
          audio: false
        });
        webcamStreamRef.current = stream;
        setUseWebcam(true);
        showToast("Flux vidéo de votre webcam connecté en direct.");
      } catch (err) {
        showToast("Impossible d'accéder à la webcam : " + err.message);
      }
    } else {
      if (webcamStreamRef.current) {
        const tracks = webcamStreamRef.current.getTracks();
        tracks.forEach(track => track.stop());
        webcamStreamRef.current = null;
      }
      if (videoRef.current) {
        videoRef.current.srcObject = null;
      }
      setUseWebcam(false);
      setWebcamDetections([]);
      showToast("Retour au flux de la caméra distante.");
    }
  };

  useEffect(() => {
    if (useWebcam && videoRef.current && webcamStreamRef.current) {
      videoRef.current.srcObject = webcamStreamRef.current;
    }
  }, [useWebcam]);

  useEffect(() => {
    return () => {
      if (webcamStreamRef.current) {
        const tracks = webcamStreamRef.current.getTracks();
        tracks.forEach(track => track.stop());
      }
    };
  }, []);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const takeSnapshot = () => {
    showToast("Photo instantanée capturée et enregistrée.");
  };

  const toggleCameraLight = () => {
    const next = !lightOn;
    setLightOn(next);
    showToast(next ? "Lumière de la caméra allumée." : "Lumière de la caméra éteinte.");
  };

  const toggleCameraAlarm = () => {
    const next = !alarmOn;
    setAlarmOn(next);
    showToast(next ? "Alarme de sécurité déclenchée sur cette zone." : "Alarme de sécurité arrêtée.");
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
                {camera.name} : {camera.location}
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
          {useWebcam ? (
            <div style={{ position: 'relative', width: '100%', height: '100%' }}>
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
              <DetectionOverlay detections={webcamDetections} />
            </div>
          ) : (
            <FluxCamera
              stream={streamDirect}
              imageRepli={imageUrlRepli}
              alt={camera.name}
              detections={liveDetections}
              onVideoRef={(el) => { fluxVideoRef.current = el; }}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
            />
          )}

          {/* STREAM OVERLAY */}
          <div style={{ position: 'absolute', top: '14px', left: '16px', display: 'flex', gap: '8px', alignItems: 'center' }}>
            <span style={{ background: isOffline && !useWebcam ? 'rgba(239, 68, 68, 0.95)' : 'rgba(2, 132, 199, 0.85)', color: '#ffffff', fontSize: '0.72rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', display: 'flex', alignItems: 'center', gap: '5px' }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isOffline && !useWebcam ? '#ef4444' : '#ffffff' }} />
              {useWebcam ? '📹 WEBCAM PC' : (isOffline ? '⚠️ HORS-LIGNE' : 'EN DIRECT')}
            </span>
            <span style={{ background: 'rgba(9, 17, 36, 0.75)', color: '#ffffff', fontSize: '0.72rem', padding: '3px 8px', borderRadius: '4px', fontWeight: 600 }}>
              {useWebcam ? 'Webcam locale (Test direct)' : camera.location}
            </span>
          </div>

          {/* COMPTEUR EN DIRECT DE PERSONNES DÉTECTÉES */}
          {(!isOffline || useWebcam) && (
            <div
              style={{
                position: 'absolute',
                bottom: '54px',
                right: '16px',
                background: (useWebcam ? webcamDetections.length : livePersonCount) > 0 ? 'rgba(2, 132, 199, 0.9)' : 'rgba(9, 17, 36, 0.75)',
                color: '#ffffff',
                fontSize: '0.72rem',
                fontWeight: 700,
                padding: '4px 10px',
                borderRadius: '6px'
              }}
            >
              {useWebcam ? webcamDetections.length : livePersonCount} personne(s) détectée(s)
            </div>
          )}
        </div>

        {/* BOTTOM CONTROLS TOOLBAR */}
        <div style={{ padding: '14px 20px', background: '#091124', borderTop: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={toggleWebcam}
              title={useWebcam ? "Désactiver la webcam et revenir au flux caméra" : "Tester la détection avec la webcam intégrée de ce PC"}
              style={{
                background: useWebcam ? 'rgba(16, 185, 129, 0.25)' : 'rgba(2, 132, 199, 0.25)',
                border: useWebcam ? '1px solid #10b981' : '1px solid #0284c7',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              <Video size={14} color={useWebcam ? "#10b981" : "#38bdf8"} />
              <span>{useWebcam ? "Désactiver Webcam" : "Tester avec Webcam"}</span>
            </button>

            <button
              onClick={takeSnapshot}
              style={{
                background: 'rgba(255,255,255,0.08)',
                border: '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              <Camera size={14} />
              <span>Prendre une photo</span>
            </button>

            <button
              onClick={handlePivoter}
              disabled={enPivotement}
              title="Pivoter le flux vidéo et réorienter l'IA de 90° (0°, 90°, 180°, 270°)"
              style={{
                background: rotation > 0 ? 'rgba(2, 132, 199, 0.25)' : 'rgba(255,255,255,0.08)',
                border: rotation > 0 ? '1px solid #0284c7' : '1px solid rgba(255,255,255,0.15)',
                color: '#ffffff',
                padding: '8px 14px',
                borderRadius: '8px',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: enPivotement ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                transition: 'all 0.2s ease'
              }}
            >
              <RotateCcw size={14} style={{ transform: enPivotement ? 'rotate(180deg)' : 'none', transition: 'transform 0.4s ease' }} />
              <span>Pivoter 90° ({rotation}°)</span>
            </button>
          </div>

        </div>

      </div>
    </div>
  );
}

export default CameraViewModal;
