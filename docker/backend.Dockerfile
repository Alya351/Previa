# Image du backend PREVIA (voir migration/backend/) — construite depuis
# /home/rakine/osc/ (contexte = le dossier PARENT de docker/ ET de
# migration/, voir docker-compose.yml : context: .., dockerfile:
# docker/backend.Dockerfile), pour pouvoir copier à la fois le code
# (../migration/) et les paquets Python déjà téléchargés (./wheels/).
#
# `wheels/` contient TOUS les paquets Python déjà présents sur cette
# machine (récupérés depuis le cache pip local, voir la commande qui a
# rempli ce dossier) — l'installation ci-dessous se fait avec
# --no-index --find-links=/wheels, donc AUCUN accès réseau requis pour
# construire cette image. Ça règle le vrai problème rencontré : les
# téléchargements de paquets volumineux (torch...) qui s'interrompaient
# au hasard depuis cette session.
FROM python:3.12-slim

# Bibliothèques système dont opencv-headless, onnxruntime et torch ont
# besoin même "headless" (libGL.so.1 est réclamé par cv2 au chargement
# malgré le nom du paquet — sans ça, ImportError au premier `import cv2`).
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgl1 libglib2.0-0 libgomp1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Paquets Python — depuis les wheels locaux uniquement, aucun réseau.
COPY docker/wheels /wheels
COPY migration/backend/requirements.txt backend/requirements.txt
RUN pip install --no-cache-dir --no-index --find-links=/wheels \
    -r backend/requirements.txt \
    && rm -rf /wheels

# Code du backend + le script de téléchargement des modèles (attend
# d'être à la racine de migration/, voir sa docstring — DOSSIER_MODELES
# = dossier du script / "models").
COPY migration/backend/ backend/
COPY migration/telecharger_modeles.py .

# models/, db/ et backend/certs/ ne sont PAS copiés dans l'image : montés
# en volumes (voir docker-compose.yml) pour que l'image reste légère et
# que modèles/données/certificats survivent aux reconstructions de
# l'image. `db/` (comptes, caméras, alertes, historique — voir
# local_store.py, rapport_cam.py, etat_persistant.py, tous résolus en
# Path(__file__)....parent.parent.parent.parent / "db", donc /app/db
# ici) manquait ici jusqu'à maintenant : sans volume, tout repartait de
# zéro à chaque fois que le conteneur était recréé (`docker compose down`
# puis `up`, ou une reconstruction d'image) — bug réel constaté en test,
# pas juste une impression.
VOLUME ["/app/models", "/app/db", "/app/backend/certs"]

EXPOSE 8012

COPY docker/entrypoint-backend.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]
