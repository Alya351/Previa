#!/bin/bash
# =============================================================================
# PREVIA — Option B : un seul lien (previa-odc.duckdns.org), aiguillage par le code
#   1. Page d'accès /acces (saisie du code d'amorçage -> espace entreprise ou particulier)
#   2. Page de connexion mise à jour dans les DEUX installations (code pré-rempli,
#      type d'installation fixé, lien « Changer d'espace »)
#   3. Caddy : le cookie previa_espace envoie chaque requête vers la bonne installation
# Prérequis : installation particulier faite (bash ~/installer_particulier.sh)
# Lancer avec :  bash ~/aiguillage/installer_aiguillage.sh
# =============================================================================
set -u
DOM=previa-odc.duckdns.org
ICI=$(dirname "$(readlink -f "$0")")
ENT=/home/ec2-user/Previa/migration/frontend/web
PAR=/home/ec2-user/Previa-particulier/migration/frontend/web
[ -s ~/.nvm/nvm.sh ] && . ~/.nvm/nvm.sh
[ -d "$PAR/src" ] || { echo "ERREUR : installation particulier absente. Lancez d'abord : bash ~/installer_particulier.sh"; exit 1; }
command -v caddy >/dev/null || { echo "ERREUR : Caddy n'est pas installé."; exit 1; }

echo "=== 1. Page d'accès ==="
mkdir -p ~/previa-acces
cp "$ICI/acces/index.html" ~/previa-acces/index.html
cp "$ENT/public/logo_previa_transparent.png" ~/previa-acces/logo.png
chmod 755 ~/previa-acces && chmod 644 ~/previa-acces/*
echo "OK : ~/previa-acces"

echo "=== 2. Page de connexion (2 installations) ==="
for W in "$ENT" "$PAR"; do
  cp "$W/src/pages/login.jsx" "$W/src/pages/login.jsx.avant_aiguillage" 2>/dev/null
  cp "$ICI/login.jsx" "$W/src/pages/login.jsx"
  (cd "$W" && npm run build) || { echo "ERREUR de compilation dans $W"; cp "$W/src/pages/login.jsx.avant_aiguillage" "$W/src/pages/login.jsx"; exit 1; }
done

echo "=== 3. Caddy ==="
sudo cp /etc/caddy/Caddyfile /etc/caddy/Caddyfile.avant_aiguillage 2>/dev/null
sudo cp "$ICI/Caddyfile" /etc/caddy/Caddyfile && sudo chmod 644 /etc/caddy/Caddyfile
if caddy validate --config /etc/caddy/Caddyfile >/tmp/caddy_valid.log 2>&1; then
  echo "Configuration valide."
  sudo systemctl reset-failed caddy 2>/dev/null; sudo systemctl restart caddy
else
  echo "ERREUR : configuration refusée, ancienne configuration remise :"; tail -5 /tmp/caddy_valid.log
  sudo cp /etc/caddy/Caddyfile.avant_aiguillage /etc/caddy/Caddyfile; exit 1
fi

echo "=== 4. Vérification ==="
IP_DNS=$(getent hosts $DOM | awk '{print $1}')
if [ -z "$IP_DNS" ]; then
  echo "Le domaine $DOM n'existe pas encore sur DuckDNS : créez-le, puis : sudo systemctl restart caddy"
  exit 0
fi
sleep 30
curl -s -o /dev/null -w "Sans espace      -> %{http_code} vers %{redirect_url}\n" https://$DOM/
curl -s -o /dev/null -w "Page d'accès     -> %{http_code}\n" https://$DOM/acces
printf "Espace particulier -> "; curl -s --cookie previa_espace=particulier https://$DOM/systeme/profil; echo
printf "Espace entreprise  -> "; curl -s --cookie previa_espace=entreprise https://$DOM/systeme/profil; echo
echo
echo "Lien unique : https://$DOM"
