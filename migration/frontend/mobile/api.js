import { useState, useEffect } from 'react';
import { Platform } from 'react-native';
import Constants from 'expo-constants';

// Connexion au vrai backend PREVIA — voir migration/backend/fonctionnalites/main/main.py.
//
// IMPORTANT — pourquoi HTTP (port 8080) et pas HTTPS (port 5173, comme
// le web) : le backend/nginx utilise un certificat auto-signé. Un
// navigateur laisse l'utilisateur cliquer "continuer quand même" ;
// Expo Go, lui, n'a aucune UI pour ça et rejette silencieusement toute
// requête vers ce certificat (erreur réseau opaque, rien à faire côté
// JS). `docker/nginx.conf` expose donc un second accès, en clair, sur
// le port 8080, UNIQUEMENT pour ce client mobile en phase de test sur
// réseau local (le web continue de tout servir en HTTPS/WSS, inchangé).
// Corollaire côté Android : depuis Android 9, le HTTP en clair est
// bloqué par défaut ("CLEARTEXT communication ... not permitted") —
// voir `android.usesCleartextTraffic` dans app.json, sans quoi CETTE
// requête échoue avec exactement cette exception, réseau ou pas.
//
// IP AUTO-DÉTECTÉE, plus besoin de la coder en dur ni de la retoucher
// quand le réseau change — deux façons de tester ce projet, deux façons
// de la déduire :
//
// 1. Vrai téléphone avec Expo Go (le cas normal) : Expo Go n'a pas
//    d'origine HTTP propre, mais il connaît déjà l'adresse du PC —
//    c'est par là qu'il vient de charger le code JS lui-même.
//    `Constants.expoConfig.hostUri` vaut un truc comme
//    "192.168.1.184:8081" (rempli par Expo CLI dès qu'on est connecté
//    via `expo start`) — on en garde juste l'adresse, on change le
//    port pour celui de l'API. Vide sur le web (mécanisme propre au
//    natif), d'où le cas 2.
// 2. Preview web (navigateur ouvert sur `localhost:8081`, touche "w"
//    dans le CLI Expo) : là on est un vrai onglet de navigateur, donc
//    "même origine" marche exactement comme pour le web principal —
//    `window.location.hostname` (ex. "localhost").
function detecterAdresseServeur() {
  if (Platform.OS === 'web' && typeof window !== 'undefined' && window.location?.hostname) {
    return window.location.hostname;
  }
  const hostUri =
    Constants.expoConfig?.hostUri ||
    Constants.manifest2?.extra?.expoClient?.hostUri ||
    (Constants.linkingUri ? Constants.linkingUri.replace(/^exp:\/\//, '').replace(/^http:\/\//, '') : null) ||
    (Constants.experienceUrl ? Constants.experienceUrl.replace(/^exp:\/\//, '').replace(/^http:\/\//, '') : null);

  if (hostUri) {
    const hote = hostUri.split(':')[0];
    if (hote) return hote;
  }
  return '192.168.1.101';
}

const ADRESSE_SERVEUR = detecterAdresseServeur();

// `let`, pas `const` : quand aucune des deux méthodes ci-dessus ne
// marche (le vrai cas d'un APK autonome, installé chez quelqu'un, sans
// Metro ni navigateur — voir docker/mdns_previa.py côté serveur), on
// part chercher le serveur par découverte mDNS juste en dessous. Ça
// prend quelques secondes ; les appels API (appelApi, useImageEnDirect)
// relisent cette variable à chaque tentative, donc pas besoin d'attendre
// de façon bloquante ici — le tout premier appel échoue simplement le
// temps que la découverte aboutisse, puis les tentatives suivantes
// (polling toutes les 1-5s selon l'endroit) passent normalement.
// URL du tunnel Cloud HTTPS sécurisé de secours (Bascule automatique en 4G/5G)
const URL_TUNNEL_CLOUD_SECOURS = 'https://api-previa.ngrok-free.app';

export let API_BASE = ADRESSE_SERVEUR ? `http://${ADRESSE_SERVEUR}:8080` : null;
let modeSecoursActif = false;

function decouvrirParMdns(delaiMs = 4000) {
  if (Platform.OS === 'web') return Promise.resolve(null);
  return new Promise((resolve) => {
    let fini = false;
    let zeroconf;
    try {
      const ZeroconfModule = require('react-native-zeroconf');
      const Zeroconf = ZeroconfModule.default || ZeroconfModule;
      zeroconf = new Zeroconf();
    } catch (e) {
      resolve(null);
      return;
    }
    const terminer = (valeur) => {
      if (fini) return;
      fini = true;
      try { zeroconf?.stop?.(); } catch (e) { /* pas grave */ }
      resolve(valeur);
    };
    zeroconf.on('resolved', (service) => {
      if (service?.addresses?.length > 0) {
        const portMobile = service.txt?.http_mobile ? Number(service.txt.http_mobile) : 8080;
        terminer(`http://${service.addresses[0]}:${portMobile}`);
      }
    });
    zeroconf.on('error', () => terminer(null));
    setTimeout(() => terminer(null), delaiMs);
    try {
      zeroconf.scan('previa', 'tcp', 'local.');
    } catch (e) {
      terminer(null);
    }
  });
}

let decouverteEnCours = null;

async function assurerAdresseServeur() {
  if (API_BASE || Platform.OS === 'web') return API_BASE;
  if (!decouverteEnCours) {
    decouverteEnCours = decouvrirParMdns().finally(() => {
      decouverteEnCours = null;
    });
  }
  const trouve = await decouverteEnCours;
  if (trouve) {
    API_BASE = trouve;
    modeSecoursActif = false;
  } else if (!API_BASE) {
    // Si mDNS et l'IP locale sont injoignables (Agent en 4G/5G à l'extérieur),
    // bascule automatique transparente vers le tunnel Cloud HTTPS
    API_BASE = URL_TUNNEL_CLOUD_SECOURS;
    modeSecoursActif = true;
  }
  return API_BASE;
}

if (!API_BASE && Platform.OS !== 'web') {
  assurerAdresseServeur();
}

async function appelApi(chemin, options = {}) {
  await assurerAdresseServeur();
  if (!API_BASE) {
    throw new Error("Serveur introuvable. Vérifiez la connexion du site.");
  }
  
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const reponse = await fetch(`${API_BASE}${chemin}`, {
      headers: { 'Content-Type': 'application/json' },
      signal: controller.signal,
      ...options,
    });
    clearTimeout(timeoutId);

    if (!reponse.ok) {
      let detail = `Erreur ${reponse.status}`;
      try {
        const corps = await reponse.json();
        detail = corps?.detail || detail;
      } catch (e) { /* pas de corps JSON */ }
      throw new Error(detail);
    }
    return reponse.json();
  } catch (err) {
    // Si la tentative locale échoue (ex: passage du Wi-Fi à la 4G), bascule transparente
    if (!modeSecoursActif && URL_TUNNEL_CLOUD_SECOURS) {
      console.warn("Échec réseau local, bascule transparente vers le Tunnel Cloud 4G/5G...");
      API_BASE = URL_TUNNEL_CLOUD_SECOURS;
      modeSecoursActif = true;
      return appelApi(chemin, options);
    }
    throw err;
  }
}

// POST /utilisateurs/connexion — voir compte.authentifier() côté backend.
// Renvoie le compte (sans mot de passe) ou lève une erreur avec le
// message du backend ("Email ou mot de passe incorrect.").
export function seConnecter(email, motDePasse) {
  return appelApi('/utilisateurs/connexion', {
    method: 'POST',
    body: JSON.stringify({ email, mot_de_passe: motDePasse }),
  });
}

// GET /vue-ensemble — liste des caméras réelles + comptages, voir
// vue_ensemble.py côté backend.
export function chargerVueEnsemble() {
  return appelApi('/vue-ensemble');
}

// GET /alertes — toutes les alertes réelles, plus récentes en premier
// (voir alertes.py côté backend). Pas de pagination.
export function listerAlertes() {
  return appelApi('/alertes');
}

// Alarme physique RÉELLE (lampe + sirène, voir Infrastructure/
// alarme_physique.py côté backend et migration/arduino/esp.ino — le
// firmware ESP32 qui pilote vraiment les deux broches). "Arrêter
// l'alerte" dans App.js appelle vraiment arreterAlarme() maintenant —
// avant l'ajout de ces deux routes, ce bouton ne changeait qu'un état
// local dans le téléphone, aucun équipement réel n'était relié.
export function arreterAlarme() {
  return appelApi('/alarme/arreter', { method: 'POST' });
}

export function reactiverAlarme() {
  return appelApi('/alarme/reactiver', { method: 'POST' });
}

// URL de la dernière image reçue de cette caméra (JPEG brut, voir
// derniere_image.py côté backend). Vraie vidéo (WebRTC, comme sur le
// web) pas possible ici : react-native-webrtc est un module natif,
// absent d'Expo Go — il faudrait un build de développement personnalisé
// (`eas build --profile development`) pour l'avoir sur mobile.
export function urlImageCamera(idCamera, bust = Date.now()) {
  return `${API_BASE}/cameras/${idCamera}/image?t=${bust}`;
}

// L'image AU MOMENT où cette alerte s'est déclenchée (voir GET
// /alertes/{id}/image côté backend, alertes.py) — pas de `?t=...` ici :
// contrairement à la caméra en direct, cette image ne change JAMAIS une
// fois l'alerte créée, donc pas besoin de casser un cache. Peut ne pas
// exister (404) si aucune image n'était encore arrivée de cette caméra
// au moment de l'alerte, ou si l'alerte a été créée avant l'ajout de
// cette fonctionnalité.
export function urlImageAlerte(idAlerte) {
  return `${API_BASE}/alertes/${idAlerte}/image`;
}

// Hook : rappelle GET /cameras/{id}/image toutes les `intervalMs` et
// renvoie une data URI (base64), prête pour <Image source={{uri}}>.
//
// Pourquoi pas juste <Image source={{uri: urlImageCamera(id, tick)}}>
// avec `tick` qui change ? Ça a été le premier essai, et ça ne
// marchait pas de façon fiable sur mobile (testé en réel) : le
// composant <Image> natif (Fresco sur Android, SDWebImage-like sur
// iOS) garde son propre cache par URL et ne respecte pas forcément
// `Cache-Control: no-store` de la même façon qu'un navigateur — donc
// l'image restait figée ou clignotait au lieu de vraiment se
// rafraîchir. Ici, on repasse par `fetch()` (le même mécanisme qui
// marche déjà pour la connexion et les alertes) puis on convertit la
// réponse en data URI nous-mêmes : plus aucun cache d'image natif dans
// le chemin, chaque tick est une vraie requête réseau avec un résultat
// garanti frais.
export function useImageEnDirect(idCamera, intervalMs = 1000) {
  const [dataUri, setDataUri] = useState(null);

  useEffect(() => {
    setDataUri(null);
    if (!idCamera) return;
    let annule = false;

    const uneImage = async () => {
      try {
        const reponse = await fetch(urlImageCamera(idCamera, Date.now()));
        if (!reponse.ok) return;
        const blob = await reponse.blob();
        const lecteur = new FileReader();
        lecteur.onloadend = () => {
          if (!annule) setDataUri(lecteur.result);
        };
        lecteur.readAsDataURL(blob);
      } catch (e) {
        // Caméra hors-ligne ou réseau momentanément indisponible — on
        // garde la dernière image affichée plutôt que de casser l'UI.
      }
    };

    uneImage();
    const id = setInterval(uneImage, intervalMs);
    return () => { annule = true; clearInterval(id); };
  }, [idCamera, intervalMs]);

  return dataUri;
}

// Libellés français par type d'événement — mêmes libellés que le web
// (voir frontend/web/src/pages/admin.jsx, LABEL_TYPE_ALERTES) pour ne
// pas raconter deux histoires différentes selon l'écran.
export const LABEL_TYPE_ALERTES = {
  rodeur: 'Rôdage suspect',
  objet_abandonne: 'Objet abandonné sans surveillance',
  objet_disparu: 'Objet disparu, vol probable',
  feu_fumee: 'Feu ou fumée détecté',
  infiltration: 'Infiltration suspectée',
  intrusion_zone: 'Intrusion en zone non autorisée',
};

const TYPES_CRITIQUES = ['feu_fumee', 'intrusion_zone', 'infiltration'];

// Convertit une alerte telle que renvoyée par GET /alertes (voir
// docstring ci-dessus) vers la forme attendue par les écrans de
// App.js (déjà écrits pour cette forme-là par l'équipe frontend,
// autour de données factices — on ne change QUE la source, pas la
// forme, pour ne pas casser tout le JSX déjà écrit).
//
// `enCours` : le backend n'a aucune notion d'alerte "acquittée"/
// "résolue" (append-only, voir docstring alertes.py) — donc TOUJOURS
// vrai ici, purement un état d'affichage local.
//
// `alarmLumiere`/`sirene` : à `false` par défaut ICI (valeur
// d'affichage initiale seulement) — mais "Arrêter l'alerte"/"Réarmer"
// dans App.js appellent maintenant VRAIMENT arreterAlarme()/
// reactiverAlarme() ci-dessous, qui pilotent un vrai ESP32 (voir
// migration/arduino/esp.ino, ses broches LAMPE_PIN/SIRENE_PIN). Reste
// une petite imprécision connue : au chargement d'une alerte déjà
// critique, ces deux champs affichent `false` même si le backend a
// réellement déjà tout allumé (voir Alertes/alertes.py, activation
// automatique) — GET /alertes ne renvoie pas encore l'état de
// l'alarme, seulement GET /alarme/etat le fait.
export function nettoyerNomCamera(nom) {
  if (!nom) return 'Caméra';
  return nom.replace(/\s*\[IP\]/gi, '').trim();
}

export function mapAlerteApi(a) {
  const critique = TYPES_CRITIQUES.includes(a.type_evenement);
  const date = a.horodatage ? new Date(a.horodatage * 1000) : new Date();
  return {
    id: a.id,
    idCamera: a.id_camera,
    title: LABEL_TYPE_ALERTES[a.type_evenement] || a.description || 'Alerte',
    criticite: critique ? 'CRITIQUE' : 'MODÉRÉE',
    criticiteColor: critique ? '#dc2626' : '#009fe3',
    camera: nettoyerNomCamera(a.num || a.id_camera),
    emplacement: [a.batiment, a.piece].filter(Boolean).join(' / ') || 'Emplacement inconnu',
    time: date.toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' }),
    date: date.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }),
    fullTime: date.toLocaleTimeString('fr-FR'),
    iconType: ['objet_abandonne', 'objet_disparu'].includes(a.type_evenement) ? 'briefcase' : 'runner',
    enCours: true,
    alarmLumiere: false,
    sirene: false,
  };
}
