#!/bin/bash
# Ancien installateur (il démarrait un fichier lancer_previa.py qui n'a
# jamais existé). Remplacé par raspberry/installer_raspberry.sh, qui
# fonctionne pour Raspberry Pi 4 et 5.
exec bash "$(dirname "$0")/raspberry/installer_raspberry.sh" "$@"
