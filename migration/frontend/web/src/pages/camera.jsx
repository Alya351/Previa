import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  API_BASE, urlFluxWebSocket, urlDirectEmettre, envoyerFrameVoir, envoyerFrameQui, listerCameras,
} from '../api.js';
import logoPrevia from '../assets/logo_previa_clean.png';
import { Icone } from '../lib/icones.jsx';
import './camera.css';

// Porté depuis frontend/web/cam/cam.js + index.html — même comportement
// (capture toutes les 2s, redimensionnement avant envoi, séquence
// /voir PUIS /qui, jamais en parallèle) — adapté à l'architecture
// multi-caméra : l'ancien système postait sur "/voir"/"/qui" globaux
// (une seule caméra possible) ; ici il faut D'ABORD choisir SUR QUELLE
// caméra enregistrée ce flux correspond (voir le sélecteur), puis on
// poste sur /cameras/{id}/voir et /cameras/{id}/qui.
//
// Pas de connexion requise ici, comme dans l'ancien système — cette page
// est pensée pour tourner sur l'appareil physique pointé sur la scène
// (un téléphone à l'entrée, par exemple), pas forcément un poste admin.

const ANALYSE_INTERVAL_MS = 2000;
const LARGEUR_MAX_ENVOI = 640;

// Flux "en direct" — vraie vidéo WebRTC, pas des JPEG répétés (voir
// Infrastructure/signalisation_webrtc.py côté backend pour le
// protocole complet). Séparé de ANALYSE_INTERVAL_MS : l'analyse IA
// continue à son rythme actuel, inchangé ; ce flux sert uniquement à
// l'affichage (tableau de bord, modale caméra), et une fois la
// connexion établie, la vidéo circule DIRECTEMENT entre ce navigateur
// et celui du spectateur — plus par ce serveur, comme un appel Meet en
// pair-à-pair. Un serveur STUN public aide à l'établissement de la
// connexion (gratuit, ne voit jamais la vidéo elle-même) ; en réseau
// local, une connexion directe (candidats "host") suffit généralement
// déjà, le STUN est juste un filet de sécurité si jamais ce n'est pas
// le cas.
const CONFIG_ICE = { iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] };

export default function Camera() {
  const videoRef = useRef(null);
  const canvasRef = useRef(null);
  const streamRef = useRef(null);
  const loopRef = useRef(null);
  const busyRef = useRef(false);
  const facingModeRef = useRef('environment');

  // Flux en direct (affichage, WebRTC) — séparé de la capture d'analyse
  // ci-dessus. wsSignalRef : le WebSocket de signalisation (négociation
  // SDP/ICE UNIQUEMENT, jamais la vidéo). peersRef : une RTCPeerConnection
  // PAR spectateur connecté (voir signalisation_webrtc.py — mode
  // "maillage", une connexion directe par spectateur).
  const wsSignalRef = useRef(null);
  const peersRef = useRef(new Map());

  const [cameras, setCameras] = useState([]);
  const [idCamera, setIdCamera] = useState(() => localStorage.getItem('previa_broadcaster_camera') || '');
  const [chargementCameras, setChargementCameras] = useState(true);

  const [actif, setActif] = useState(false);
  const [erreur, setErreur] = useState('');
  const [framesEnvoyees, setFramesEnvoyees] = useState(0);
  const [derniereLatence, setDerniereLatence] = useState(null);
  const [statutVoir, setStatutVoir] = useState(null);
  const [statutQui, setStatutQui] = useState(null);

  useEffect(() => {
    chargerCameras();
    return () => arreterCamera();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function chargerCameras() {
    try {
      const [cams, pieces, batiments] = await Promise.all([
        listerCameras().catch(() => []),
        fetch(`${API_BASE}/pieces`).then((r) => r.json()).catch(() => []),
        fetch(`${API_BASE}/batiments`).then((r) => r.json()).catch(() => []),
      ]);
      const enrichies = cams.map((c) => {
        const p = pieces.find((pp) => pp.id === c.piece_id);
        const b = p ? batiments.find((bb) => bb.id === p.batiment_id) : null;
        return { ...c, nomPiece: p?.nom, nomBatiment: b?.nom };
      });
      setCameras(enrichies);
      if (enrichies.length > 0) {
        const saved = localStorage.getItem('previa_broadcaster_camera');
        if (saved && enrichies.some((c) => c.id === saved)) {
          setIdCamera(saved);
        } else {
          setIdCamera(enrichies[0].id);
        }
      }
    } catch {
      setErreur('Impossible de charger la liste des caméras enregistrées.');
    } finally {
      setChargementCameras(false);
    }
  }

  async function demarrerCamera() {
    setErreur('');
    if (!idCamera) {
      setErreur("Choisis d'abord une caméra enregistrée dans la liste ci-dessus.");
      return;
    }
    try {
      const flux = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: facingModeRef.current },
        audio: false,
      });
      streamRef.current = flux;
      if (videoRef.current) videoRef.current.srcObject = flux;
      setActif(true);
      loopRef.current = setInterval(() => capturerEtEnvoyer(idCamera), ANALYSE_INTERVAL_MS);
      demarrerSignalisation(idCamera);
    } catch (e) {
      setErreur(`Erreur caméra : ${e.message} (HTTPS et autorisation navigateur requis).`);
    }
  }

  function arreterCamera() {
    if (loopRef.current) clearInterval(loopRef.current);
    if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    if (videoRef.current) videoRef.current.srcObject = null;
    setActif(false);
    arreterSignalisation();
  }

  // Ouvre le WebSocket de signalisation (.../direct/emettre) — ne porte
  // que les messages SDP/ICE, jamais la vidéo (voir CONFIG_ICE
  // ci-dessus et signalisation_webrtc.py). Ne bloque jamais le
  // démarrage de la caméra si la connexion échoue (réseau capricieux,
  // backend pas encore prêt...) — l'analyse IA, elle, continue de
  // fonctionner indépendamment.
  function demarrerSignalisation(camId) {
    try {
      const ws = new WebSocket(urlDirectEmettre(camId));
      wsSignalRef.current = ws;
      ws.onmessage = (evt) => traiterMessageSignalisation(JSON.parse(evt.data));
      ws.onerror = () => { /* silencieux : le flux direct est un bonus d'affichage, pas l'analyse */ };
    } catch (e) { /* pas grave, l'analyse IA continue sans le flux direct */ }
  }

  function arreterSignalisation() {
    if (wsSignalRef.current) { wsSignalRef.current.close(); wsSignalRef.current = null; }
    peersRef.current.forEach((pc) => pc.close());
    peersRef.current.clear();
  }

  async function traiterMessageSignalisation(message) {
    const ws = wsSignalRef.current;
    if (!ws) return;

    if (message.type === 'nouveau_spectateur') {
      // Un navigateur vient de se connecter à .../direct/regarder pour
      // cette caméra — on lui crée SA propre connexion WebRTC (mode
      // maillage, voir signalisation_webrtc.py) et on lui envoie une
      // offre.
      const id = message.id;
      const pc = new RTCPeerConnection(CONFIG_ICE);
      peersRef.current.set(id, pc);

      if (streamRef.current) {
        streamRef.current.getTracks().forEach((piste) => pc.addTrack(piste, streamRef.current));
      }

      pc.onicecandidate = (evt) => {
        if (evt.candidate) {
          ws.send(JSON.stringify({ type: 'ice', pour: id, candidat: evt.candidate }));
        }
      };

      try {
        const offre = await pc.createOffer();
        await pc.setLocalDescription(offre);
        ws.send(JSON.stringify({ type: 'offre', pour: id, sdp: pc.localDescription }));
      } catch (e) { /* pas grave, ce spectateur en particulier n'aura pas d'image */ }
      return;
    }

    if (message.type === 'reponse') {
      const pc = peersRef.current.get(message.de);
      if (pc) {
        try { await pc.setRemoteDescription(new RTCSessionDescription(message.sdp)); }
        catch (e) { /* connexion probablement déjà fermée entre-temps */ }
      }
      return;
    }

    if (message.type === 'ice') {
      const pc = peersRef.current.get(message.de);
      if (pc && message.candidat) {
        try { await pc.addIceCandidate(new RTCIceCandidate(message.candidat)); }
        catch (e) { /* candidat arrivé trop tard ou connexion fermée, sans gravité */ }
      }
      return;
    }

    if (message.type === 'spectateur_parti') {
      const pc = peersRef.current.get(message.id);
      if (pc) { pc.close(); peersRef.current.delete(message.id); }
    }
  }

  async function changerCamera() {
    arreterCamera();
    facingModeRef.current = facingModeRef.current === 'environment' ? 'user' : 'environment';
    await demarrerCamera();
  }

  function prendreCapture() {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);
    const url = canvas.toDataURL('image/jpeg', 0.9);
    const a = document.createElement('a');
    a.href = url;
    a.download = `previa_capture_${Date.now()}.jpg`;
    a.click();
  }

  function capturerEtEnvoyer(camId) {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (busyRef.current || !video?.videoWidth) return;
    busyRef.current = true;

    const echelle = Math.min(1, LARGEUR_MAX_ENVOI / video.videoWidth);
    canvas.width = Math.round(video.videoWidth * echelle);
    canvas.height = Math.round(video.videoHeight * echelle);
    canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

    const debut = performance.now();

    canvas.toBlob(async (blob) => {
      if (!blob) { busyRef.current = false; return; }
      try {
        // Séquentiel : /voir écrit les objets, puis /qui analyse les personnes
        const resVoir = await envoyerFrameVoir(camId, blob).catch((e) => ({ err: e.message }));
        const resQui = await envoyerFrameQui(camId, blob).catch((e) => ({ err: e.message }));

        setDerniereLatence(Math.round(performance.now() - debut));
        setFramesEnvoyees((f) => f + 1);
        setStatutVoir(resVoir?.err ? 'err' : 200);
        setStatutQui(resQui?.err ? 'err' : 200);
      } catch (e) {
        setErreur(`Erreur lors de l'envoi de la trame : ${e.message}`);
        setStatutVoir('err');
        setStatutQui('err');
      } finally {
        busyRef.current = false;
      }
    }, 'image/jpeg', 0.85);
  }

  const camActuelle = cameras.find((c) => c.id === idCamera);

  return (
    <div className="cam-page">
      <header className="cam-header">
        <div className="cam-header-brand">
          <img src={logoPrevia} alt="Previa" />
          <span>Flux Caméra & Surveillance</span>
        </div>
        <Link className="cam-lien-admin" to="/admin">Dashboard Admin <Icone.flecheDroite width={14} height={14} /></Link>
      </header>

      <div className="cam-corps">
        <div className="cam-selecteur">
          <label>Caméra enregistrée</label>
          {chargementCameras ? (
            <p className="db-vide">Chargement...</p>
          ) : cameras.length === 0 ? (
            <p className="db-vide">
              Aucune caméra enregistrée — crée-en une depuis le tableau de bord admin avant de démarrer un flux.
            </p>
          ) : (
            <select
              className="cam-select"
              value={idCamera}
              disabled={actif}
              onChange={(e) => {
                setIdCamera(e.target.value);
                localStorage.setItem('previa_broadcaster_camera', e.target.value);
              }}
            >
              {cameras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.num} — {c.nomBatiment || '?'} / {c.nomPiece || '?'}{c.est_entree ? ' (entrée)' : ''}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="cam-viewport">
          <video ref={videoRef} autoPlay playsInline muted />
          {!actif && (
            <div className="cam-vide-message">
              {camActuelle ? `Prêt à démarrer sur ${camActuelle.num}` : 'Choisis une caméra puis démarre le flux'}
            </div>
          )}
          <div className="cam-hud-coin tl" /><div className="cam-hud-coin tr" />
          <div className="cam-hud-coin bl" /><div className="cam-hud-coin br" />
          <div className="cam-overlay-haut">
            {actif && (
              <div className="cam-rec-badge"><span className="cam-rec-dot" />REC</div>
            )}
            <div className="cam-fps-badge">{actif ? 'TRANSMISSION LIVE' : 'SYS IDLE'}</div>
          </div>
        </div>

        <div className="cam-controles">
          <button className="cam-btn primaire" onClick={demarrerCamera} disabled={actif || cameras.length === 0}><Icone.lecture width={15} height={15} /> Démarrer la caméra</button>
          <button className="cam-btn danger" onClick={arreterCamera} disabled={!actif}><Icone.stop width={15} height={15} /> Arrêter</button>
          <button className="cam-btn secondaire" onClick={changerCamera} disabled={!actif}><Icone.rotation width={15} height={15} /> Changer caméra</button>
          <button className="cam-btn secondaire" onClick={prendreCapture} disabled={!actif}><Icone.appareilPhoto width={15} height={15} /> Capture</button>
        </div>

        <div className="cam-telemetrie">
          <div className="cam-tel-titre">
            <span>Console de télémétrie</span>
            <span className={`cam-tel-statut ${erreur ? 'erreur' : actif ? 'actif' : 'inactif'}`}>
              {erreur ? 'ERREUR' : actif ? 'FLUX ACTIF' : 'INACTIF'}
            </span>
          </div>
          <div className="cam-tel-grille">
            <div className="cam-tel-item"><div className="cam-tel-label">Trames envoyées</div><div className="cam-tel-val">{framesEnvoyees}</div></div>
            <div className="cam-tel-item"><div className="cam-tel-label">Dernière latence</div><div className="cam-tel-val">{derniereLatence != null ? `${derniereLatence} ms` : '--'}</div></div>
            <div className="cam-tel-item"><div className="cam-tel-label">/voir</div><div className={`cam-tel-val ${statutVoir === 200 ? 'ok' : statutVoir ? 'err' : ''}`}>{statutVoir === 200 ? '200 OK' : statutVoir || '--'}</div></div>
            <div className="cam-tel-item"><div className="cam-tel-label">/qui</div><div className={`cam-tel-val ${statutQui === 200 ? 'ok' : statutQui ? 'err' : ''}`}>{statutQui === 200 ? '200 OK' : statutQui || '--'}</div></div>
          </div>
          {erreur && <div className="cam-erreur">{erreur}</div>}
        </div>
      </div>

      <canvas ref={canvasRef} style={{ display: 'none' }} />
    </div>
  );
}
