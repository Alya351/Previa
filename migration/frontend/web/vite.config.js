import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// HTTPS en dev, avec le MÊME certificat que le backend (voir
// backend/fonctionnalites/*/generer_certificat.py, régénéré à chaque
// démarrage de main.py pour couvrir l'IP locale courante).
//
// Pourquoi c'est nécessaire et pas juste "plus propre" : ce frontend
// tourne avec `--host` (accessible depuis le réseau local, pas juste
// localhost — cam.jsx est pensée pour un téléphone qui filme, pas
// forcément le poste admin). Or navigator.mediaDevices.getUserMedia
// n'existe QUE dans un "contexte sécurisé" : https, OU http mais
// seulement sur localhost/127.0.0.1. Servi en http sur l'IP réseau
// (http://192.168.x.x:5173), navigator.mediaDevices est carrément
// undefined dans le navigateur — "Démarrer la caméra" ne peut pas
// marcher, quel que soit le code de camera.jsx. D'où le bouton signalé
// comme "ne marche pas" dès qu'on y accède autrement que par localhost.
const cheminCert = fileURLToPath(new URL('../../backend/certs/cert.pem', import.meta.url))
const cheminCle = fileURLToPath(new URL('../../backend/certs/key.pem', import.meta.url))
const certsPrets = existsSync(cheminCert) && existsSync(cheminCle)

const httpsConfig = certsPrets
  ? { cert: readFileSync(cheminCert), key: readFileSync(cheminCle) }
  : undefined

// Proxy vers le backend (port 8012) — le frontend et le backend ont
// chacun leur propre certificat auto-signé, donc jusqu'ici un
// téléphone devait accepter DEUX avertissements différents (un par
// port) à chaque changement de réseau, ce qui cassait /cameras en
// silence tant que le deuxième n'était pas accepté. Avec ce proxy, le
// navigateur ne parle JAMAIS directement au port 8012 : toutes les
// requêtes vers ces chemins partent vers CE serveur (5173, déjà
// accepté), qui les relaie lui-même vers le backend en interne
// (serveur à serveur, hors du navigateur — `secure:false` car c'est
// NOUS qui parlons au certificat auto-signé, pas le téléphone). Un seul
// avertissement à accepter, plus jamais deux. Liste = les préfixes de
// route réels de fonctionnalites/main/main.py (voir aussi src/api.js).
const routesBackend = [
  'alarme', 'alertes', 'batiments', 'cameras', 'docs', 'openapi.json', 'pieces',
  'profils', 'redoc', 'static-docs', 'systeme', 'utilisateurs', 'vue-ensemble',
]
// `ws: true` : laisse aussi passer la mise à niveau WebSocket (voir
// Infrastructure/flux_direct.py côté backend, .../flux/emettre et
// .../flux/regarder sous /cameras) — sans ça, seules les requêtes HTTP
// classiques passeraient par ce proxy, pas les WebSocket.
const proxy = Object.fromEntries(
  routesBackend.map((r) => [`/${r}`, { target: 'https://localhost:8012', changeOrigin: true, secure: false, ws: true }]),
)

export default defineConfig({
  plugins: [react()],
  server: {
    host: true,
    https: httpsConfig,
    proxy,
  },
  // `vite preview` sert le build de production (dist/, un seul gros
  // fichier JS déjà assemblé) au lieu du mode dev (des dizaines de
  // petits fichiers chargés un par un, module par module) — bien plus
  // rapide à charger sur un réseau mobile/hotspot, où chaque aller-
  // retour compte. Même port (5173) et même certificat que server.https
  // ci-dessus : un téléphone qui a déjà accepté le certificat sur ce
  // port n'a rien à re-valider en passant de l'un à l'autre.
  preview: {
    host: true,
    https: httpsConfig,
    port: 5173,
    proxy,
  },
})
