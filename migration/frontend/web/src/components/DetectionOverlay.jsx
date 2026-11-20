import React from 'react';

/**
 * Overlay de détection en temps réel avec cadres HUD (Rouge pour Suspect, Vert pour Autorisé).
 * Se superpose directement sur le lecteur vidéo / flux de la caméra.
 */
// `cadre` (px, optionnel) = zone réellement occupée par l'image dans son conteneur.
// Avec object-fit: cover/contain l'image est rognée ou entourée de bandes : sans ce
// cadre les pourcentages du backend se plaquent sur le conteneur et le cadre dérive
// (ex. sur la poitrine au lieu du visage).
// Deux états seulement : AUTORISÉ (vert) ou INTRUSION (rouge). Pour que l'état ne change pas
// « au hasard » d'une analyse à l'autre :
//  - une personne reconnue reste AUTORISÉE pendant MAINTIEN_AUTORISE_MS même si une analyse
//    suivante ne la reconnaît pas (visage de profil, image floue...) ;
//  - une personne non reconnue n'est déclarée INTRUSION qu'après DELAI_IDENTIFICATION_MS
//    (le temps que la reconnaissance faciale confirme), sauf si le serveur la signale déjà
//    comme suspecte ou en zone interdite.
const MAINTIEN_AUTORISE_MS = 10000;
const DELAI_IDENTIFICATION_MS = 4000;

export function DetectionOverlay({ detections = [], width = 640, height = 480, cadre = null }) {
  const memoire = React.useRef(new Map());
  if (!detections || detections.length === 0) return null;
  const maintenant = Date.now();
  const occurrences = {};
  const reclames = new Set();
  // Oublie les personnes plus vues depuis longtemps
  for (const [cle, m] of memoire.current) {
    if (maintenant - m.vuLe > 30000) memoire.current.delete(cle);
  }

  return (
    <div
      style={{
        position: 'absolute',
        top: cadre ? cadre.top : 0,
        left: cadre ? cadre.left : 0,
        width: cadre ? cadre.width : '100%',
        height: cadre ? cadre.height : '100%',
        pointerEvents: 'none',
        overflow: cadre ? 'visible' : 'hidden',
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

        // RÈGLE HUD : VERT = AUTORISÉ (reconnu), ROUGE = INTRUSION (non reconnu).
        // AUTORISÉ = uniquement une personne ENREGISTRÉE (le serveur renvoie `nom` seulement quand
        // le visage correspond à une fiche du personnel) et dont l'accès n'est pas révoqué.
        // Le statut `connu`/`vient_d_etre_confirme` ne suffit PAS : le serveur l'attribue aussi à
        // tout visage simplement revu plusieurs fois, même s'il n'est pas enregistré.
        const reconnu = Boolean(det.nom) && !/r[ée]voqu/i.test(String(det.motif_suspicion || ''));
        // Deux personnes peuvent recevoir le même identifiant du serveur : on les distingue
        // pour que leurs états (autorisé/intrusion) et leurs cadres ne se mélangent pas.
        const base = String(det.id || det.pid || idx);
        occurrences[base] = (occurrences[base] || 0) + 1;
        const cle = occurrences[base] > 1 ? `${base}#${occurrences[base]}` : base;
        const cx = leftPercent + wPercent / 2;
        const cy = topPercent + hPercent / 2;
        let m = memoire.current.get(cle);
        if (!m) {
          // Nouvel identifiant : si une personne suivie était juste là à l'analyse précédente
          // (l'identifiant a changé alors que c'est la même personne), on hérite de son état.
          let proche = null;
          let dmin = 8; // % de l'image : assez serré pour ne pas confondre deux personnes voisines
          for (const [k2, m2] of memoire.current) {
            if (reclames.has(k2) || maintenant - m2.vuLe > 3000) continue;
            const d = Math.hypot((m2.cx ?? 1e3) - cx, (m2.cy ?? 1e3) - cy);
            if (d < dmin) { dmin = d; proche = k2; }
          }
          m = proche ? { ...memoire.current.get(proche) } : { premiereVue: maintenant, derniereReconnu: 0, vuLe: maintenant };
        }
        reclames.add(cle);
        m.cx = cx;
        m.cy = cy;
        m.vuLe = maintenant;
        if (reconnu) m.derniereReconnu = maintenant;
        memoire.current.set(cle, m);
        const isEmployee = reconnu || (maintenant - m.derniereReconnu < MAINTIEN_AUTORISE_MS);

        // Détection de présence en zone sensible délimitée
        const inForbiddenZone = Boolean(
          det.intrusionZoneActive ||
          det.en_zone_interdite ||
          (det.motif_suspicion && det.motif_suspicion.toLowerCase().includes('zone')) ||
          (det.intrusionZone && det.intrusionZone !== 'Hors zone')
        );

        // Deux états : AUTORISÉ (reconnu) ou INTRUSION (non reconnu). Pendant les premières
        // secondes (reconnaissance en cours) on affiche « IDENTIFICATION » sans conclure,
        // sauf si le serveur signale déjà une zone interdite ou un comportement suspect.
        const signaleParServeur = inForbiddenZone || det.est_suspect === true ||
          det.rodageClass === 'danger' || det.infiltrationClass === 'danger';
        const isIntrusion = !isEmployee &&
          (signaleParServeur || (maintenant - m.premiereVue >= DELAI_IDENTIFICATION_MS));
        const enIdentification = !isEmployee && !isIntrusion;
        const isSuspect = isIntrusion;

        const couleurEtat = isIntrusion ? '#ef4444' : enIdentification ? '#64748b' : '#10b981';
        const color = couleurEtat;
        const bgColor = isIntrusion ? 'rgba(239, 68, 68, 0.20)' : enIdentification ? 'rgba(100, 116, 139, 0.15)' : 'rgba(16, 185, 129, 0.20)';
        const borderColor = couleurEtat;
        const shadow = isIntrusion
          ? '0 0 18px rgba(239, 68, 68, 0.8), inset 0 0 10px rgba(239, 68, 68, 0.35)'
          : enIdentification
          ? '0 0 12px rgba(100, 116, 139, 0.5)'
          : '0 0 18px rgba(16, 185, 129, 0.8), inset 0 0 10px rgba(16, 185, 129, 0.3)';

        const labelTexte = isEmployee
          ? (det.nom ? `✅ ${det.nom} · AUTORISÉ` : '✅ AUTORISÉ')
          : isIntrusion
          ? '🚨 INTRUSION'
          : '⏳ IDENTIFICATION…';

        return (
          <div
            key={cle}
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
              // Les cadres arrivent environ toutes les 1-2 s : on les fait glisser jusqu'à la
              // nouvelle position au lieu de les téléporter par saccades.
              transition: 'left 0.9s linear, top 0.9s linear, width 0.9s linear, height 0.9s linear, background-color 0.2s, border-color 0.2s, box-shadow 0.2s',
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
                background: couleurEtat,
                color: '#ffffff',
                fontSize: '0.68rem',
                fontWeight: 800,
                letterSpacing: '0.4px',
                padding: '3px 8px',
                borderRadius: '4px',
                whiteSpace: 'nowrap',
                maxWidth: '320px',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
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
