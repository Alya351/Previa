// Traduction des données réelles /cameras/{id}/etat vers le format
// affiché par l'interface (cartes, tableau, modale de détail) — porté
// depuis l'ancien frontend/web/admin/admin.js (mapPersonneApi,
// mapObjetInstanceApi, mapFeuFumeeAlerte, mapZoneSuspecte), MÊME
// LOGIQUE de lecture des champs, adapté au multi-caméra : chaque cible
// porte maintenant son contexte caméra (camCtx), et deux signaux qui
// n'existaient pas dans l'ancien système sont intégrés (infiltration,
// déjà suspect ailleurs — voir ComportementsSupects/infiltre.py et
// profil_suspect.py côté backend).

export const COULEUR_HEX = {
  noir: '#0f172a', blanc: '#e2e8f0', gris: '#64748b', bleu: '#2563eb',
  rouge: '#e11d48', vert: '#059669', jaune: '#d97706', orange: '#ea580c',
  marron: '#78350f', beige: '#d6d3c8', rose: '#ec4899', violet: '#7c3aed',
  inconnue: '#94a3b8', inconnu: '#94a3b8',
};
export function couleurVersHex(nom) {
  return COULEUR_HEX[(nom || '').toLowerCase()] || '#94a3b8';
}

// Position radar STABLE mais décorative — même choix assumé que l'ancien
// admin.js (voir sa docstring) : /etat ne donne pas les dimensions de
// l'image, impossible de normaliser une vraie position sans deviner ; un
// hachage de l'id donne au moins une position qui ne saute pas d'un
// rafraîchissement à l'autre pour la même cible.
export function stableRadarPos(id) {
  let h = 0;
  const s = String(id);
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
  const top = 18 + (h % 62);
  const left = 12 + ((h >> 8) % 76);
  return { top: `${top}%`, left: `${left}%` };
}

export function formatDuree(sec) {
  sec = Math.max(0, Math.round(sec || 0));
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m} min ${String(s).padStart(2, '0')}s` : `${s}s`;
}

export function statutIdentite(statut) {
  if (statut === 'connu' || statut === 'vient_d_etre_confirme') return { label: 'Confirmée', cls: 'ok' };
  if (statut === 'en_observation') return { label: 'En observation', cls: 'neutre' };
  return { label: statut || 'Inconnu', cls: 'warn' };
}

export function rodeurInfo(r) {
  if (!r) return { texte: 'Inconnu', cls: 'neutre', risk: 0 };
  switch (r.statut) {
    case 'a_verifier_trop_stable': return { texte: `À vérifier, ${formatDuree(r.depuis_secondes)}`, cls: 'danger', risk: 95 };
    case 'prolonge': return { texte: `Rôde longtemps, ${formatDuree(r.depuis_secondes)}`, cls: 'danger', risk: 85 };
    case 'confirme': return { texte: `Rôde, ${formatDuree(r.depuis_secondes)}`, cls: 'warn', risk: 65 };
    case 'assis_probablement_attente': return { texte: 'Assis, attend', cls: 'neutre', risk: 15 };
    case 'normal': return { texte: 'Normal', cls: 'ok', risk: 10 };
    default: return { texte: 'En observation', cls: 'neutre', risk: 5 };
  }
}

export function regardInfo(r) {
  if (!r) return { texte: 'Inconnu', cls: 'neutre', risk: 0 };
  switch (r.statut) {
    case 'confirme': return { texte: `Scanne, ${r.amplitude_deg ?? '?'}°`, cls: 'warn', risk: 40 };
    case 'normal': return { texte: 'Normal', cls: 'ok', risk: 0 };
    case 'pas_de_visage': return { texte: 'Pas de visage', cls: 'neutre', risk: 0 };
    default: return { texte: 'En observation', cls: 'neutre', risk: 0 };
  }
}

// Signal absent de l'ancien système (voir ComportementsSupects/infiltre.py,
// construit plus tôt dans cette migration) : découverte sans être jamais
// passée par une entrée surveillée.
export function infiltrationInfo(i) {
  if (!i || !i.infiltre) return { texte: 'Normal', cls: 'ok', risk: 0 };
  return { texte: 'Infiltration suspectée', cls: 'danger', risk: 96 };
}

// Signal le plus récent (voir zoneCam/detectionEnZone.py) : présence
// détectée dans une zone que l'admin a explicitement dessinée comme
// interdite — le plus DIRECT des signaux ici, ce n'est pas un
// comportement à interpréter, c'est une zone qu'un humain a
// délibérément marquée à l'avance. Priorité maximale (voir riskPct et
// avisIADe ci-dessous).
export function intrusionZoneInfo(iz) {
  if (!iz || !iz.intrusion) return { texte: 'Hors zone', cls: 'ok', risk: 0 };
  return { texte: 'Intrusion en zone non autorisée', cls: 'danger', risk: 97 };
}

// Second avis (voir Alertes/comparaison_ia.py) : priorité intrusion en
// zone > rôdage > infiltration > posture — le signal le plus
// directement lié à une intrusion en premier (une zone dessinée à la
// main par un admin est plus certaine qu'un comportement déduit).
export function avisIADe(p) {
  return p.comportement?.intrusion_zone?.avis_ia || p.comportement?.rodeur?.avis_ia
    || p.comportement?.infiltration?.avis_ia || p.action?.posture?.avis_ia || null;
}

export function avisIALibelle(avisIA) {
  if (avisIA.resultat === 'suspect') return { label: 'SUSPECT', couleur: '#e11d48', fond: 'rgba(225,29,72,0.12)' };
  if (avisIA.resultat === 'incertain') return { label: 'INCERTAIN', couleur: '#64748b', fond: 'rgba(148,163,184,0.12)' };
  return { label: 'NORMAL', couleur: '#059669', fond: 'rgba(5,150,105,0.12)' };
}

export function mapPersonneApi(p, idx, camCtx) {
  const statut = statutIdentite(p.statut);
  const rodeur = rodeurInfo(p.comportement?.rodeur);
  const regard = regardInfo(p.comportement?.regarde_autour);
  const infiltration = infiltrationInfo(p.comportement?.infiltration);
  const intrusionZone = intrusionZoneInfo(p.comportement?.intrusion_zone);
  const disparus = p.comportement?.objets_disparus || [];
  const riskPct = Math.min(100, Math.max(rodeur.risk, regard.risk, infiltration.risk, intrusionZone.risk, disparus.length ? 90 : 0));
  const avisIA = avisIADe(p);
  const id = p.id || `personne_${camCtx.id_camera}_${idx}`;

  return {
    id,
    isObject: false,
    radarPos: stableRadarPos(id),
    camCtx,
    statusLabel: statut.label,
    statusClass: statut.cls,
    riskPct,
    riskLevel: riskPct >= 70 ? 'high' : riskPct >= 40 ? 'med' : 'low',
    volProbable: disparus.map((d) => ({ label: d.label, avisIA: d.avis_ia || null })),
    rodage: rodeur.texte,
    rodageClass: rodeur.cls,
    regard: regard.texte,
    regardClass: regard.cls,
    infiltration: infiltration.texte,
    infiltrationClass: infiltration.cls,
    intrusionZone: intrusionZone.texte,
    intrusionZoneClass: intrusionZone.cls,
    intrusionZoneActive: !!p.comportement?.intrusion_zone?.intrusion,
    dejaSuspectAilleurs: p.comportement?.deja_suspect_ailleurs || null,
    avisIA,
    visage: p.visage_detecte ? 'Oui' : 'Non',
    visageClass: p.visage_detecte ? 'ok' : 'neutre',
    genre: p.genre || 'Inconnu',
    posture: p.action?.posture?.position || 'inconnue',
    activite: p.action?.posture?.activite || 'inconnue',
    box_visage: p.box_visage || null,
    box_corps: p.box_corps || null,
    est_suspect: p.est_suspect !== undefined ? p.est_suspect : (riskPct >= 60 || statut.cls === 'warn'),
    nom: p.nom || null,
    matricule: p.matricule || null,
    motif_suspicion: p.motif_suspicion || (riskPct >= 60 ? 'Comportement suspect détecté' : null),
    clothes: (p.vetements || []).map((v) => ({
      name: `${v.type}${v.couleur ? ' (' + v.couleur + ')' : ''}`,
      color: couleurVersHex(v.couleur),
    })),
  };
}

export function mapObjetInstanceApi(nomFr, instance, camCtx) {
  const a = instance.abandonne || {};
  const id = `${camCtx.id_camera}-${nomFr}-${instance.id}`;
  let statusLabel, statusClass, riskPct;
  if (a.abandonne && a.statut === 'confirme') {
    statusLabel = `Abandonné, ${formatDuree(a.depuis_secondes_sans_personne)}`;
    statusClass = 'danger';
    riskPct = 90;
  } else if (instance.confirme) {
    statusLabel = 'Confirmé';
    statusClass = 'ok';
    riskPct = 15;
  } else {
    statusLabel = 'En observation';
    statusClass = 'neutre';
    riskPct = 10;
  }
  const pos = instance.position;
  const zoneTexte = Array.isArray(pos) ? `Position (${Math.round(pos[0])}, ${Math.round(pos[1])})` : 'Position inconnue';

  return {
    id,
    isObject: true,
    radarPos: stableRadarPos(id),
    camCtx,
    label: `${nomFr}${a.abandonne ? ' — potentiellement abandonné' : ''}`,
    type: nomFr,
    statusLabel,
    statusClass,
    riskPct,
    riskLevel: riskPct >= 70 ? 'high' : riskPct >= 40 ? 'med' : 'low',
    zone: zoneTexte,
    immobileDuree: formatDuree(a.depuis_secondes_sans_personne ?? instance.depuis_secondes),
    proprietaire: 'Non identifié',
    avisIA: a.avis_ia || null,
    clothes: [],
  };
}

export function mapFeuFumeeAlerte(a, camCtx) {
  const risk = a.statut === 'propagation' ? 100 : 92;
  const pos = a.position;
  const id = `${camCtx.id_camera}-feu_fumee-${a.foyer_id}`;
  return {
    id,
    isObject: true,
    radarPos: stableRadarPos(id),
    camCtx,
    label: a.statut === 'propagation' ? `Propagation de ${a.type}` : `Foyer de ${a.type} confirmé`,
    type: a.type,
    statusLabel: a.statut === 'propagation' ? 'Propagation en cours' : 'Foyer confirmé',
    statusClass: 'danger',
    riskPct: risk,
    riskLevel: 'high',
    zone: Array.isArray(pos) ? `Position (${Math.round(pos[0])}, ${Math.round(pos[1])})` : 'Position inconnue',
    immobileDuree: formatDuree(a.depuis_secondes),
    proprietaire: 'Alerte incendie — intervention immédiate',
    clothes: [],
  };
}

// Fiche complète attendue par PrecursorDetailModal (voir
// components/PrecursorDetailModal.jsx), construite à partir d'une cible
// réelle —
// partagée par DashboardView (top-6) ET CiblesView (Personnes/Objets,
// listing complet) pour ne pas dupliquer cette traduction à deux endroits.
export function construireFicheDetail(item) {
  if (!item) return null;
  const lieu = `${item.camCtx?.batiment || '?'} / ${item.camCtx?.piece || '?'}`;
  const camera = `${item.camCtx?.num || item.camCtx?.id_camera || '?'}`;
  const image = item.camCtx?.id_camera ? `/cameras/${item.camCtx.id_camera}/image` : '';
  const isUrgent = item.riskLevel === 'high';
  const status = isUrgent ? 'Danger Immédiat' : item.riskLevel === 'med' ? 'À surveiller' : 'Normal';

  if (item.isObject) {
    return {
      title: item.label,
      subtitle: item.type,
      camera, location: lieu,
      duration: item.immobileDuree ? `Immobile depuis ${item.immobileDuree}` : '',
      status, isUrgent, image,
      actionSummary: item.avisIA ? `Évaluation : ${item.avisIA.resultat}` : 'Aucune évaluation disponible pour l\'instant',
      idAlerte: item.idAlerte || item.id_alerte || (typeof item.id === 'string' && item.id.startsWith('alert-') ? item.id.replace('alert-', '') : null),
      idCamera: item.camCtx?.id_camera || null,
      details: [
        { label: 'Zone', val: item.zone || '?' },
        { label: 'Statut', val: item.statusLabel },
        { label: 'Propriétaire', val: item.proprietaire || 'Non identifié' },
      ],
    };
  }

  return {
    title: item.id,
    subtitle: item.genre || 'Genre inconnu',
    camera, location: lieu,
    duration: item.rodage || '',
    status, isUrgent, image,
    idAlerte: item.idAlerte || item.id_alerte || (typeof item.id === 'string' && item.id.startsWith('alert-') ? item.id.replace('alert-', '') : null),
    idCamera: item.camCtx?.id_camera || null,
    actionSummary: item.avisIA ? `Évaluation : ${item.avisIA.resultat} (${Math.round((item.avisIA.confiance || 0) * 100)}%)` : 'Aucune évaluation disponible pour l\'instant',
    details: [
      { label: 'Statut d\'identité', val: item.statusLabel },
      { label: 'Genre', val: item.genre || 'Inconnu' },
      { label: 'Posture', val: item.posture },
      { label: 'Activité', val: item.activite },
      { label: 'Rôdage', val: item.rodage },
      { label: 'Regard', val: item.regard },
      { label: 'Infiltration', val: item.infiltration },
      { label: 'Zone non autorisée', val: item.intrusionZone },
      { label: 'Visage détecté', val: item.visage },
      { label: 'Vêtements', val: item.clothes?.length ? item.clothes.map((c) => c.name).join(', ') : 'Non identifiés' },
    ],
  };
}

export function mapZoneSuspecte(z, idx, camCtx) {
  const cls = (z.statut === 'a_verifier_trop_stable' || z.statut === 'prolonge') ? 'danger' : 'warn';
  const risk = cls === 'danger' ? 90 : 60;
  const libelle = z.statut === 'a_verifier_trop_stable'
    ? 'Zone à vérifier, présence très prolongée'
    : z.statut === 'prolonge'
      ? 'Zone avec présence prolongée'
      : 'Présence prolongée non identifiée';
  const idZone = `${camCtx.id_camera}-zone-${idx}`;
  return {
    id: idZone,
    isObject: true,
    radarPos: stableRadarPos(idZone),
    camCtx,
    label: libelle,
    type: 'zone de surveillance',
    statusLabel: libelle,
    statusClass: cls,
    riskPct: risk,
    riskLevel: risk >= 70 ? 'high' : 'med',
    zone: 'Personne non identifiée dans cette zone',
    immobileDuree: formatDuree(z.depuis_secondes),
    proprietaire: 'Non identifié',
    clothes: [],
  };
}
