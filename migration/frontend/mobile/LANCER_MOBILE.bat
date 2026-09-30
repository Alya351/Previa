@echo off
title PREVIA MOBILE - DEMARRAGE AUTOMATIQUE (BACKEND + BD + EXPO)
cd /d "%~dp0..\..\.."
set "PATH=C:\Users\alyak\AppData\Local\node-v20\node-v20.19.4-win-x64;C:\Users\alyak\AppData\Roaming\npm;%PATH%"

echo ======================================================================
echo       PREVIA - DEMARRAGE AUTOMATIQUE POSTE NOMADE MOBILE
echo ======================================================================
echo.

REM 1. Verification et Lancement Automatique du Backend + BD (port 8080)
netstat -aon | findstr :8080 | findstr LISTENING >nul 2>&1
if %ERRORLEVEL% NEQ 0 (
    echo [*] Le backend et la base de donnees ne sont pas encore lances.
    echo [*] Démarrage automatique du serveur Backend PREVIA (Port 8080)...
    start "PREVIA - BACKEND & BD" cmd /c "%~dp0..\..\..\LANCER_BACKEND_LOCAL.bat"
    timeout /t 3 >nul
) else (
    echo [OK] Backend PREVIA & BD deja actifs sur le port 8080.
)

REM 2. Liberation du port Metro (8081) si necessaire
echo [*] Liberation du port Metro (8081)...
for /f "tokens=5" %%a in ('netstat -aon ^| findstr :8081 ^| findstr LISTENING') do taskkill /f /pid %%a >nul 2>&1

REM 3. Lancement de l'Application Mobile Expo
echo [*] Lancement de l'application mobile PREVIA...
echo.
cd /d "%~dp0"
npx expo start --clear

pause
