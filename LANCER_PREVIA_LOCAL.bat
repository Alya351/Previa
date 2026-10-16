@echo off
title PREVIA - LANCEUR COMPLET LOCAL
cd /d "%~dp0"

echo ======================================================================
echo          PREVIA - DEMARRAGE DE LA SUITE LOCALE COMPLETE (PC)
echo ======================================================================
echo.
echo [1/3] Demarrage du Backend d'analyse IA (Port 8012 HTTPS)...
start "PREVIA - Backend FastAPI (Port 8012)" cmd /c "cd /d "%~dp0migration\backend" && set "PYTHONPATH=%~dp0migration\backend" && python -m uvicorn fonctionnalites.main.main:app --host 0.0.0.0 --port 8012 --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem"

timeout /t 3 /nobreak >nul

echo [2/3] Demarrage du Serveur Web Dashboard (Port 5173 HTTPS)...
start "PREVIA - Web Dashboard (Port 5173)" cmd /c "cd /d "%~dp0migration\frontend\web" && python serveur_web_https.py"

timeout /t 2 /nobreak >nul

echo [3/3] Ouverture de l'interface dans votre navigateur...
start https://localhost:5173

echo.
echo ======================================================================
echo   PREVIA est actif en local !
echo   - Web Dashboard : https://localhost:5173
echo   - Backend API   : https://localhost:8012/docs
echo   - Identifiants  : alyakiemde@gmail.com
echo ======================================================================
echo.
pause
