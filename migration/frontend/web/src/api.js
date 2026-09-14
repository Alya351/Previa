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

// Construit une URL WebSocket vers le backend, en passant par le MÊME
// proxy que le reste (voir la docstring ci-dessus) — même origine, même
// certificat déjà accepté, juste `https:`/`wss:` au lieu de
// `http:`/`ws:` selon la page. Utilisé pour le flux caméra en direct
// (voir Infrastructure/flux_direct.py côté backend, camera.jsx et
// components/LiveCameraGrid.jsx/CameraViewModal.jsx côté frontend).
export function urlFluxWebSocket(chemin) {
  const protocole = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${protocole}//${window.location.host}${chemin}`;
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
