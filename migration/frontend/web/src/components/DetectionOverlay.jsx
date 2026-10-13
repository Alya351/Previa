import React from 'react';

/**
 * Overlay de détection en temps réel avec cadres HUD (Rouge pour Suspect, Vert pour Autorisé).
 * Se superpose directement sur le lecteur vidéo / flux de la caméra.
 */
export function DetectionOverlay({ detections = [], width = 640, height = 480 }) {
  if (!detections || detections.length === 0) return null;

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        left: 0,
        width: '100%',
        height: '100%',
        pointerEvents: 'none',
        overflow: 'hidden',
        zIndex: 10,
      }}
    >
      {detections.map((det, idx) => {
        // Priorité à la boîte normalisée directe, sinon boîte visage, sinon corps
        const box = det.box_normalisee || det.box_visage || det.box_corps;
        if (!box || box.length < 4) return null;

        const [x1, y1, x2, y2] = box;
        let leftPercent, topPercent, wPercent, hPercent;

        // 1. Si les coordonnées sont déjà normalisées entre 0 et 1 (ex. 0.15, 0.45)
        if (x2 <= 1.0 && y2 <= 1.0 && x1 >= 0 && y1 >= 0) {
          leftPercent = Math.max(0, Math.min(95, x1 * 100));
          topPercent = Math.max(0, Math.min(95, y1 * 100));
          wPercent = Math.max(2, Math.min(100 - leftPercent, (x2 - x1) * 100));
          hPercent = Math.max(2, Math.min(100 - topPercent, (y2 - y1) * 100));
        } else {
          // 2. Coordonnées absolues en pixels : résolution de capture exacte ou détection automatique
          const resW = det.resolution?.[0] || (x2 > 1280 ? 1920 : x2 > 640 ? 1280 : (width || 640));
          const resH = det.resolution?.[1] || (y2 > 720 ? 1080 : y2 > 480 ? 720 : (height || 480));

          leftPercent = Math.max(0, Math.min(92, (x1 / resW) * 100));
          topPercent = Math.max(0, Math.min(92, (y1 / resH) * 100));
          wPercent = Math.max(3, Math.min(100 - leftPercent, ((x2 - x1) / resW) * 100));
          hPercent = Math.max(3, Math.min(100 - topPercent, ((y2 - y1) / resH) * 100));
        }

        // RÈGLE DE SÉCURITÉ HUD PREVIA :
        // 1. ROUGE = Personne suspecte (anomalie comportementale, intrusion zone, rôdage prolongé, visage dissimulé)
        // 2. VERT  = Collaborateur identifié (reconnu par Face ID, personnel de l'entreprise)
        // 3. BLEU  = Visiteur normal (personne non enregistrée mais circulant normalement sans anomalie)
        const isEmployee = Boolean(det.nom) || det.statut === 'connu' || det.statut === 'vient_d_etre_confirme';
        const isSuspect = det.est_suspect === true || (det.riskPct !== undefined && det.riskPct >= 60) || (!isEmployee && (det.intrusionZoneActive || det.rodageClass === 'danger' || det.infiltrationClass === 'danger'));
        const isVisitor = !isSuspect && !isEmployee;

        const color = isSuspect ? '#ef4444' : isVisitor ? '#0284c7' : '#10b981';
        const bgColor = isSuspect ? 'rgba(239, 68, 68, 0.20)' : isVisitor ? 'rgba(2, 132, 199, 0.18)' : 'rgba(16, 185, 129, 0.20)';
        const borderColor = isSuspect ? '#ef4444' : isVisitor ? '#0284c7' : '#10b981';
        const shadow = isSuspect
          ? '0 0 18px rgba(239, 68, 68, 0.8), inset 0 0 10px rgba(239, 68, 68, 0.35)'
          : isVisitor
          ? '0 0 16px rgba(2, 132, 199, 0.7), inset 0 0 8px rgba(2, 132, 199, 0.25)'
          : '0 0 18px rgba(16, 185, 129, 0.8), inset 0 0 10px rgba(16, 185, 129, 0.3)';

        const labelTexte = isSuspect
          ? (det.motif_suspicion ? `🚨 ${det.motif_suspicion.toUpperCase()}` : '🚨 INDIVIDU SUSPECT')
          : isVisitor
          ? '👤 VISITEUR (NORMAL)'
          : (det.nom ? `✅ ${det.nom} (${det.matricule || 'COLLABORATEUR'})` : '✅ COLLABORATEUR AUTORISÉ');

        return (
          <div
            key={det.id || idx}
            style={{
              position: 'absolute',
              left: `${leftPercent}%`,
              top: `${topPercent}%`,
              width: `${wPercent}%`,
              height: `${hPercent}%`,
              border: `2px solid ${borderColor}`,
              borderRadius: '6px',
              backgroundColor: bgColor,
              boxShadow: shadow,
              transition: 'all 0.15s ease-out',
              display: 'flex',
              flexDirection: 'column',
              justifyContent: 'flex-start',
            }}
          >
            {/* BADGE D'IDENTIFICATION AU DESSUS DE LA TÊTE */}
            <div
              style={{
                position: 'absolute',
                top: '-26px',
                left: '-2px',
                background: isSuspect ? '#ef4444' : isVisitor ? '#0284c7' : '#10b981',
                color: '#ffffff',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.4px',
                padding: '3px 8px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
              }}
            >
              {isSuspect && <span className="live-dot-pulse" style={{ width: '6px', height: '6px', background: '#fff' }} />}
              <span>{labelTexte}</span>
            </div>

            {/* COINS HUD CYBER (Haut Gauche, Haut Droite, Bas Gauche, Bas Droite) */}
            <div style={{ position: 'absolute', top: -1, left: -1, width: 8, height: 8, borderTop: `3px solid ${color}`, borderLeft: `3px solid ${color}` }} />
            <div style={{ position: 'absolute', top: -1, right: -1, width: 8, height: 8, borderTop: `3px solid ${color}`, borderRight: `3px solid ${color}` }} />
            <div style={{ position: 'absolute', bottom: -1, left: -1, width: 8, height: 8, borderBottom: `3px solid ${color}`, borderLeft: `3px solid ${color}` }} />
            <div style={{ position: 'absolute', bottom: -1, right: -1, width: 8, height: 8, borderBottom: `3px solid ${color}`, borderRight: `3px solid ${color}` }} />
          </div>
        );
      })}
    </div>
  );
}

export default DetectionOverlay;
