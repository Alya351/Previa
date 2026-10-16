@echo off
title PREVIA - BACKEND LOCAL (FASTAPI)
cd /d "%~dp0migration\backend"
set "PYTHONPATH=%~dp0migration\backend"
set "PREVIA_MODE_DEV=1"

echo ======================================================================
echo       PREVIA - DEMARRAGE DU BACKEND LOCAL (PORT 8012 HTTPS)
echo ======================================================================
echo.
echo [*] Chargement des fonctionnalites backend PREVIA...
echo [*] API accessible sur https://localhost:8012 et https://127.0.0.1:8012
echo.

python -m uvicorn fonctionnalites.main.main:app --host 0.0.0.0 --port 8012 --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem

pause
