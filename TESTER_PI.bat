@echo off
chcp 65001 >nul
TITLE PREVIA - Tests du Raspberry (lecture seule)
COLOR 0A
where python >nul 2>nul
if %ERRORLEVEL% NEQ 0 (
    echo [ERREUR] Python introuvable.
    pause
    exit /b 1
)
python tester_pi.py
