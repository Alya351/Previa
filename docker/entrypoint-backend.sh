#!/bin/sh
# Point d'entrée du conteneur backend — voir Dockerfile (backend/) et
# docker-compose.yml. Exécuté à CHAQUE démarrage du conteneur (pas
# seulement à la construction de l'image) : c'est ici que se joue "ça
# télécharge le zip des modèles tout seul si besoin".
set -e

echo "[entrypoint] vérification des modèles (migration/models/)..."
python3 telecharger_modeles.py

echo "[entrypoint] démarrage du backend PREVIA sur le port 8012..."
cd backend
exec python3 -m uvicorn fonctionnalites.main.main:app \
    --host 0.0.0.0 --port 8012 \
    --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem
