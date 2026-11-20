@echo off
title PREVIA - Relais cameras (redemarrage automatique)
cd /d "%~dp0"
rem Relance le relais s'il s'arrete (erreur OpenCV, coupure reseau...). Fermer cette fenetre pour l'arreter.
:boucle
echo [%date% %time%] Demarrage du relais cameras...
python relais_cameras_orange.py
echo [%date% %time%] Le relais s'est arrete. Nouvelle tentative dans 5 secondes...
timeout /t 5 /nobreak >nul
goto boucle
