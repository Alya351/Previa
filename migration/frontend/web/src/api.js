// Base de l'API PREVIA (backend FastAPI, voir migration/backend/,
// toujours sur le port 8012 — JAMAIS 8011, qui est le port de l'ancien
// backend/ utilisé par previarun).
//
// Chaîne VIDE exprès, PAS `https://<hôte>:8012` : le frontend n'appelle
// plus jamais le port 8012 directement depuis le navigateur — voir le
// proxy dans vite.config.js, qui relaie ces mêmes chemins vers le
// backend en interne (serveur à serveur). Avant ce proxy, chaque appel
// partait vers un port ET un certificat auto-signé DIFFÉRENTS de ceux
// de la page — sur un téléphone qui n'avait accepté que le certificat
// de la page, ces appels échouaient en silence ("Impossible de charger
// la liste des caméras enregistrées") jusqu'à ce qu'on aille accepter
// le second avertissement à la main, sur une URL qu'on ne visite
// jamais autrement. Avec API_BASE vide, `${API_BASE}/cameras` devient
// juste `/cameras` — même origine, même port, même certificat déjà
// accepté que la page elle-même.
export const API_BASE = '';

// Construit une URL WebSocket vers le backend
export function urlFluxWebSocket(chemin) {
  const protocole = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocole}//${window.location.host}${chemin}`;
}

// ============================================================================
// APIS CAMÉRAS — Gestion, Flux Vidéo, IA et Zones
// ============================================================================

// 1. Lister toutes les caméras
export function listerCameras() {
  return fetch(`${API_BASE}/cameras`).then(jsonOuErreur);
}

// 2. Créer / Enregistrer une nouvelle caméra
export function creerCamera({ idAdmin, num, pieceId, estEntree = false, urlFlux = null }) {
  return fetch(`${API_BASE}/cameras`, {
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
  return fetch(`${API_BASE}/cameras/${idCamera}`).then(jsonOuErreur);
}

// 4. Modifier une caméra existante
export function mettreAJourCamera(idCamera, { idAdmin, num, pieceId, estEntree, urlFlux }) {
  return fetch(`${API_BASE}/cameras/${idCamera}`, {
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
  return fetch(`${API_BASE}/cameras/${idCamera}`, { method: 'DELETE' }).then(jsonOuErreur);
}

// 6. Obtenir le dernier état d'analyse IA de la caméra (personnes & objets)
export function chargerEtatCamera(idCamera) {
  return fetch(`${API_BASE}/cameras/${idCamera}/etat`).then(jsonOuErreur);
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
  return fetch(`${API_BASE}/cameras/tester_flux`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ url_flux: urlFlux }),
  }).then(jsonOuErreur);
}

// 8. Envoyer une frame d'analyse d'objets & feu/fumée (/voir)
export async function envoyerFrameVoir(idCamera, imageBlob) {
  const form = new FormData();
  form.append('file', imageBlob, 'frame.jpg');
  const res = await fetch(`${API_BASE}/cameras/${idCamera}/voir`, {
    method: 'POST',
    body: form,
  });
  return jsonOuErreur(res);
}

// 9. Envoyer une frame d'analyse de personnes & posture (/qui)
export async function envoyerFrameQui(idCamera, imageBlob) {
  const form = new FormData();
  form.append('file', imageBlob, 'frame.jpg');
  const res = await fetch(`${API_BASE}/cameras/${idCamera}/qui`, {
    method: 'POST',
    body: form,
  });
  return jsonOuErreur(res);
}

// 10. Charger la zone interdite configurée pour une caméra
export function chargerZoneCamera(idCamera) {
  return fetch(`${API_BASE}/cameras/${idCamera}/zone`).then(jsonOuErreur);
}

// 11. Enregistrer / Mettre à jour une zone interdite
export function enregistrerZoneCamera(idCamera, idAdmin, points, nomZone = '', plageHoraire = null) {
  return fetch(`${API_BASE}/cameras/${idCamera}/zone`, {
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
  return fetch(`${API_BASE}/cameras/${idCamera}/zone`, { method: 'DELETE' }).then(jsonOuErreur);
}

// 13. URLs WebSocket de streaming direct WebRTC
export function urlDirectEmettre(idCamera) {
  return urlFluxWebSocket(`/cameras/${idCamera}/direct/emettre`);
}
export function urlDirectRegarder(idCamera) {
  return urlFluxWebSocket(`/cameras/${idCamera}/direct/regarder`);
}


// État réel de l'alarme physique (lampe + sirène pilotées par l'ESP32,
// voir Infrastructure/alarme_physique.py côté backend). Déclenchée
// automatiquement à l'enregistrement d'une alerte critique
// (feu_fumee/intrusion_zone/infiltration, voir Alertes/alertes.py), à
// arrêter/réarmer manuellement depuis ici.
export function chargerEtatAlarme() {
  return fetch(`${API_BASE}/alarme/etat`).then((r) => r.json());
}
export function arreterAlarme() {
  return fetch(`${API_BASE}/alarme/arreter`, { method: 'POST' }).then((r) => r.json());
}
export function reactiverAlarme() {
  return fetch(`${API_BASE}/alarme/reactiver`, { method: 'POST' }).then((r) => r.json());
}

export function urlImageAlerte(idAlerte) {
  return `${API_BASE}/alertes/${idAlerte}/image`;
}

export function urlClipAlerte(idAlerte) {
  return `${API_BASE}/alertes/${idAlerte}/clip`;
}

// Config des ESP32 alarme (page admin "configAlerte") — voir
// Infrastructure/esp_decouverte.py côté backend pour pourquoi TOUT
// passe par ce même backend (même /systeme/esp/{id}/...) plutôt que
// d'appeler chaque ESP directement depuis ici : contenu mixte
// (HTTPS -> HTTP) bloqué par le navigateur, malgré le CORS ouvert
// côté firmware.
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

export function listerEsp() {
  return fetch(`${API_BASE}/systeme/esp`).then(jsonOuErreur);
}
export function chargerEtatEsp(idAppareil) {
  return fetch(`${API_BASE}/systeme/esp/${idAppareil}/etat`).then(jsonOuErreur);
}
export function ajouterReseauEsp(idAppareil, ssid, motDePasse) {
  return fetch(`${API_BASE}/systeme/esp/${idAppareil}/reseaux`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid, mot_de_passe: motDePasse }),
  }).then(jsonOuErreur);
}
export function supprimerReseauEsp(idAppareil, ssid) {
  return fetch(`${API_BASE}/systeme/esp/${idAppareil}/reseaux/supprimer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid }),
  }).then(jsonOuErreur);
}
export function basculerReseauEsp(idAppareil, ssid) {
  return fetch(`${API_BASE}/systeme/esp/${idAppareil}/basculer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ ssid }),
  }).then(jsonOuErreur);
}

// Licence de cette installation (code d'amorçage à 8 caractères, obtenu
// sur previa-SV, actif 1 an) — voir Infrastructure/licence.py côté
// backend. `chargerEtatLicence` fonctionne hors ligne (le backend ne
// recalcule que depuis l'horloge locale, voir sa docstring) ;
// `activerLicence` exige elle une connexion (vérifie le code en ligne).
export function chargerEtatLicence() {
  return fetch(`${API_BASE}/systeme/licence/etat`).then(jsonOuErreur);
}
export function activerLicence(code) {
  return fetch(`${API_BASE}/systeme/licence/activer`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code }),
  }).then(jsonOuErreur);
}

// Réinitialisation complète (voir Infrastructure/reboot.py) — efface
// TOUTES les données locales. Volontairement accessible sans connexion
// (page /reboot, voir App.jsx) : pensée pour le cas où justement plus
// personne ne peut se connecter.
export function reinitialiserSysteme() {
  return fetch(`${API_BASE}/systeme/reboot`, { method: 'POST' }).then(jsonOuErreur);
}

// ============================================================================
// PERSONNEL & RECONNAISSANCE FACIALE FACE ID (Persistance Backend)
// ============================================================================

export function listerPersonnel() {
  return fetch(`${API_BASE}/personnel`).then(jsonOuErreur);
}

export function enregistrerPersonnel(donnees) {
  return fetch(`${API_BASE}/personnel`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(donnees),
  }).then(jsonOuErreur);
}

export function mettreAJourPersonnel(idPersonne, modifs) {
  return fetch(`${API_BASE}/personnel/${idPersonne}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(modifs),
  }).then(jsonOuErreur);
}

export function supprimerPersonnel(idPersonne) {
  return fetch(`${API_BASE}/personnel/${idPersonne}`, {
    method: 'DELETE',
  }).then(jsonOuErreur);
}

export function verifierVisage(imageBase64) {
  return fetch(`${API_BASE}/personnel/verifier-visage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ image: imageBase64 }),
  }).then(jsonOuErreur);
}

// ============================================================================
// ALERTES & NOTIFICATIONS (Suppression & Acquittement)
// ============================================================================

export function supprimerAlerte(idAlerte) {
  return fetch(`${API_BASE}/alertes/${idAlerte}`, { method: 'DELETE' }).then(jsonOuErreur);
}

export function supprimerToutesAlertes() {
  return fetch(`${API_BASE}/alertes`, { method: 'DELETE' }).then(jsonOuErreur);
}


