import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Activity, AlertTriangle, ArrowRight, ArrowUpDown, BarChart3, Building2, Camera, Cctv, Check, CheckCircle, CheckCircle2,
  ChevronLeft, ChevronRight, Clock, DoorOpen, Download, Eye, FileSpreadsheet, FileText, Filter, Info, KeyRound, LayoutGrid,
  Lightbulb, List, Loader2, Mail, MapPin, Maximize2, Menu, Package, Play, Plus, RefreshCw, Save, Search,
  Router, Shield, ShieldAlert, ShieldCheck, SlidersHorizontal, Target, Trash2, TrendingUp, Undo2, Users, Volume2,
  VolumeX, Wifi, WifiOff, X, Zap, ZoomIn,
} from 'lucide-react';
import Sidebar from '../components/Sidebar';
import HeaderDecor from '../components/HeaderDecor';
import KpiCards from '../components/KpiCards';
import LiveCameraGrid from '../components/LiveCameraGrid';
import AiAnalysisCard from '../components/AiAnalysisCard';
import CameraViewModal from '../components/CameraViewModal';
import PrecursorDetailModal from '../components/PrecursorDetailModal';
import PersonnesFaceIdView from '../components/PersonnesFaceIdView';
import AlertMediaModal from '../components/AlertMediaModal';
import ConfirmModal from '../components/ConfirmModal';
import {
  API_BASE, chargerEtatAlarme, arreterAlarme, listerEsp, chargerEtatEsp, ajouterReseauEsp,
  supprimerReseauEsp, basculerReseauEsp, chargerEtatLicence, activerLicence,
  chargerZoneCamera, enregistrerZoneCamera, supprimerZoneCamera, listerCameras,
  creerCamera, supprimerCamera, testerFluxRtsp, urlFluxCamera, urlImageAlerte, urlClipAlerte,
  supprimerAlerte, supprimerToutesAlertes,
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
      <div className="welcome-header" style={{ marginBottom: '16px' }}>
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
              Surveillance intelligente et protection des locaux
            </p>
          </div>
        </div>
      </div>

      {/* BANDEAU D'ÉTAT SÉCURITÉ */}
      <div
        style={{
          background: alerteEnCours ? '#fef2f2' : '#f0fdf4',
          border: alerteEnCours ? '2px solid #ef4444' : '1px solid #bbf7d0',
          borderRadius: '14px',
          padding: '14px 20px',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          boxShadow: alerteEnCours ? '0 8px 24px rgba(239, 68, 68, 0.15)' : '0 2px 10px rgba(0,0,0,0.02)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span
            style={{
              width: '12px',
              height: '12px',
              borderRadius: '50%',
              background: alerteEnCours ? '#ef4444' : '#16a34a',
              boxShadow: alerteEnCours ? '0 0 12px #ef4444' : '0 0 8px #16a34a',
              flexShrink: 0,
            }}
          />
          <div>
            <div style={{ fontSize: '0.92rem', fontWeight: 800, color: alerteEnCours ? '#991b1b' : '#166534' }}>
              {alerteEnCours
                ? `🚨 ALERTE CRITIQUE EN COURS : ${alerteEnCours.titre.toUpperCase()} (${alerteEnCours.lieu})`
                : '🟢 SYSTÈME DE SÉCURITÉ ARMÉ — Surveillance active 24h/24'
              }
            </div>
            <div style={{ fontSize: '0.78rem', color: alerteEnCours ? '#b91c1c' : '#15803d', marginTop: '2px' }}>
              {alerteEnCours
                ? 'Sirène et projecteurs activés. Vérification immédiate requise.'
                : 'Tous les flux et zones de surveillance sont opérationnels.'
              }
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          {alerteEnCours ? (
            <button
              type="button"
              onClick={() => onSelectTab('alerts')}
              style={{
                background: '#ef4444',
                color: '#ffffff',
                border: 'none',
                padding: '8px 16px',
                borderRadius: '8px',
                fontSize: '0.82rem',
                fontWeight: 800,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                boxShadow: '0 4px 12px rgba(239, 68, 68, 0.3)',
              }}
            >
              <ShieldAlert size={15} /> Gérer l'Urgence
            </button>
          ) : (
            <span
              style={{
                fontSize: '0.76rem',
                color: '#15803d',
                fontWeight: 800,
                background: '#dcfce7',
                padding: '5px 12px',
                borderRadius: '20px',
                border: '1px solid #86efac',
                display: 'flex',
                alignItems: 'center',
                gap: '5px',
              }}
            >
              <ShieldCheck size={14} color="#16a34a" /> Surveillance Active
            </span>
          )}
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
          camera={cameras.find((c) => c.id === selectedCamera.id) || selectedCamera}
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
// Dessin de zone non autorisée par caméra avec plage horaire d'activation
function SectionZones({ cameras, initialCameraId }) {
  const [idCamera, setIdCamera] = useState(initialCameraId || cameras[0]?.id || '');
  const [tick, setTick] = useState(0);
  const [points, setPoints] = useState([]);
  const [nomZone, setNomZone] = useState('');
  const [active24h, setActive24h] = useState(true);
  const [heureDebut, setHeureDebut] = useState('20:00');
  const [heureFin, setHeureFin] = useState('06:00');
  const [joursActifs, setJoursActifs] = useState([0, 1, 2, 3, 4, 5, 6]);
  const [zoneExistante, setZoneExistante] = useState(null);
  const [estModifie, setEstModifie] = useState(false);
  const [ratio, setRatio] = useState(4 / 3);
  const [imageOk, setImageOk] = useState(true);
  const [message, setMessage] = useState(null);
  const [enregistrement, setEnregistrement] = useState(false);
  const viewportRef = useRef(null);

  const camActuelle = cameras.find((c) => c.id === idCamera);
  const streamDirect = useFluxDirect(camActuelle?.urlFlux ? null : idCamera);

  useEffect(() => {
    if (initialCameraId && cameras.some((c) => c.id === initialCameraId)) {
      setIdCamera(initialCameraId);
    }
  }, [initialCameraId, cameras]);

  useEffect(() => {
    if (cameras.length > 0 && !cameras.some((c) => c.id === idCamera)) setIdCamera(cameras[0].id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cameras.map((c) => c.id).join(',')]);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    setPoints([]); setMessage(null); setZoneExistante(null); setEstModifie(false);
    setNomZone(''); setActive24h(true); setHeureDebut('20:00'); setHeureFin('06:00'); setJoursActifs([0, 1, 2, 3, 4, 5, 6]);
    if (!idCamera) return;
    chargerZoneCamera(idCamera)
      .then((z) => {
        if (z) {
          setZoneExistante(z);
          setPoints(z.points || []);
          if (z.nom_zone) setNomZone(z.nom_zone);
          if (z.plage_horaire) {
            setActive24h(z.plage_horaire.active_24h ?? true);
            setHeureDebut(z.plage_horaire.heure_debut || '20:00');
            setHeureFin(z.plage_horaire.heure_fin || '06:00');
            if (Array.isArray(z.plage_horaire.jours_actifs)) {
              setJoursActifs(z.plage_horaire.jours_actifs);
            }
          }
          setEstModifie(false);
        }
      })
      .catch(() => {});
  }, [idCamera]);

  // camActuelle est déjà défini au début du composant

  function clicSurImage(e) {
    const el = viewportRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;
    if (x < 0 || x > 1 || y < 0 || y > 1) return;
    setPoints((prev) => [...prev, { x, y }]);
    setEstModifie(true);
  }

  function basculerJour(idx) {
    setJoursActifs((prev) =>
      prev.includes(idx) ? (prev.length > 1 ? prev.filter((j) => j !== idx) : prev) : [...prev, idx].sort()
    );
    setEstModifie(true);
  }

  function appliquerPreset(debut, fin, jours = [0, 1, 2, 3, 4, 5, 6]) {
    setActive24h(false);
    setHeureDebut(debut);
    setHeureFin(fin);
    setJoursActifs(jours);
    setEstModifie(true);
  }

  // Calcul du statut en temps réel
  function calculerStatutActuel() {
    if (active24h) return { actif: true, texte: 'Active en permanence (24h/24)' };
    const now = new Date();
    const currentDay = (now.getDay() + 6) % 7; // 0=Lun .. 6=Dim
    if (!joursActifs.includes(currentDay)) {
      return { actif: false, texte: 'En veille aujourd\'hui (Jour non surveillé)' };
    }
    const [hD, mD] = heureDebut.split(':').map(Number);
    const [hF, mF] = heureFin.split(':').map(Number);
    const nowMin = now.getHours() * 60 + now.getMinutes();
    const debMin = hD * 60 + mD;
    const finMin = hF * 60 + mF;

    let actif = false;
    if (debMin <= finMin) {
      actif = nowMin >= debMin && nowMin <= finMin;
    } else {
      actif = nowMin >= debMin || nowMin <= finMin;
    }
    return {
      actif,
      texte: actif ? `Active en ce moment (${heureDebut} - ${heureFin})` : `En veille actuellement (${heureDebut} - ${heureFin})`,
    };
  }

  const statutHoraire = calculerStatutActuel();

  async function enregistrer() {
    if (points.length < 3) { setMessage({ ok: false, texte: 'Il faut au moins 3 points pour délimiter une zone.' }); return; }
    setEnregistrement(true);
    try {
      const plage = {
        active_24h: active24h,
        heure_debut: heureDebut,
        heure_fin: heureFin,
        jours_actifs: joursActifs,
      };
      const savedName = nomZone.trim() || `Zone ${camActuelle?.name || ''}`;
      const data = await enregistrerZoneCamera(
        idCamera,
        sessionStorage.getItem('previa_utilisateur_id'),
        points,
        savedName,
        plage
      );
      setZoneExistante(data);
      setNomZone(data.nom_zone || savedName);
      setEstModifie(false);
      setMessage({ ok: true, texte: 'Zone & plage horaire enregistrées avec succès.' });
    } catch (e) {
      setMessage({ ok: false, texte: e.message });
    } finally {
      setEnregistrement(false);
    }
  }

  async function supprimer() {
    setEnregistrement(true);
    try {
      await supprimerZoneCamera(idCamera);
      setZoneExistante(null); setPoints([]); setNomZone(''); setEstModifie(false);
      setMessage({ ok: true, texte: 'Zone supprimée.' });
    } catch (e) {
      setMessage({ ok: false, texte: e.message });
    } finally {
      setEnregistrement(false);
    }
  }

  if (cameras.length === 0) return null;

  const polygonePoints = points.map((p) => `${p.x * 100},${p.y * 100}`).join(' ');
  const joursNoms = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  return (
    <div style={{ background: '#ffffff', borderRadius: '18px', padding: '24px 28px', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 20px rgba(0,0,0,0.04)', marginTop: '24px' }}>
      {/* HEADER SECTION WITH BADGE */}
      <div style={{ marginBottom: '22px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, color: '#01356B', margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span style={{ display: 'inline-flex', padding: '8px', borderRadius: '10px', background: '#e0f2fe', color: '#009FE3' }}>
              <MapPin size={20} />
            </span>
            Zones Sensibles & Plages Horaires d'Activation
          </h3>
          <p style={{ fontSize: '0.84rem', color: 'var(--ink-muted)', margin: '6px 0 0 0', maxWidth: '680px', lineHeight: 1.4 }}>
            Délimitez une zone sur l'image et activez la surveillance sur des plages horaires ciblées pour éliminer les fausses alertes pendant les heures de travail.
          </p>
        </div>

        {/* Live Status Badge */}
        <div style={{
          display: 'inline-flex', alignItems: 'center', gap: '8px', padding: '8px 16px', borderRadius: '30px',
          background: statutHoraire.actif ? '#ecfdf5' : '#f8fafc',
          border: statutHoraire.actif ? '1px solid #6ee7b7' : '1px solid #e2e8f0',
          color: statutHoraire.actif ? '#047857' : '#64748b',
          fontSize: '0.82rem', fontWeight: 700,
          boxShadow: statutHoraire.actif ? '0 2px 8px rgba(16,185,129,0.15)' : 'none'
        }}>
          <span style={{
            width: '8px', height: '8px', borderRadius: '50%',
            background: statutHoraire.actif ? '#10b981' : '#94a3b8',
            boxShadow: statutHoraire.actif ? '0 0 10px #10b981' : 'none',
          }} />
          {statutHoraire.texte}
        </div>
      </div>

      {/* TOP CONTROLS: Camera Selection & Zone Name */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: '16px', marginBottom: '20px', background: '#f8fafc', padding: '16px', borderRadius: '14px', border: '1px solid #e2e8f0' }}>
        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#01356B', display: 'block', marginBottom: '6px' }}>
            📹 Caméra Cible
          </label>
          <select
            value={idCamera}
            onChange={(e) => setIdCamera(e.target.value)}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.88rem', fontWeight: 700, background: '#ffffff', color: '#0f172a', outline: 'none', cursor: 'pointer' }}
          >
            {cameras.map((c) => <option key={c.id} value={c.id}>{c.name} — {c.location}</option>)}
          </select>
        </div>

        <div>
          <label style={{ fontSize: '0.78rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#01356B', display: 'block', marginBottom: '6px' }}>
            🏷️ Nom de la zone protégée
          </label>
          <input
            type="text"
            placeholder="Ex: Zone Réserve, Coffre-fort, Bureau Direction"
            value={nomZone}
            onChange={(e) => {
              setNomZone(e.target.value);
              setEstModifie(true);
            }}
            style={{ width: '100%', padding: '10px 14px', borderRadius: '10px', border: '1px solid #cbd5e1', fontSize: '0.88rem', color: '#0f172a', background: '#ffffff', outline: 'none', fontWeight: 600 }}
          />
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: '24px', alignItems: 'start' }}>
        {/* Visual Drawing Viewport */}
        <div>
          <div
            ref={viewportRef}
            onClick={clicSurImage}
            style={{ position: 'relative', borderRadius: '14px', overflow: 'hidden', background: '#05070d', aspectRatio: String(ratio), cursor: 'crosshair', userSelect: 'none', border: '1px solid var(--border-subtle)', boxShadow: '0 4px 12px rgba(0,0,0,0.06)' }}
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
                En attente d'un flux de cette caméra…
              </div>
            )}
            <svg style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} viewBox="0 0 100 100" preserveAspectRatio="none">
              {points.length >= 2 && <polygon points={polygonePoints} fill={statutHoraire.actif ? 'rgba(2,132,199,0.3)' : 'rgba(148,163,184,0.25)'} stroke={statutHoraire.actif ? '#0284c7' : '#94a3b8'} strokeWidth="2.5" strokeDasharray={statutHoraire.actif ? 'none' : '4 2'} vectorEffect="non-scaling-stroke" />}
              {points.slice(1).map((p, i) => (
                <line key={i} x1={points[i].x * 100} y1={points[i].y * 100} x2={p.x * 100} y2={p.y * 100} stroke="#0284c7" strokeWidth="2.5" vectorEffect="non-scaling-stroke" />
              ))}
            </svg>
            {points.map((p, i) => (
              <div key={i} style={{ position: 'absolute', left: `${p.x * 100}%`, top: `${p.y * 100}%`, marginLeft: '-11px', marginTop: '-11px', width: '22px', height: '22px', borderRadius: '50%', background: '#0284c7', border: '2px solid #fff', color: '#fff', fontSize: '11px', fontWeight: 800, display: 'flex', alignItems: 'center', justifyContent: 'center', pointerEvents: 'none', boxShadow: '0 2px 6px rgba(0,0,0,0.35)' }}>
                {i + 1}
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: '10px', fontSize: '0.8rem', color: 'var(--ink-muted)' }}>
            <span>{points.length} point(s) posé(s) — Cliquez pour en ajouter (3 min).</span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => {
                  setPoints((p) => p.slice(0, -1));
                  setEstModifie(true);
                }}
                disabled={points.length === 0}
                style={{ ...btnSecondaire, padding: '5px 10px', fontSize: '0.78rem' }}
              >
                <Undo2 size={13} /> Annuler point
              </button>
              <button
                onClick={() => {
                  setPoints([]);
                  setEstModifie(true);
                }}
                disabled={points.length === 0}
                style={{ ...btnSecondaire, padding: '5px 10px', fontSize: '0.78rem' }}
              >
                <Trash2 size={13} /> Effacer tracé
              </button>
            </div>
          </div>
        </div>

        {/* Schedule & Activation Controls */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Card: Plage Horaire */}
          <div style={{ background: '#ffffff', border: '1px solid #e2e8f0', borderRadius: '14px', padding: '18px', boxShadow: '0 2px 10px rgba(0,0,0,0.02)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px', borderBottom: '1px solid #f1f5f9', paddingBottom: '10px' }}>
              <span style={{ fontSize: '0.9rem', fontWeight: 800, color: '#01356B', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={18} color="#009FE3" /> Plage Horaire d'Activation
              </span>
              <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer', fontSize: '0.78rem', fontWeight: 700, color: '#009FE3', background: '#e0f2fe', padding: '4px 10px', borderRadius: '20px' }}>
                <input
                  type="checkbox"
                  checked={active24h}
                  onChange={(e) => {
                    setActive24h(e.target.checked);
                    setEstModifie(true);
                  }}
                  style={{ width: '15px', height: '15px', accentColor: '#009FE3', cursor: 'pointer' }}
                />
                Actif 24h/24
              </label>
            </div>

            {!active24h ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {/* Presets */}
                <div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ink-muted)', display: 'block', marginBottom: '6px' }}>
                    Modèles rapides :
                  </span>
                  <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap' }}>
                    <button
                      type="button"
                      onClick={() => appliquerPreset('20:00', '06:00')}
                      style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, border: '1px solid #cbd5e1', background: heureDebut === '20:00' && heureFin === '06:00' ? '#e0f2fe' : '#ffffff', color: heureDebut === '20:00' && heureFin === '06:00' ? '#0369a1' : 'var(--ink-primary)', cursor: 'pointer' }}
                    >
                      🌙 Nuit (20h–6h)
                    </button>
                    <button
                      type="button"
                      onClick={() => appliquerPreset('18:00', '08:00')}
                      style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, border: '1px solid #cbd5e1', background: heureDebut === '18:00' && heureFin === '08:00' ? '#e0f2fe' : '#ffffff', color: heureDebut === '18:00' && heureFin === '08:00' ? '#0369a1' : 'var(--ink-primary)', cursor: 'pointer' }}
                    >
                      🏢 Hors bureau (18h–8h)
                    </button>
                    <button
                      type="button"
                      onClick={() => appliquerPreset('08:00', '18:00')}
                      style={{ padding: '4px 8px', borderRadius: '6px', fontSize: '0.74rem', fontWeight: 600, border: '1px solid #cbd5e1', background: heureDebut === '08:00' && heureFin === '18:00' ? '#e0f2fe' : '#ffffff', color: heureDebut === '08:00' && heureFin === '18:00' ? '#0369a1' : 'var(--ink-primary)', cursor: 'pointer' }}
                    >
                      ☀️ Jour (8h–18h)
                    </button>
                  </div>
                </div>

                {/* Hours inputs */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '3px' }}>
                      Heure de début
                    </label>
                    <input
                      type="time"
                      value={heureDebut}
                      onChange={(e) => {
                        setHeureDebut(e.target.value);
                        setEstModifie(true);
                      }}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontWeight: 700, background: '#ffffff' }}
                    />
                  </div>
                  <div>
                    <label style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '3px' }}>
                      Heure de fin
                    </label>
                    <input
                      type="time"
                      value={heureFin}
                      onChange={(e) => {
                        setHeureFin(e.target.value);
                        setEstModifie(true);
                      }}
                      style={{ width: '100%', padding: '6px 10px', borderRadius: '6px', border: '1px solid var(--border-light)', fontSize: '0.85rem', fontWeight: 700, background: '#ffffff' }}
                    />
                  </div>
                </div>

                {/* Days of week */}
                <div>
                  <span style={{ fontSize: '0.74rem', fontWeight: 700, color: 'var(--ink-secondary)', display: 'block', marginBottom: '6px' }}>
                    Jours de surveillance active :
                  </span>
                  <div style={{ display: 'flex', gap: '4px', justifyContent: 'space-between' }}>
                    {joursNoms.map((nom, idx) => {
                      const sel = joursActifs.includes(idx);
                      return (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => basculerJour(idx)}
                          style={{
                            flex: 1, padding: '6px 0', textAlign: 'center', borderRadius: '6px',
                            fontSize: '0.74rem', fontWeight: 800, cursor: 'pointer',
                            background: sel ? '#0284c7' : '#ffffff',
                            color: sel ? '#ffffff' : 'var(--ink-secondary)',
                            border: sel ? '1px solid #0284c7' : '1px solid var(--border-light)',
                            transition: 'all 0.15s ease',
                          }}
                        >
                          {nom}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', background: '#ffffff', padding: '10px 12px', borderRadius: '8px', border: '1px dashed var(--border-light)' }}>
                🛡️ La zone est protégée <strong>24h/24 et 7j/7</strong>. Toute intrusion déclenchera instantanément une alerte, de jour comme de nuit.
              </div>
            )}
          </div>

          {/* Action Messages & Status */}
          {message && (
            <div style={{
              fontSize: '0.82rem',
              padding: '9px 14px',
              borderRadius: '8px',
              background: message.ok ? '#ecfdf5' : '#fef2f2',
              color: message.ok ? '#047857' : '#b91c1c',
              border: `1px solid ${message.ok ? '#a7f3d0' : '#fecaca'}`,
              fontWeight: 600,
              display: 'flex',
              alignItems: 'center',
              gap: '8px'
            }}>
              {message.ok ? <CheckCircle2 size={16} color="#059669" /> : <AlertTriangle size={16} color="#dc2626" />}
              <span>{message.texte}</span>
            </div>
          )}

          {/* Save & Delete Buttons */}
          {zoneExistante && !estModifie ? (
            <div
              style={{
                background: '#ecfdf5',
                border: '1px solid #a7f3d0',
                color: '#065f46',
                padding: '11px 16px',
                borderRadius: '8px',
                fontSize: '0.85rem',
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                justifyContent: 'center',
                boxShadow: '0 1px 3px rgba(0,0,0,0.04)'
              }}
            >
              <CheckCircle2 size={16} color="#10b981" />
              <span>Zone enregistrée & active</span>
            </div>
          ) : (
            <button
              onClick={enregistrer}
              disabled={enregistrement || points.length < 3}
              style={{
                width: '100%',
                background: (enregistrement || points.length < 3) 
                  ? '#94a3b8' 
                  : 'linear-gradient(135deg, #01356B 0%, #009FE3 100%)',
                border: 'none',
                color: '#ffffff',
                padding: '12px 18px',
                borderRadius: '10px',
                fontSize: '0.88rem',
                fontWeight: 800,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '8px',
                boxShadow: (enregistrement || points.length < 3) 
                  ? 'none' 
                  : '0 4px 14px rgba(0, 159, 227, 0.35)',
                opacity: (enregistrement || points.length < 3) ? 0.6 : 1,
                cursor: (enregistrement || points.length < 3) ? 'not-allowed' : 'pointer'
              }}
            >
              <Save size={16} />
              <span>{zoneExistante ? 'Enregistrer les modifications' : 'Enregistrer la zone & les plages horaires'}</span>
            </button>
          )}

          {zoneExistante && (
            <button onClick={supprimer} disabled={enregistrement} style={btnSecondaire}>
              <Trash2 size={15} /> Supprimer la zone enregistrée
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
  padding: '11px 16px', borderRadius: '8px', fontSize: '0.85rem', fontWeight: 700, cursor: 'pointer',
  display: 'flex', alignItems: 'center', gap: '8px', justifyContent: 'center',
  boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
};

function ilYA(horodatage) {
  if (!horodatage) return 'jamais';
  const s = Math.max(0, Math.round(Date.now() / 1000 - horodatage));
  if (s < 5) return "à l'instant";
  if (s < 60) return `il y a ${s}s`;
  if (s < 3600) return `il y a ${Math.round(s / 60)} min`;
  return `il y a ${Math.round(s / 3600)} h`;
}

// ============================================================================
// SECTION : CAMÉRAS (SUPERVISION ÉPURÉE, MULTI-VUES ET ZONES DE SÉCURITÉ)
// ============================================================================
function CamerasView({ cameras = [], personnes = [], alertes = [], onRefresh, onSelectTab }) {
  const [selectedCam, setSelectedCam] = useState(() => {
    return localStorage.getItem('previa_selected_camera') || null;
  });
  const [subTab, setSubTab] = useState('hero'); // 'hero' | 'mosaic' | 'zones'
  const [isSyncing, setIsSyncing] = useState(false);
  const [tick, setTick] = useState(0);
  const [alerteInspectee, setAlerteInspectee] = useState(null);
  const [fullscreenModalCam, setFullscreenModalCam] = useState(null);

  useEffect(() => {
    const id = setInterval(() => setTick((t) => t + 1), 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const saved = localStorage.getItem('previa_selected_camera');
    if (saved && cameras.some((c) => String(c.id) === String(saved))) {
      if (String(selectedCam) !== String(saved)) setSelectedCam(saved);
    } else if ((!selectedCam || !cameras.some((c) => String(c.id) === String(selectedCam))) && cameras.length > 0) {
      setSelectedCam(cameras[0].id);
      localStorage.setItem('previa_selected_camera', cameras[0].id);
    }
  }, [cameras, selectedCam]);

  if (cameras.length === 0) {
    return (
      <div className="content-body" style={{ maxWidth: '1400px', margin: '0 auto' }}>
        <div className="welcome-header">
          <div>
            <h1 className="welcome-heading">Supervision des <span>Caméras</span></h1>
            <p className="welcome-sub">Visionnage en direct et état des caméras</p>
          </div>
        </div>
        <div
          style={{
            background: '#ffffff',
            border: '1px dashed var(--border-light)',
            borderRadius: '20px',
            padding: '48px 24px',
            textAlign: 'center',
            marginTop: '20px',
          }}
        >
          <Cctv size={40} color="#94a3b8" style={{ margin: '0 auto 12px' }} />
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
            Aucune caméra enregistrée
          </h3>
          <p style={{ fontSize: '0.88rem', color: 'var(--ink-muted)', marginTop: '6px' }}>
            Configurez une caméra dans l'onglet <strong>Organisation</strong> pour commencer la surveillance.
          </p>
        </div>
      </div>
    );
  }

  const camerasEtat = cameras.map((c) => {
    const age = c.misAJourLe ? Date.now() / 1000 - c.misAJourLe : null;
    const isOff = c.urlFlux ? false : (age == null || age > 15);
    const persSurCam = personnes.filter((p) => String(p.camCtx?.id_camera || '') === String(c.id));
    const persCount = persSurCam.length > 0 ? persSurCam.length : (c.nombrePersonnes ?? 0);
    const alertesDeCetteCam = alertes.filter((a) => String(a.id_camera || '') === String(c.id));
    return {
      id: c.id,
      name: c.name || `Caméra #${c.id}`,
      fullName: `${c.name} · ${c.location || 'Site principal'}`,
      location: c.location || 'Zone principale',
      image: c.urlFlux ? c.image : `${c.image}?t=${tick}`,
      urlFlux: c.urlFlux,
      status: isOff ? 'Hors-ligne' : 'En ligne',
      isOffline: isOff,
      frameAge: c.urlFlux ? 'En direct' : (age == null ? 'Aucune image' : `${ilYA(c.misAJourLe)}`),
      persons: persCount,
      behavior: persCount > 0 ? `${persCount} personne(s) visible(s)` : 'Surveillance normale',
      alertes: alertesDeCetteCam,
      hasAlert: alertesDeCetteCam.length > 0,
    };
  });

  const currentCamera = camerasEtat.find((c) => String(c.id) === String(selectedCam)) || camerasEtat[0];
  const isOffline = currentCamera.isOffline;
  const streamDirectCourant = useFluxDirect(currentCamera.urlFlux ? null : currentCamera.id);
  const detectionsSurCetteCam = personnes.filter((p) => String(p.camCtx?.id_camera || '') === String(currentCamera.id));
  const derniereAlerteCetteCam = currentCamera.alertes[0];

  const handleSync = () => {
    setIsSyncing(true);
    Promise.resolve(onRefresh && onRefresh()).finally(() => {
      setTimeout(() => setIsSyncing(false), 500);
    });
  };

  const handleSelectCamera = (camId) => {
    setSelectedCam(camId);
    localStorage.setItem('previa_selected_camera', camId);
  };

  const handleDeleteAlerte = async (id, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    try {
      await supprimerAlerte(id);
      if (onRefresh) onRefresh();
    } catch (err) {
      console.error('Erreur suppression alerte:', err);
    }
  };

  const handleDownloadSnapshot = () => {
    const link = document.createElement('a');
    link.href = currentCamera.image;
    link.download = `previa_snapshot_${currentCamera.id}_${Date.now()}.jpg`;
    link.target = '_blank';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="content-body" style={{ maxWidth: '1440px', margin: '0 auto', paddingBottom: '60px' }}>
      {/* EN-TÊTE ÉPURÉ & SÉLECTEUR DE MODE DE VUE */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          marginBottom: '20px',
        }}
      >
        <div>
          <h1 className="welcome-heading" style={{ fontSize: '1.75rem', fontWeight: 800, margin: 0 }}>
            Supervision des <span>Caméras</span>
          </h1>
          <p className="welcome-sub" style={{ fontSize: '0.9rem', color: 'var(--ink-muted)', marginTop: '4px' }}>
            Flux vidéo temps réel, cadrage IA et délimitation de zones
          </p>
        </div>

        {/* COMMUTATEUR DE MODE DE VUE (SEGMENTED PILL) */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            backgroundColor: '#ffffff',
            padding: '4px',
            borderRadius: '14px',
            border: '1px solid var(--border-light)',
            boxShadow: '0 2px 8px rgba(0,0,0,0.03)',
          }}
        >
          <button
            type="button"
            onClick={() => setSubTab('hero')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: subTab === 'hero' ? '#0284c7' : 'transparent',
              color: subTab === 'hero' ? '#ffffff' : 'var(--ink-secondary)',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Camera size={15} />
            <span>Focus Caméra</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('mosaic')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: subTab === 'mosaic' ? '#0284c7' : 'transparent',
              color: subTab === 'mosaic' ? '#ffffff' : 'var(--ink-secondary)',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <LayoutGrid size={15} />
            <span>Mosaïque Multi-Vues ({camerasEtat.length})</span>
          </button>

          <button
            type="button"
            onClick={() => setSubTab('zones')}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '6px',
              padding: '7px 14px',
              borderRadius: '10px',
              border: 'none',
              backgroundColor: subTab === 'zones' ? '#0284c7' : 'transparent',
              color: subTab === 'zones' ? '#ffffff' : 'var(--ink-secondary)',
              fontSize: '0.84rem',
              fontWeight: 700,
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <Shield size={15} />
            <span>Zones de Sécurité</span>
          </button>
        </div>
      </div>

      {/* ==================================================================== */}
      {/* 1. VUE FOCUS / DIRECT ÉPURÉE (HERO) */}
      {/* ==================================================================== */}
      {subTab === 'hero' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* BANDEAU SÉLECTEUR RAPIDE DE CAMÉRAS */}
          <div
            style={{
              display: 'flex',
              gap: '10px',
              overflowX: 'auto',
              paddingBottom: '4px',
              scrollbarWidth: 'none',
            }}
          >
            {camerasEtat.map((cam) => {
              const isSelected = String(selectedCam) === String(cam.id);
              return (
                <button
                  key={cam.id}
                  type="button"
                  onClick={() => handleSelectCamera(cam.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    padding: '8px 14px',
                    borderRadius: '12px',
                    border: isSelected ? '2px solid #0284c7' : '1px solid var(--border-light)',
                    backgroundColor: isSelected ? '#f0f9ff' : '#ffffff',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                    boxShadow: isSelected ? '0 4px 12px rgba(2,132,199,0.15)' : 'none',
                    flexShrink: 0,
                    textAlign: 'left',
                  }}
                >
                  <div style={{ position: 'relative' }}>
                    <div
                      style={{
                        width: '32px',
                        height: '32px',
                        borderRadius: '8px',
                        backgroundColor: isSelected ? '#0284c7' : '#f1f5f9',
                        color: isSelected ? '#ffffff' : '#64748b',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      <Cctv size={18} />
                    </div>
                    {cam.hasAlert && (
                      <span
                        style={{
                          position: 'absolute',
                          top: -2,
                          right: -2,
                          width: '10px',
                          height: '10px',
                          borderRadius: '50%',
                          backgroundColor: '#ef4444',
                          boxShadow: '0 0 6px #ef4444',
                        }}
                      />
                    )}
                  </div>

                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: isSelected ? '#0369a1' : 'var(--ink-primary)' }}>
                      {cam.name}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: isSelected ? '#0284c7' : 'var(--ink-muted)' }}>
                      {cam.location} {cam.persons > 0 && `· 👤 ${cam.persons}`}
                    </div>
                  </div>

                  <span
                    style={{
                      fontSize: '0.68rem',
                      fontWeight: 800,
                      padding: '2px 6px',
                      borderRadius: '4px',
                      marginLeft: '4px',
                      backgroundColor: cam.isOffline ? '#fee2e2' : '#dcfce7',
                      color: cam.isOffline ? '#dc2626' : '#16a34a',
                    }}
                  >
                    {cam.isOffline ? 'OFF' : 'LIVE'}
                  </span>
                </button>
              );
            })}
          </div>

          {/* LECTEUR VIDÉO HERO */}
          <div
            style={{
              backgroundColor: '#ffffff',
              borderRadius: '20px',
              padding: '16px',
              border: '1px solid var(--border-subtle)',
              boxShadow: 'var(--shadow-card)',
            }}
          >
            <div
              style={{
                position: 'relative',
                borderRadius: '14px',
                overflow: 'hidden',
                backgroundColor: '#05070d',
                aspectRatio: '16/9',
                maxHeight: '68vh',
                boxShadow: 'inset 0 0 0 1px rgba(255,255,255,0.08)',
              }}
            >
              <FluxCamera
                stream={streamDirectCourant}
                imageRepli={currentCamera.image}
                alt={currentCamera.name}
                detections={detectionsSurCetteCam}
                style={{
                  width: '100%',
                  height: '100%',
                  objectFit: 'cover',
                  filter: isOffline ? 'grayscale(100%) opacity(0.4)' : 'none',
                }}
              />

              {/* OVERLAY HORS-LIGNE SI LE FLUX EST COUPÉ */}
              {isOffline && (
                <div
                  style={{
                    position: 'absolute',
                    inset: 0,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#ffffff',
                    backgroundColor: 'rgba(15, 23, 42, 0.7)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 10,
                  }}
                >
                  <div
                    style={{
                      width: '56px',
                      height: '56px',
                      borderRadius: '50%',
                      backgroundColor: 'rgba(239, 68, 68, 0.2)',
                      border: '2px solid #ef4444',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      color: '#ef4444',
                      marginBottom: '12px',
                    }}
                  >
                    <AlertTriangle size={28} />
                  </div>
                  <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 800 }}>Signal Caméra Interrompu</h4>
                  <p style={{ margin: '4px 0 0', fontSize: '0.85rem', color: '#cbd5e1' }}>
                    Aucune trame reçue depuis plus de 15 secondes.
                  </p>
                </div>
              )}

              {/* HUD FLOTTANT SUPÉRIEUR */}
              <div
                style={{
                  position: 'absolute',
                  top: 14,
                  left: 14,
                  right: 14,
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  zIndex: 20,
                  pointerEvents: 'none',
                }}
              >
                {/* STATUT FLUX GAUCHE */}
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    color: '#ffffff',
                    padding: '6px 14px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: '0.78rem',
                    fontWeight: 700,
                  }}
                >
                  <span
                    style={{
                      width: '8px',
                      height: '8px',
                      borderRadius: '50%',
                      backgroundColor: isOffline ? '#ef4444' : '#22c55e',
                      boxShadow: isOffline ? '0 0 8px #ef4444' : '0 0 8px #22c55e',
                    }}
                  />
                  <span>{isOffline ? 'HORS-LIGNE' : 'EN DIRECT'}</span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span style={{ color: '#38bdf8' }}>{currentCamera.name}</span>
                  <span style={{ opacity: 0.7, fontSize: '0.72rem' }}>({currentCamera.location})</span>
                </div>

                {/* LÉGENDE & COMPTEUR DROITE */}
                <div
                  style={{
                    backgroundColor: 'rgba(15, 23, 42, 0.8)',
                    backdropFilter: 'blur(8px)',
                    color: '#ffffff',
                    padding: '6px 12px',
                    borderRadius: '10px',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    border: '1px solid rgba(255,255,255,0.12)',
                    fontSize: '0.74rem',
                    fontWeight: 700,
                  }}
                >
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#4ade80' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#22c55e' }} />
                    Autorisé
                  </span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#f87171' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#ef4444' }} />
                    Suspect
                  </span>
                  <span style={{ opacity: 0.4 }}>|</span>
                  <span style={{ color: '#bae6fd' }}>
                    👤 {detectionsSurCetteCam.length} vue{detectionsSurCetteCam.length > 1 ? 's' : ''}
                  </span>
                </div>
              </div>
            </div>

            {/* BANDEAU D'ALERTE EN DIRECT (UNIQUEMENT SI INCIDENT PRÉSENT SUR CETTE CAMÉRA) */}
            {derniereAlerteCetteCam && (
              <div
                style={{
                  marginTop: '12px',
                  backgroundColor: '#fef2f2',
                  border: '1.5px solid #fecaca',
                  borderRadius: '12px',
                  padding: '10px 16px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '12px',
                  animation: 'previaFadeIn 0.2s ease-out',
                }}
              >
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: '10px', cursor: 'pointer', flex: 1 }}
                  onClick={() => setAlerteInspectee(derniereAlerteCetteCam)}
                >
                  <div
                    style={{
                      width: '32px',
                      height: '32px',
                      borderRadius: '8px',
                      backgroundColor: '#fee2e2',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '14px',
                    }}
                  >
                    🚨
                  </div>
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#991b1b' }}>
                      Incident détecté : {derniereAlerteCetteCam.type_evenement || 'Alerte sécurité'}
                    </div>
                    <div style={{ fontSize: '0.78rem', color: '#b91c1c' }}>
                      {derniereAlerteCetteCam.description} · {derniereAlerteCetteCam.horodatage ? heureLocale(derniereAlerteCetteCam.horodatage) : "à l'instant"}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '8px' }}>
                  <button
                    type="button"
                    onClick={() => setAlerteInspectee(derniereAlerteCetteCam)}
                    style={{
                      backgroundColor: '#ffffff',
                      color: '#b91c1c',
                      border: '1px solid #fca5a5',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '4px',
                    }}
                  >
                    <Eye size={13} />
                    <span>Examiner</span>
                  </button>

                  <button
                    type="button"
                    onClick={(e) => handleDeleteAlerte(derniereAlerteCetteCam.id, e)}
                    style={{
                      backgroundColor: '#dc2626',
                      color: '#ffffff',
                      border: 'none',
                      padding: '6px 12px',
                      borderRadius: '8px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                    }}
                  >
                    Acquitter
                  </button>
                </div>
              </div>
            )}

            {/* BARRE D'ACTIONS INFÉRIEURE DU LECTEUR */}
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginTop: '14px',
                flexWrap: 'wrap',
                gap: '12px',
                padding: '4px 6px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.84rem', color: 'var(--ink-secondary)' }}>
                <span style={{ display: 'flex', alignItems: 'center', gap: '6px', fontWeight: 600 }}>
                  <Clock size={15} color="#0284c7" />
                  Flux : <strong>{currentCamera.frameAge}</strong>
                </span>
                <span style={{ opacity: 0.3 }}>|</span>
                <span style={{ fontWeight: 600 }}>
                  {currentCamera.behavior}
                </span>
              </div>

              <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                <button
                  type="button"
                  onClick={handleDownloadSnapshot}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid var(--border-light)',
                    color: 'var(--ink-secondary)',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  title="Télécharger une capture instantanée"
                >
                  <Download size={14} />
                  <span>Snapshot</span>
                </button>

                <button
                  type="button"
                  onClick={() => setSubTab('zones')}
                  style={{
                    backgroundColor: '#f8fafc',
                    border: '1px solid var(--border-light)',
                    color: 'var(--ink-secondary)',
                    padding: '8px 14px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    transition: 'all 0.15s ease',
                  }}
                  title="Délimiter une zone non autorisée sur cette caméra"
                >
                  <Shield size={14} color="#0284c7" />
                  <span>Zone de Sécurité</span>
                </button>

                <button
                  type="button"
                  onClick={() => setFullscreenModalCam(currentCamera)}
                  style={{
                    backgroundColor: '#0284c7',
                    border: 'none',
                    color: '#ffffff',
                    padding: '8px 16px',
                    borderRadius: '10px',
                    fontSize: '0.82rem',
                    fontWeight: 700,
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    boxShadow: '0 2px 8px rgba(2,132,199,0.3)',
                    transition: 'all 0.15s ease',
                  }}
                  title="Afficher en plein écran avec contrôles"
                >
                  <Maximize2 size={14} />
                  <span>Plein Écran</span>
                </button>

                <button
                  type="button"
                  onClick={handleSync}
                  style={{
                    backgroundColor: '#f1f5f9',
                    border: '1px solid var(--border-light)',
                    color: 'var(--ink-secondary)',
                    padding: '8px 12px',
                    borderRadius: '10px',
                    cursor: 'pointer',
                  }}
                  title="Synchroniser le flux"
                >
                  <RefreshCw size={14} className={isSyncing ? 'animate-spin' : ''} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 2. VUE MOSAÏQUE MULTI-VUES */}
      {/* ==================================================================== */}
      {subTab === 'mosaic' && (
        <div>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(340px, 1fr))',
              gap: '18px',
            }}
          >
            {camerasEtat.map((cam) => {
              const streamDirectTuile = useFluxDirect(cam.urlFlux ? null : cam.id);
              const detectionsTuile = personnes.filter((p) => String(p.camCtx?.id_camera || '') === String(cam.id));

              return (
                <div
                  key={cam.id}
                  style={{
                    backgroundColor: '#ffffff',
                    borderRadius: '18px',
                    padding: '14px',
                    border: '1px solid var(--border-subtle)',
                    boxShadow: 'var(--shadow-card)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '10px',
                    transition: 'transform 0.15s ease',
                  }}
                >
                  <div
                    onClick={() => {
                      setSelectedCam(cam.id);
                      setSubTab('hero');
                    }}
                    style={{
                      position: 'relative',
                      borderRadius: '12px',
                      overflow: 'hidden',
                      backgroundColor: '#05070d',
                      aspectRatio: '16/9',
                      cursor: 'pointer',
                    }}
                    title="Cliquer pour passer en vue focus"
                  >
                    <FluxCamera
                      stream={streamDirectTuile}
                      imageRepli={cam.image}
                      alt={cam.name}
                      detections={detectionsTuile}
                      style={{
                        width: '100%',
                        height: '100%',
                        objectFit: 'cover',
                        filter: cam.isOffline ? 'grayscale(100%) opacity(0.5)' : 'none',
                      }}
                    />

                    {/* BADGE LIVE */}
                    <div
                      style={{
                        position: 'absolute',
                        top: 10,
                        left: 10,
                        backgroundColor: cam.isOffline ? '#ef4444' : '#0284c7',
                        color: '#ffffff',
                        fontSize: '0.68rem',
                        fontWeight: 800,
                        padding: '3px 8px',
                        borderRadius: '6px',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '5px',
                        zIndex: 10,
                      }}
                    >
                      {!cam.isOffline && <span className="live-dot-pulse" />}
                      <span>{cam.isOffline ? 'HORS-LIGNE' : 'LIVE'}</span>
                    </div>

                    {/* COMPTEUR DE PERSONNES */}
                    {detectionsTuile.length > 0 && (
                      <div
                        style={{
                          position: 'absolute',
                          top: 10,
                          right: 10,
                          backgroundColor: 'rgba(15, 23, 42, 0.8)',
                          color: '#bae6fd',
                          fontSize: '0.7rem',
                          fontWeight: 700,
                          padding: '3px 8px',
                          borderRadius: '6px',
                          zIndex: 10,
                        }}
                      >
                        👤 {detectionsTuile.length}
                      </div>
                    )}
                  </div>

                  {/* PIED DE CARTE */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
                        {cam.name}
                      </div>
                      <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)' }}>
                        {cam.location} · {cam.frameAge}
                      </div>
                    </div>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedCam(cam.id);
                          setSubTab('hero');
                        }}
                        style={{
                          backgroundColor: '#f0f9ff',
                          border: '1px solid #bae6fd',
                          color: '#0284c7',
                          padding: '5px 10px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                        }}
                      >
                        Focus
                      </button>

                      <button
                        type="button"
                        onClick={() => setFullscreenModalCam(cam)}
                        style={{
                          backgroundColor: '#f8fafc',
                          border: '1px solid var(--border-light)',
                          color: 'var(--ink-secondary)',
                          padding: '5px 8px',
                          borderRadius: '8px',
                          cursor: 'pointer',
                        }}
                        title="Plein écran"
                      >
                        <Maximize2 size={13} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ==================================================================== */}
      {/* 3. VUE ZONES DE SÉCURITÉ */}
      {/* ==================================================================== */}
      {subTab === 'zones' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <SectionZones cameras={cameras} initialCameraId={selectedCam} />
        </div>
      )}

      {/* MODALE PLEIN ÉCRAN */}
      {fullscreenModalCam && (
        <CameraViewModal
          camera={fullscreenModalCam}
          onClose={() => setFullscreenModalCam(null)}
          onSignalAlert={() => {
            if (onSelectTab) onSelectTab('alerts');
          }}
        />
      )}

      {/* MODAL HD PHOTO / VIDÉO DE L'INTRUSION */}
      {alerteInspectee && (
        <AlertMediaModal
          alerte={alerteInspectee}
          onClose={() => setAlerteInspectee(null)}
          onDelete={handleDeleteAlerte}
          onGoToCamera={handleSelectCamera}
        />
      )}
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
// `alertesReelles` : branché sur GET /alertes (voir Admin() plus bas)
// Gestion complète de l'historique : tri multi-critères, filtre par caméra / sévérité,
// pagination pour fluidifier les longues listes, suppression individuelle et purge complète.
function EventsView({ alertesReelles = [], cameras = [], onRefresh, onSelectTab }) {
  const [search, setSearch] = useState('');
  const [selectedFilter, setSelectedFilter] = useState('all'); // 'all' | 'critical' | 'suspect'
  const [selectedCamera, setSelectedCamera] = useState('all');
  const [sortBy, setSortBy] = useState('newest'); // 'newest' | 'oldest' | 'severity' | 'camera'
  const [modeAffichage, setModeAffichage] = useState('timeline'); // 'timeline' | 'table'
  const [evenementSelectionne, setEvenementSelectionne] = useState(null);
  const [supprimesLocaux, setSupprimesLocaux] = useState(new Set());
  const [enSuppression, setEnSuppression] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Liste des options de caméras pour le filtre
  const cameraOptions = useMemo(() => {
    const map = new Map();
    cameras.forEach((c) => {
      const nom = [c.batiment, c.piece].filter(Boolean).join(' / ') || c.nom || 'Caméra';
      map.set(String(c.id), `Cam #${c.num || c.id} — ${nom}`);
    });
    alertesReelles.forEach((a) => {
      if (a.id_camera && !map.has(String(a.id_camera))) {
        const nom = [a.batiment, a.piece].filter(Boolean).join(' / ') || 'Zone Principale';
        map.set(String(a.id_camera), `Cam #${a.num || a.id_camera} — ${nom}`);
      }
    });
    return Array.from(map.entries()).map(([id, label]) => ({ id, label }));
  }, [cameras, alertesReelles]);

  const sourceAlertes = alertesReelles.length > 0 ? alertesReelles : [
    {
      id: 'alt-demo-01',
      type_evenement: 'intrusion_zone',
      description: 'Intrusion détectée en zone sécurisée hors horaires autorisés (Cour Arrière).',
      horodatage: Math.floor(Date.now() / 1000) - 120,
      num: 'Caméra 01',
      id_camera: 'cam-01',
      batiment: 'Bâtiment Principal',
      piece: 'Zone Restreinte',
    },
    {
      id: 'alt-demo-02',
      type_evenement: 'rodeur',
      description: 'Comportement suspect prolongé devant la baie vitrée du rez-de-chaussée.',
      horodatage: Math.floor(Date.now() / 1000) - 900,
      num: 'Caméra 02',
      id_camera: 'cam-02',
      batiment: 'Bâtiment A',
      piece: 'Entrée Sud',
    },
    {
      id: 'alt-demo-03',
      type_evenement: 'infiltration',
      description: 'Tentative de franchissement non autorisé détectée sur le périmètre.',
      horodatage: Math.floor(Date.now() / 1000) - 3600,
      num: 'Caméra 03',
      id_camera: 'cam-03',
      batiment: 'Entrepôt',
      piece: 'Porte Quai',
    },
  ];

  const events = useMemo(() => {
    return sourceAlertes
      .filter((a) => !supprimesLocaux.has(a.id))
      .map((a) => {
        const critique = ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(a.type_evenement);
        return {
          id: a.id,
          horodatage: a.horodatage || 0,
          time: heureLocale(a.horodatage),
          date: new Date(a.horodatage ? a.horodatage * 1000 : Date.now()).toLocaleDateString('fr-FR', { day: '2-digit', month: 'short', year: 'numeric' }),
          type: LABEL_TYPE_EVENEMENTS[a.type_evenement] || a.type_evenement,
          rawType: a.type_evenement,
          cam: `${a.num || a.id_camera} · ${[a.batiment, a.piece].filter(Boolean).join(' / ') || 'Zone Principale'}`,
          camId: String(a.id_camera || ''),
          desc: a.description || '',
          level: critique ? 'Critique' : 'Suspect',
          critique,
          validated: true,
          imageUrl: urlImageAlerte(a.id),
        };
      });
  }, [sourceAlertes, supprimesLocaux]);

  // Filtrage et Tri
  const filteredAndSorted = useMemo(() => {
    const list = events.filter((e) => {
      const matchesSearch =
        e.desc.toLowerCase().includes(search.toLowerCase()) ||
        e.cam.toLowerCase().includes(search.toLowerCase()) ||
        e.type.toLowerCase().includes(search.toLowerCase());
      if (!matchesSearch) return false;

      if (selectedFilter === 'critical' && !e.critique) return false;
      if (selectedFilter === 'suspect' && e.critique) return false;

      if (selectedCamera !== 'all' && e.camId !== selectedCamera) return false;

      return true;
    });

    list.sort((a, b) => {
      if (sortBy === 'newest') return (b.horodatage || 0) - (a.horodatage || 0);
      if (sortBy === 'oldest') return (a.horodatage || 0) - (b.horodatage || 0);
      if (sortBy === 'severity') {
        if (a.critique === b.critique) return (b.horodatage || 0) - (a.horodatage || 0);
        return a.critique ? -1 : 1;
      }
      if (sortBy === 'camera') return a.cam.localeCompare(b.cam);
      return 0;
    });

    return list;
  }, [events, search, selectedFilter, selectedCamera, sortBy]);

  // Réinitialiser la pagination lors d'un changement de filtre / tri
  useEffect(() => {
    setCurrentPage(1);
  }, [search, selectedFilter, selectedCamera, sortBy, itemsPerPage]);

  const totalCritiques = events.filter((e) => e.critique).length;
  const totalSuspects = events.filter((e) => !e.critique).length;

  const totalPages = Math.max(1, Math.ceil(filteredAndSorted.length / itemsPerPage));
  const safeCurrentPage = Math.min(currentPage, totalPages);
  const paginatedEvents = filteredAndSorted.slice(
    (safeCurrentPage - 1) * itemsPerPage,
    safeCurrentPage * itemsPerPage
  );

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: 'Annuler',
    dangerLevel: 'danger',
    itemDetails: null,
    onConfirm: null,
  });

  const handleDelete = (target, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const eventObj = typeof target === 'object' && target !== null ? target : events.find((ev) => ev.id === target);
    const targetId = eventObj ? eventObj.id : target;

    setConfirmModal({
      isOpen: true,
      title: "Supprimer cet événement",
      message: "Voulez-vous vraiment supprimer cet événement de l'historique ?",
      confirmText: "Supprimer l'incident",
      cancelText: "Annuler",
      dangerLevel: "danger",
      itemDetails: eventObj ? {
        type: eventObj.type,
        cam: eventObj.cam,
        time: `${eventObj.date} à ${eventObj.time}`,
        desc: eventObj.desc,
      } : null,
      onConfirm: async () => {
        try {
          setEnSuppression(true);
          setSupprimesLocaux((prev) => new Set([...prev, targetId]));
          if (evenementSelectionne?.id === targetId) setEvenementSelectionne(null);
          await supprimerAlerte(targetId);
          showToast("Événement supprimé de l'historique.");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (onRefresh) onRefresh();
        } catch (err) {
          console.error("Erreur suppression alerte:", err);
          showToast("Erreur lors de la suppression de l'événement.");
        } finally {
          setEnSuppression(false);
        }
      },
    });
  };

  const handleClearAll = () => {
    if (events.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: "Effacer tout l'historique",
      message: `Êtes-vous sûr de vouloir supprimer définitivement la totalité de l'historique (${events.length} incidents enregistrés) ? Cette action est irréversible.`,
      confirmText: `Effacer tout l'historique (${events.length})`,
      cancelText: "Annuler",
      dangerLevel: "danger",
      itemDetails: null,
      onConfirm: async () => {
        try {
          setEnSuppression(true);
          const allIds = events.map((ev) => ev.id);
          setSupprimesLocaux((prev) => new Set([...prev, ...allIds]));
          setEvenementSelectionne(null);
          await supprimerToutesAlertes();
          showToast("Tout l'historique a été effacé avec succès.");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (onRefresh) onRefresh();
        } catch (err) {
          console.error("Erreur suppression totale:", err);
          showToast("Erreur lors de la purge de l'historique.");
        } finally {
          setEnSuppression(false);
        }
      },
    });
  };

  return (
    <div className="content-body" style={{ position: 'relative' }}>
      {/* TOAST DE CONFIRMATION */}
      {toastMessage && (
        <div
          style={{
            position: 'fixed',
            top: 24,
            right: 24,
            zIndex: 999999,
            background: '#0f172a',
            color: '#ffffff',
            padding: '12px 20px',
            borderRadius: '12px',
            boxShadow: '0 10px 30px rgba(0,0,0,0.25)',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.88rem',
            fontWeight: 600,
            border: '1px solid rgba(255,255,255,0.1)',
            animation: 'fadeIn 0.2s ease',
          }}
        >
          <CheckCircle2 size={18} color="#22c55e" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* HEADER AVEC STATS ET BOUTON PURGE */}
      <div className="welcome-header" style={{ marginBottom: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '14px' }}>
        <div>
          <h1 className="welcome-heading">Journal & <span>Historique des Incidents</span></h1>
          <p className="welcome-sub">Historique visuel et enregistrements chronologiques de tous les événements de sécurité.</p>
        </div>

        {events.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            disabled={enSuppression}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: '#fee2e2',
              color: '#b91c1c',
              border: '1.5px solid #fca5a5',
              padding: '10px 18px',
              borderRadius: '10px',
              fontSize: '0.84rem',
              fontWeight: 800,
              cursor: enSuppression ? 'not-allowed' : 'pointer',
              boxShadow: '0 2px 8px rgba(239, 68, 68, 0.15)',
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#fecaca'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
          >
            <Trash2 size={16} />
            <span>Effacer tout l'historique ({events.length})</span>
          </button>
        )}
      </div>

      {/* KPI STATS SUMMARY */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '14px', marginBottom: '20px' }}>
        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#f0f9ff', color: '#0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
            {events.length}
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: 'var(--ink-muted)', fontWeight: 600 }}>TOTAL ÉVÉNEMENTS</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: 'var(--ink-primary)' }}>{events.length} enregistrés</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#fef2f2', color: '#ef4444', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
            {totalCritiques}
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#ef4444', fontWeight: 600 }}>INCIDENTS CRITIQUES</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#b91c1c' }}>{totalCritiques} urgences</div>
          </div>
        </div>

        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '16px', border: '1px solid var(--border-subtle)', boxShadow: '0 2px 8px rgba(0,0,0,0.02)', display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{ width: 42, height: 42, borderRadius: '10px', background: '#fffbeb', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 800 }}>
            {totalSuspects}
          </div>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#d97706', fontWeight: 600 }}>COMPORTEMENTS SUSPECTS</span>
            <div style={{ fontSize: '1.1rem', fontWeight: 800, color: '#92400e' }}>{totalSuspects} observations</div>
          </div>
        </div>
      </div>

      {/* TOOLBAR AVANCÉE : FILTRES, TRI, CAMÉRAS, RECHERCHE, VUE */}
      <div
        style={{
          background: '#ffffff',
          borderRadius: '16px',
          padding: '14px 18px',
          border: '1px solid var(--border-subtle)',
          boxShadow: '0 2px 8px rgba(0,0,0,0.02)',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px',
          marginBottom: '20px',
        }}
      >
        {/* LIGNE 1 : FILTRES GRAVITÉ & RECHERCHE */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
          {/* FILTER CHIPS */}
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <button
              onClick={() => setSelectedFilter('all')}
              style={{
                background: selectedFilter === 'all' ? '#0284c7' : '#f8fafc',
                color: selectedFilter === 'all' ? '#ffffff' : 'var(--ink-secondary)',
                border: '1px solid ' + (selectedFilter === 'all' ? '#0284c7' : 'var(--border-light)'),
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: selectedFilter === 'all' ? '0 2px 8px rgba(2,132,199,0.3)' : 'none',
              }}
            >
              Tous ({events.length})
            </button>
            <button
              onClick={() => setSelectedFilter('critical')}
              style={{
                background: selectedFilter === 'critical' ? '#ef4444' : '#f8fafc',
                color: selectedFilter === 'critical' ? '#ffffff' : 'var(--ink-secondary)',
                border: '1px solid ' + (selectedFilter === 'critical' ? '#ef4444' : 'var(--border-light)'),
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: selectedFilter === 'critical' ? '0 2px 8px rgba(239,68,68,0.3)' : 'none',
              }}
            >
              🚨 Critiques ({totalCritiques})
            </button>
            <button
              onClick={() => setSelectedFilter('suspect')}
              style={{
                background: selectedFilter === 'suspect' ? '#d97706' : '#f8fafc',
                color: selectedFilter === 'suspect' ? '#ffffff' : 'var(--ink-secondary)',
                border: '1px solid ' + (selectedFilter === 'suspect' ? '#d97706' : 'var(--border-light)'),
                padding: '7px 14px',
                borderRadius: '10px',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                boxShadow: selectedFilter === 'suspect' ? '0 2px 8px rgba(217,119,6,0.3)' : 'none',
              }}
            >
              ⚠️ Suspects ({totalSuspects})
            </button>
          </div>

          {/* RECHERCHE & BASCULE VUE */}
          <div style={{ display: 'flex', gap: '10px', alignItems: 'center', flexWrap: 'wrap' }}>
            <div style={{ position: 'relative', width: '240px', maxWidth: '100%' }}>
              <Search size={15} style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--ink-muted)' }} />
              <input
                type="text"
                placeholder="Rechercher caméra, zone..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                style={{
                  width: '100%',
                  padding: '7px 12px 7px 34px',
                  borderRadius: '10px',
                  border: '1px solid var(--border-light)',
                  background: '#f8fafc',
                  fontSize: '0.82rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', background: '#f1f5f9', padding: '3px', borderRadius: '10px', border: '1px solid var(--border-light)' }}>
              <button
                onClick={() => setModeAffichage('timeline')}
                style={{
                  background: modeAffichage === 'timeline' ? '#ffffff' : 'transparent',
                  color: modeAffichage === 'timeline' ? '#0284c7' : 'var(--ink-muted)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: modeAffichage === 'timeline' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Chronologie
              </button>
              <button
                onClick={() => setModeAffichage('table')}
                style={{
                  background: modeAffichage === 'table' ? '#ffffff' : 'transparent',
                  color: modeAffichage === 'table' ? '#0284c7' : 'var(--ink-muted)',
                  border: 'none',
                  padding: '6px 12px',
                  borderRadius: '8px',
                  fontSize: '0.78rem',
                  fontWeight: 700,
                  cursor: 'pointer',
                  boxShadow: modeAffichage === 'table' ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                }}
              >
                Tableau
              </button>
            </div>
          </div>
        </div>

        {/* LIGNE 2 : SÉLECTEUR DE CAMÉRA, TRI ET ITEMS PAR PAGE */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px', paddingTop: '8px', borderTop: '1px solid #f1f5f9', fontSize: '0.82rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            {/* FILTRE PAR CAMÉRA */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <Cctv size={15} color="#0284c7" />
              <span style={{ fontWeight: 600, color: 'var(--ink-muted)' }}>Caméra :</span>
              <select
                value={selectedCamera}
                onChange={(e) => setSelectedCamera(e.target.value)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--ink-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="all">Toutes les caméras ({events.length})</option>
                {cameraOptions.map((opt) => (
                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                ))}
              </select>
            </div>

            {/* TRI */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <ArrowUpDown size={15} color="#0284c7" />
              <span style={{ fontWeight: 600, color: 'var(--ink-muted)' }}>Trier par :</span>
              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                style={{
                  background: '#f8fafc',
                  border: '1px solid var(--border-light)',
                  borderRadius: '8px',
                  padding: '5px 10px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  color: 'var(--ink-primary)',
                  cursor: 'pointer',
                  outline: 'none',
                }}
              >
                <option value="newest">Plus récent d'abord (Chronologique inverse)</option>
                <option value="oldest">Plus ancien d'abord</option>
                <option value="severity">Criticité d'abord (🚨 Urgences en tête)</option>
                <option value="camera">Par caméra (A-Z)</option>
              </select>
            </div>
          </div>

          {/* SÉLECTEUR DE TAILLE DE PAGE */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span style={{ color: 'var(--ink-muted)', fontSize: '0.78rem' }}>Afficher :</span>
            <select
              value={itemsPerPage}
              onChange={(e) => setItemsPerPage(Number(e.target.value))}
              style={{
                background: '#f8fafc',
                border: '1px solid var(--border-light)',
                borderRadius: '8px',
                padding: '4px 8px',
                fontSize: '0.78rem',
                fontWeight: 600,
                color: 'var(--ink-primary)',
                cursor: 'pointer',
                outline: 'none',
              }}
            >
              <option value={10}>10 par page</option>
              <option value={25}>25 par page</option>
              <option value={50}>50 par page</option>
              <option value={100}>100 par page</option>
            </select>
          </div>
        </div>
      </div>

      {/* VUE TIMELINE INTERACTIVE AVEC SNAPSHOTS PHOTOS */}
      {modeAffichage === 'timeline' ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {paginatedEvents.length === 0 ? (
            <div style={{ background: '#ffffff', borderRadius: '16px', padding: '40px', textAlign: 'center', border: '1px solid var(--border-subtle)', color: 'var(--ink-muted)' }}>
              Aucun événement ne correspond à vos critères de recherche ou de filtre.
            </div>
          ) : (
            <div style={{ position: 'relative', paddingLeft: '28px' }}>
              {/* LIGNE VERTICALE DE LA TIMELINE */}
              <div
                style={{
                  position: 'absolute',
                  left: '10px',
                  top: '12px',
                  bottom: '12px',
                  width: '3px',
                  background: 'linear-gradient(180deg, #0284c7 0%, #cbd5e1 100%)',
                  borderRadius: '2px',
                }}
              />

              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {paginatedEvents.map((ev) => {
                  const isCrit = ev.critique;
                  return (
                    <div
                      key={ev.id}
                      style={{
                        position: 'relative',
                        background: '#ffffff',
                        borderRadius: '16px',
                        padding: '16px 20px',
                        border: isCrit ? '1.5px solid #fecaca' : '1px solid var(--border-subtle)',
                        boxShadow: isCrit ? '0 4px 18px rgba(239, 68, 68, 0.08)' : '0 2px 8px rgba(0,0,0,0.03)',
                        display: 'grid',
                        gridTemplateColumns: '140px 1fr auto',
                        gap: '18px',
                        alignItems: 'center',
                        transition: 'transform 0.15s ease, box-shadow 0.15s ease',
                        cursor: 'pointer',
                      }}
                      onClick={() => setEvenementSelectionne(ev)}
                    >
                      {/* POINT SUR LA LIGNE TIMELINE */}
                      <div
                        style={{
                          position: 'absolute',
                          left: '-23px',
                          top: '24px',
                          width: '14px',
                          height: '14px',
                          borderRadius: '50%',
                          background: isCrit ? '#ef4444' : '#0284c7',
                          border: '3px solid #ffffff',
                          boxShadow: isCrit ? '0 0 10px rgba(239, 68, 68, 0.8)' : '0 0 8px rgba(2, 132, 199, 0.5)',
                        }}
                      />

                      {/* MINIATURE SNAPSHOT PHOTO */}
                      <div
                        style={{
                          width: '130px',
                          height: '84px',
                          borderRadius: '10px',
                          overflow: 'hidden',
                          background: '#0f172a',
                          position: 'relative',
                          border: '1px solid #e2e8f0',
                        }}
                      >
                        <img
                          src={ev.imageUrl}
                          alt={ev.type}
                          onError={(e) => {
                            e.target.style.display = 'none';
                            if (e.target.nextSibling) e.target.nextSibling.style.display = 'flex';
                          }}
                          style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                        />
                        <div
                          style={{
                            display: 'none',
                            width: '100%',
                            height: '100%',
                            alignItems: 'center',
                            justifyContent: 'center',
                            background: '#1e293b',
                            color: '#94a3b8',
                            fontSize: '0.72rem',
                            textAlign: 'center',
                            padding: '4px',
                          }}
                        >
                          <Camera size={18} style={{ marginBottom: 2 }} />
                          <span>Snapshot</span>
                        </div>
                        <div
                          style={{
                            position: 'absolute',
                            bottom: 4,
                            right: 4,
                            background: 'rgba(0,0,0,0.7)',
                            color: '#fff',
                            fontSize: '0.65rem',
                            padding: '1px 4px',
                            borderRadius: '4px',
                            fontWeight: 700,
                          }}
                        >
                          {ev.time}
                        </div>
                      </div>

                      {/* CONTENU DE L'ÉVÉNEMENT */}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                          <span
                            style={{
                              background: isCrit ? '#fee2e2' : '#fef3c7',
                              color: isCrit ? '#dc2626' : '#d97706',
                              padding: '2px 8px',
                              borderRadius: '6px',
                              fontSize: '0.72rem',
                              fontWeight: 800,
                              textTransform: 'uppercase',
                            }}
                          >
                            {isCrit ? '🚨 Danger Immédiat' : '⚠️ Signal Précurseur'}
                          </span>
                          <span style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
                            {ev.date} · {ev.time}
                          </span>
                        </div>

                        <h4 style={{ margin: '2px 0 0 0', fontSize: '0.98rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
                          {ev.type}
                        </h4>

                        <p style={{ margin: 0, fontSize: '0.84rem', color: 'var(--ink-secondary)', lineHeight: 1.3 }}>
                          {ev.desc}
                        </p>

                        <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', display: 'flex', alignItems: 'center', gap: '6px', marginTop: '2px' }}>
                          <Cctv size={14} color="#0284c7" />
                          <span>{ev.cam}</span>
                        </div>
                      </div>

                      {/* ACTIONS & DÉTAILS */}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '8px' }}>
                        <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
                          <button
                            type="button"
                            onClick={(e) => handleDelete(ev.id, e)}
                            title="Supprimer cet incident"
                            style={{
                              background: '#ffffff',
                              border: '1px solid #fecaca',
                              color: '#dc2626',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                              transition: 'all 0.15s ease',
                            }}
                            onMouseEnter={(e) => { e.currentTarget.style.background = '#fee2e2'; }}
                            onMouseLeave={(e) => { e.currentTarget.style.background = '#ffffff'; }}
                          >
                            <Trash2 size={13} />
                          </button>

                          <button
                            type="button"
                            style={{
                              background: '#f8fafc',
                              border: '1px solid var(--border-light)',
                              color: 'var(--ink-secondary)',
                              padding: '6px 12px',
                              borderRadius: '8px',
                              fontSize: '0.78rem',
                              fontWeight: 600,
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              cursor: 'pointer',
                            }}
                          >
                            <span>Examiner</span>
                            <ArrowRight size={13} />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* TABLEAU CLASSIQUE */
        <div style={{ background: '#ffffff', borderRadius: '18px', padding: '20px', border: '1px solid var(--border-subtle)', boxShadow: 'var(--shadow-card)', overflowX: 'auto' }}>
          {paginatedEvents.length === 0 ? (
            <div style={{ padding: '30px', textAlign: 'center', color: 'var(--ink-muted)' }}>
              Aucun événement ne correspond à vos critères de recherche ou de filtre.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
              <thead>
                <tr style={{ borderBottom: '2px solid var(--border-light)', color: 'var(--ink-muted)', fontSize: '0.78rem', textTransform: 'uppercase' }}>
                  <th style={{ padding: '12px 16px' }}>Horodatage</th>
                  <th style={{ padding: '12px 16px' }}>Signal / Incident</th>
                  <th style={{ padding: '12px 16px' }}>Caméra / Zone</th>
                  <th style={{ padding: '12px 16px' }}>Analyse & Contexte</th>
                  <th style={{ padding: '12px 16px' }}>Niveau</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {paginatedEvents.map((ev) => {
                  const isCrit = ev.critique;
                  return (
                    <tr key={ev.id} style={{ borderBottom: '1px solid var(--border-light)', cursor: 'pointer' }} onClick={() => setEvenementSelectionne(ev)}>
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
                        <span style={{ background: isCrit ? '#fee2e2' : '#fef3c7', color: isCrit ? '#ef4444' : '#d97706', padding: '3px 8px', borderRadius: '6px', fontSize: '0.75rem', fontWeight: 700 }}>
                          {ev.level}
                        </span>
                      </td>
                      <td style={{ padding: '14px 16px', textAlign: 'right' }}>
                        <button
                          type="button"
                          onClick={(e) => handleDelete(ev.id, e)}
                          title="Supprimer cet incident"
                          style={{
                            background: '#fef2f2',
                            border: '1px solid #fecaca',
                            color: '#dc2626',
                            padding: '6px 10px',
                            borderRadius: '8px',
                            cursor: 'pointer',
                          }}
                        >
                          <Trash2 size={14} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* BARRE DE PAGINATION */}
      {filteredAndSorted.length > 0 && (
        <div
          style={{
            marginTop: '20px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: '12px',
            background: '#ffffff',
            padding: '12px 18px',
            borderRadius: '14px',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            Affichage de <strong>{(safeCurrentPage - 1) * itemsPerPage + 1}</strong> à{' '}
            <strong>{Math.min(safeCurrentPage * itemsPerPage, filteredAndSorted.length)}</strong> sur{' '}
            <strong>{filteredAndSorted.length}</strong> incident(s)
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={safeCurrentPage <= 1}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: safeCurrentPage <= 1 ? '#f8fafc' : '#ffffff',
                color: safeCurrentPage <= 1 ? '#cbd5e1' : 'var(--ink-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: safeCurrentPage <= 1 ? 'not-allowed' : 'pointer',
              }}
            >
              <ChevronLeft size={14} />
              <span>Précédent</span>
            </button>

            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: 'var(--ink-secondary)', padding: '0 6px' }}>
              Page {safeCurrentPage} / {totalPages}
            </span>

            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
              disabled={safeCurrentPage >= totalPages}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                padding: '6px 12px',
                borderRadius: '8px',
                border: '1px solid var(--border-light)',
                background: safeCurrentPage >= totalPages ? '#f8fafc' : '#ffffff',
                color: safeCurrentPage >= totalPages ? '#cbd5e1' : 'var(--ink-primary)',
                fontSize: '0.8rem',
                fontWeight: 600,
                cursor: safeCurrentPage >= totalPages ? 'not-allowed' : 'pointer',
              }}
            >
              <span>Suivant</span>
              <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      {/* MODAL HD PHOTO / VIDÉO DE L'INTRUSION */}
      {evenementSelectionne && (
        <AlertMediaModal
          alerte={evenementSelectionne}
          onClose={() => setEvenementSelectionne(null)}
          onDelete={handleDelete}
          onGoToCamera={(camId) => {
            if (onSelectTab) onSelectTab('cameras');
          }}
        />
      )}

      {/* MODAL DE CONFIRMATION DE SUPPRESSION DESIGN PREVIA */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        dangerLevel={confirmModal.dangerLevel}
        itemDetails={confirmModal.itemDetails}
        loading={enSuppression}
      />
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
function AlertsView({ alertesReelles = [], camerasParId = {}, onRefresh, onSelectTab }) {
  const sourceAlertes = alertesReelles.length > 0 ? alertesReelles : [
    {
      id: 'alt-demo-01',
      type_evenement: 'intrusion_zone',
      description: 'Intrusion détectée en zone sécurisée hors horaires autorisés (Cour Arrière).',
      horodatage: Math.floor(Date.now() / 1000) - 120,
      num: 'Caméra 01',
      id_camera: 'cam-01',
      batiment: 'Bâtiment Principal',
      piece: 'Zone Restreinte',
    },
    {
      id: 'alt-demo-02',
      type_evenement: 'rodeur',
      description: 'Comportement suspect prolongé devant la baie vitrée du rez-de-chaussée.',
      horodatage: Math.floor(Date.now() / 1000) - 900,
      num: 'Caméra 02',
      id_camera: 'cam-02',
      batiment: 'Bâtiment A',
      piece: 'Entrée Sud',
    },
    {
      id: 'alt-demo-03',
      type_evenement: 'infiltration',
      description: 'Tentative de franchissement non autorisé détectée sur le périmètre.',
      horodatage: Math.floor(Date.now() / 1000) - 3600,
      num: 'Caméra 03',
      id_camera: 'cam-03',
      batiment: 'Entrepôt',
      piece: 'Porte Quai',
    },
  ];

  const alertsReelles = sourceAlertes.map((a) => {
    const critique = ['feu_fumee', 'intrusion_zone', 'infiltration'].includes(a.type_evenement);
    return {
      id: a.id,
      title: LABEL_TYPE_ALERTES[a.type_evenement] || a.type_evenement,
      dangerLevel: critique ? 'critical' : 'warning',
      dangerLabel: critique ? 'Danger Immédiat' : 'À surveiller',
      cameraName: `${a.num || a.id_camera}`,
      id_camera: a.id_camera,
      location: [a.batiment, a.piece].filter(Boolean).join(' / ') || 'Emplacement inconnu',
      image: camerasParId[a.id_camera] || '',
      imageUrl: urlImageAlerte(a.id),
      timeAgo: ilYAAlertes(a.horodatage),
      horodatage: a.horodatage,
      description: a.description,
      critique,
    };
  });

  const [alerts, setAlerts] = useState(alertsReelles);
  const [alerteInspectee, setAlerteInspectee] = useState(null);
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

  const [confirmModal, setConfirmModal] = useState({
    isOpen: false,
    title: '',
    message: '',
    confirmText: '',
    cancelText: 'Annuler',
    dangerLevel: 'danger',
    itemDetails: null,
    onConfirm: null,
  });
  const [enSuppression, setEnSuppression] = useState(false);

  const handleAcknowledge = async (id) => {
    try {
      await supprimerAlerte(id);
      dejaVuesRef.current.add(id);
      setAlerts(prev => prev.filter(a => a.id !== id));
      showToast("L'alerte a été marquée comme vérifiée et supprimée.");
      if (onRefresh) onRefresh();
    } catch (e) {
      showToast("Erreur lors de la suppression de l'alerte.");
    }
  };

  const handleDelete = (target, e) => {
    if (e && e.stopPropagation) e.stopPropagation();
    const alertObj = typeof target === 'object' && target !== null ? target : alerts.find((a) => a.id === target);
    const targetId = alertObj ? alertObj.id : target;

    setConfirmModal({
      isOpen: true,
      title: "Supprimer cette notification",
      message: "Voulez-vous vraiment supprimer cette notification d'alerte ?",
      confirmText: "Supprimer la notification",
      cancelText: "Annuler",
      dangerLevel: "danger",
      itemDetails: alertObj ? {
        type: alertObj.title || alertObj.type,
        cam: alertObj.cameraName || alertObj.cam,
        time: alertObj.timeAgo || alertObj.time,
        desc: alertObj.description || alertObj.desc,
      } : null,
      onConfirm: async () => {
        try {
          setEnSuppression(true);
          await supprimerAlerte(targetId);
          dejaVuesRef.current.add(targetId);
          setAlerts(prev => prev.filter(a => a.id !== targetId));
          showToast("Notification supprimée.");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (alerteInspectee?.id === targetId) setAlerteInspectee(null);
          if (onRefresh) onRefresh();
        } catch (e) {
          showToast("Erreur lors de la suppression.");
        } finally {
          setEnSuppression(false);
        }
      },
    });
  };

  const handleClearAll = () => {
    if (alerts.length === 0) return;
    setConfirmModal({
      isOpen: true,
      title: "Tout effacer",
      message: `Êtes-vous sûr de vouloir supprimer la totalité des alertes actives (${alerts.length} notifications) ?`,
      confirmText: `Tout effacer (${alerts.length})`,
      cancelText: "Annuler",
      dangerLevel: "danger",
      itemDetails: null,
      onConfirm: async () => {
        try {
          setEnSuppression(true);
          await supprimerToutesAlertes();
          setAlerts([]);
          showToast("Toutes les alertes ont été supprimées.");
          setConfirmModal((prev) => ({ ...prev, isOpen: false }));
          if (onRefresh) onRefresh();
        } catch (e) {
          showToast("Erreur lors de la suppression des alertes.");
        } finally {
          setEnSuppression(false);
        }
      },
    });
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
            Gestion des événements et contrôle des alarmes
          </p>
        </div>
      </div>

      {/* SOUS-TITRE DE SECTION */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
          marginBottom: '16px'
        }}
      >
        <div style={{ fontSize: '0.9rem', fontWeight: 700, color: 'var(--ink-secondary)' }}>
          Surveillance en direct des lieux ({alerts.length} alerte{alerts.length > 1 ? 's' : ''})
        </div>
        {alerts.length > 0 && (
          <button
            onClick={handleClearAll}
            style={{
              background: '#fee2e2',
              color: '#ef4444',
              border: '1px solid #fca5a5',
              padding: '6px 14px',
              borderRadius: '8px',
              fontSize: '0.8rem',
              fontWeight: 700,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Trash2 size={14} />
            Tout Effacer
          </button>
        )}
      </div>

      {/* BANNIÈRE D'URGENCE ACTIVE UNIQUEMENT SI LA SIRÈNE RETENTIT */}
      {etatAlarme.sirene && (
        <div
          style={{
            background: '#fee2e2',
            border: '2px solid #ef4444',
            borderRadius: '16px',
            padding: '16px 22px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '14px',
            boxShadow: '0 8px 24px rgba(239, 68, 68, 0.2)',
            animation: 'pulse 1.5s infinite',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: '#dc2626', color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <Volume2 size={24} />
            </div>
            <div>
              <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: '#991b1b' }}>
                🚨 Sirène de sécurité en cours de sonnerie
              </h4>
              <p style={{ margin: '3px 0 0 0', fontSize: '0.84rem', color: '#b91c1c', fontWeight: 600 }}>
                Une alerte critique a déclenché l'alarme sonore. Cliquez ci-contre pour couper le son.
              </p>
            </div>
          </div>
          <button
            onClick={handleStopSiren}
            style={{
              background: '#dc2626',
              color: '#ffffff',
              border: 'none',
              padding: '10px 20px',
              borderRadius: '10px',
              fontWeight: 800,
              fontSize: '0.88rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              boxShadow: '0 4px 12px rgba(220, 38, 38, 0.4)',
            }}
          >
            <VolumeX size={18} /> Arrêter la sirène
          </button>
        </div>
      )}

      {/* 2 CARTES DE STATUT ESSENTIELLES (ÉPURÉES & SANS CONFUSION) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '14px', marginBottom: '24px' }}>
        {/* DANGER IMMÉDIAT */}
        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '18px 20px', border: criticalCount > 0 ? '1px solid #fecaca' : '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: criticalCount > 0 ? '#fee2e2' : '#f1f5f9', color: criticalCount > 0 ? '#dc2626' : '#64748b', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ShieldAlert size={22} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: criticalCount > 0 ? '#dc2626' : 'var(--ink-primary)' }}>
              {criticalCount}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Alertes urgentes prioritaires
            </div>
          </div>
        </div>

        {/* À SURVEILLER */}
        <div style={{ background: '#ffffff', borderRadius: '14px', padding: '18px 20px', border: '1px solid var(--border-light)', boxShadow: 'var(--shadow-card)', display: 'flex', alignItems: 'center', gap: '14px' }}>
          <div style={{ width: '44px', height: '44px', borderRadius: '12px', background: '#fef3c7', color: '#d97706', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <AlertTriangle size={20} />
          </div>
          <div>
            <div style={{ fontSize: '1.35rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
              {warningCount}
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', fontWeight: 600 }}>
              Événements à surveiller
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
                  background: isCritical ? '#fff5f5' : '#ffffff',
                  borderRadius: '16px',
                  padding: '20px 24px',
                  border: `1.5px solid ${isCritical ? '#fecaca' : '#e2e8f0'}`,
                  boxShadow: isCritical ? '0 8px 24px rgba(239, 68, 68, 0.08)' : '0 2px 10px rgba(0,0,0,0.03)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '20px',
                  flexWrap: 'wrap',
                  transition: 'all 0.15s ease'
                }}
              >
                {/* 1. PHOTO DE LA CAMÉRA AVEC OVERLAY CLEAN */}
                <div
                  onClick={() => setAlerteInspectee(item)}
                  style={{
                    width: '140px',
                    height: '90px',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    position: 'relative',
                    flexShrink: 0,
                    boxShadow: '0 4px 12px rgba(0,0,0,0.12)',
                    cursor: 'pointer',
                    border: '1px solid rgba(0,0,0,0.08)'
                  }}
                  title="Cliquer pour examiner la capture vidéo"
                >
                  <img
                    src={item.image}
                    alt={item.cameraName}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                  />
                  <div
                    style={{
                      position: 'absolute',
                      bottom: '6px',
                      left: '6px',
                      background: 'rgba(1, 53, 107, 0.85)',
                      backdropFilter: 'blur(4px)',
                      color: '#ffffff',
                      fontSize: '0.66rem',
                      fontWeight: 800,
                      padding: '3px 8px',
                      borderRadius: '6px',
                      display: 'flex',
                      alignItems: 'center',
                      gap: '5px'
                    }}
                  >
                    <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: isCritical ? '#ef4444' : '#10b981' }} />
                    {item.cameraName || 'CAMÉRA'}
                  </div>
                </div>

                {/* 2. DÉTAILS DE L'ÉVÉNEMENT (AU CENTRE) */}
                <div style={{ flex: '1 1 320px', cursor: 'pointer' }} onClick={() => setAlerteInspectee(item)}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '6px' }}>
                    <span
                      style={{
                        fontSize: '0.74rem',
                        fontWeight: 800,
                        padding: '4px 10px',
                        borderRadius: '6px',
                        background: isCritical ? '#ef4444' : (isWarning ? '#f59e0b' : '#009FE3'),
                        color: '#ffffff',
                        letterSpacing: '0.03em'
                      }}
                    >
                      ⚠️ {item.dangerLabel ? item.dangerLabel.toUpperCase() : 'SUSPECT'}
                    </span>
                    <h3 style={{ fontSize: '1.08rem', fontWeight: 800, color: '#01356B', margin: 0 }}>
                      {item.title}
                    </h3>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', fontSize: '0.8rem', color: '#64748b', marginBottom: '8px', fontWeight: 600 }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      📍 <strong>{item.cameraName}</strong> ({item.location})
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: '4px', color: '#94a3b8' }}>
                      🕒 {item.timeAgo}
                    </span>
                  </div>

                  <p style={{ fontSize: '0.86rem', color: '#334155', margin: '0 0 10px 0', lineHeight: 1.45, fontWeight: 500 }}>
                    {item.description}
                  </p>

                  {/* CE QUE LE SYSTÈME A FAIT AUTOMATIQUEMENT */}
                  {item.critique && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                      <div
                        style={{
                          background: etatAlarme.lampe ? '#fef3c7' : '#f8fafc',
                          color: etatAlarme.lampe ? '#92400e' : '#64748b',
                          border: `1px solid ${etatAlarme.lampe ? '#fde68a' : '#e2e8f0'}`,
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Lightbulb size={14} />
                        <span>{etatAlarme.lampe ? '💡 Projecteur allumé' : '💡 Éclairage en veille'}</span>
                      </div>

                      <div
                        style={{
                          background: etatAlarme.sirene ? '#fee2e2' : '#ecfdf5',
                          color: etatAlarme.sirene ? '#dc2626' : '#059669',
                          border: `1px solid ${etatAlarme.sirene ? '#fca5a5' : '#bbf7d0'}`,
                          padding: '4px 10px',
                          borderRadius: '8px',
                          fontSize: '0.76rem',
                          fontWeight: 700,
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px'
                        }}
                      >
                        <Volume2 size={14} />
                        <span>{etatAlarme.sirene ? '🚨 Sirène active' : '🔊 Sirène prête'}</span>
                      </div>
                    </div>
                  )}
                </div>

                {/* 3. BOUTONS D'ACTION ÉPURÉS POUR L'OPÉRATEUR */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', alignItems: 'stretch', flexShrink: 0, minWidth: '150px' }}>
                  <button
                    onClick={() => setAlerteInspectee(item)}
                    style={{
                      background: 'linear-gradient(135deg, #01356B 0%, #009FE3 100%)',
                      color: '#ffffff',
                      border: 'none',
                      padding: '9px 16px',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      fontWeight: 800,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px',
                      boxShadow: '0 4px 12px rgba(0, 159, 227, 0.25)',
                    }}
                  >
                    <Eye size={15} />
                    <span>Examiner</span>
                  </button>

                  <button
                    onClick={() => handleAcknowledge(item.id)}
                    style={{
                      background: '#ffffff',
                      border: '1px solid #cbd5e1',
                      color: '#334155',
                      padding: '8px 14px',
                      borderRadius: '10px',
                      fontSize: '0.82rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                  >
                    <Check size={15} color="#10b981" />
                    <span>Vérifié</span>
                  </button>

                  <button
                    onClick={() => handleDelete(item.id)}
                    style={{
                      background: '#fff1f2',
                      border: '1px solid #fecdd3',
                      color: '#e11d48',
                      padding: '6px 12px',
                      borderRadius: '10px',
                      fontSize: '0.78rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      gap: '6px'
                    }}
                    title="Supprimer définitivement"
                  >
                    <Trash2 size={13} />
                    <span>Supprimer</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* MODAL HD PHOTO / VIDÉO DE L'INTRUSION */}
      {alerteInspectee && (
        <AlertMediaModal
          alerte={alerteInspectee}
          onClose={() => setAlerteInspectee(null)}
          onDelete={handleDelete}
          onGoToCamera={(camId) => {
            if (onSelectTab) onSelectTab('cameras');
          }}
        />
      )}

      {/* MODAL DE CONFIRMATION DE SUPPRESSION DESIGN PREVIA */}
      <ConfirmModal
        isOpen={confirmModal.isOpen}
        onClose={() => setConfirmModal((prev) => ({ ...prev, isOpen: false }))}
        onConfirm={confirmModal.onConfirm}
        title={confirmModal.title}
        message={confirmModal.message}
        confirmText={confirmModal.confirmText}
        cancelText={confirmModal.cancelText}
        dangerLevel={confirmModal.dangerLevel}
        itemDetails={confirmModal.itemDetails}
        loading={enSuppression}
      />
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
        const avis = a.avis_ia ? `Évaluation : ${a.avis_ia.resultat} (${Math.round((a.avis_ia.confiance || 0) * 100)}%)` : null;

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
        const fileContent = "Horodatage,Camera,Type_Evenement,Description,Evaluation\n" + lignes.join('\n') + '\n';
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
          <h1 className="welcome-heading">Rapports & <span>Audits de Sécurité</span></h1>
          <p className="welcome-sub">Téléchargement instantané des comptes-rendus d'activité et des audits de sécurité pour la direction.</p>
        </div>
      </div>

      {/* 1-CLICK INSTANT DAILY PDF REPORT FOR MANAGEMENT */}
      <div
        style={{
          background: 'linear-gradient(135deg, #0284c7 0%, #0369a1 100%)',
          borderRadius: '16px',
          padding: '24px 28px',
          color: '#ffffff',
          marginBottom: '24px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px',
          boxShadow: '0 8px 24px rgba(2, 132, 199, 0.25)',
        }}
      >
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
            <FileText size={22} color="#ffffff" />
            <h3 style={{ margin: 0, fontSize: '1.2rem', fontWeight: 800 }}>
              Rapport Quotidien de Sécurité (PDF)
            </h3>
          </div>
          <p style={{ margin: 0, fontSize: '0.86rem', opacity: 0.9 }}>
            Téléchargez en un clic le rapport officiel complet de la journée pour la direction et vos archives.
          </p>
        </div>

        <button
          onClick={() => handleDownload(reports[0])}
          disabled={downloadingId !== null}
          style={{
            background: '#ffffff',
            color: '#0284c7',
            border: 'none',
            padding: '12px 24px',
            borderRadius: '12px',
            fontWeight: 800,
            fontSize: '0.92rem',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
          }}
        >
          {downloadingId === reports[0]?.id ? <Loader2 size={18} /> : <Download size={18} />}
          <span>Télécharger le rapport du jour (PDF)</span>
        </button>
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
// SECTION : CONFIG ALARME — Boîtiers sirène & éclairage sans fil
// ============================================================================
function ConfigAlerteView() {
  const [appareils, setAppareils] = useState([]);
  const [erreur, setErreur] = useState('');
  const [chargement, setChargement] = useState(true);

  useEffect(() => {
    let annule = false;
    const rafraichir = () => {
      listerEsp()
        .then((liste) => { if (!annule) { setAppareils(Array.isArray(liste) ? liste : []); setErreur(''); } })
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
          <h1 className="welcome-heading">Boîtiers <span>Sirènes & Projecteurs</span></h1>
          <p className="welcome-sub">Gérez la connexion Wi-Fi des sirènes et projecteurs physiques de vos locaux</p>
        </div>
      </div>

      {erreur && <p style={{ color: '#dc2626', fontSize: '0.85rem', marginBottom: '14px' }}>{erreur}</p>}

      {chargement ? (
        <div style={carte}><p style={{ color: 'var(--ink-muted)', fontSize: '0.88rem', margin: 0 }}>Recherche des boîtiers sans fil...</p></div>
      ) : (appareils || []).length === 0 ? (
        <div style={{ ...carte, textAlign: 'center', padding: '48px' }}>
          <Router size={40} color="#94a3b8" style={{ marginBottom: '12px' }} />
          <h3 style={{ fontSize: '1.05rem', color: 'var(--ink-primary)', fontWeight: 700, margin: '0 0 6px' }}>Aucun boîtier sirène détecté</h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--ink-muted)', margin: 0 }}>
            Vérifiez que le boîtier sirène est allumé et connecté au même réseau Wi-Fi que le serveur.
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {(appareils || []).map((a) => <CarteEsp key={a.id} appareil={a} />)}
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

  const signalTexte = etatEsp ? (etatEsp.rssi > -65 ? '🟢 Signal Excellent' : etatEsp.rssi > -80 ? '🟡 Signal Bon' : '🔴 Signal Faible') : '—';

  return (
    <div style={carte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--ink-primary)', margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Router size={18} color="#0284c7" /> Boîtier Sirène & Projecteur Sans Fil
          </h3>
          <p style={{ fontSize: '0.8rem', color: 'var(--ink-muted)', margin: 0 }}>Identifiant : {appareil.hote || appareil.id} (IP : {appareil.ip})</p>
        </div>
        {etatEsp && (
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 800, color: '#0284c7' }}>Connecté au Wi-Fi « {etatEsp.ssid_actuel || '—'} »</div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', fontWeight: 600 }}>{signalTexte}</div>
          </div>
        )}
      </div>

      {erreur && <p style={{ color: '#dc2626', fontSize: '0.82rem', marginBottom: '12px' }}>{erreur}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {(etatEsp?.reseaux || []).length === 0 ? (
          <p style={{ fontSize: '0.82rem', color: 'var(--ink-muted)', margin: 0 }}>Aucun réseau Wi-Fi enregistré pour ce boîtier.</p>
        ) : (
          (etatEsp?.reseaux || []).map((s) => {
            const actif = s === etatEsp.ssid_actuel;
            return (
              <div key={s} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 14px', background: actif ? 'rgba(2,132,199,0.08)' : '#f8fafc', borderRadius: '10px', border: actif ? '1px solid #0284c7' : '1px solid var(--border-light)' }}>
                <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--ink-primary)' }}>Wi-Fi : {s}{actif ? ' (Réseau actuel actif)' : ''}</span>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {!actif && (
                    <button disabled={enCours} onClick={() => basculer(s)} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '6px 12px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
                      Se connecter
                    </button>
                  )}
                  <button disabled={enCours} onClick={() => supprimer(s)} style={{ background: '#fee2e2', color: '#dc2626', border: 'none', padding: '6px 10px', borderRadius: '6px', fontSize: '0.78rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
                    Oublier
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      <form onSubmit={ajouter} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
        <input style={champ} placeholder="Nom du réseau Wi-Fi (Box)" value={ssid} onChange={(e) => setSsid(e.target.value)} required />
        <input style={champ} type="password" placeholder="Mot de passe du Wi-Fi" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} />
        <button type="submit" disabled={enCours} style={{ background: '#0284c7', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '8px', fontSize: '0.82rem', fontWeight: 700, cursor: enCours ? 'default' : 'pointer' }}>
          Connecter ce boîtier au Wi-Fi
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
        appelApiOrg('/utilisateurs').catch(() => []),
        appelApiOrg('/batiments').catch(() => []),
        appelApiOrg('/pieces').catch(() => []),
        appelApiOrg('/cameras').catch(() => []),
      ]);
      setComptes(Array.isArray(c) ? c : (Array.isArray(c?.utilisateurs) ? c.utilisateurs : []));
      setBatiments(Array.isArray(b) ? b : (Array.isArray(b?.batiments) ? b.batiments : []));
      setPieces(Array.isArray(p) ? p : (Array.isArray(p?.pieces) ? p.pieces : []));
      setCameras(Array.isArray(cam) ? cam : (Array.isArray(cam?.cameras) ? cam.cameras : []));
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
      {onglet === 'batiments' && <SectionBatiments batiments={batiments} comptes={comptes} onChange={charger} />}
      {onglet === 'pieces' && <SectionPieces pieces={pieces} batiments={batiments} onChange={charger} />}
      {onglet === 'cameras' && <SectionCameras cameras={cameras} pieces={pieces} onChange={charger} />}
    </div>
  );
}

function SectionComptes({ comptes = [], onChange }) {
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
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Tous les comptes ({(comptes || []).length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', marginBottom: '16px', alignItems: 'center' }}>
        <input style={champ} placeholder="Prénom" value={prenom} onChange={(e) => setPrenom(e.target.value)} required />
        <input style={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <input style={champ} type="email" placeholder="Email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        <input style={champ} type="password" placeholder="Mot de passe" value={motDePasse} onChange={(e) => setMotDePasse(e.target.value)} required />
        <select style={champ} value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="user">Opérateur / Gardien (Notifications & Alertes)</option>
          <option value="admin">Administrateur (Accès complet)</option>
        </select>
        <button style={btn} disabled={envoi} type="submit"><Plus size={15} /> Créer le compte</button>
      </form>
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
        <thead><tr style={{ borderBottom: '1px solid var(--border-light)', color: 'var(--ink-muted)', fontSize: '0.75rem', textTransform: 'uppercase' }}>
          <th style={{ padding: '8px', textAlign: 'left' }}>Nom & Prénom</th><th style={{ padding: '8px', textAlign: 'left' }}>Email</th><th style={{ padding: '8px', textAlign: 'left' }}>Rôle</th><th />
        </tr></thead>
        <tbody>
          {(comptes || []).map((c) => (
            <tr key={c.id} style={{ borderBottom: '1px solid var(--border-light)' }}>
              <td style={{ padding: '8px', fontWeight: 700 }}>{c.prenom} {c.nom}</td>
              <td style={{ padding: '8px', color: 'var(--ink-muted)' }}>{c.email}</td>
              <td style={{ padding: '8px' }}>
                <span style={{ background: c.role === 'admin' ? '#e0f2fe' : '#f1f5f9', color: c.role === 'admin' ? '#0284c7' : '#475569', padding: '3px 8px', borderRadius: '6px', fontWeight: 700, fontSize: '0.75rem' }}>
                  {c.role === 'admin' ? 'Administrateur' : 'Opérateur'}
                  {c.est_par_defaut ? ' (Principal)' : ''}
                </span>
              </td>
              <td style={{ padding: '8px', textAlign: 'right', display: 'flex', gap: '6px', justifyContent: 'flex-end' }}>
                <button
                  style={{ ...btnSuppr, background: '#f0f9ff', color: '#0284c7', borderColor: '#bae6fd' }}
                  onClick={async () => {
                    const nmp = prompt(`Nouveau mot de passe pour ${c.prenom} ${c.nom} :`);
                    if (nmp && nmp.trim()) {
                      try {
                        const chemin = c.role === 'admin' ? `/utilisateurs/admins/${c.id}` : `/utilisateurs/users/${c.id}`;
                        await appelApiOrg(chemin, { method: 'PUT', body: JSON.stringify({ mot_de_passe: nmp.trim() }) });
                        alert(`Le mot de passe de ${c.prenom} a bien été réinitialisé !`);
                        onChange();
                      } catch (errM) {
                        alert(`Erreur : ${errM.message}`);
                      }
                    }
                  }}
                  title="Réinitialiser le mot de passe"
                >
                  Réinitialiser Pass
                </button>
                {!c.est_par_defaut && <button style={btnSuppr} onClick={() => supprimer(c)} title="Supprimer ce compte"><Trash2 size={14} /></button>}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SectionBatiments({ batiments = [], comptes = [], onChange }) {
  const [nom, setNom] = useState('');
  const [lieu, setLieu] = useState('');
  const [responsableId, setResponsableId] = useState('');
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await appelApiOrg('/batiments', {
        method: 'POST',
        body: JSON.stringify({
          id_admin: idAdmin(),
          nom,
          lieu,
          responsable_id: responsableId || null,
        }),
      });
      setNom(''); setLieu(''); setResponsableId(''); onChange();
    } catch (e2) { setErr(e2.message); }
  };
  const supprimer = async (b) => {
    await appelApiOrg(`/batiments/${b.id}`, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };

  const nomResponsable = (id) => {
    if (!id) return null;
    const c = (comptes || []).find((u) => u.id === id);
    return c ? `${c.prenom} ${c.nom}` : null;
  };

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: '4px', color: 'var(--ink-primary)' }}>
        Bâtiments & Sites Surveillés ({(batiments || []).length})
      </h3>
      <p style={{ margin: '0 0 16px 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
        Créez les bâtiments de votre entreprise et assignez un responsable ou gardien référent.
      </p>

      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center', marginBottom: '18px', background: '#f8fafc', padding: '14px', borderRadius: '12px', border: '1px solid var(--border-light)' }}>
        <input style={{ ...champ, flex: 1, minWidth: '180px' }} placeholder="Nom du bâtiment (ex: Siège Principal)" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <input style={{ ...champ, flex: 1, minWidth: '160px' }} placeholder="Lieu / Ville (ex: Abidjan)" value={lieu} onChange={(e) => setLieu(e.target.value)} required />
        <select style={{ ...champ, flex: 1, minWidth: '200px' }} value={responsableId} onChange={(e) => setResponsableId(e.target.value)}>
          <option value="">👤 Responsable / Gardien assigné (Optionnel)</option>
          {(comptes || []).map((c) => (
            <option key={c.id} value={c.id}>
              {c.prenom} {c.nom} ({c.role === 'admin' ? 'Admin' : 'Opérateur'})
            </option>
          ))}
        </select>
        <button style={btn} type="submit"><Plus size={15} /> Créer le bâtiment</button>
      </form>

      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(batiments || []).map((b) => {
          const resp = nomResponsable(b.responsable_id);
          return (
            <div key={b.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', background: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
              <div>
                <strong style={{ fontSize: '0.95rem', color: 'var(--ink-primary)' }}>{b.nom}</strong>
                <span style={{ color: 'var(--ink-muted)', fontSize: '0.84rem', marginLeft: '8px' }}>📍 {b.lieu}</span>
                {resp && (
                  <span style={{ marginLeft: '12px', fontSize: '0.74rem', fontWeight: 700, background: '#e0f2fe', color: '#0284c7', padding: '3px 9px', borderRadius: '999px' }}>
                    👤 Responsable : {resp}
                  </span>
                )}
              </div>
              <button style={btnSuppr} onClick={() => supprimer(b)} title="Supprimer ce bâtiment"><Trash2 size={14} /></button>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function SectionPieces({ pieces = [], batiments = [], onChange }) {
  const [nom, setNom] = useState('');
  const [batimentId, setBatimentId] = useState('');
  const [err, setErr] = useState('');

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await appelApiOrg('/pieces', { method: 'POST', body: JSON.stringify({ id_admin: idAdmin(), nom, batiment_id: batimentId || (batiments || [])[0]?.id }) });
      setNom(''); onChange();
    } catch (e2) { setErr(e2.message); }
  };
  const supprimer = async (p) => {
    await appelApiOrg(`/pieces/${p.id}`, { method: 'DELETE' }).catch((e2) => setErr(e2.message));
    onChange();
  };
  const nomBatiment = (id) => (batiments || []).find((b) => b.id === id)?.nom || '?';

  return (
    <div style={carte}>
      <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '14px' }}>Pièces ({(pieces || []).length})</h3>
      <form onSubmit={creer} style={{ display: 'flex', gap: '8px', marginBottom: '16px' }}>
        <input style={champ} placeholder="Nom" value={nom} onChange={(e) => setNom(e.target.value)} required />
        <select style={champ} value={batimentId} onChange={(e) => setBatimentId(e.target.value)} required>
          <option value="">-- Choisir un bâtiment --</option>
          {(batiments || []).map((b) => <option key={b.id} value={b.id}>{b.nom}</option>)}
        </select>
        <button style={btn} type="submit" disabled={(batiments || []).length === 0}><Plus size={15} /> Créer</button>
      </form>
      {(batiments || []).length === 0 && <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Crée d'abord un bâtiment.</p>}
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(pieces || []).map((p) => (
          <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 12px', background: '#f8fafc', borderRadius: '8px' }}>
            <div><strong>{p.nom}</strong> <span style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>· {nomBatiment(p.batiment_id)}</span></div>
            <button style={btnSuppr} onClick={() => supprimer(p)} title="Supprimer"><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

function SectionCameras({ cameras = [], pieces = [], onChange }) {
  const [num, setNum] = useState('');
  const [pieceId, setPieceId] = useState('');
  const [typeCamera, setTypeCamera] = useState('ip'); // 'ip' | 'webcam'
  const [ipUrl, setIpUrl] = useState('');
  const [estEntree, setEstEntree] = useState(false);
  const [testConnexionMsg, setTestConnexionMsg] = useState(null);
  const [testEnCours, setTestEnCours] = useState(false);
  const [cameraFluxEnDirect, setCameraFluxEnDirect] = useState(null);
  const [directLoaded, setDirectLoaded] = useState(false);
  const [err, setErr] = useState('');

  const appliquerPreset = (nomCamera, urlRTSP) => {
    setTypeCamera('ip');
    setNum(nomCamera);
    setIpUrl(urlRTSP);
    if (!pieceId && (pieces || []).length > 0) {
      setPieceId(pieces[0].id);
    }
  };

  const testerConnexionIp = async () => {
    if (!ipUrl.trim()) {
      setTestConnexionMsg({ ok: false, texte: 'Veuillez saisir une adresse IP ou URL de flux RTSP.' });
      return;
    }
    setTestEnCours(true);
    setTestConnexionMsg({ ok: true, texte: '⏳ Connexion au flux RTSP en cours...' });
    try {
      const res = await testerFluxRtsp(ipUrl.trim());
      if (res.ok) {
        setTestConnexionMsg({ ok: true, texte: `✅ Flux RTSP connecté avec succès (${res.taille_image || 'Image'} reçue).` });
      } else {
        setTestConnexionMsg({ ok: false, texte: `❌ Échec connexion : ${res.erreur || 'Flux injoignable'}` });
      }
    } catch (e) {
      setTestConnexionMsg({ ok: false, texte: `❌ Erreur de test : ${e.message}` });
    } finally {
      setTestEnCours(false);
      setTimeout(() => setTestConnexionMsg(null), 8000);
    }
  };

  const creer = async (e) => {
    e.preventDefault(); setErr('');
    try {
      await creerCamera({
        idAdmin: idAdmin(),
        num: num.trim(),
        pieceId: pieceId || (pieces || [])[0]?.id,
        estEntree,
        urlFlux: typeCamera === 'ip' ? (ipUrl.trim() || null) : null,
      });
      setNum(''); setIpUrl(''); setEstEntree(false); onChange();
    } catch (e2) { setErr(e2.message); }
  };

  const supprimer = async (c) => {
    await supprimerCamera(c.id).catch((e2) => setErr(e2.message));
    onChange();
  };

  const nomPiece = (id) => (pieces || []).find((p) => p.id === id)?.nom || '?';

  return (
    <div style={carte}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <div>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800, margin: 0, color: 'var(--ink-primary)' }}>
            Caméras de Surveillance ({(cameras || []).length})
          </h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.82rem', color: 'var(--ink-muted)' }}>
            Connectez vos caméras IP de sécurité (RTSP) ou vos téléphones/webcams aux pièces du bâtiment.
          </p>
        </div>
      </div>

      </div>

      <form onSubmit={creer} style={{ background: '#f8fafc', padding: '16px', borderRadius: '12px', border: '1px solid var(--border-light)', display: 'flex', flexDirection: 'column', gap: '12px', marginBottom: '18px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap', alignItems: 'center' }}>
          <select style={{ ...champ, fontWeight: 700 }} value={typeCamera} onChange={(e) => setTypeCamera(e.target.value)}>
            <option value="ip">📹 Caméra IP Réseau (RTSP / ONVIF)</option>
            <option value="webcam">📱 Téléphone / Webcam Locale</option>
          </select>

          <input style={{ ...champ, minWidth: '160px' }} placeholder="Nom / Numéro (ex: Caméra 2)" value={num} onChange={(e) => setNum(e.target.value)} required />

          <select style={champ} value={pieceId} onChange={(e) => setPieceId(e.target.value)} required>
            <option value="">Sélectionner une pièce...</option>
            {(pieces || []).map((p) => <option key={p.id} value={p.id}>{p.nom}</option>)}
          </select>

          <label style={{ fontSize: '0.82rem', color: 'var(--ink-secondary)', display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
            <input type="checkbox" checked={estEntree} onChange={(e) => setEstEntree(e.target.checked)} /> Point de contrôle d'accès (Entrée)
          </label>
        </div>

        {typeCamera === 'ip' && (
          <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
            <input
              style={{ ...champ, flex: 1, minWidth: '280px', fontFamily: 'monospace', fontSize: '0.85rem' }}
              placeholder="Flux RTSP (ex: rtsp://admin:11Avril2002@@192.168.11.101:554/Streaming/Channels/101)"
              value={ipUrl}
              onChange={(e) => setIpUrl(e.target.value)}
            />
            <button
              type="button"
              onClick={testerConnexionIp}
              disabled={testEnCours}
              style={{ ...btn, background: '#f1f5f9', color: '#0284c7', border: '1px solid var(--border-light)', minWidth: '130px' }}
            >
              {testEnCours ? 'Test en cours...' : 'Tester le flux RTSP'}
            </button>
          </div>
        )}

        {testConnexionMsg && (
          <p style={{ color: testConnexionMsg.ok ? '#16a34a' : '#dc2626', fontSize: '0.82rem', fontWeight: 600, margin: 0 }}>
            {testConnexionMsg.texte}
          </p>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '4px' }}>
          <button style={btn} type="submit" disabled={(pieces || []).length === 0}><Plus size={15} /> Enregistrer la caméra</button>
        </div>
      </form>

      {(pieces || []).length === 0 && <p style={{ color: 'var(--ink-muted)', fontSize: '0.82rem' }}>Créez d'abord une pièce dans l'onglet Pièces.</p>}
      {err && <p style={{ color: '#dc2626', fontSize: '0.8rem' }}>{err}</p>}

      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {(cameras || []).map((c) => (
          <div key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: '#ffffff', border: '1px solid var(--border-light)', borderRadius: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <strong style={{ color: 'var(--ink-primary)', fontSize: '0.92rem' }}>{c.num}</strong>
              <span style={{ color: 'var(--ink-muted)', fontSize: '0.84rem' }}>· Pièce : {nomPiece(c.piece_id)}</span>
              {c.est_entree && <span style={{ fontSize: '0.7rem', fontWeight: 700, background: '#dcfce7', color: '#15803d', padding: '3px 8px', borderRadius: '999px' }}>ENTRÉE PRINCIPALE</span>}
              {c.url_flux && (
                <span style={{ fontSize: '0.74rem', background: '#f0fdf4', border: '1px solid #bbf7d0', color: '#166534', padding: '2px 8px', borderRadius: '6px', fontFamily: 'monospace' }}>
                  🟢 RTSP : {c.url_flux}
                </span>
              )}
            </div>
            <div style={{ display: 'flex', gap: '6px', alignItems: 'center' }}>
              {c.url_flux && (
                <button
                  type="button"
                  onClick={() => setCameraFluxEnDirect(c)}
                  style={{ ...btn, background: '#eff6ff', color: '#2563eb', border: '1px solid #bfdbfe', padding: '6px 12px', fontSize: '0.78rem' }}
                  title="Voir le flux vidéo continu en direct"
                >
                  👁️ Voir le direct
                </button>
              )}
                <button style={btnSuppr} onClick={() => supprimer(c)} title="Supprimer la caméra"><Trash2 size={14} /></button>
              </div>
            </div>
          ))}
        </div>

      {/* Modal / Lecteur de flux direct RTSP */}
      {cameraFluxEnDirect && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(15, 23, 42, 0.75)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 9999, backdropFilter: 'blur(4px)', padding: '20px' }}>
          <div style={{ background: '#ffffff', borderRadius: '16px', maxWidth: '800px', width: '100%', overflow: 'hidden', boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '16px 20px', borderBottom: '1px solid var(--border-light)' }}>
              <div>
                <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 800, color: 'var(--ink-primary)' }}>
                  📺 Flux Vidéo en Direct — {cameraFluxEnDirect.num}
                </h4>
                <p style={{ margin: '2px 0 0 0', fontSize: '0.78rem', color: 'var(--ink-muted)', fontFamily: 'monospace' }}>
                  {cameraFluxEnDirect.url_flux}
                </p>
              </div>
              <button
                type="button"
                onClick={() => { setCameraFluxEnDirect(null); setDirectLoaded(false); }}
                style={{ background: 'transparent', border: 'none', fontSize: '1.4rem', cursor: 'pointer', color: 'var(--ink-muted)' }}
              >
                ✕
              </button>
            </div>
            <div style={{ position: 'relative', background: '#0b132b', minHeight: '400px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <img
                src={urlFluxCamera(cameraFluxEnDirect.id)}
                alt={`Flux direct ${cameraFluxEnDirect.num}`}
                style={{ width: '100%', maxHeight: '550px', objectFit: 'contain', zIndex: 2, background: '#0b132b' }}
                onLoad={() => {
                  setDirectLoaded(true);
                }}
                onError={(e) => {
                  setDirectLoaded(false);
                  setTimeout(() => {
                    if (e.target) {
                      e.target.src = `${urlFluxCamera(cameraFluxEnDirect.id)}?t=${Date.now()}`;
                    }
                  }, 1500);
                }}
              />
              {!directLoaded && (
                <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center', color: '#ffffff', padding: '30px', zIndex: 1, background: '#0b132b' }}>
                  <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(2, 132, 199, 0.15)', border: '2px dashed #0284c7', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '14px' }}>
                    <Cctv size={28} color="#38bdf8" />
                  </div>
                  <p style={{ fontSize: '1.05rem', fontWeight: 700, margin: '0 0 6px 0' }}>🔌 En attente de connexion de la caméra</p>
                  <p style={{ fontSize: '0.82rem', color: '#94a3b8', maxWidth: '420px', margin: 0 }}>
                    Branchez le routeur et la caméra sur le secteur. Dès que la caméra est allumée sur le réseau ({cameraFluxEnDirect.url_flux}), la vidéo apparaîtra automatiquement ici en direct.
                  </p>
                </div>
              )}
            </div>
            <div style={{ padding: '12px 20px', display: 'flex', alignItems: 'center', background: '#f8fafc', borderTop: '1px solid var(--border-light)' }}>
              <span style={{ fontSize: '0.8rem', color: '#16a34a', fontWeight: 700, display: 'flex', alignItems: 'center', gap: '6px' }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: '#16a34a', display: 'inline-block' }}></span>
                Flux décodé en temps réel via FFmpeg MJPEG
              </span>
            </div>
          </div>
        </div>
      )}
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

// Titre à afficher pour une situation personne (Surveillance Comportementale)
function titreSituationPersonne(item) {
  if (item.intrusionZoneActive) return '🚨 Intrusion en zone non autorisée';
  if (item.rodage && item.rodage !== 'Normal' && !item.rodage.startsWith('En observation') && item.riskPct >= 40) {
    return item.rodage;
  }
  if (item.infiltration && item.infiltration !== 'Normal' && item.riskPct >= 40) {
    return item.infiltration;
  }
  if (item.regard && item.regard.startsWith('Scanne') && item.riskPct >= 40) {
    return `Balayage visuel anormal (${item.regard})`;
  }
  if (item.nom) return `${item.nom} (Collaborateur identifié)`;
  if (item.visage === 'Oui') return 'Personne détectée (Visage visible)';
  return 'Présence normale';
}

export default function Admin() {
  const navigate = useNavigate();
  const [currentTab, setCurrentTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

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
    image: c.url_flux ? urlFluxCamera(c.id_camera) : `${API_BASE}/cameras/${c.id_camera}/image`,
    urlFlux: c.url_flux,
    location: [c.batiment, c.piece].filter(Boolean).join(' / ') || 'Emplacement inconnu',
    estEntree: c.est_entree,
    nombrePersonnes: c.nombre_personnes ?? 0,
    misAJourLe: c.mis_a_jour_le,
    detections: personnes.filter((p) => p.camCtx?.id_camera === c.id_camera),
  }));

  const camerasParId = Object.fromEntries(camerasReelles.map((c) => [c.id, c.image]));

  // Surveillance comportementale :
  // - Toutes les personnes détectées (analyse comportementale active)
  // - Les objets anormaux ou critiques uniquement (feu, fumée, objet abandonné, objet disparu)
  // On exclut les objets statiques normaux du décor (chaises, tables) qui n'ont aucune anomalie.
  const objetsAnormaux = objets.filter((o) => o.riskPct >= 40 || o.riskLevel === 'high' || o.riskLevel === 'med');
  const cibles = [...personnes, ...objetsAnormaux].sort((a, b) => b.riskPct - a.riskPct);
  const situations = cibles.slice(0, 4).map((item) => ({
    id: item.id,
    title: item.isObject ? item.label : (item.nom ? `${item.nom} (Collaborateur)` : titreSituationPersonne(item)),
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
        return <CamerasView cameras={camerasReelles} personnes={personnes} alertes={alertes} onRefresh={rafraichir} onSelectTab={setCurrentTab} />;
      case 'personnes':
        return <PersonnesFaceIdView items={personnes} />;
      case 'events':
        return <EventsView alertesReelles={alertes} cameras={camerasReelles} onRefresh={rafraichir} onSelectTab={setCurrentTab} />;
      case 'alerts':
        return <AlertsView alertesReelles={alertes} camerasParId={camerasParId} onRefresh={rafraichir} onSelectTab={setCurrentTab} />;
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

  const titresOnglets = {
    dashboard: 'Tableau de bord',
    cameras: 'Caméras',
    personnes: 'Personnel & Face ID',
    events: 'Historique',
    alerts: 'Alertes',
    reports: 'Rapports',
    organisation: 'Organisation',
    configAlerte: 'Boîtiers d\'alarme',
  };

  return (
    <div className="app-container">
      {/* PERSISTENT SAPPHIRE SIDEBAR IDENTICAL ACROSS ALL VIEWS */}
      <Sidebar
        currentTab={currentTab}
        onSelectTab={(tab) => {
          setCurrentTab(tab);
          setIsMobileMenuOpen(false);
        }}
        isCollapsed={isSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        onCloseMobile={() => setIsMobileMenuOpen(false)}
        unreadAlerts={alertes.length}
        showOrganisation={estParDefaut}
        joursRestantsLicence={licence.jours_restants}
      />

      {/* MAIN OPERATIONS WORKSPACE */}
      <main className="main-layout">
        {/* MOBILE TOP BAR (visible on screens <= 768px) */}
        <div className="mobile-top-bar">
          <button
            className="mobile-menu-btn"
            onClick={() => setIsMobileMenuOpen(true)}
            aria-label="Ouvrir le menu"
          >
            <Menu size={22} />
          </button>
          <div className="mobile-app-title">
            <strong>Previa</strong> · <span>{titresOnglets[currentTab] || 'Tableau de bord'}</span>
          </div>
        </div>

        {/* TOP RIGHT ORGANIC BLUE WAVE BANNER WITH ACTION BUTTONS */}
        <HeaderDecor
          onNavigate={(tab) => {
            setCurrentTab(tab);
            setIsMobileMenuOpen(false);
          }}
          onLogout={seDeconnecter}
          onRefresh={rafraichir}
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
