# Image du frontend PREVIA (voir migration/frontend/web/) — construit
# les fichiers statiques (npm run build), puis les sert via nginx +
# redirige les routes API vers le backend (remplace le proxy de
# `vite preview` utilisé en développement, voir vite.config.js — nginx
# reprend exactement le même rôle, la même liste de routes, voir
# ./nginx.conf). Contexte de construction = /home/rakine/osc/ (voir
# docker-compose.yml), d'où les chemins migration/frontend/web/...

# --- Étape 1 : construction ---
FROM node:20-alpine AS build
WORKDIR /app
COPY migration/frontend/web/package.json migration/frontend/web/package-lock.json* ./
RUN npm ci
COPY migration/frontend/web/ ./
RUN npm run build

# --- Étape 2 : service (image finale, légère) ---
FROM nginx:1.27-alpine
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

# Le certificat HTTPS (généré par le backend, voir generer_certificat.py)
# est monté en lecture seule au démarrage — voir docker-compose.yml —
# pas copié dans l'image (il change à chaque IP, l'image non).
VOLUME ["/etc/nginx/certs"]

EXPOSE 5173
