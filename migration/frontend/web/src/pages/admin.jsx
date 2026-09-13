import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, BarChart3, Building2, Cctv, Check, CheckCircle, CheckCircle2,
  Clock, DoorOpen, Download, Eye, FileSpreadsheet, FileText, Filter, Info, KeyRound, LayoutGrid,
  Lightbulb, List, Loader2, Mail, MapPin, Menu, Package, Play, Plus, RefreshCw, Save, Search,
  Router, Shield, ShieldAlert, ShieldCheck, Target, Trash2, TrendingUp, Undo2, Users, Volume2,
  VolumeX, Wifi, WifiOff, Zap, ZoomIn,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import HeaderDecor from '../components/HeaderDecor';
import KpiCards from '../components/KpiCards';
import LiveCameraGrid from '../components/LiveCameraGrid';
import AiAnalysisCard from '../components/AiAnalysisCard';
import CameraViewModal from '../components/CameraViewModal';
import PrecursorDetailModal from '../components/PrecursorDetailModal';
import {
  API_BASE, chargerEtatAlarme, arreterAlarme, listerEsp, chargerEtatEsp, ajouterReseauEsp,
  supprimerReseauEsp, basculerReseauEsp, chargerEtatLicence, activerLicence,
} from '../api.js';
import { useFluxDirect } from '../lib/useFluxDirect.js';
import { FluxCamera } from '../components/FluxCamera.jsx';
import {
  mapPersonneApi, mapObjetInstanceApi, mapFeuFumeeAlerte, mapZoneSuspecte,
  avisIALibelle, construireFicheDetail,
} from '../lib/mappageCibles.js';
import './admin.css';

// Tableau de bord — interface reprise TELLE QUELLE de /home/rakine/osc/web
// (composants dans ../components/, design dans admin.css), avec de vraies
// données à la place des données fictives d'origine (poll de
// GET /vue-ensemble, GET /cameras/{id}/etat et GET /alertes toutes les
// 2s, voir Admin() plus bas) et deux ajouts absents de la maquette :
// l'onglet Organisation (comptes/bâtiments/pièces/caméras, réservé au
// compte admin par défaut) et les onglets Personnes/Objets (listing
// complet des cibles, avec fiche détaillée — repris de l'ancien
// migration/admin.jsx). Un seul fichier, comme le reste de pages/ : les
// 8 sections (avant séparées en composants webui/views/*.jsx) sont
// simplement des fonctions de ce module, plus bas ; seuls les
// composants réellement partagés (Sidebar, cartes...) restent dans
// ../components/.

// ============================================================================
// LICENCE — écran de remplacement TOTAL quand elle n'est plus active
// (voir Infrastructure/licence.py côté backend). Aucun Sidebar, aucun
// HeaderDecor, aucun onglet : un seul "menu", ce message, exactement
// comme demandé — l'app normale (Admin(), plus bas) ne se rend PAS tant
// que /systeme/licence/etat ne répond pas "active".
// ============================================================================
const MESSAGES_LICENCE = {
  expiree: "Le code d'amorçage de cette installation a expiré (valable 1 an).",
  desactivee: "Le code d'amorçage de cette installation a été désactivé.",
};

function LicenceDisabledScreen({ statut, onActivee }) {
  const [code, setCode] = useState('');
  const [enCours, setEnCours] = useState(false);
  const [erreur, setErreur] = useState('');

  async function activer(e) {
    e.preventDefault();
    if (!code.trim()) return;
    setErreur('');
    setEnCours(true);
    try {
      const nouvelEtat = await activerLicence(code.trim());
      onActivee(nouvelEtat);
    } catch (err) {
      setErreur(err.message || 'Code invalide.');
    } finally {
      setEnCours(false);
    }
  }

  return (
    <div
      style={{
        minHeight: '100vh', width: '100vw', background: '#eaf2fe',
        backgroundImage: 'radial-gradient(circle at 10% 20%, rgba(2, 132, 199, 0.08) 0%, transparent 40%), radial-gradient(circle at 90% 80%, rgba(0, 180, 216, 0.08) 0%, transparent 40%)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '24px',
      }}
    >
      <div
        style={{
          background: '#ffffff', width: '100%', maxWidth: '440px', borderRadius: '24px',
          boxShadow: '0 25px 70px rgba(2, 132, 199, 0.15), 0 10px 30px rgba(0, 0, 0, 0.04)',
          padding: '44px 38px', display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
        }}
      >
        <div style={{
          width: 64, height: 64, borderRadius: '50%', background: '#fee2e2',
          display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
        }}>
          <ShieldAlert size={30} color="#dc2626" />
        </div>

        <h2 style={{ fontSize: '1.4rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
          Système désactivé
        </h2>
        <p style={{ fontSize: '0.92rem', color: 'var(--ink-muted)', marginTop: 10, lineHeight: 1.55 }}>
          {MESSAGES_LICENCE[statut] || "La licence de cette installation n'est plus active."}
          {' '}Payez un nouveau code ou contactez Previa sur le site officiel.
        </p>

        <form onSubmit={activer} style={{ width: '100%', marginTop: 26, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ position: 'relative' }}>
            <KeyRound size={18} style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
            <input
              type="text"
              placeholder="Nouveau code d'amorçage"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              style={{ width: '100%', padding: '12px 14px 12px 42px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#f8fafc', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.9rem', outline: 'none' }}
            />
          </div>

          {erreur && (
            <div style={{ background: '#fee2e2', color: '#dc2626', padding: '10px 14px', borderRadius: '10px', fontSize: '0.84rem', fontWeight: 600 }}>
              {erreur}
            </div>
          )}

          <button
            type="submit"
            disabled={enCours || !code.trim()}
            style={{
              background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)', color: '#ffffff', border: 'none',
              padding: '13px', borderRadius: '12px', fontSize: '0.92rem', fontWeight: 700, cursor: 'pointer',
              opacity: enCours || !code.trim() ? 0.7 : 1, boxShadow: '0 8px 20px rgba(2, 132, 199, 0.3)',
            }}
          >
            {enCours ? 'Vérification...' : 'Activer ce code'}
          </button>
        </form>

        <a
          href="mailto:contact@previa.app"
          style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 22, fontSize: '0.86rem', color: '#0284c7', fontWeight: 700, textDecoration: 'none' }}
        >
          <Mail size={15} /> Contacter Previa
        </a>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION : TABLEAU DE BORD
// ============================================================================

function DashboardView({
  onToggleSidebar, onSelectTab,
  kpis = {}, cameras = [], situations = [], alerteEnCours = null,
}) {
  const [selectedCamera, setSelectedCamera] = useState(null);
  const [selectedSituation, setSelectedSituation] = useState(null);

  const handleSelectModule = (id) => {
    const situation = situations.find((s) => s.id === id);
    setSelectedSituation(situation ? construireFicheDetail(situation._item) : null);
  };

  return (
    <div className="content-body">
      {/* WELCOME BANNER HEADER */}
      <div className="welcome-header">
        <div className="welcome-title-group">
          <button
            className="hamburger-btn"
            onClick={onToggleSidebar}
            title="Afficher/Masquer le menu latéral"
          >
            <Menu size={24} strokeWidth={2.2} />
          </button>
          <div>
            <h1 className="welcome-heading">
              Bienvenue sur <span>Previa</span>
            </h1>
            <p className="welcome-sub">
              Surveillance intelligente par analyse comportementale
            </p>
          </div>
        </div>
      </div>

      {/* 4 TOP KPI CARDS WITH DIRECT VIEW NAVIGATION */}
      <KpiCards
        activeCameras={kpis.activeCameras ?? 0}
        detectedPersons={kpis.detectedPersons ?? 0}
        suspectBehaviors={kpis.suspectBehaviors ?? 0}
        uptimeRate={kpis.uptimeRate ?? '—'}
        onNavigate={(tab) => onSelectTab(tab)}
      />

      {/* TWO COLUMN GRID: FLUX EN DIRECT + ANALYSES IA */}
      <div className="main-two-column-grid">
        {/* LEFT COLUMN: 3X2 LIVE CAMERAS GRID */}
        <LiveCameraGrid cameras={cameras} onSelectCamera={(cam) => setSelectedCamera(cam)} />

        {/* RIGHT COLUMN: AI ANALYSES & PRECURSOR MODULES */}
        <AiAnalysisCard situations={situations} alerteEnCours={alerteEnCours} onSelectModule={handleSelectModule} />
      </div>

      {/* LIVE CAMERA MODAL */}
      {selectedCamera && (
        <CameraViewModal
          camera={selectedCamera}
          onClose={() => setSelectedCamera(null)}
          onSignalAlert={(cam) => {
            onSelectTab('alerts');
          }}
        />
      )}

      {/* DETAILED PRECURSOR INSPECTION MODAL (OBJETS ABANDONNES, RODAGE, ETC.) */}
      {selectedSituation && (
        <PrecursorDetailModal
          situation={selectedSituation}
          onClose={() => setSelectedSituation(null)}
          onActionConfirmed={(actionName, data) => {
            // Action locale uniquement (voir PrecursorDetailModal) — pas
            // d'endpoint backend dédié pour "vérifié", même logique que
            // signaler/suivre plus bas (CiblesView).
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// SECTION : CAMÉRAS (+ dessin de zones non autorisées)
// ============================================================================

// Dessin de zone non autorisée par caméra — fonctionnalité réelle de
// migration (voir backend/fonctionnalites/zoneCam/), déplacée ici (l'onglet
// Configuration séparé a été retiré) avec le même langage visuel (cartes
// blanches, style en ligne) que le reste de cette section.
function SectionZones({ cameras }) {
  const [idCamera, setIdCamera] = useState(cameras[0]?.id || '');
  const [tick, setTick] = useState(0);
  const [points, setPoints] = useState([]);
  const [zoneExistante, setZoneExistante] = useState(null);
  const [ratio, setRatio] = useState(4 / 3);
  const [imageOk, setImageOk] = useState(true);
  const [message, setMessage] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const viewportRef = useRef(null);
  // Vraie vidéo WebRTC (voir lib/useFluxDirect.js) pour dessiner la zone
  // directement sur le flux en direct plutôt que sur une image statique
  // rafraîchie toutes les 2s — les coordonnées de clic restent en %
  // relatifs au conteneur, donc valables pareil que ce soit une <video>
  // ou une <img> en dessous (voir clicSurImage). Retombe sur l'image
  // statique tant que la connexion n'est pas établie.
  const streamDirect = useFluxDirect(idCamera);

  useEffect(() => {
    if (cameras.length > 0 && !cameras.some((c) => c.id === idCamera)) setIdCamera(cameras[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras.map((c) => c.id).join(',')]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPoints([]); setMessage(null); setZoneExistante(null);
    if (!idCamera) return;
    fetch(`${API_BASE}/cameras/${idCamera}/zone`)
      .then((r) => (r.ok ? r.json() : null))
      .then((z) => { if (z) { setZoneExistante(z); setPoints(z.points); } })
      .catch(() => {});
  }, [idCamera]);

  const camActuelle = cameras.find((c) => c.id === idCamera);

  function clicSurImage(e) {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPoints((prev) => [...prev, { x, y }]);
  }

  async function enregistrer() {
    if (points.length < 3) { setMessage({ ok: false, texte: 'Il faut au moins 3 points.' }); return; }
    setEnregistrement(true);
    try {
      const res = await fetch(`${API_BASE}/cameras/${idCamera}/zone`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id_admin: sessionStorage.getItem('previa_utilisateur_id'), points }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error(data?.detail || `Erreur ${res.status}`);
      setZoneExistante(data);
      setMessage({ ok: true, texte: 'Zone enregistrée.' });
    } catch (e) {
      setMessage({ ok: false, texte: e.message });
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer() {
    setEnregistrement(true);
    try {
      const res = await fetch(`${API_BASE}/cameras/${idCamera}/zone`, { method: 'DELETE' });
      if (!res.ok && res.status !== 404) throw new Error(`Erreur ${res.status}`);
      setZoneExistante(null); setPoints([]);
      setMessage({ ok: true, texte: 'Zone supprimée.' });
    } catch (e) {
      setMessage({ ok: false, texte: e.message });
    } finally {
      setEnregistrement(false);
    }
  }

  if (cameras.length === 0) return null;

  const polygonePoints = points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');

  return (
    <div style={{ background: '#ffffff', borderRadius: '18px', padding: '28px 32px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', marginTop: '24px' }}>
      <div style={{ marginBottom: '16px' }}>
        <h3 style={{ fontSize: '1.15rem', fontWeight: 700, color: 'var(--ink-primary)', margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
          <MapPin size={19} /> Zones non autorisées
        </h3>
        <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: '4px 0 0 0' }}>
          Dessine une zone sur l'image d'une caméra : toute personne détectée dedans déclenche une alerte "Intrusion en zone non autorisée".
        </p>
      </div>

      <select
        value={idCamera}
        onChange={(e) => setIdCamera(e.target.value)}
        style={{ padding: '8px 14px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontWeight: 600, background: '#ffffff', color: 'var(--ink-primary)', marginBottom: '16px', width: '100%', maxWidth: '360px' }}
      >
        {cameras.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.location}</option>)}
      </select>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '20px', alignItems: 'start' }}>
        <div
          ref={viewportRef}
          onClick={clicSurImage}
          style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#05070d', aspectRatio: String(ratio), cursor: 'crosshair', userSelect: 'none' }}
        >
          <FluxCamera
            stream={streamDirect}
            imageRepli={`${camActuelle?.image}?t=${tick}`}
            alt={camActuelle?.name}
            style={{ width: '100%', height: '100%', objectFit: 'cover', display: imageOk ? 'block' : 'none' }}
            onLoad={(e) => {
              const t = e.target;
              const largeur = t.naturalWidth || t.videoWidth;
              const hauteur = t.naturalHeight || t.videoHeight;
              setImageOk(true);
              setRatio((largeur && hauteur) ? largeur / hauteur : 4 / 3);
            }}
            onError={() => setImageOk(false)}
          />
          {!imageOk && (
            <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#94a3b8', fontSize: '0.82rem', textAlign: 'center', padding: '16px' }}>
              En attente d'une image de cette caméra…
            </div>
          )}
          <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
            {points.length >= 2 && <polygon points={polygonePoints} fill="rgba(2,132,199,0.25)" stroke="#0284c7" strokeWidth="2" vectorEffect="non-scaling-stroke" />}
            {points.slice(1).map((p, i) => (
              <line key={i} x1={points[i].x * 100} y1={points[i].y * 100} x2={p.x * 100} y2={p.y * 100} stroke="#0284c7" strokeWidth="2" vectorEffect="non-scaling-stroke" />
            ))}
          </svg>
          {points.map((p, i) => (
            <div key={i} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, marginLeft: '-10px', marginTop: '-10px', width: '20px', height: '20px', borderRadius: '50%', background: '#0284c7', border: '2px solid #fff', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none' }}>
              {i + 1}
            </div>
          ))}
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <div style={{ fontSize: '0.85rem', color: 'var(--ink-muted)' }}>{points.length} point(s) posé(s) — clique sur l'image pour en ajouter (3 minimum).</div>
          {zoneExistante && <div style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 600 }}>Zone déjà enregistrée pour cette caméra.</div>}
          {message && <div style={{ fontSize: '0.8rem', color: message.ok ? '#16a34a' : '#dc2626', fontWeight: 600 }}>{message.texte}</div>}

          <button onClick={() => setPoints((p) => p.slice(0, -1))} disabled={points.length === 0} style={btnSecondaire}>
            <Undo2 size={14} /> Annuler le dernier point
          </button>
          <button onClick={() => setPoints([])} disabled={points.length === 0} style={btnSecondaire}>
            <Trash2 size={14} /> Effacer
          </button>
          <button onClick={enregistrer} disabled={enregistrement || points.length < 3} style={btnPrimaire}>
            <Save size={14} /> Enregistrer la zone
          </button>
          {zoneExistante && (
            <button onClick={supprimer} disabled={enregistrement} style={btnSecondaire}>
              <Trash2 size={14} /> Supprimer la zone enregistrée
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

const btnSecondaire = {
  background: '#f8fafc', border: '1px solid var(--border-light)', color: 'var(--ink-secondary)',
  padding: '9px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 600, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
};
const btnPrimaire = {
  background: '#0284c7', border: 'none', color: '#ffffff',
  padding: '9px 14px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
};

function ilYA(horodatage) {
  if (!horodatage) return 'jamais';
  const s = Math.max(0, Math.round(Date.now() / 1000 - horodatage));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `il y a ${Math.round(s / 3600)} h`;
}

// `cameras` : branché sur les vraies caméras (voir Admin() plus bas) —
// remplace les 6 caméras fictives d'origine. "En ligne"/"Hors-ligne"
// dérivé de l'âge de la dernière image reçue (seuil : > 15s =
// hors-ligne), pas d'un FPS inventé.
function CamerasView({ cameras = [], onRefresh }) {
  const [selectedCam, setSelectedCam] = useState(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!selectedCam && cameras.length > 0) setSelectedCam(cameras[0].id);
  }, [cameras, selectedCam]);

  if (cameras.length === 0) {
    return (
      <div className="content-body">
        <div className="welcome-header">
          <div>
            <h1 className="welcome-heading">Supervision des <span>Caméras</span></h1>
            <p className="welcome-sub">Surveillance temporelle, gestion des occlusions et détection de pannes</p>
          </div>
        </div>
        <p style={{ color: 'var(--ink-muted)' }}>Aucune caméra enregistrée pour l'instant.</p>
      </div>
    );
  }

  const camerasEtat = cameras.map((c) => {
    const age = c.misAJourLe ? Date.now() / 1000 - c.misAJourLe : null;
    const isOff = age == null || age > 15;
    return {
      id: c.id,
      name: `${c.name} : ${c.location}`,
      image: `${c.image}?t=${tick}`,
      zone: c.location,
      status: isOff ? 'Hors-ligne' : 'En ligne',
      frameAge: age == null ? 'Aucune image reçue' : `${ilYA(c.misAJourLe)}`,
      persons: c.nombrePersonnes ?? 0,
      behavior: c.nombrePersonnes > 0 ? `${c.nombrePersonnes} personne(s) suivie(s)` : 'Aucune activité',
    };
  });

  const currentCamera = camerasEtat.find(c => c.id === selectedCam) || camerasEtat[0];
  const isOffline = currentCamera.status === 'Hors-ligne';
  // Flux direct (vraie vidéo WebRTC, voir lib/useFluxDirect.js) sur la
  // caméra affichée en grand ci-dessous — retombe sur l'image statique
  // (currentCamera.image, rafraîchie toutes les 2s) tant que la
  // connexion n'est pas établie. Les vignettes de la liste latérale
  // restent sur l'image statique (pas la peine d'ouvrir une connexion
  // par caméra juste pour de petites vignettes).
  const streamDirectCourant = useFluxDirect(currentCamera.id);

  const handleSync = () => {
    setIsSyncing(true);
    Promise.resolve(onRefresh && onRefresh()).finally(() => {
      setTimeout(() => setIsSyncing(false), 500);
    });
  };

  return (
    <div className="content-body">
      {/* CLEAN HEADER */}
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Supervision des <span>Caméras</span></h1>
          <p className="welcome-sub">Surveillance temporelle, gestion des occlusions et détection de pannes</p>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '24px' }}>
        {/* MAIN SELECTED CAMERA VIEW */}
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}>
          <div style={{ position: 'relative', borderRadius: '12px', overflow: 'hidden', background: '#000', aspectRatio: '16/9' }}>
            <FluxCamera
              stream={streamDirectCourant}
              imageRepli={currentCamera.image}
              alt={currentCamera.name}
              style={{ width: '100%', height: '100%', objectFit: 'cover', filter: isOffline ? 'grayscale(100%) opacity(0.5)' : 'none' }}
            />

            {/* STATUS BADGE */}
            <div
              style={{
                position: 'absolute',
                top: 12,
                left: 12,
                background: isOffline ? '#ef4444' : '#0284c7',
                color: '#fff',
                fontSize: '0.7rem',
                fontWeight: 800,
                padding: '4px 10px',
                borderRadius: '6px',
                display: 'flex',
                alignItems: 'center',
                gap: '6px'
              }}
            >
              {!isOffline && <span className="live-dot-pulse" />}
              <span>{isOffline ? '⚠️ CAMÉRA HORS-LIGNE (IMAGE TROP ANCIENNE)' : 'EN DIRECT'}</span>
            </div>

            {/* OCCLUSION / PERSISTENCE BADGE */}
            <div style={{ position: 'absolute', top: 12, right: 12, background: 'rgba(15,23,42,0.85)', color: '#00f0ff', padding: '4px 10px', borderRadius: '6px', fontSize: '0.7rem', fontFamily: 'JetBrains Mono, monospace' }}>
              Suivi actif continu (Tolérance occlusion)
            </div>

            <div style={{ position: 'absolute', bottom: 12, left: 12, right: 12, background: 'rgba(10, 17, 40, 0.9)', backdropFilter: 'blur(8px)', padding: '10px 16px', borderRadius: '8px', color: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <strong style={{ fontSize: '0.95rem' }}>{currentCamera.name}</strong>
                <div style={{ fontSize: '0.75rem', opacity: 0.85, color: '#38bdf8' }}>Analyse : {currentCamera.behavior}</div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <span style={{ background: isOffline ? 'rgba(239,68,68,0.2)' : 'rgba(16,185,129,0.2)', color: isOffline ? '#ef4444' : '#10b981', padding: '4px 8px', borderRadius: '4px', fontSize: '0.72rem', fontWeight: 700 }}>
                  {isOffline ? 'DÉFAILLANCE' : 'IA PREVIA ACTIVE'}
                </span>
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '16px', flexWrap: 'wrap', gap: '12px' }}>
            <div style={{ display: 'flex', gap: '16px', fontSize: '0.84rem', color: 'var(--ink-muted)' }}>
              <span>Latence image : <strong style={{ color: isOffline ? '#ef4444' : 'var(--ink-primary)' }}>{currentCamera.frameAge}</strong></span>
              <span>Cibles suivies : <strong style={{ color: 'var(--ink-primary)' }}>{currentCamera.persons}</strong></span>
              <span>Filtrage mobilier : <strong style={{ color: '#10b981' }}>Actif (0 faux positif)</strong></span>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleSync}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  padding: '8px 14px',
                  borderRadius: '8px',
                  fontWeight: 600,
                  fontSize: '0.82rem',
                  color: 'var(--ink-secondary)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  cursor: 'pointer'
                }}
              >
                <RefreshCw size={15} className={isSyncing ? "animate-spin" : ""} />
                Synchroniser Flux
              </button>

              <button
                onClick={() => alert(`Alerte transmise pour : ${currentCamera.name}`)}
                style={{
                  background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
                  color: '#ffffff',
                  border: 'none',
                  padding: '8px 16px',
                  borderRadius: '8px',
                  fontWeight: 700,
                  fontSize: '0.82rem',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px'
                }}
              >
                <AlertTriangle size={16} />
                Déclencher Alerte
              </button>
            </div>
          </div>
        </div>

        {/* SIDE CAMERA SELECTOR LIST */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '4px' }}>
            Statut des Caméras ({camerasEtat.length})
          </h3>
          {camerasEtat.map((cam) => {
            const off = cam.status === 'Hors-ligne';
            return (
              <div
                key={cam.id}
                onClick={() => setSelectedCam(cam.id)}
                style={{
                  background: selectedCam === cam.id ? '#e0f2fe' : '#ffffff',
                  border: selectedCam === cam.id ? '2px solid #0284c7' : '1px solid var(--border-subtle)',
                  borderRadius: '12px',
                  padding: '12px 14px',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '12px',
                  cursor: 'pointer',
                  transition: 'all 0.2s ease'
                }}
              >
                <img src={cam.image} alt={cam.name} style={{ width: '60px', height: '42px', objectFit: 'cover', borderRadius: '6px', filter: off ? 'grayscale(100%)' : 'none' }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink-primary)' }}>{cam.name}</div>
                  <div style={{ fontSize: '0.72rem', color: off ? '#ef4444' : 'var(--ink-muted)' }}>
                    {off ? '⚠️ Signal interrompu' : `${cam.zone} (${cam.frameAge})`}
                  </div>
                </div>
                {off ? (
                  <span style={{ background: '#fee2e2', color: '#ef4444', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    PANNE
                  </span>
                ) : (
                  <span style={{ background: '#dcfce7', color: '#16a34a', fontSize: '0.68rem', fontWeight: 800, padding: '2px 6px', borderRadius: '4px' }}>
                    LIVE
                  </span>
                )}
              </div>
            );
          })}
        </div>
      </div>

      <SectionZones cameras={cameras} />
    </div>
  );
}

// ============================================================================
// SECTION : PERSONNES / OBJETS (listing complet des cibles)
// ============================================================================

// Onglets "Personnes" / "Objets" — fonctionnalité réelle de l'ancien
// migration/admin.jsx (CiblesSection) absente de la maquette
// /home/rakine/osc/web (qui condense tout en top-6 sur le Tableau de
// bord, voir DashboardView) : listing complet des cibles détectées, avec
// recherche, tri, vue cartes/tableau et "Suivre"/"Signaler" — mêmes
// actions locales (pas d'endpoint backend dédié, jamais eu) que l'ancien
// composant, juste redessinées dans le langage visuel de cette interface.
const RISK_STYLE = {
  high: { fond: '#fee2e2', couleur: '#dc2626', barre: '#ef4444', label: 'Danger' },
  med: { fond: '#fef3c7', couleur: '#b45309', barre: '#eab308', label: 'À surveiller' },
  low: { fond: '#dcfce7', couleur: '#16a34a', barre: '#22c55e', label: 'Normal' },
};

function titrePersonne(item) {
  if (item.intrusionZoneActive) return 'Intrusion en zone non autorisée';
  if (item.rodage && item.rodage !== 'Normal' && !item.rodage.startsWith('En observation')) return item.rodage;
  if (item.infiltration && item.infiltration !== 'Normal') return item.infiltration;
  return `${item.genre} · ${item.posture}`;
}

function titrePersonneObjet(item) {
  return item.type;
}

const chip = {
  fontSize: '0.74rem', color: 'var(--ink-secondary)', background: '#f8fafc',
  border: '1px solid var(--border-light)', borderRadius: '6px', padding: '3px 8px',
};

function bandeau(kind) {
  return {
    display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.76rem', fontWeight: 700,
    padding: '6px 10px', borderRadius: '8px',
    background: kind === 'danger' ? '#fee2e2' : '#e0f2fe',
    color: kind === 'danger' ? '#dc2626' : '#0284c7',
  };
}

const btnAction = {
  flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px',
  padding: '7px 10px', borderRadius: '8px', border: '1px solid var(--border-light)',
  background: '#f8fafc', color: 'var(--ink-secondary)', fontSize: '0.76rem', fontWeight: 700, cursor: 'pointer',
};
const btnActionActif = { background: '#e0f2fe', color: '#0284c7', borderColor: '#93c5fd' };

function iconBtn(actif, danger = false) {
  return {
    width: '28px', height: '28px', borderRadius: '7px', border: '1px solid var(--border-light)',
    background: actif ? (danger ? '#fee2e2' : '#e0f2fe') : '#f8fafc',
    color: actif ? (danger ? '#dc2626' : '#0284c7') : 'var(--ink-secondary)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer',
  };
}

function CiblesView({ titre, sousTitre, items = [], type }) {
  const [recherche, setRecherche] = useState('');
  const [tri, setTri] = useState('risk-desc');
  const [vue, setVue] = useState('cartes');
  const [suivi, setSuivi] = useState(null);
  const [signales, setSignales] = useState(() => new Set());
  const [detail, setDetail] = useState(null);

  function basculerSignal(id) {
    setSignales((s) => {
      const copie = new Set(s);
      copie.has(id) ? copie.delete(id) : copie.add(id);
      return copie;
    });
  }

  const q = recherche.trim().toLowerCase();
  const filtres = items.filter((item) => {
    if (!q) return true;
    if (item.id.toLowerCase().includes(q)) return true;
    if ((item.camCtx?.num || item.camCtx?.id_camera || '').toLowerCase().includes(q)) return true;
    if (item.isObject) return (item.label || '').toLowerCase().includes(q) || (item.type || '').toLowerCase().includes(q);
    return (item.genre || '').toLowerCase().includes(q) || (item.posture || '').toLowerCase().includes(q)
      || (item.clothes || []).some((c) => c.name.toLowerCase().includes(q));
  });

  const tries = [...filtres].sort((a, b) => {
    if (tri === 'id') return a.id.localeCompare(b.id);
    const sa = (signales.has(a.id) ? 1000 : 0) + a.riskPct;
    const sb = (signales.has(b.id) ? 1000 : 0) + b.riskPct;
    return sb - sa;
  });

  const IconeType = type === 'objets' ? Package : Users;

  return (
    <div className="content-body">
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">{titre}</h1>
          <p className="welcome-sub">{sousTitre}</p>
        </div>
      </div>

      {/* BARRE D'OUTILS : recherche, tri, vue */}
      <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '20px' }}>
        <div style={{ position: 'relative', flex: '1 1 260px', minWidth: '220px' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
          <input
            type="text"
            placeholder={type === 'objets' ? 'Rechercher (id, type, caméra...)' : 'Rechercher (id, genre, vêtement, caméra...)'}
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            style={{ width: '100%', padding: '9px 12px 9px 36px', borderRadius: '10px', border: '1px solid var(--border-light)', background: '#ffffff', color: 'var(--ink-primary)', colorScheme: 'light', fontSize: '0.85rem', outline: 'none' }}
          />
        </div>

        <select
          value={tri}
          onChange={(e) => setTri(e.target.value)}
          style={{ padding: '9px 12px', borderRadius: '10px', border: '1px solid var(--border-light)', fontSize: '0.83rem', fontWeight: 600, background: '#ffffff', color: 'var(--ink-primary)' }}
        >
          <option value="risk-desc">Trier : risque</option>
          <option value="id">Trier : identifiant</option>
        </select>

        <div style={{ display: 'flex', border: '1px solid var(--border-light)', borderRadius: '10px', overflow: 'hidden' }}>
          <button
            onClick={() => setVue('cartes')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', border: 'none', background: vue === 'cartes' ? '#0284c7' : '#ffffff', color: vue === 'cartes' ? '#fff' : 'var(--ink-secondary)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <LayoutGrid size={14} /> Cartes
          </button>
          <button
            onClick={() => setVue('tableau')}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '9px 14px', border: 'none', borderLeft: '1px solid var(--border-light)', background: vue === 'tableau' ? '#0284c7' : '#ffffff', color: vue === 'tableau' ? '#fff' : 'var(--ink-secondary)', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer' }}
          >
            <List size={14} /> Tableau
          </button>
        </div>

        <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>{tries.length} cible(s)</span>
      </div>

      {tries.length === 0 ? (
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '40px', textAlign: 'center', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}>
          <IconeType size={28} style={{ color: 'var(--ink-light)', marginBottom: '10px' }} />
          <p style={{ color: 'var(--ink-muted)', fontSize: '0.9rem' }}>
            {items.length === 0 ? `Aucun${type === 'objets' ? '' : 'e'} ${type === 'objets' ? 'objet' : 'personne'} détecté${type === 'objets' ? '' : 'e'} pour l'instant.` : 'Aucune cible ne correspond à la recherche.'}
          </p>
        </div>
      ) : vue === 'cartes' ? (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '16px' }}>
          {tries.map((item) => {
            const rs = RISK_STYLE[item.riskLevel] || RISK_STYLE.low;
            const estSuivi = suivi === item.id;
            const estSignale = signales.has(item.id);
            const avis = item.avisIA ? avisIALibelle(item.avisIA) : null;
            return (
              <div key={item.id} style={{ background: '#ffffff', borderRadius: '16px', padding: '18px', border: `1px solid ${estSignale ? '#fca5a5' : 'var(--border-subtle)'}`, boxShadow: 'var(--shadow-card)', display: 'flex', flexDirection: 'column', gap: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
                    <div style={{ width: '38px', height: '38px', borderRadius: '10px', background: rs.fond, color: rs.couleur, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <IconeType size={18} />
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--ink-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{item.id}</div>
                      <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{item.isObject ? titrePersonneObjet(item) : titrePersonne(item)}</div>
                    </div>
                  </div>
                  <span style={{ fontSize: '0.7rem', fontWeight: 800, padding: '3px 8px', borderRadius: '5px', background: rs.fond, color: rs.couleur, whiteSpace: 'nowrap' }}>{item.riskPct}%</span>
                </div>

                <div style={{ height: '6px', borderRadius: '4px', background: '#f1f5f9', overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${item.riskPct}%`, background: rs.barre, borderRadius: '4px' }} />
                </div>

                <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                  📍 {[item.camCtx?.batiment, item.camCtx?.piece, item.camCtx?.num || item.camCtx?.id_camera].filter(Boolean).join(' / ')}
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                  {item.isObject ? (
                    <>
                      <span style={chip}>Zone : <strong>{item.zone}</strong></span>
                      <span style={chip}>Immobile : <strong>{item.immobileDuree}</strong></span>
                    </>
                  ) : (
                    <>
                      <span style={chip}>Rôdage : <strong>{item.rodage}</strong></span>
                      <span style={chip}>Regard : <strong>{item.regard}</strong></span>
                      <span style={chip}>Visage : <strong>{item.visage}</strong></span>
                    </>
                  )}
                </div>

                {!item.isObject && item.intrusionZoneActive && (
                  <div style={bandeau('danger')}><AlertTriangle size={13} /> Intrusion en zone non autorisée</div>
                )}
                {estSuivi && <div style={bandeau('suivi')}><Target size={13} /> Suivi actif</div>}
                {estSignale && <div style={bandeau('danger')}><AlertTriangle size={13} /> Alerte manuelle active</div>}

                {avis && (
                  <div style={{ fontSize: '0.76rem', fontWeight: 700, padding: '6px 10px', borderRadius: '8px', background: avis.fond, color: avis.couleur }}>
                    Avis IA : {avis.label} ({Math.round((item.avisIA.confiance || 0) * 100)}%)
                  </div>
                )}

                <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
                  <button onClick={() => setSuivi(estSuivi ? null : item.id)} style={{ ...btnAction, ...(estSuivi ? btnActionActif : {}) }}>
                    <Target size={13} /> {estSuivi ? 'Ne plus suivre' : 'Suivre'}
                  </button>
                  <button onClick={() => basculerSignal(item.id)} style={{ ...btnAction, ...(estSignale ? { background: '#fee2e2', color: '#dc2626', borderColor: '#fca5a5' } : {}) }}>
                    <AlertTriangle size={13} /> Signaler
                  </button>
                  <button onClick={() => setDetail(item)} style={btnAction}>
                    <Info size={13} /> Détails
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div style={{ background: '#ffffff', borderRadius: '18px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', overflow: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.84rem' }}>
            <thead>
              <tr style={{ textAlign: 'left', borderBottom: '1px solid var(--border-light)' }}>
                {['Cible', type === 'objets' ? 'Type' : 'Genre / Posture', 'Risque', type === 'objets' ? 'Zone / Immobile' : 'Rôdage / Regard', 'Avis IA', 'Caméra', ''].map((h) => (
                  <th key={h} style={{ padding: '10px 14px', color: 'var(--ink-muted)', fontWeight: 700, fontSize: '0.74rem', textTransform: 'uppercase', letterSpacing: '0.03em' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {tries.map((item) => {
                const rs = RISK_STYLE[item.riskLevel] || RISK_STYLE.low;
                const estSuivi = suivi === item.id;
                const estSignale = signales.has(item.id);
                const avis = item.avisIA ? avisIALibelle(item.avisIA) : null;
                return (
                  <tr key={item.id} style={{ borderBottom: '1px solid var(--border-subtle)' }}>
                    <td style={{ padding: '10px 14px', fontWeight: 700, color: 'var(--ink-primary)' }}>{item.id}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-secondary)' }}>{item.isObject ? item.type : `${item.genre} (${item.posture})`}</td>
                    <td style={{ padding: '10px 14px' }}><span style={{ fontWeight: 800, color: rs.couleur }}>{item.riskPct}%</span></td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-secondary)' }}>{item.isObject ? `${item.zone} · ${item.immobileDuree}` : `${item.rodage} · ${item.regard}`}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-secondary)' }}>{avis ? `${avis.label} (${Math.round((item.avisIA.confiance || 0) * 100)}%)` : '—'}</td>
                    <td style={{ padding: '10px 14px', color: 'var(--ink-secondary)' }}>{item.camCtx?.num || item.camCtx?.id_camera || '?'}</td>
                    <td style={{ padding: '10px 14px' }}>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button onClick={() => setSuivi(estSuivi ? null : item.id)} title="Suivre" style={iconBtn(estSuivi)}><Target size={14} /></button>
                        <button onClick={() => basculerSignal(item.id)} title="Signaler" style={iconBtn(estSignale, true)}><AlertTriangle size={14} /></button>
                        <button onClick={() => setDetail(item)} title="Détails" style={iconBtn(false)}><Info size={14} /></button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detail && (
        <PrecursorDetailModal
          situation={construireFicheDetail(detail)}
          onClose={() => setDetail(null)}
          onActionConfirmed={() => {}}
        />
      )}
    </div>
  );
}

// ============================================================================
// SECTION : ANALYSES
// ============================================================================

// Certains KPI ci-dessous restent illustratifs (voir la maquette
// d'origine) : le backend ne calcule pas encore d'agrégats historiques
// (passages/24h, durée moyenne) — seule la liste "Derniers événements
// remarquables" en bas est branchée sur GET /alertes (voir
// `alertesReelles` prop, Admin() plus bas). La répartition des
// postures/"Activité générale observée" (100% fictive, jamais reliée à
// rien de réel) a été retirée à la demande de l'utilisateur.
function AnalyticsView({ alertesReelles = [], nombreCameras = 0 }) {
  const analyticsKpis = [
    { title: "Passages observés", value: "1 420", change: "+12%", sub: "Dernières 24h" },
    { title: "Durée moyenne de présence", value: "3m 42s", change: "Normal", sub: "Flux piéton régulier" },
    { title: "Situations anormales", value: String(alertesReelles.length), change: "Traitées", sub: "Interventions rapides" },
    { title: "État du système", value: nombreCameras > 0 ? '100%' : '—', change: "Actif", sub: `${nombreCameras} caméra(s) en ligne` }
  ];

  const derniersEvenements = alertesReelles.slice(0, 3);
  const couleurNiveau = (t) => (['feu_fumee', 'intrusion_zone', 'infiltration'].includes(t) ? '#ef4444' : '#f59e0b');

  return (
    <div className="content-body">
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Rapports & <span>Activité des Lieux</span></h1>
          <p className="welcome-sub">Synthèse des passages, présences et événements constatés sur les différents secteurs</p>
        </div>
      </div>

      {/* KPI STATS */}
      <div className="kpi-grid">
        {analyticsKpis.map((kpi, idx) => (
          <div key={idx} className="kpi-card">
            <div className="kpi-icon-wrapper">
              <BarChart3 size={24} />
            </div>
            <div className="kpi-content">
              <span className="kpi-value">{kpi.value}</span>
              <span className="kpi-label">{kpi.title}</span>
              <span style={{ fontSize: '0.75rem', color: '#0284c7', fontWeight: 600 }}>
                {kpi.change} · {kpi.sub}
              </span>
            </div>
          </div>
        ))}
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '24px' }}>
        {/* RECENT BEHAVIORAL DETECTIONS */}
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '24px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '16px' }}>
            Derniers événements remarquables
          </h3>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
            {derniersEvenements.length === 0 ? (
              <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', margin: 0 }}>Rien à signaler pour l'instant.</p>
            ) : (
              derniersEvenements.map((a) => (
                <div key={a.id} style={{ padding: '12px 14px', background: '#f8fafc', borderRadius: '10px', borderLeft: `4px solid ${couleurNiveau(a.type_evenement)}`, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)' }}>{a.description}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>{a.num || a.id_camera} : {a.piece || '?'}</div>
                  </div>
                  <span style={{ fontSize: '0.75rem', color: couleurNiveau(a.type_evenement), fontWeight: 700 }}>
                    {a.horodatage ? new Date(a.horodatage * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '--:--'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION : ÉVÉNEMENTS
// ============================================================================

const LABEL_TYPE_EVENEMENTS = {
  rodeur: 'Rôdage',
  objet_abandonne: 'Objet Abandonné',
  objet_disparu: 'Objet Disparu',
  feu_fumee: 'Feu / Fumée',
  infiltration: 'Infiltration',
  intrusion_zone: 'Zone non autorisée',
};

function heureLocale(horodatage) {
  if (!horodatage) return '--:--:--';
  return new Date(horodatage * 1000).toLocaleTimeString('fr-FR');
}

// `alertesReelles` : branché sur GET /alertes (voir Admin() plus bas) —
// remplace les 6 lignes fictives d'origine. "Prolongé" = type le plus
// grave (feu_fumee/intrusion_zone/infiltration), "Confirmé" = le reste —
// pas de distinction plus fine disponible côté backend pour l'instant.
// "Action Validée" montre l'avis du comparateur IA (voir
// Alertes/comparaison_ia.py) plutôt que des équipements physiques qu'on
// n'a pas réellement (lumières/projecteurs).
function EventsView({ alertesReelles = [] }) {
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all');

  const events = alertesReelles.map((a) => {
    const critique = ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(a.type_evenement);
    return {
      id: a.id,
      time: heureLocale(a.horodatage),
      type: LABEL_TYPE_EVENEMENTS[a.type_evenement] || a.type_evenement,
      cam: `${a.num || a.id_camera} · ${[a.batiment, a.piece].filter(Boolean).join(' / ') || '?'}`,
      desc: a.description,
      level: critique ? 'Prolongé' : 'Confirmé',
      validated: true,
      action: a.avis_ia ? `Avis IA : ${a.avis_ia.resultat}` : 'Aucun avis IA',
    };
  });

  const filtered = events.filter(e => {
    const matchesSearch = e.desc.toLowerCase().includes(search.toLowerCase()) ||
                          e.cam.toLowerCase().includes(search.toLowerCase()) ||
                          e.type.toLowerCase().includes(search.toLowerCase());
    if (selectedFilter === 'all') return matchesSearch;
    if (selectedFilter === 'precursor') return matchesSearch && e.type !== 'Flux Normal';
    if (selectedFilter === 'critical') return matchesSearch && e.level === 'Prolongé';
    return matchesSearch;
  });

  return (
    <div className="content-body">
      {/* CLEAN HEADER */}
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Journal des <span>Événements et Télémétrie</span></h1>
          <p className="welcome-sub">Historique des comportements précurseurs et interventions validées</p>
        </div>
      </div>

      {/* DEDICATED TOOLBAR ROW */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '14px',
          marginBottom: '20px'
        }}
      >
        {/* FILTER CHIPS */}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={() => setSelectedFilter('all')}
            style={{
              background: selectedFilter === 'all' ? '#0284c7' : '#ffffff',
              color: selectedFilter === 'all' ? '#ffffff' : 'var(--ink-secondary)',
              border: '1px solid var(--border-light)',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: selectedFilter === 'all' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none'
            }}
          >
            Tous les événements
          </button>
          <button
            onClick={() => setSelectedFilter('precursor')}
            style={{
              background: selectedFilter === 'precursor' ? '#0284c7' : '#ffffff',
              color: selectedFilter === 'precursor' ? '#ffffff' : 'var(--ink-secondary)',
              border: '1px solid var(--border-light)',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: selectedFilter === 'precursor' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none'
            }}
          >
            Comportements Précurseurs IA
          </button>
          <button
            onClick={() => setSelectedFilter('critical')}
            style={{
              background: selectedFilter === 'critical' ? '#ef4444' : '#ffffff',
              color: selectedFilter === 'critical' ? '#ffffff' : 'var(--ink-secondary)',
              border: '1px solid var(--border-light)',
              padding: '8px 16px',
              borderRadius: '10px',
              fontSize: '0.82rem',
              fontWeight: 600,
              cursor: 'pointer',
              boxShadow: selectedFilter === 'critical' ? '0 2px 8px rgba(239,68,68,0.3)' : 'none'
            }}
          >
            Cas Critiques (Prolongés)
          </button>
        </div>

        {/* SEARCH INPUT */}
        <div style={{ position: 'relative', width: '320px', maxWidth: '100%' }}>
          <Search size={16} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
          <input
            type="text"
            placeholder="Rechercher par mot-clé, zone..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              width: '100%',
              padding: '9px 12px 9px 38px',
              borderRadius: '10px',
              border: '1px solid var(--border-light)',
              background: '#ffffff',
              fontSize: '0.85rem',
              outline: 'none',
              boxShadow: '0 2px 6px rgba(0,0,0,0.02)'
            }}
          />
        </div>
      </div>

      {/* TABLE */}
      <div style={{ background: '#ffffff', borderRadius: '18px', padding: '24px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
          <thead>
            <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--ink-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
              <th style={{ padding: '12px 16px' }}>Horodatage</th>
              <th style={{ padding: '12px 16px' }}>Signal Précurseur</th>
              <th style={{ padding: '12px 16px' }}>Caméra / Zone</th>
              <th style={{ padding: '12px 16px' }}>Analyse Temporelle et Contexte</th>
              <th style={{ padding: '12px 16px' }}>Niveau</th>
              <th style={{ padding: '12px 16px', textAlign: 'right' }}>Action Validée</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((ev) => {
              const isCrit = ev.level === 'Prolongé';
              const isWarn = ev.level === 'Confirmé';
              const badgeBg = isCrit ? '#fee2e2' : (isWarn ? '#fef3c7' : '#f1f5f9');
              const badgeColor = isCrit ? '#ef4444' : (isWarn ? '#d97706' : '#64748b');

              return (
                <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
                  <td style={{ padding: '14px 16px', fontFamily: 'JetBrains Mono, monospace', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
                    {ev.time}
                  </td>
                  <td style={{ padding: '14px 16px', fontWeight: 700, color: 'var(--ink-primary)' }}>
                    {ev.type}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--ink-secondary)' }}>
                    {ev.cam}
                  </td>
                  <td style={{ padding: '14px 16px', color: 'var(--ink-muted)', fontSize: '0.84rem' }}>
                    {ev.desc}
                  </td>
                  <td style={{ padding: '14px 16px' }}>
                    <span style={{ background: badgeBg, color: badgeColor, padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                      {ev.level}
                    </span>
                  </td>
                  <td style={{ padding: '14px 16px', textAlign: 'right', fontWeight: 600, color: '#0284c7', fontSize: '0.82rem' }}>
                    {ev.action}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ============================================================================
// SECTION : ALERTES
// ============================================================================

function ilYAAlertes(horodatage) {
  if (!horodatage) return 'à l\'instant';
  const s = Math.max(0, Math.round(Date.now() / 1000 - horodatage));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `il y a ${Math.round(s / 3600)} h`;
}

const LABEL_TYPE_ALERTES = {
  rodeur: 'Personne suspecte qui rôde',
  objet_abandonne: 'Objet abandonné sans surveillance',
  objet_disparu: 'Objet disparu, vol probable',
  feu_fumee: 'Feu ou fumée détecté',
  infiltration: 'Infiltration suspectée',
  intrusion_zone: 'Intrusion en zone non autorisée',
};

// `alertesReelles`, `camerasParId` : branchés sur GET /alertes (voir
// Admin() plus bas) — remplace les 4 alertes fictives d'origine. Le
// dangerLevel dérive du type d'événement (feu_fumee/intrusion_zone/
// infiltration = critical, le reste = warning) — on n'a pas de siège/
// lumière physiques réels ici, donc sirenActive/lightsActive restent à
// false (pas de fausse affirmation qu'un équipement s'est allumé).
function AlertsView({ alertesReelles = [], camerasParId = {} }) {
  const alertsReelles = alertesReelles.map((a) => {
    const critique = ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(a.type_evenement);
    return {
      id: a.id,
      title: LABEL_TYPE_ALERTES[a.type_evenement] || a.type_evenement,
      dangerLevel: critique ? 'critical' : 'warning',
      dangerLabel: critique ? 'Danger Immédiat' : 'À surveiller',
      cameraName: `${a.num || a.id_camera}`,
      location: [a.batiment, a.piece].filter(Boolean).join(' / ') || 'Emplacement inconnu',
      image: camerasParId[a.id_camera] || '',
      timeAgo: ilYAAlertes(a.horodatage),
      description: a.description,
      critique,
    };
  });

  const [alerts, setAlerts] = useState(alertsReelles);
  const dejaVuesRef = useRef(new Set());

  // État RÉEL de la lampe/sirène physiques (ESP32, voir
  // Infrastructure/alarme_physique.py côté backend) — un seul appareil
  // pour tout le site, pas un état par alerte. Déclenché automatiquement
  // dès qu'une alerte critique (feu_fumee/intrusion_zone/infiltration)
  // est enregistrée (voir Alertes/alertes.py), et affiché ici tel quel,
  // sans donnée fictive.
  const [etatAlarme, setEtatAlarme] = useState({ lampe: false, sirene: false });

  useEffect(() => {
    let annule = false;
    const rafraichir = () => {
      chargerEtatAlarme()
        .then((e) => { if (!annule) setEtatAlarme(e); })
        .catch(() => {});
    };
    rafraichir();
    const id = setInterval(rafraichir, 2000);
    return () => { annule = true; clearInterval(id); };
  }, []);

  useEffect(() => {
    setAlerts((prev) => {
      // Garde les alertes locales "vérifiées" (retirées à la main, voir
      // handleAcknowledge) hors de la liste tant qu'un nouveau /alertes
      // ne les redonne pas — sinon elles réapparaîtraient au prochain
      // poll (toutes les 2s, voir Admin()).
      const idsAffiches = new Set(prev.map((a) => a.id));
      const idsVerifies = dejaVuesRef.current;
      return alertsReelles.filter((a) => !idsVerifies.has(a.id));
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alertesReelles]);

  const [soundEnabled, setSoundEnabled] = useState(true);
  const [toast, setToast] = useState(null);

  const audioCtxRef = useRef(null);
  const loopRef = useRef(null);

  // Sonnerie douce et agréable (Carillon de sécurité professionnel)
  const playFriendlyAlarm = () => {
    if (!soundEnabled) return;
    try {
      if (!audioCtxRef.current) {
        audioCtxRef.current = new (window.AudioContext || window.webkitAudioContext)();
      }
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') ctx.resume();

      const now = ctx.currentTime;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.linearRampToValueAtTime(0.14, now + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.48);

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1400, now);

      const osc1 = ctx.createOscillator();
      const osc2 = ctx.createOscillator();

      osc1.type = 'sine';
      osc2.type = 'sine';

      osc1.frequency.setValueAtTime(587.33, now); // Ré5
      osc1.frequency.linearRampToValueAtTime(880, now + 0.22); // La5
      osc1.frequency.linearRampToValueAtTime(587.33, now + 0.45);

      osc2.frequency.setValueAtTime(293.66, now); // Ré4
      osc2.frequency.linearRampToValueAtTime(440, now + 0.22); // La4
      osc2.frequency.linearRampToValueAtTime(293.66, now + 0.45);

      osc1.connect(filter);
      osc2.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc1.start(now);
      osc2.start(now);
      osc1.stop(now + 0.48);
      osc2.stop(now + 0.48);
    } catch (e) {}
  };

  // Sonnerie automatique tant que la sirène physique réelle sonne
  // (état venu du backend, voir le polling ci-dessus — plus une seule
  // fausse alerte ne peut la déclencher).
  useEffect(() => {
    if (etatAlarme.sirene && soundEnabled) {
      if (!loopRef.current) {
        playFriendlyAlarm();
        loopRef.current = setInterval(playFriendlyAlarm, 2000);
      }
    } else {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
    }
    return () => {
      if (loopRef.current) {
        clearInterval(loopRef.current);
        loopRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [etatAlarme.sirene, soundEnabled]);

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3000);
  };

  const handleStopSiren = () => {
    arreterAlarme()
      .then((e) => { setEtatAlarme(e); showToast("La sonnerie a été arrêtée."); })
      .catch(() => showToast("Impossible de joindre l'alarme."));
  };

  const handleAcknowledge = (id) => {
    dejaVuesRef.current.add(id); // masqué localement (pas d'endpoint "vérifié" côté backend, voir plus haut)
    setAlerts(prev => prev.filter(a => a.id !== id));
    showToast("L'alerte a été marquée comme vérifiée.");
  };

  // Compteurs en langage simple
  const criticalCount = alerts.filter(a => a.dangerLevel === 'critical').length;
  const warningCount = alerts.filter(a => a.dangerLevel === 'warning').length;

  return (
    <div className="content-body" style={{ maxWidth: '1400px', margin: '0 auto', paddingBottom: '60px' }}>

      {/* MESSAGE NOTIFICATION TOAST */}
      {toast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: 'var(--sidebar-navy)',
            color: '#ffffff',
            padding: '12px 22px',
            borderRadius: '12px',
            boxShadow: '0 12px 30px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            zIndex: 9999,
            fontSize: '0.9rem',
            fontWeight: 600,
            borderLeft: '4px solid #0284c7'
          }}
        >
          <CheckCircle2 size={18} color="#38bdf8" />
          <span>{toast}</span>
        </div>
      )}

      {/* EN-TÊTE PRINCIPAL SIMPLE & CLAIR */}
      <div className="welcome-header" style={{ marginBottom: '16px' }}>
        <div>
          <h1 className="welcome-heading" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
            Alertes & <span>Sécurité</span>
          </h1>
          <p className="welcome-sub" style={{ fontSize: '0.9rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
            Le système allume automatiquement les lumières et l'alarme en fonction de la situation
          </p>
        </div>
      </div>

      {/* BARRE D'OUTILS ET BOUTONS DE CONTRÔLE SIMPLES */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '20px'
        }}
      >
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
          Surveillance en direct des lieux
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={playFriendlyAlarm}
            style={{
              background: '#ffffff',
              border: '1px solid var(--border-light)',
              color: 'var(--ink-secondary)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            <Play size={14} color="#0284c7" />
            <span>Écouter la sonnerie</span>
          </button>

          <button
            onClick={() => {
              const next = !soundEnabled;
              setSoundEnabled(next);
              showToast(next ? "Sonnerie activée" : "Sonnerie coupée sur cet écran");
            }}
            style={{
              background: soundEnabled ? 'rgba(2,132,199,0.08)' : '#ffffff',
              border: `1px solid ${soundEnabled ? '#0284c7' : 'var(--border-light)'}`,
              color: soundEnabled ? '#0284c7' : 'var(--ink-muted)',
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.85rem',
              fontWeight: 600,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
            }}
          >
            {soundEnabled ? <Volume2 size={16} /> : <VolumeX size={16} />}
            <span>{soundEnabled ? 'Son : Activé' : 'Son : Coupé'}</span>
          </button>
        </div>
      </div>

      {/* 4 BLOCS D'ÉTAT SIMPLES (AUCUN JARGON TECHNIQUE) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '14px', marginBottom: '24px' }}>

        {/* DANGER IMMÉDIAT */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: criticalCount > 0 ? '#fee2e2' : '#f1f5f9', color: criticalCount > 0 ? '#dc2626' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: criticalCount > 0 ? '#dc2626' : 'var(--ink-primary)' }}>
              {criticalCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Danger immédiat
            </div>
          </div>
        </div>

        {/* À SURVEILLER */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.25rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
              {warningCount}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Événements à surveiller
            </div>
          </div>
        </div>

        {/* ALARME SONORE — état réel de la sirène ESP32 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: etatAlarme.sirene ? '#fee2e2' : '#f1f5f9', color: etatAlarme.sirene ? '#dc2626' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Volume2 size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: etatAlarme.sirene ? '#dc2626' : '#10b981' }}>
              {etatAlarme.sirene ? 'Alarme en cours' : 'Alarme silencieuse'}
            </div>
            <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              {etatAlarme.sirene ? 'Sonnerie active' : 'Veille normale'}
            </div>
          </div>
        </div>

        {/* LUMIÈRE / PROJECTEURS — état réel de la lampe ESP32 */}
        <div style={{ background: '#ffffff', borderRadius: '12px', padding: '16px 18px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '42px', height: '42px', borderRadius: '10px', background: etatAlarme.lampe ? '#fef3c7' : '#f1f5f9', color: etatAlarme.lampe ? '#d97706' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Lightbulb size={20} />
          </div>
          <div>
            <div style={{ fontSize: '0.95rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
              {etatAlarme.lampe ? 'Lumière allumée' : 'Lumière éteinte'}
            </div>
            <div style={{ fontSize: '0.8rem', color: etatAlarme.lampe ? '#d97706' : 'var(--ink-muted)', fontWeight: 600 }}>
              {etatAlarme.lampe ? 'Pour éclairer et dissuader' : 'Veille normale'}
            </div>
          </div>
        </div>

      </div>

      {/* LISTE DES ALERTES AVEC PHOTOS DES CAMÉRAS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        {alerts.length === 0 ? (
          <div style={{ background: '#ffffff', borderRadius: '16px', padding: '48px', textAlign: 'center', border: '1px solid var(--border-light)', color: 'var(--ink-muted)' }}>
            <CheckCircle2 size={44} color="#10b981" style={{ marginBottom: '12px' }} />
            <h3 style={{ fontSize: '1.15rem', color: 'var(--ink-primary)', fontWeight: 700 }}>Toutes les alertes sont traitées</h3>
            <p style={{ fontSize: '0.88rem' }}>Tous les secteurs sont calmes et sécurisés.</p>
          </div>
        ) : (
          alerts.map((item) => {
            const isCritical = item.dangerLevel === 'critical';
            const isWarning = item.dangerLevel === 'warning';

            const badgeBg = isCritical ? '#fee2e2' : (isWarning ? '#fef3c7' : '#e0f2fe');
            const badgeColor = isCritical ? '#dc2626' : (isWarning ? '#d97706' : '#0284c7');
            const cardBorder = isCritical ? '#ef4444' : (isWarning ? '#f59e0b' : 'var(--border-light)');

            return (
              <div
                key={item.id}
                style={{
                  background: '#ffffff',
                  borderRadius: '16px',
                  padding: '18px 22px',
                  border: `1px solid ${isCritical ? '#fca5a5' : 'var(--border-light)'}`,
                  borderLeft: `5px solid ${cardBorder}`,
                  boxShadow: isCritical ? '0 8px 24px rgba(239, 68, 68, 0.1)' : 'var(--shadow-card)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  flexWrap: 'wrap'
                }}
              >
                {/* 1. PHOTO DE LA CAMÉRA */}
                <div
                  style={{
                    width: '130px',
                    height: '84px',
                    borderRadius: '10px',
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    boxShadow: '0 2px 8px rgba(0,0,0,0.1)'
                  }}
                >
                  <img
                    src={item.image}
                    alt={item.cameraName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      top: '4px',
                      left: '4px',
                      background: 'rgba(9, 17, 36, 0.8)',
                      color: '#ffffff',
                      fontSize: '0.65rem',
                      fontWeight: 700,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px'
                    }}
                  >
                    <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: isCritical ? '#ef4444' : '#10b981' }} />
                    DIRECT
                  </div>
                </div>

                {/* 2. DÉTAILS DE L'ÉVÉNEMENT (AU CENTRE) */}
                <div style={{ flex: '1 1 340px' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', marginBottom: '4px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '5px',
                        background: badgeBg,
                        color: badgeColor
                      }}
                    >
                      {item.dangerLabel}
                    </span>
                    <h3 style={{ fontSize: '1.02rem', fontWeight: 700, color: 'var(--ink-primary)', margin: 0 }}>
                      {item.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', gap: '14px', fontSize: '0.8rem', color: 'var(--ink-muted)', marginBottom: '6px' }}>
                    <span>📍 <strong>{item.cameraName}</strong> ({item.location})</span>
                    <span>🕒 {item.timeAgo}</span>
                  </div>

                  <p style={{ fontSize: '0.85rem', color: 'var(--ink-secondary)', margin: '0 0 10px 0', lineHeight: 1.4 }}>
                    {item.description}
                  </p>

                  {/* CE QUE LE SYSTÈME A FAIT AUTOMATIQUEMENT — état réel
                      de la lampe/sirène physiques (un seul appareil pour
                      tout le site), affiché seulement sur les alertes
                      critiques puisque c'est ce qui les déclenche. */}
                  {item.critique && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>

                      {/* LUMIÈRE */}
                      <div
                        style={{
                          background: etatAlarme.lampe ? '#fef3c7' : '#f1f5f9',
                          color: etatAlarme.lampe ? '#92400e' : '#64748b',
                          border: `1px solid ${etatAlarme.lampe ? '#fde68a' : '#e2e8f0'}`,
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Lightbulb size={13} />
                        <span>{etatAlarme.lampe ? 'Lumière allumée' : 'Lumière éteinte'}</span>
                      </div>

                      {/* ALARME SONORE */}
                      <div
                        style={{
                          background: etatAlarme.sirene ? '#fee2e2' : '#f1f5f9',
                          color: etatAlarme.sirene ? '#dc2626' : '#64748b',
                          border: `1px solid ${etatAlarme.sirene ? '#fca5a5' : '#e2e8f0'}`,
                          padding: '4px 9px',
                          borderRadius: '6px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '5px'
                        }}
                      >
                        <Volume2 size={13} />
                        <span>{etatAlarme.sirene ? 'Alarme qui sonne' : 'Alarme silencieuse'}</span>
                      </div>

                    </div>
                  )}
                </div>

                {/* 3. BOUTONS D'ACTION POUR L'OPÉRATEUR (À DROITE) */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', flexShrink: 0 }}>
                  {isCritical && etatAlarme.sirene && (
                    <button
                      onClick={handleStopSiren}
                      style={{
                        background: '#ef4444',
                        color: '#ffffff',
                        border: 'none',
                        padding: '9px 18px',
                        borderRadius: '8px',
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '6px',
                        boxShadow: '0 2px 8px rgba(239, 68, 68, 0.25)'
                      }}
                    >
                      <VolumeX size={15} />
                      <span>Arrêter l'Alarme</span>
                    </button>
                  )}

                  <button
                    onClick={() => handleAcknowledge(item.id)}
                    style={{
                      background: '#f8fafc',
                      border: '1px solid var(--border-light)',
                      color: 'var(--ink-secondary)',
                      padding: '9px 18px',
                      borderRadius: '8px',
                      fontSize: '0.82rem',
                      fontWeight: 600,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={15} color="#10b981" />
                    <span>C'est Vérifié</span>
                  </button>
                </div>

              </div>
            );
          })
        )}
      </div>

    </div>
  );
}

// ============================================================================
// SECTION : RAPPORTS
// ============================================================================

// `alertesReelles`, `kpis` : contenu des rapports généré à partir des
// vraies données du moment (voir Admin() plus bas) — remplace les 4
// rapports fictifs et leur contenu inventé d'origine. Toujours généré et
// téléchargé côté navigateur (aucun endpoint backend dédié aux rapports
// pour l'instant) : "aujourd'hui" plutôt que des dates figées.
function ReportsView({ alertesReelles = [], kpis = {} }) {
  const [downloadingId, setDownloadingId] = useState(null);
  const [successToast, setSuccessToast] = useState(null);

  const maintenant = new Date().toLocaleString('fr-FR');
  const reports = [
    { id: 'rep-01', title: `Rapport d'Activité — ${new Date().toLocaleDateString('fr-FR')}`, size: `${alertesReelles.length} événement(s)`, date: maintenant, type: 'PDF' },
    { id: 'rep-03', title: 'Export des Alertes (toutes caméras)', size: `${alertesReelles.length} ligne(s)`, date: maintenant, type: 'CSV' },
  ];

  // Rapport PDF : vrai document PDF (via jsPDF, chargé à la demande — voir
  // le import() dynamique plus bas — pour ne pas alourdir le bundle
  // principal avec html2canvas/DOMPurify que jsPDF embarque mais qu'on
  // n'utilise pas). Avant, le bouton annonçait "PDF" mais téléchargeait
  // en fait un .txt renommé.
  async function construirePdf(rep) {
    const { jsPDF } = await import('jspdf');
    const doc = new jsPDF({ unit: 'pt', format: 'a4' });
    const margeG = 48;
    let y = 56;
    const largeurPage = doc.internal.pageSize.getWidth();
    const largeurUtile = largeurPage - margeG * 2;

    const sautDePageSiBesoin = (hauteur) => {
      if (y + hauteur > doc.internal.pageSize.getHeight() - 48) {
        doc.addPage();
        y = 56;
      }
    };

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.setTextColor(2, 132, 199);
    doc.text('RAPPORT OFFICIEL DE SÉCURITÉ PREVIA', margeG, y);
    y += 18;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.setTextColor(100, 116, 139);
    doc.text('Système de vidéosurveillance intelligente par analyse comportementale', margeG, y);
    y += 24;
    doc.setDrawColor(226, 232, 240);
    doc.line(margeG, y, largeurPage - margeG, y);
    y += 24;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(12);
    doc.setTextColor(15, 23, 42);
    doc.text(rep.title, margeG, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(`Émis le ${rep.date}`, margeG, y);
    y += 26;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.setTextColor(15, 23, 42);
    doc.text('Résumé', margeG, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9.5);
    [
      `${kpis.activeCameras ?? 0} caméra(s) active(s)`,
      `${kpis.detectedPersons ?? 0} personne(s) actuellement détectée(s)`,
      `${alertesReelles.length} alerte(s) confirmée(s)`,
    ].forEach((ligne) => {
      sautDePageSiBesoin(14);
      doc.text(`•  ${ligne}`, margeG + 4, y);
      y += 14;
    });
    y += 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(11);
    doc.text(`Détail des événements (${Math.min(alertesReelles.length, 30)} sur ${alertesReelles.length})`, margeG, y);
    y += 16;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(9);

    if (alertesReelles.length === 0) {
      doc.setTextColor(100, 116, 139);
      doc.text('Aucune alerte enregistrée pour l\'instant.', margeG + 4, y);
      y += 14;
    } else {
      alertesReelles.slice(0, 30).forEach((a) => {
        const quand = a.horodatage ? new Date(a.horodatage * 1000).toLocaleString('fr-FR') : '?';
        const camera = [a.batiment, a.piece, a.num || a.id_camera].filter(Boolean).join(' / ');
        const entete = `[${a.type_evenement}] ${quand} — ${camera}`;
        const desc = a.description || '';
        const avis = a.avis_ia ? `Avis IA : ${a.avis_ia.resultat} (${Math.round((a.avis_ia.confiance || 0) * 100)}%)` : null;

        const lignesEntete = doc.splitTextToSize(entete, largeurUtile);
        const lignesDesc = doc.splitTextToSize(desc, largeurUtile - 8);
        sautDePageSiBesoin(lignesEntete.length * 12 + lignesDesc.length * 11 + (avis ? 12 : 0) + 8);

        doc.setFont('helvetica', 'bold');
        doc.setTextColor(15, 23, 42);
        doc.text(lignesEntete, margeG, y);
        y += lignesEntete.length * 12;

        doc.setFont('helvetica', 'normal');
        doc.setTextColor(51, 65, 85);
        doc.text(lignesDesc, margeG + 8, y);
        y += lignesDesc.length * 11;

        if (avis) {
          doc.setTextColor(2, 132, 199);
          doc.text(avis, margeG + 8, y);
          y += 12;
        }
        y += 8;
      });
    }

    return doc;
  }

  const handleDownload = async (rep) => {
    setDownloadingId(rep.id);

    setTimeout(async () => {
      const fileName = `${rep.title.replace(/[^a-zA-Z0-9_-]/g, '_')}`;

      if (rep.type === 'CSV') {
        const lignes = alertesReelles.map((a) => [
          a.horodatage ? new Date(a.horodatage * 1000).toISOString() : '',
          a.num || a.id_camera, a.type_evenement,
          (a.description || '').replace(/,/g, ';'),
          a.avis_ia ? a.avis_ia.resultat : '',
        ].join(','));
        const fileContent = "Horodatage,Camera,Type_Evenement,Description,Avis_IA\n" + lignes.join('\n') + '\n';
        const blob = new Blob([fileContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${fileName}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } else {
        const doc = await construirePdf(rep);
        doc.save(`${fileName}.pdf`);
      }

      setDownloadingId(null);
      setSuccessToast(`Le fichier "${rep.title}" a été téléchargé avec succès !`);

      setTimeout(() => setSuccessToast(null), 4000);
    }, 600);
  };

  return (
    <div className="content-body">
      {/* TOAST NOTIFICATION */}
      {successToast && (
        <div
          style={{
            position: 'fixed',
            bottom: 24,
            right: 24,
            background: '#091124',
            color: '#ffffff',
            padding: '14px 22px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
            display: 'flex',
            alignItems: 'center',
            gap: '12px',
            zIndex: 999,
            borderLeft: '5px solid #10b981'
          }}
        >
          <CheckCircle size={20} color="#10b981" />
          <span style={{ fontSize: '0.9rem', fontWeight: 600 }}>{successToast}</span>
        </div>
      )}

      {/* CLEAN HEADER */}
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Génération et Téléchargement de <span>Rapports</span></h1>
          <p className="welcome-sub">Téléchargement instantané des audits de sécurité et exports télémétriques</p>
        </div>
      </div>

      {/* REPORTS CARDS GRID */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '20px' }}>
        {reports.map((rep) => (
          <div
            key={rep.id}
            style={{
              background: '#ffffff',
              borderRadius: '18px',
              padding: '24px',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card)',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'space-between',
              transition: 'transform 0.2s ease'
            }}
          >
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
                <div style={{ width: '44px', height: '44px', borderRadius: '10px', background: '#e0f2fe', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  {rep.type === 'PDF' ? <FileText size={22} /> : <FileSpreadsheet size={22} />}
                </div>
                <span style={{ fontSize: '0.75rem', fontWeight: 800, padding: '3px 8px', borderRadius: '4px', background: '#f1f5f9', color: 'var(--ink-secondary)' }}>
                  {rep.type} ({rep.size})
                </span>
              </div>

              <h3 style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--ink-primary)', marginBottom: '6px' }}>
                {rep.title}
              </h3>
              <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
                Généré le {rep.date}
              </p>
            </div>

            <button
              onClick={() => handleDownload(rep)}
              disabled={downloadingId === rep.id}
              style={{
                marginTop: '20px',
                background: downloadingId === rep.id ? '#e0f2fe' : '#f8fafc',
                border: '1px solid var(--border-light)',
                color: '#0284c7',
                padding: '10px 14px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 700,
                cursor: downloadingId === rep.id ? 'wait' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                transition: 'all 0.2s ease'
              }}
            >
              {downloadingId === rep.id ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Génération du téléchargement...
                </>
              ) : (
                <>
                  <Download size={16} />
                  Télécharger le fichier ({rep.type})
                </>
              )}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// SECTION : ORGANISATION (comptes / bâtiments / pièces / caméras)
// ============================================================================

// Vue entièrement NOUVELLE — pas dans la maquette de référence
// (/home/rakine/osc/web) : porte les fonctionnalités réelles de l'ancien
// migration/defaultAdmin.jsx (gestion des comptes, bâtiments, pièces,
// caméras — la hiérarchie bâtiment > pièce > caméra) qui n'existaient
// nulle part dans cette interface. Réservée au compte admin par défaut
// (voir Sidebar > showOrganisation, Admin() plus bas). Style
// volontairement dans la même convention que le reste de ce fichier
// (cartes blanches, styles en ligne).
const idAdmin = () => sessionStorage.getItem('previa_utilisateur_id');

async function appelApiOrg(chemin, options = {}) {
  const res = await fetch(`${API_BASE}${chemin}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || `Erreur ${res.status}`);
  return data;
}

const onglets = [
  { id: 'comptes', label: 'Comptes', icon: Users },
  { id: 'batiments', label: 'Bâtiments', icon: Building2 },
  { id: 'pieces', label: 'Pièces', icon: DoorOpen },
  { id: 'cameras', label: 'Caméras', icon: Cctv },
];

const carte = { background: '#ffffff', borderRadius: '18px', padding: '24px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)' };
const champ = { padding: '9px 12px', borderRadius: '8px', border: '1px solid var(--border-light)', fontSize: '0.85rem', background: '#f8fafc', color: 'var(--ink-primary)' };
const btn = { background: '#0284c7', border: 'none', color: '#fff', padding: '9px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' };
const btnSuppr = { background: '#fee2e2', border: 'none', color: '#dc2626', width: '30px', height: '30px', borderRadius: '7px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 };

// ============================================================================
// SECTION : CONFIG ALARME — administration des ESP32 alarme (lampe +
// sirène physiques, voir Infrastructure/alarme_physique.py et
// migration/arduino/esp/esp.ino) présents sur le réseau local : quel
// Wi-Fi chacun utilise, les réseaux qu'il connaît, en ajouter/retirer,
// le faire basculer ailleurs. Tout passe par ce backend (jamais un
// fetch direct navigateur -> ESP) — voir Infrastructure/esp_decouverte.py
// pour pourquoi (contenu mixte HTTPS -> HTTP bloqué par le navigateur).
// ============================================================================
function ConfigAlerteView() {
  const [appareils, setAppareils] = useState([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    const rafraichir = () => {
      listerEsp()
        .then((liste) => { if (!annule) { setAppareils(liste); setErreur(''); } })
        .catch((e) => { if (!annule) setErreur(e.message); })
        .finally(() => { if (!annule) setChargement(false); });
    };
    rafraichir();
    const id = setInterval(rafraichir, 5000);
    return () => { annule = true; clearInterval(id); };
  }, []);

  return (
    <div className="content-body">
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Config <span>Alarme</span></h1>
          <p className="welcome-sub">Boîtiers ESP32 (lampe + sirène) détectés sur le réseau local — Wi-Fi utilisé, réseaux enregistrés</p>
        </div>
      </div>

      {erreur && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '14px' }}>{erreur}</p>}

      {chargement ? (
        <div style={carte}><p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem', margin: 0 }}>Recherche des boîtiers ESP32...</p></div>
      ) : appareils.length === 0 ? (
        <div style={{ ...carte, textAlign: 'center', padding: '48px' }}>
          <Router size={40} color="#94a3b8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--ink-primary)', fontWeight: 700, margin: '0 0 6px' }}>Aucun boîtier détecté</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', margin: 0 }}>
            Vérifie que l'ESP32 est allumé, connecté au même réseau que ce serveur, et que le script de découverte
            (previastart / mdns_previa.py) tourne bien sur la machine hôte.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {appareils.map((a) => <CarteEsp key={a.id} appareil={a} />)}
        </div>
      )}
    </div>
  );
}

function CarteEsp({ appareil }) {
  const [etatEsp, setEtatEsp] = useState(null);
  const [erreur, setErreur] = useState('');
  const [ssid, setSsid] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [enCours, setEnCours] = useState(false);

  const rafraichir = () => {
    chargerEtatEsp(appareil.id)
      .then((e) => { setEtatEsp(e); setErreur(''); })
      .catch((e) => setErreur(e.message));
  };

  useEffect(() => {
    rafraichir();
    const id = setInterval(rafraichir, 4000);
    return () => clearInterval(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [appareil.id]);

  const ajouter = async (e) => {
    e.preventDefault();
    setEnCours(true); setErreur('');
    try {
      await ajouterReseauEsp(appareil.id, ssid, motDePasse);
      setSsid(''); setMotDePasse('');
      rafraichir();
    } catch (e2) { setErreur(e2.message); } finally { setEnCours(false); }
  };

  const supprimer = async (s) => {
    setEnCours(true); setErreur('');
    try { await supprimerReseauEsp(appareil.id, s); rafraichir(); }
    catch (e2) { setErreur(e2.message); } finally { setEnCours(false); }
  };

  const basculer = async (s) => {
    setEnCours(true); setErreur('');
    try { await basculerReseauEsp(appareil.id, s); }
    catch (e2) { setErreur(e2.message); } finally { setEnCours(false); }
  };

  return (
    <div style={carte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700, color: 'var(--ink-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Router size={18} color="#0284c7" /> {appareil.hote || appareil.id}
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: 0 }}>{appareil.ip}</p>
        </div>
        {etatEsp && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 700, color: '#0284c7' }}>Connecté à « {etatEsp.ssid_actuel || '—'} »</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>Signal : {etatEsp.rssi} dBm</div>
          </div>
        )}
      </div>

      {erreur && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '12px' }}>{erreur}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {(etatEsp?.reseaux || []).length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: 0 }}>Aucun réseau enregistré sur ce boîtier.</p>
        ) : (
          etatEsp.reseaux.map((s) => {
            const actif = s === etatEsp.ssid_actuel;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: actif ? 'rgba(2,132,199,0.08)' : '#f8fafc', borderRadius: '8px', border: actif ? '1px solid #0284c7' : '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 600, color: 'var(--ink-primary)' }}>{s}{actif ? ' (actuel)' : ''}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {!actif && (
                    <button disabled={enCours} onClick={() => basculer(s)} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '5px 10px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
                      Basculer
                    </button>
                  )}
                  <button disabled={enCours} onClick={() => supprimer(s)} style={{ background: '#fff', color: '#dc2626', border: '1px solid #fca5a5', padding: '5px 10px', borderRadius: '6px', fontSize: '0.76rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
                    Retirer
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={ajouter} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={champ} placeholder="Nom du Wi-Fi (SSID)" value={ssid} onChange={(e) => setSsid(e.target.value)} required />
        <input style={champ} type="password" placeholder="Mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        <button type="submit" disabled={enCours} style={{ background: 'var(--sidebar-navy)', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
          Ajouter ce réseau
        </button>
      </form>
    </div>
  );
}

function OrganisationView() {
  const [onglet, setOnglet] = useState('comptes');
  const [comptes, setComptes] = useState([]);
  const [batiments, setBatiments] = useState([]);
  const [pieces, setPieces] = useState([]);
  const [cameras, setCameras] = useState([]);
  const [erreur, setErreur] = useState('');

  async function charger() {
    try {
      const [c, b, p, cam] = await Promise.all([
        appelApiOrg('/utilisateurs'), appelApiOrg('/batiments'), appelApiOrg('/pieces'), appelApiOrg('/cameras'),
      ]);
      setComptes(c); setBatiments(b); setPieces(p); setCameras(cam);
      setErreur('');
    } catch (e) {
      setErreur(e.message);
    }
  }

  useEffect(() => { charger(); }, []);

  return (
    <div className="content-body">
      <div className="welcome-header">
        <div>
          <h1 className="welcome-heading">Gestion de l'<span>Organisation</span></h1>
          <p className="welcome-sub">Comptes, bâtiments, pièces et caméras — réservé aux administrateurs</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: '10px', marginBottom: '20px' }}>
        {onglets.map((o) => {
          const Icon = o.icon;
          return (
            <button
              key={o.id}
              onClick={() => setOnglet(o.id)}
              style={{
                background: onglet === o.id ? '#0284c7' : '#ffffff',
                color: onglet === o.id ? '#fff' : 'var(--ink-secondary)',
                border: '1px solid var(--border-light)',
                padding: '9px 16px', borderRadius: '10px', fontSize: '0.85rem', fontWeight: 700,
                cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '8px',
                boxShadow: onglet === o.id ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
              }}
            >
              <Icon size={16} /> {o.label}
            </button>
          );
        })}
      </div>

      {erreur && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '14px' }}>{erreur}</p>}

      {onglet === 'comptes' && <SectionComptes comptes={comptes} onChange={charger} />}
      {onglet === 'batiments' && <SectionBatiments batiments={batiments} onChange={charger} />}
      {onglet === 'pieces' && <SectionPieces pieces={pieces} batiments={batiments} onChange={charger} />}
      {onglet === 'cameras' && <SectionCameras cameras={cameras} pieces={pieces} onChange={charger} />}
    </div>
  );
}

function SectionComptes({ comptes, onChange }) {
  const [nom, setNom] = useState('');
  const [prenom, setPrenom] = useState('');
  const [email, setEmail] = useState('');
  const [motDePasse, setMotDePasse] = useState('');
  const [role, setRole] = useState('user');
  const [envoi, setEnvoi] = useState(false);
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault();
    setEnvoi(true); setErr('');
    try {
      const chemin = role === 'admin' ? '/utilisateurs/admins' : '/utilisateurs/users';
      await appelApiOrg(chemin, { method: 'POST', body: JSON.stringify({ id_admin: idAdmin(), nom, prenom, email, mot_de_passe: motDePasse }) });
      setNom(''); setPrenom(''); setEmail(''); setMotDePasse('');
      onChange();
    } catch (e2) { setErr(e2.message); } finally { setEnvoi(false); }
  };

  const supprimer = async (c) => {
    const chemin = c.role === 'admin' ? `/utilisateurs/admins/${c.id}` : `/utilisateurs/users/${c.id}`;
    await appelApiOrg(chemin, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Tous les comptes ({comptes.length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input style={champ} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        <input style={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <input style={champ} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={champ} type="password" placeholder="Mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
        <select style={champ} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="user">User (notifications)</option>
          <option value="admin">Admin (accès complet)</option>
        </select>
        <button style={btn} disabled={envoi} type="submit"><Plus size={15} /> Créer</button>
      </form>
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead><tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--ink-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <th style={{ padding: '8px', textAlign: 'left' }}>Nom</th><th style={{ padding: '8px', textAlign: 'left' }}>Email</th><th style={{ padding: '8px', textAlign: 'left' }}>Rôle</th><th />
        </tr></thead>
        <tbody>
          {comptes.map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '8px', fontWeight: 700 }}>{c.prenom} {c.nom}</td>
              <td style={{ padding: '8px', color: 'var(--ink-muted)' }}>{c.email}</td>
              <td style={{ padding: '8px' }}>{c.role}{c.est_par_defaut ? ' (défaut)' : ''}</td>
              <td style={{ padding: '8px', textAlign: 'right' }}>
                {!c.est_par_defaut && <button style={btnSuppr} onClick={() => supprimer(c)} title="Supprimer"><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBatiments({ batiments, onChange }) {
  const [nom, setNom] = useState('');
  const [lieu, setLieu] = useState('');
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await appelApiOrg('/batiments', { method: 'POST', body: JSON.stringify({ id_admin: idAdmin(), nom, lieu }) });
      setNom(''); setLieu(''); onChange();
    } catch (e2) { setErr(e2.message); }
  };
  const supprimer = async (b) => {
    await appelApiOrg(`/batiments/${b.id}`, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Bâtiments ({batiments.length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input style={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <input style={champ} placeholder="Lieu" value={lieu} onChange={(e) => setLieu(e.target.value)} required />
        <button style={btn} type="submit"><Plus size={15} /> Créer</button>
      </form>
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {batiments.map((b) => (
          <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div><strong>{b.nom}</strong> <span style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>· {b.lieu}</span></div>
            <button style={btnSuppr} onClick={() => supprimer(b)} title="Supprimer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionPieces({ pieces, batiments, onChange }) {
  const [nom, setNom] = useState('');
  const [batimentId, setBatimentId] = useState('');
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await appelApiOrg('/pieces', { method: 'POST', body: JSON.stringify({ id_admin: idAdmin(), nom, batiment_id: batimentId || batiments[0]?.id }) });
      setNom(''); onChange();
    } catch (e2) { setErr(e2.message); }
  };
  const supprimer = async (p) => {
    await appelApiOrg(`/pieces/${p.id}`, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };
  const nomBatiment = (id) => batiments.find((b) => b.id === id)?.nom || '?';

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Pièces ({pieces.length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input style={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <select style={champ} value={batimentId} onChange={(e) => setBatimentId(e.target.value)} required>
          <option value="">Bâtiment...</option>
          {batiments.map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <button style={btn} type="submit" disabled={batiments.length === 0}><Plus size={15} /> Créer</button>
      </form>
      {batiments.length === 0 && <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Crée d'abord un bâtiment.</p>}
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {pieces.map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div><strong>{p.nom}</strong> <span style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>· {nomBatiment(p.batiment_id)}</span></div>
            <button style={btnSuppr} onClick={() => supprimer(p)} title="Supprimer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCameras({ cameras, pieces, onChange }) {
  const [num, setNum] = useState('');
  const [pieceId, setPieceId] = useState('');
  const [estEntree, setEstEntree] = useState(false);
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await appelApiOrg('/cameras', { method: 'POST', body: JSON.stringify({ id_admin: idAdmin(), num, piece_id: pieceId || pieces[0]?.id, est_entree: estEntree }) });
      setNum(''); setEstEntree(false); onChange();
    } catch (e2) { setErr(e2.message); }
  };
  const supprimer = async (c) => {
    await appelApiOrg(`/cameras/${c.id}`, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };
  const nomPiece = (id) => pieces.find((p) => p.id === id)?.nom || '?';

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Caméras ({cameras.length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap', marginBottom: '16px' }}>
        <input style={champ} placeholder="Numéro (ex. CAM-01)" value={num} onChange={(e) => setNum(e.target.value)} required />
        <select style={champ} value={pieceId} onChange={(e) => setPieceId(e.target.value)} required>
          <option value="">Pièce...</option>
          {pieces.map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
        </select>
        <label style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: '6px' }}>
          <input type="checkbox" checked={estEntree} onChange={(e) => setEstEntree(e.target.checked)} /> Point d'entrée
        </label>
        <button style={btn} type="submit" disabled={pieces.length === 0}><Plus size={15} /> Créer</button>
      </form>
      {pieces.length === 0 && <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Crée d'abord une pièce.</p>}
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {cameras.map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div>
              <strong>{c.num}</strong> <span style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>· {nomPiece(c.piece_id)}</span>
              {c.est_entree && <span style={{ marginLeft: '8px', fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '2px 7px', borderRadius: '999px' }}>ENTRÉE</span>}
            </div>
            <button style={btnSuppr} onClick={() => supprimer(c)} title="Supprimer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// ORCHESTRATEUR : Admin (page /admin et /default-admin)
// ============================================================================

const INTERVALLE_MS = 2000;

async function appelApi(chemin) {
  const res = await fetch(`${API_BASE}${chemin}`);
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error(data?.detail || `Erreur ${res.status}`);
  return data;
}

function jouerBip(audioCtxRef) {
  try {
    if (!audioCtxRef.current) {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      audioCtxRef.current = new Ctx();
    }
    const ctx = audioCtxRef.current;
    if (ctx.state === 'suspended') ctx.resume();
    const now = ctx.currentTime;
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.setValueAtTime(880, now);
    g.gain.setValueAtTime(0.25, now);
    g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
    o.connect(g);
    g.connect(ctx.destination);
    o.start(now);
    o.stop(now + 0.25);
  } catch (e) { /* pas grave, silencieux */ }
}

// Titre à afficher pour une "situation" personne (Surveillance
// Comportementale) — le signal le plus parlant d'abord.
function titreSituationPersonne(item) {
  if (item.intrusionZoneActive) return 'Intrusion en zone non autorisée';
  if (item.rodage && item.rodage !== 'Normal' && !item.rodage.startsWith('En observation')) return item.rodage;
  if (item.infiltration && item.infiltration !== 'Normal') return item.infiltration;
  if (item.regard && item.regard !== 'Normal') return `Regard suspect : ${item.regard}`;
  return 'Personne suivie';
}

export default function Admin() {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  const nom = sessionStorage.getItem('previa_utilisateur_nom') || 'Utilisateur';
  const role = sessionStorage.getItem('previa_utilisateur_role') || 'user';
  const estParDefaut = sessionStorage.getItem('previa_est_par_defaut') === 'oui';

  const [vueEnsemble, setVueEnsemble] = useState(null);
  const [personnes, setPersonnes] = useState([]);
  const [objets, setObjets] = useState([]);
  const [alertes, setAlertes] = useState([]);
  const [audioActif, setAudioActif] = useState(true);

  // Licence de cette installation (voir LicenceDisabledScreen plus haut
  // et Infrastructure/licence.py côté backend) — `null` tant que le
  // premier chargement n'a pas répondu, pour ne jamais flasher l'app
  // normale puis la reprendre. Revérifiée toutes les 10 min (best-effort
  // : une désactivation à distance doit finir par se voir sans recharger
  // la page), mais la réponse elle-même vient d'un calcul local, donc
  // fonctionne même hors ligne.
  const [licence, setLicence] = useState(null);
  useEffect(() => {
    let annule = false;
    async function verifierLicence() {
      try {
        const e = await chargerEtatLicence();
        if (!annule) setLicence(e);
      } catch {
        // Backend hors ligne/injoignable : ne verrouille pas l'app sur un
        // simple raté réseau — seul un statut explicite ("expiree",
        // "desactivee"...) déclenche LicenceDisabledScreen.
        if (!annule) setLicence((prev) => prev ?? { statut: 'active' });
      }
    }
    verifierLicence();
    const t = setInterval(verifierLicence, 10 * 60 * 1000);
    return () => { annule = true; clearInterval(t); };
  }, []);

  const alertesConnuesRef = useRef(null);
  const audioCtxRef = useRef(null);
  const audioActifRef = useRef(true);
  audioActifRef.current = audioActif;

  async function rafraichir() {
    try {
      const v = await appelApi('/vue-ensemble');
      setVueEnsemble(v);

      const resultats = await Promise.all(
        v.cameras.map((c) => appelApi(`/cameras/${c.id_camera}/etat`).then((e) => ({ c, e })).catch(() => null)),
      );

      const nouvellesPersonnes = [];
      const nouveauxObjets = [];
      for (const item of resultats) {
        if (!item) continue;
        const { c, e } = item;
        const camCtx = { id_camera: c.id_camera, num: c.num, piece: c.piece, batiment: c.batiment };
        const personnesVues = e.personnesVues || {};
        const vueActuelle = e.vueActuelle || {};
        (personnesVues.personnes || []).forEach((p, idx) => nouvellesPersonnes.push(mapPersonneApi(p, idx, camCtx)));
        Object.entries(vueActuelle.objets || {}).forEach(([nomObj, info]) => {
          (info.instances || []).forEach((instance) => nouveauxObjets.push(mapObjetInstanceApi(nomObj, instance, camCtx)));
        });
        (vueActuelle.alertes_feu_fumee || []).forEach((a) => nouveauxObjets.push(mapFeuFumeeAlerte(a, camCtx)));
        (personnesVues.zones_suspectes || []).filter((z) => z.rodeur).forEach((z, idx) => nouveauxObjets.push(mapZoneSuspecte(z, idx, camCtx)));
      }
      setPersonnes(nouvellesPersonnes);
      setObjets(nouveauxObjets);

      const a = await appelApi('/alertes');
      const idsConnus = alertesConnuesRef.current;
      if (idsConnus !== null) {
        const nouvelles = a.filter((al) => !idsConnus.has(al.id));
        if (nouvelles.length > 0 && audioActifRef.current) jouerBip(audioCtxRef);
      }
      alertesConnuesRef.current = new Set(a.map((al) => al.id));
      setAlertes(a);
    } catch (err) {
      // silencieux : chaque vue affiche déjà un état vide correct sans données
    }
  }

  useEffect(() => {
    rafraichir();
    const t = setInterval(rafraichir, INTERVALLE_MS);
    return () => clearInterval(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Raccourcis clavier (1-9), étendus à l'onglet Organisation quand présent.
  useEffect(() => {
    const tabs = ['dashboard', 'cameras', 'personnes', 'objets', 'events', 'alerts', 'reports', ...(estParDefaut ? ['organisation', 'configAlerte'] : [])];
    const handleKeyDown = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
      const num = parseInt(e.key, 10);
      if (num >= 1 && num <= tabs.length) setCurrentTab(tabs[num - 1]);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [estParDefaut]);

  function seDeconnecter() {
    sessionStorage.clear();
    navigate('/login', { replace: true });
  }

  // --- Données dérivées, distribuées aux vues via props ---------------

  const camerasReelles = (vueEnsemble?.cameras || []).map((c) => ({
    id: c.id_camera,
    name: c.num || c.id_camera,
    image: `${API_BASE}/cameras/${c.id_camera}/image`,
    location: [c.batiment, c.piece].filter(Boolean).join(' / ') || 'Emplacement inconnu',
    estEntree: c.est_entree,
    nombrePersonnes: c.nombre_personnes ?? 0,
    misAJourLe: c.mis_a_jour_le,
  }));

  const camerasParId = Object.fromEntries(camerasReelles.map((c) => [c.id, c.image]));

  const cibles = [...personnes, ...objets].sort((a, b) => b.riskPct - a.riskPct);
  const situations = cibles.slice(0, 6).map((item) => ({
    id: item.id,
    title: item.isObject ? item.label : titreSituationPersonne(item),
    subtitle: `${item.camCtx?.batiment || '?'} · ${item.camCtx?.piece || '?'} · ${item.camCtx?.num || item.camCtx?.id_camera || '?'}`,
    riskLevel: item.riskLevel,
    _item: item,
  }));

  const derniereAlerte = alertes[0];
  const alerteEnCours = derniereAlerte ? {
    titre: derniereAlerte.type_evenement,
    lieu: [derniereAlerte.batiment, derniereAlerte.piece, derniereAlerte.num || derniereAlerte.id_camera].filter(Boolean).join(' / '),
  } : null;

  const alertesPrioritaires = personnes.filter((p) => p.riskPct >= 70).length + objets.filter((o) => o.riskPct >= 70).length;

  const camerasEnLigne = camerasReelles.filter((c) => c.misAJourLe && Date.now() / 1000 - c.misAJourLe <= 15).length;
  const uptimeRate = camerasReelles.length > 0 ? `${Math.round((camerasEnLigne / camerasReelles.length) * 100)}%` : '—';

  const kpis = {
    activeCameras: vueEnsemble?.nombre_cameras ?? 0,
    detectedPersons: personnes.length,
    suspectBehaviors: alertesPrioritaires,
    uptimeRate,
  };

  const notifications = alertes.slice(0, 3).map((a) => ({
    id: a.id,
    title: a.description,
    time: a.horodatage ? new Date(a.horodatage * 1000).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }) : '',
    cam: a.num || a.id_camera,
    type: ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(a.type_evenement) ? 'critical' : 'warning',
  }));

  const renderActiveView = () => {
    const toggleSidebar = () => setIsSidebarCollapsed(!isSidebarCollapsed);
    switch (currentTab) {
      case 'dashboard':
        return (
          <DashboardView
            onToggleSidebar={toggleSidebar}
            onSelectTab={(tab) => setCurrentTab(tab)}
            kpis={kpis}
            cameras={camerasReelles}
            situations={situations}
            alerteEnCours={alerteEnCours}
          />
        );
      case 'cameras':
        return <CamerasView cameras={camerasReelles} onRefresh={rafraichir} />;
      case 'personnes':
        return <CiblesView titre="Personnes" sousTitre="Toutes les personnes détectées, toutes caméras confondues." items={personnes} type="personnes" />;
      case 'objets':
        return <CiblesView titre="Objets" sousTitre="Tous les objets détectés, toutes caméras confondues." items={objets} type="objets" />;
      case 'events':
        return <EventsView alertesReelles={alertes} />;
      case 'alerts':
        return <AlertsView alertesReelles={alertes} camerasParId={camerasParId} />;
      case 'reports':
        return <ReportsView alertesReelles={alertes} kpis={kpis} />;
      case 'organisation':
        return estParDefaut ? <OrganisationView /> : <DashboardView onToggleSidebar={toggleSidebar} onSelectTab={setCurrentTab} kpis={kpis} cameras={camerasReelles} situations={situations} alerteEnCours={alerteEnCours} />;
      case 'configAlerte':
        return estParDefaut ? <ConfigAlerteView /> : <DashboardView onToggleSidebar={toggleSidebar} onSelectTab={setCurrentTab} kpis={kpis} cameras={camerasReelles} situations={situations} alerteEnCours={alerteEnCours} />;
      default:
        return (
          <DashboardView
            onToggleSidebar={toggleSidebar}
            onSelectTab={(tab) => setCurrentTab(tab)}
            kpis={kpis}
            cameras={camerasReelles}
            situations={situations}
            alerteEnCours={alerteEnCours}
          />
        );
    }
  };

  // Garde de licence — voir la docstring du useEffect ci-dessus. Coupe le
  // rendu normal AVANT le Sidebar/HeaderDecor : demandé explicitement
  // "tout le menu qui part et laisse un seul menu", pas juste un bandeau
  // en plus de l'interface habituelle.
  if (licence === null) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--ink-muted)' }}>
        Chargement...
      </div>
    );
  }
  if (licence.statut !== 'active') {
    return <LicenceDisabledScreen statut={licence.statut} onActivee={setLicence} />;
  }

  return (
    <div className="app-container">
      {/* PERSISTENT SAPPHIRE SIDEBAR IDENTICAL ACROSS ALL VIEWS */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => setCurrentTab(tab)}
        isCollapsed={isSidebarCollapsed}
        unreadAlerts={alertes.length}
        showOrganisation={estParDefaut}
        joursRestantsLicence={licence.jours_restants}
      />

      {/* MAIN OPERATIONS WORKSPACE */}
      <main className="main-layout">
        {/* TOP RIGHT ORGANIC BLUE WAVE BANNER WITH ACTION BUTTONS */}
        <HeaderDecor
          onNavigate={(tab) => setCurrentTab(tab)}
          onLogout={seDeconnecter}
          unreadCount={alertes.length}
          notifications={notifications}
          utilisateur={{ nom, role }}
        />

        {/* CURRENT TAB VIEW */}
        {renderActiveView()}
      </main>
    </div>
  );
}
