#!/bin/bash
# =============================================================================
# PREVIA - Script d'installation et de démarrage automatique sur Raspberry Pi 4
# =============================================================================
set -e

echo "======================================================================"
echo "  🛡️  INSTALLATION DU SERVEUR CENTRAL PREVIA SUR RASPBERRY PI 4"
echo "======================================================================"

# 1. Mise à jour du système & paquets requis
echo -e "\n[1/5] 📦 Installation des paquets système requis..."
sudo apt update
sudo apt install -y \
    python3 \
    python3-pip \
    python3-venv \
    ffmpeg \
    nodejs \
    npm \
    libgl1 \
    libglib2.0-0 \
    avahi-daemon \
    avahi-utils \
    git \
    curl

# Accès matériel aux nœuds de décodage GPU V4L2 M2M
sudo usermod -aG video "$(whoami)" || true

# 2. Installation des dépendances Python
echo -e "\n[2/5] 🐍 Installation des dépendances IA & Backend..."
pip3 install --break-system-packages \
    fastapi \
    uvicorn \
    cryptography \
    opencv-python-headless \
    numpy \
    ultralytics \
    onnxruntime \
    zeroconf \
    pydantic \
    requests \
    websockets \
    python-multipart

# 3. Installation des dépendances Frontend Web
echo -e "\n[3/5] 🌐 Installation des dépendances de l'interface Web..."
cd "$(dirname "$0")/migration/frontend/web"
npm install --legacy-peer-deps
cd ../../../

# 4. Permissions d'exécution
chmod +x lancer_previa.py

# 5. Création du service systemd de démarrage automatique (optionnel mais recommandé)
echo -e "\n[4/5] ⚙️  Configuration du démarrage automatique (Service Systemd)..."
SERVICE_PATH="/etc/systemd/system/previa.service"
CURRENT_DIR="$(pwd)"
CURRENT_USER="$(whoami)"

sudo bash -c "cat <<EOF > $SERVICE_PATH
[Unit]
Description=PREVIA Central Security Server
After=network.target

[Service]
Type=simple
User=$CURRENT_USER
WorkingDirectory=$CURRENT_DIR
ExecStart=/usr/bin/python3 $CURRENT_DIR/lancer_previa.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF"

sudo systemctl daemon-reload
sudo systemctl enable previa.service

echo -e "\n[5/5] 🚀 Démarrage du serveur PREVIA..."
sudo systemctl restart previa.service

IP_LOCALE=$(hostname -I | awk '{print $1}')

echo -e "\n======================================================================"
echo "  ✅ INSTALLATION TERMINÉE AVEC SUCCÈS SUR RASPBERRY PI 4 !"
echo "======================================================================"
echo "  🖥️  Interface Web (Réseau Local) : https://${IP_LOCALE}:5173"
echo "  🔗  Nom de domaine Local         : https://previa.local:5173"
echo "  📖  API & Documentation          : https://${IP_LOCALE}:8012/docs"
echo "======================================================================"
echo "  ℹ️  Le service tourne en tâche de fond et redémarrera automatiquement au boot."
echo "      - Pour voir les logs : journalctl -u previa.service -f"
echo "      - Pour redémarrer    : sudo systemctl restart previa.service"
echo "      - Pour arrêter       : sudo systemctl stop previa.service"
echo -e "======================================================================\n"
