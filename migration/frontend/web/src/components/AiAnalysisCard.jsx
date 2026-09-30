import React from 'react';
import { 
  ShieldAlert, 
  Package, 
  Eye, 
  ShieldCheck, 
  ChevronRight 
} from 'lucide-react';

// `situations` et `alerteEnCours` : branchés sur les vraies cibles
// (personnes/objets à risque, voir mappageCibles.js) et la dernière
// vraie alerte confirmée (GET /alertes) — remplace les 4 situations et
// la bannière fictives d'origine. Chaque situation garde un `id` qui
// est l'identifiant RÉEL de la cible (pid ou id d'objet), passé tel
// quel à onSelectModule pour ouvrir le détail correspondant.
const ICONES_PAR_NIVEAU = {
  high: { icon: <ShieldAlert size={18} />, badgeBg: '#fee2e2', badgeColor: '#dc2626', iconBg: '#fee2e2', iconColor: '#dc2626' },
  med: { icon: <Eye size={18} />, badgeBg: '#fef3c7', badgeColor: '#b45309', iconBg: '#fef3c7', iconColor: '#d97706' },
  low: { icon: <ShieldCheck size={18} />, badgeBg: '#f0fdf4', badgeColor: '#15803d', iconBg: '#f0fdf4', iconColor: '#16a34a' },
};
const LABEL_PAR_NIVEAU = { high: 'Danger Immédiat', med: 'À surveiller', low: 'Normal' };

export function AiAnalysisCard({ situations = [], alerteEnCours, onSelectModule }) {
  return (
    <div 
      style={{
        background: '#ffffff',
        borderRadius: '16px',
        padding: '20px 22px',
        border: '1px solid var(--border-light)',
        boxShadow: 'var(--shadow-card)',
        display: 'flex',
        flexDirection: 'column',
        gap: '14px'
      }}
    >
      {/* HEADER */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <h2 style={{ fontSize: '1.05rem', fontWeight: 800, color: 'var(--ink-primary)', margin: 0 }}>
            Surveillance Comportementale
          </h2>
          <p style={{ fontSize: '0.78rem', color: 'var(--ink-muted)', margin: '2px 0 0 0' }}>
            Détection automatique et réactions des équipements
          </p>
        </div>

        <span 
          style={{
            fontSize: '0.72rem',
            color: '#15803d',
            background: '#dcfce7',
            fontWeight: 700,
            padding: '3px 8px',
            borderRadius: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span style={{ width: '5px', height: '5px', borderRadius: '50%', background: '#16a34a' }} />
          En direct
        </span>
      </div>

      {/* REFINED COMPACT ALERT BANNER — la vraie dernière alerte
          confirmée (voir GET /alertes), rien si aucune. */}
      {alerteEnCours && (
        <div
          style={{
            background: '#fef2f2',
            borderRadius: '10px',
            padding: '10px 14px',
            border: '1px solid #fecaca',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            gap: '10px'
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
            <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#ef4444', flexShrink: 0 }} />
            <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#991b1b', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              Alerte en cours — {alerteEnCours.titre}
            </span>
          </div>
          <span style={{ fontSize: '0.74rem', color: '#b91c1c', fontWeight: 600, flexShrink: 0 }}>
            {alerteEnCours.lieu}
          </span>
        </div>
      )}

      {/* LIST OF SITUATIONS */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {situations.length === 0 && (
          <div
            style={{
              padding: '24px 16px',
              textAlign: 'center',
              background: '#f8fafc',
              borderRadius: '12px',
              border: '1px dashed var(--border-light)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <ShieldCheck size={26} color="#10b981" />
            <div style={{ fontSize: '0.86rem', fontWeight: 700, color: 'var(--ink-primary)' }}>
              Aucun comportement suspect détecté
            </div>
            <div style={{ fontSize: '0.78rem', color: 'var(--ink-muted)' }}>
              Surveillance active en temps réel sur l'ensemble des caméras
            </div>
          </div>
        )}
        {situations.map((item) => {
          const style = ICONES_PAR_NIVEAU[item.riskLevel] || ICONES_PAR_NIVEAU.low;
          return (
          <div 
            key={item.id} 
            onClick={() => onSelectModule && onSelectModule(item.id)}
            style={{
              background: '#ffffff',
              borderRadius: '10px',
              padding: '12px 14px',
              border: '1px solid var(--border-light)',
              cursor: 'pointer',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              gap: '12px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = '#f8fafc';
              e.currentTarget.style.borderColor = '#cbd5e1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = '#ffffff';
              e.currentTarget.style.borderColor = 'var(--border-light)';
            }}
            title="Cliquer pour voir les détails de cette situation"
          >
            {/* LEFT: ICON + TEXT */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1, minWidth: 0 }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '8px',
                  background: style.iconBg,
                  color: style.iconColor,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0
                }}
              >
                {style.icon}
              </div>

              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.88rem', fontWeight: 700, color: 'var(--ink-primary)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.title}
                </div>
                <div style={{ fontSize: '0.76rem', color: 'var(--ink-muted)', marginTop: '2px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {item.subtitle}
                </div>
              </div>
            </div>

            {/* RIGHT: BADGE + CHEVRON */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
              <span
                style={{
                  fontSize: '0.7rem',
                  fontWeight: 700,
                  background: style.badgeBg,
                  color: style.badgeColor,
                  padding: '3px 8px',
                  borderRadius: '5px'
                }}
              >
                {LABEL_PAR_NIVEAU[item.riskLevel] || 'Normal'}
              </span>
              <ChevronRight size={16} color="var(--ink-muted)" />
            </div>

          </div>
          );
        })}
      </div>
    </div>
  );
}

export default AiAnalysisCard;
