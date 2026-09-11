@echo off
setlocal enabledelayedexpansion
REM previastart.bat -- equivalent Windows de previastart (voir ce fichier
REM pour les explications completes). Lance tout PREVIA (backend +
REM frontend) en une seule commande.
REM
REM Usage :
REM   previastart.bat

cd /d "%~dp0"

where docker >nul 2>nul
if errorlevel 1 (
    echo Docker n'est pas installe -- voir https://docs.docker.com/get-docker/
    pause
    exit /b 1
)

REM Docker Desktop peut etre installe mais pas LANCE -- `docker` (la
REM commande) existe deja a ce stade, mais parle a un moteur qui ne
REM tourne pas encore (erreur "npipe ... dockerDesktopLinuxEngine ...
REM cannot find the file specified"). Verifie ca AVANT toute autre
REM commande docker, avec un message clair plutot que l'erreur technique
REM brute.
docker info >nul 2>nul
if errorlevel 1 (
    echo.
    echo Docker Desktop n'est pas demarre.
    echo   1. Ouvre l'application "Docker Desktop" ^(menu Demarrer^)
    echo   2. Attends que la baleine, en bas a droite, devienne stable
    echo      ^(elle bouge/anime pendant le demarrage^)
    echo   3. Relance previastart.bat
    pause
    exit /b 1
)

REM Charge previa.tar automatiquement s'il est la et que les images n'y
REM sont pas encore (cas d'une cle USB/dossier copie tel quel : double-
REM clic direct, pas besoin de taper `docker load` a la main). Ne fait
REM rien si les images sont deja chargees, ni si previa.tar est absent.
if exist "previa.tar" (
    docker image inspect previa-backend:latest >nul 2>nul
    if errorlevel 1 (
        echo previastart : chargement de previa.tar ^(une seule fois^)...
        docker load -i previa.tar
        echo.
    )
)

REM Si models.zip est la (voir LISEZMOI_PARTAGE.md), on l'extrait
REM DIRECTEMENT dans le volume Docker des modeles -- pas besoin que le
REM backend le retelecharge depuis Google Drive au premier demarrage.
REM Utilise l'image previa-backend elle-meme (deja chargee juste avant,
REM contient Python) pour dezipper -- aucun acces reseau requis pour
REM cette etape. Ne fait rien si les modeles sont deja dans le volume.
if exist "models.zip" (
    set DEJA=
    for /f "delims=" %%i in ('docker run --rm -v previa_models:/m --entrypoint sh previa-backend:latest -c "test -f /m/yolo11x-pose.pt && echo oui" 2^>nul') do set DEJA=%%i
    if not "!DEJA!"=="oui" (
        echo previastart : extraction de models.zip dans le volume ^(une seule fois, ~3 Go, prend un moment^)...
        docker run --rm -v previa_models:/dest -v "%cd%\models.zip:/models.zip:ro" --entrypoint python3 previa-backend:latest -c "import zipfile, shutil; zipfile.ZipFile('/models.zip').extractall('/tmp/x'); shutil.copytree('/tmp/x/models', '/dest', dirs_exist_ok=True)"
        echo.
    )
)

REM Detecte l'adresse IP locale de cette machine, transmise au conteneur
REM backend (voir docker-compose.yml, PREVIA_IP_PUBLIQUE) -- sans ca, le
REM certificat HTTPS serait genere pour l'adresse interne du conteneur,
REM invisible depuis un telephone sur le meme Wi-Fi.
REM
REM Passe par la route par defaut reelle (equivalent Windows de
REM `ip route get 1.1.1.1`, voir previastart) plutot que "la premiere
REM adresse trouvee" -- l'ancienne methode pouvait remonter une adresse
REM virtuelle (WSL, Hyper-V, VPN...) au lieu du vrai Wi-Fi/Ethernet,
REM constate en test (172.23.x.x renvoye a la place de l'IP reelle).
if not defined PREVIA_IP_PUBLIQUE (
    for /f "delims=" %%i in ('powershell -NoProfile -Command "$r = Get-NetRoute -DestinationPrefix '0.0.0.0/0' -ErrorAction SilentlyContinue | Sort-Object -Property RouteMetric | Select-Object -First 1; if ($r) { (Get-NetIPAddress -InterfaceIndex $r.InterfaceIndex -AddressFamily IPv4 -ErrorAction SilentlyContinue | Select-Object -First 1 -ExpandProperty IPAddress) }"') do set PREVIA_IP_PUBLIQUE=%%i
)

if not defined PREVIA_IP_PUBLIQUE (
    echo AVERTISSEMENT : adresse IP locale non detectee automatiquement --
    echo   le certificat HTTPS pourrait ne pas correspondre a ton adresse reseau.
    echo   Tu peux la fixer toi-meme : set PREVIA_IP_PUBLIQUE=192.168.x.x
) else (
    echo previastart : adresse detectee -^> %PREVIA_IP_PUBLIQUE%
)

REM Annonce previa.local sur le reseau local (mDNS, voir mdns_previa.py)
REM -- pour que le telephone (et les futures cameras physiques) trouvent
REM le serveur tout seuls, sans chercher une IP a chaque reseau. Tourne
REM SUR CETTE MACHINE, pas dans Docker Desktop (meme raison que
REM l'abandon de network_mode: host cote Docker). Optionnel : si Python
REM ou le paquet zeroconf manquent (frequent sur un PC Windows tout
REM neuf), previastart.bat continue quand meme SANS mDNS -- juste un
REM message, jamais une erreur bloquante, l'adresse IP ci-dessus reste
REM toujours utilisable.
set MDNS_OK=
where python >nul 2>nul
if not errorlevel 1 (
    python -c "import zeroconf" >nul 2>nul
    if not errorlevel 1 set MDNS_OK=1
)
if defined MDNS_OK (
    start "PREVIA mDNS" /min python mdns_previa.py
    echo previastart : previa.local annonce sur le reseau local ^(mDNS^)
) else (
    echo previastart : mDNS non disponible ^(Python/paquet zeroconf manquant^) -- utilise l'adresse IP ci-dessus
)

echo previastart : demarrage de PREVIA (Ctrl+C pour arreter)
echo   - images + modeles deja recus (previa.tar + models.zip) : demarrage direct
echo   - sinon : construction depuis les sources + telechargement des modeles (~3 Go)
echo   - lancements suivants : quasi instantane (tout est deja en cache)
echo.

REM PAS de --build ici, volontairement : voir previastart (script Linux/Mac)
REM pour l'explication complete.
docker compose up

REM Coupe l'annonce mDNS en meme temps que Docker -- fenetre separee
REM ("PREVIA mDNS", voir le `start` ci-dessus), fermee explicitement
REM par son titre plutot qu'en tuant tous les process python.exe de la
REM machine (ca tuerait n'importe quel AUTRE script Python de
REM l'utilisateur qui tournerait en meme temps).
if defined MDNS_OK taskkill /FI "WINDOWTITLE eq PREVIA mDNS*" /T /F >nul 2>nul

REM Garde la fenetre ouverte apres l'arret (Ctrl+C ou erreur) -- sans
REM ca, un double-clic depuis l'explorateur ferme la fenetre aussitot,
REM impossible de lire un message d'erreur eventuel.
pause
