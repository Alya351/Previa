@echo off
title PREVIA - BACKEND LOCAL (FASTAPI)
cd /d "%~dp0migration\backend"
set "PYTHONPATH=%~dp0migration\backend"

echo ======================================================================
echo       PREVIA - DEMARRAGE DU BACKEND LOCAL (PORT 8080)
echo ======================================================================
echo.
echo [*] Chargement des fonctionnalites backend PREVIA...
echo [*] API accessible sur http://localhost:8080 et http://192.168.1.101:8080
echo.

python -m uvicorn fonctionnalites.main.main:app --host 0.0.0.0 --port 8080

pause
