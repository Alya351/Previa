import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vite'

// HTTPS en dev, avec le MÊME certificat que le backend (voir
// backend/fonctionnalites/*/generer_certificat.py, régénéré à chaque
// démarrage de main.py pour couvrir l'IP locale courante).
const cheminCert = fileURLToPath(new URL('../../backend/certs/cert.pem', import.meta.url))
const cheminCle = fileURLToPath(new URL('../../backend/certs/key.pem', import.meta.url))
const certsPrets = existsSync(cheminCert) && existsSync(cheminCle)

const httpsConfig = certsPrets
  ? { cert: readFileSync(cheminCert), key: readFileSync(cheminCle) }
  : undefined

// Proxy vers le backend (port 8012)
const routesBackend = [
  'alarme', 'alertes', 'batiments', 'cameras', 'docs', 'openapi.json', 'personnel', 'pieces',
  'profils', 'redoc', 'static-docs', 'systeme', 'utilisateurs', 'vue-ensemble',
]
const proxy = Object.fromEntries(
  routesBackend.map((r) => [`/${r}`, { target: 'https://localhost:8012', changeOrigin: true, secure: false, ws: true }]),
)

export default defineConfig({
  esbuild: {
    jsx: 'automatic',
  },
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
