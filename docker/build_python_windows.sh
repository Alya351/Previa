#!/bin/sh
# Reconstruit docker/python-windows/ -- le Python portable (embeddable,
# officiel python.org) + `zeroconf`/`ifaddr` déjà installés dedans, que
# previastart.bat utilise pour annoncer previa.local (mDNS) sur un PC
# Windows qui n'a pas déjà Python (le cas le plus courant : Windows ne
# fournit jamais Python par défaut). Voir previastart.bat et
# LISEZMOI_PARTAGE.md pour l'utilisation.
#
# PAS versionné dans git (voir .gitignore, même principe que
# docker/wheels/, previa.tar, models.zip : gros binaires téléchargés,
# jamais du code source) -- relancer ce script pour le reconstruire,
# ou juste pour changer de version Python/zeroconf.
#
# Usage (depuis n'importe où) :
#   ./build_python_windows.sh
#
# Nécessite un accès réseau (python.org + PyPI) -- contrairement au
# reste du projet, cette étape n'a pas besoin d'être hors-ligne : elle
# ne tourne qu'une fois, ici, pour PRÉPARER le paquet à envoyer, pas
# chez la personne qui le reçoit.
set -e
cd "$(dirname "$0")"

PYTHON_VERSION="3.12.10"
ZEROCONF_VERSION="0.151.3"
DEST="python-windows"

rm -rf "$DEST"
mkdir -p "$DEST"

echo "build_python_windows : téléchargement de Python $PYTHON_VERSION (embeddable, Windows amd64)..."
curl -sL -o /tmp/python-embed.zip \
    "https://www.python.org/ftp/python/${PYTHON_VERSION}/python-${PYTHON_VERSION}-embed-amd64.zip"
unzip -q /tmp/python-embed.zip -d "$DEST"
rm -f /tmp/python-embed.zip

echo "build_python_windows : téléchargement de zeroconf $ZEROCONF_VERSION + ifaddr (roues Windows/cp312)..."
mkdir -p /tmp/pywin_wheels
pip download "zeroconf==${ZEROCONF_VERSION}" ifaddr --no-deps -d /tmp/pywin_wheels \
    --platform win_amd64 --python-version 312 --implementation cp --abi cp312 --only-binary=:all: --quiet

mkdir -p "$DEST/site-packages"
for whl in /tmp/pywin_wheels/*.whl; do
    unzip -q "$whl" -d "$DEST/site-packages"
done
rm -rf /tmp/pywin_wheels

# `._pth` de l'embeddable Python : contrôle explicitement sys.path (pas
# de site-packages par défaut, contrairement à une install normale) --
# réécrit entièrement (plutôt que d'éditer le fichier téléchargé, en
# CRLF natif Windows) pour ajouter juste le dossier où on vient
# d'installer zeroconf/ifaddr, en LF propre -- pas besoin de `import
# site` pour ça, ces deux paquets n'utilisent aucun mécanisme .pth
# avancé. Nom du zip stdlib = "python" + version sans point (ex.
# "python312.zip" pour 3.12.x), convention fixe de ce paquet officiel.
ZIP_STDLIB="python$(echo "$PYTHON_VERSION" | cut -d. -f1,2 | tr -d .).zip"
PTH_FILE=$(ls "$DEST"/python3*._pth)
cat > "$PTH_FILE" <<EOF
$ZIP_STDLIB
.
site-packages

# Uncomment to run site.main() automatically
#import site
EOF

echo "build_python_windows : terminé -- $(du -sh "$DEST" | cut -f1)"
