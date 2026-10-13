// Base de l'API PREVIA (backend FastAPI, voir migration/backend/,
// toujours sur le port 8012 — JAMAIS 8011, qui est le port de l'ancien
// backend/ utilisé par previarun).
//
// Chaîne VIDE exprès, PAS `https://<hôte>:8012` : le frontend n'appelle
// plus jamais le port 8012 directement depuis le navigateur — voir le
// proxy dans vite.config.js, qui relaie ces mêmes chemins vers le
// backend en interne (serveur à serveur).
export const API_BASE = '';

// Helper pour injecter le jeton de session dans les en-têtes HTTP
export function entetesAuth(headers = {}) {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('previa_token') : null;
  const res = { ...headers };
  if (token) {
    res['Authorization'] = `Bearer ${token}`;
  }
  return res;
}

// Wrapper fetch automatique avec jeton d'authentification Bearer
export function fetchAvecAuth(url, options = {}) {
  const headers = entetesAuth(options.headers || {});
  return fetch(url, { ...options, headers });
}

// Construit une URL WebSocket vers le backend
export function urlFluxWebSocket(chemin) {
  const protocole = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocole}//${window.location.host}${chemin}`;
}

async function jsonOuErreur(reponse) {
  if (!reponse.ok) {
    let detail = `Erreur ${reponse.status}`;
    try {
      const corps = await reponse.json();
      detail = corps?.detail || detail;
    } catch (e) { /* pas de corps JSON */ }
    throw new Error(detail);
  }
  return reponse.json();
}

// ============================================================================
// BÂTIMENTS & PIÈCES
// ============================================================================

export function listerBatiments() {
  return fetchAvecAuth(`${API_BASE}/batiments`).then(jsonOuErreur);
}

export function listerPieces(batimentId = null) {
  const url = batimentId ? `${API_BASE}/pieces?batiment_id=${batimentId}` : `${API_BASE}/pieces`;
  return fetchAvecAuth(url).then(jsonOuErreur);
}

// ============================================================================
// APIS CAMÉRAS — Gestion, Flux Vidéo, IA et Zones
// ============================================================================

// 1. Lister toutes les caméras
export function listerCameras() {
  return fetchAvecAuth(`${API_BASE}/cameras`).then(jsonOuErreur);
}

// 2. Créer / Enregistrer une nouvelle caméra
export function creerCamera({ idAdmin, num, pieceId, estEntree = false, urlFlux = null }) {
  return fetchAvecAuth(`${API_BASE}/cameras`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_admin: idAdmin,
      num,
      piece_id: pieceId,
      est_entree: estEntree,
      url_flux: urlFlux,
    }),
  }).then(jsonOuErreur);
}

// 3. Charger les informations d'une caméra
export function chargerCamera(idCamera) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}`).then(jsonOuErreur);
}

// 4. Modifier une caméra existante
export function mettreAJourCamera(idCamera, { idAdmin, num, pieceId, estEntree, urlFlux }) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_admin: idAdmin,
      num,
      piece_id: pieceId,
      est_entree: estEntree,
      url_flux: urlFlux,
    }),
  }).then(jsonOuErreur);
}

// 5. Supprimer une caméra
export function supprimerCamera(idCamera) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}`, { method: 'DELETE' }).then(jsonOuErreur);
}

// 6. Obtenir le dernier état d'analyse IA de la caméra (personnes & objets)
export function chargerEtatCamera(idCamera) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/etat`).then(jsonOuErreur);
}

// 7. URL de la dernière image capturée en direct
export function urlImageCamera(idCamera) {
  return `${API_BASE}/cameras/${idCamera}/image`;
}

// 7b. URL du flux vidéo continu MJPEG en direct pour caméra RTSP
export function urlFluxCamera(idCamera) {
  return `${API_BASE}/cameras/${idCamera}/flux`;
}

// 7c. Tester un flux RTSP
export function testerFluxRtsp(urlFlux) {
  return fetchAvecAuth(`${API_BASE}/cameras/tester_flux`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url_flux: urlFlux }),
  }).then(jsonOuErreur);
}

// 8. Envoyer une frame d'analyse d'objets & feu/fumée (/voir)
export async function envoyerFrameVoir(idCamera, imageBlob) {
  const form = new FormData();
  form.append('file', imageBlob, 'frame.jpg');
  const res = await fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/voir`, {
    method: 'POST',
    body: form,
  });
  return jsonOuErreur(res);
}

// 9. Envoyer une frame d'analyse de personnes & posture (/qui)
export async function envoyerFrameQui(idCamera, imageBlob) {
  const form = new FormData();
  form.append('file', imageBlob, 'frame.jpg');
  const res = await fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/qui`, {
    method: 'POST',
    body: form,
  });
  return jsonOuErreur(res);
}

// 10. Charger la zone interdite configurée pour une caméra
export function chargerZoneCamera(idCamera) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/zone`).then(jsonOuErreur);
}

// 11. Enregistrer / Mettre à jour une zone interdite
export function enregistrerZoneCamera(idCamera, idAdmin, points, nomZone = '', plageHoraire = null) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/zone`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      id_admin: idAdmin,
      points,
      nom_zone: nomZone,
      plage_horaire: plageHoraire,
    }),
  }).then(jsonOuErreur);
}

// 12. Supprimer la zone interdite d'une caméra
export function supprimerZoneCamera(idCamera) {
  return fetchAvecAuth(`${API_BASE}/cameras/${idCamera}/zone`, { method: 'DELETE' }).then(jsonOuErreur);
}

// 13. URLs WebSocket de streaming direct WebRTC
export function urlDirectEmettre(idCamera) {
  return urlFluxWebSocket(`/cameras/${idCamera}/direct/emettre`);
}
export function urlDirectRegarder(idCamera) {
  return urlFluxWebSocket(`/cameras/${idCamera}/direct/regarder`);
}

// État réel de l'alarme physique (lampe + sirène pilotées par l'ESP32)
export function chargerEtatAlarme() {
  return fetchAvecAuth(`${API_BASE}/alarme/etat`).then((r) => r.json());
}
export function arreterAlarme() {
  return fetchAvecAuth(`${API_BASE}/alarme/arreter`, { method: 'POST' }).then((r) => r.json());
}
export function reactiverAlarme() {
  return fetchAvecAuth(`${API_BASE}/alarme/reactiver`, { method: 'POST' }).then((r) => r.json());
}

export function urlImageAlerte(idAlerte) {
  return `${API_BASE}/alertes/${idAlerte}/image`;
}

export function urlClipAlerte(idAlerte) {
  return `${API_BASE}/alertes/${idAlerte}/clip`;
}

// Config des ESP32 alarme
export function listerEsp() {
  return fetchAvecAuth(`${API_BASE}/systeme/esp`).then(jsonOuErreur);
}
export function chargerEtatEsp(idAppareil) {
  return fetchAvecAuth(`${API_BASE}/systeme/esp/${idAppareil}/etat`).then(jsonOuErreur);
}
export function ajouterReseauEsp(idAppareil, ssid, motDePasse) {
  return fetchAvecAuth(`${API_BASE}/systeme/esp/${idAppareil}/reseaux`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid, mot_de_passe: motDePasse }),
  }).then(jsonOuErreur);
}
export function supprimerReseauEsp(idAppareil, ssid) {
  return fetchAvecAuth(`${API_BASE}/systeme/esp/${idAppareil}/reseaux/supprimer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid }),
  }).then(jsonOuErreur);
}
export function basculerReseauEsp(idAppareil, ssid) {
  return fetchAvecAuth(`${API_BASE}/systeme/esp/${idAppareil}/basculer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid }),
  }).then(jsonOuErreur);
}

// Licence
export function chargerEtatLicence() {
  return fetchAvecAuth(`${API_BASE}/systeme/licence/etat`).then(jsonOuErreur);
}
export function activerLicence(code) {
  return fetchAvecAuth(`${API_BASE}/systeme/licence/activer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(jsonOuErreur);
}

// Réinitialisation système
export function reinitialiserSysteme() {
  return fetchAvecAuth(`${API_BASE}/systeme/reboot`, { method: 'POST' }).then(jsonOuErreur);
}

// ============================================================================
// PERSONNEL & RECONNAISSANCE FACIALE FACE ID
// ============================================================================

export function listerPersonnel() {
  return fetchAvecAuth(`${API_BASE}/personnel`).then(jsonOuErreur);
}

export function enregistrerPersonnel(donnees) {
  return fetchAvecAuth(`${API_BASE}/personnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(donnees),
  }).then(jsonOuErreur);
}

export function mettreAJourPersonnel(idPersonne, modifs) {
  return fetchAvecAuth(`${API_BASE}/personnel/${idPersonne}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(modifs),
  }).then(jsonOuErreur);
}

export function supprimerPersonnel(idPersonne) {
  return fetchAvecAuth(`${API_BASE}/personnel/${idPersonne}`, {
    method: 'DELETE',
  }).then(jsonOuErreur);
}

export function verifierVisage(imageBase64) {
  return fetchAvecAuth(`${API_BASE}/personnel/verifier-visage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  }).then(jsonOuErreur);
}

// ============================================================================
// ALERTES & NOTIFICATIONS (Suppression & Acquittement)
// ============================================================================

export function supprimerAlerte(idAlerte) {
  return fetchAvecAuth(`${API_BASE}/alertes/${idAlerte}`, { method: 'DELETE' }).then(jsonOuErreur);
}

export function supprimerToutesAlertes() {
  return fetchAvecAuth(`${API_BASE}/alertes`, { method: 'DELETE' }).then(jsonOuErreur);
}

export function traiterAlerte(idAlerte, traitement, motif = "", auteur = "Opérateur") {
  return fetchAvecAuth(`${API_BASE}/alertes/${idAlerte}/traiter`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ traitement, motif, auteur }),
  }).then(jsonOuErreur);
}

export function obtenirJournalActions() {
  return fetchAvecAuth(`${API_BASE}/journal-actions`).then(jsonOuErreur);
}

export function ObtenirUrlExportCSV() {
  const token = typeof sessionStorage !== 'undefined' ? sessionStorage.getItem('previa_token') : null;
  return token ? `${API_BASE}/export/alertes/csv?token=${encodeURIComponent(token)}` : `${API_BASE}/export/alertes/csv`;
}
