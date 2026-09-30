@echo off
chcp 65001 >nul
TITLE PREVIA - Lancement sur Raspberry Pi
COLOR 0A

echo =====================================================================
echo       [ PREVIA ]  LANCEMENT SUR RASPBERRY PI
echo =====================================================================
echo.

where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Python n'est pas installe ou n'est pas dans le PATH Windows !
    pause
    exit /b 1
)

python lancer_sur_raspberry.py
pause
