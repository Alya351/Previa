#!/bin/bash
# installer_raspberry.sh — configure un Raspberry Pi pour faire tourner PREVIA
# (API + tableau de bord web) et piloter la sirène/lampe par ses broches GPIO.
#
# À lancer SUR LE RASPBERRY, une fois le projet copié dans ~/tech-impact
# (c'est ce que fait LANCER_SUR_RASPBERRY.bat, qui appelle aussi ce script) :
#     sudo bash ~/tech-impact/raspberry/installer_raspberry.sh
#
# Sans danger à relancer : chaque étape vérifie d'abord ce qui existe déjà.
# Ce que fait le script :
#   1. nomme le boîtier "previa"  -> joignable par previa.local
#   2. installe les paquets système manquants (avahi, gpiozero...) si internet
#   3. donne à PREVIA le droit d'utiliser les broches GPIO + /etc/previa/gpio.env
#   4. crée les services previa-api et previa-web SEULEMENT s'ils n'existent
#      pas (un service existant n'est jamais réécrit, seulement complété)
#   5. annonce le service PREVIA sur le réseau (l'appli mobile le trouve seule)
#   6. active le démarrage automatique et (re)démarre PREVIA
set -u

LOG()  { printf '\033[1m[previa]\033[0m %s\n' "$*"; }
WARN() { printf '\033[33m[previa] ATTENTION : %s\033[0m\n' "$*" >&2; }

if [ "$(id -u)" -ne 0 ]; then
    echo "Lancez ce script avec sudo : sudo bash $0" >&2
    exit 1
fi

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SRC_DIR")"
if [ ! -d "$APP_DIR/migration/backend" ]; then
    echo "Dossier du projet introuvable ($APP_DIR/migration/backend)." >&2
    exit 1
fi
DEST_USER="${SUDO_USER:-}"
if [ -z "$DEST_USER" ] || [ "$DEST_USER" = "root" ]; then
    DEST_USER="$(stat -c %U "$APP_DIR")"
fi
LOG "projet : $APP_DIR   utilisateur : $DEST_USER"

# Les fichiers venus de Windows peuvent avoir des fins de ligne CRLF
sed -i 's/\r$//' "$SRC_DIR"/*.sh "$SRC_DIR"/*.py "$SRC_DIR"/*.env 2>/dev/null || true

en_ligne() { timeout 6 getent hosts pypi.org >/dev/null 2>&1; }
ARCH="$(uname -m)"
[ "$ARCH" = "aarch64" ] || WARN "architecture $ARCH : un Raspberry Pi OS 64 bits (aarch64) est nécessaire pour torch/PyTorch"

# ---------------------------------------------------------------- 1. nom
if [ "$(hostname)" != "previa" ]; then
    LOG "nom du boîtier : $(hostname) -> previa (joignable ensuite par previa.local)"
    hostnamectl set-hostname previa 2>/dev/null || echo previa > /etc/hostname
    if grep -q '^127\.0\.1\.1' /etc/hosts; then
        sed -i 's/^127\.0\.1\.1.*/127.0.1.1\tprevia/' /etc/hosts
    else
        printf '127.0.1.1\tprevia\n' >> /etc/hosts
    fi
fi

# ------------------------------- 1b. accès Internet par la clé 4G + Tailscale
# Fait AVANT l'installation des paquets : si la box n'a pas Internet, c'est la clé 4G qui doit servir.
# Ne bloque jamais l'installation (sur place, PREVIA fonctionne sans Internet).
bash "$SRC_DIR/acces_distant.sh" || WARN "accès à distance non configuré (voir messages ci-dessus)"

# ----------------------------------------------------- 2. paquets système
installer_paquet() {
    dpkg -s "$1" >/dev/null 2>&1 && return 0
    if apt-get install -y --no-install-recommends "$1" >/dev/null 2>&1; then
        LOG "paquet installé : $1"
    else
        WARN "paquet $1 non installé"
    fi
}
if en_ligne; then
    apt-get update -qq >/dev/null 2>&1 || WARN "apt-get update a échoué"
    for p in avahi-daemon ffmpeg python3-venv python3-pip python3-gpiozero python3-lgpio libgl1 libglib2.0-0 libgomp1; do
        installer_paquet "$p"
    done
else
    WARN "pas d'internet : paquets système non vérifiés (ce n'est pas bloquant s'ils sont déjà là)"
fi

# ------------------------------------------------------------ 3. GPIO
GROUPE_GPIO=0
if getent group gpio >/dev/null 2>&1; then
    usermod -aG gpio "$DEST_USER" && GROUPE_GPIO=1
else
    WARN "groupe 'gpio' absent (système non Raspberry Pi OS ?) : les relais peuvent nécessiter un autre réglage de droits"
fi
mkdir -p /etc/previa
if [ ! -f /etc/previa/gpio.env ]; then
    cp "$SRC_DIR/gpio.env" /etc/previa/gpio.env
    LOG "réglages des broches créés : /etc/previa/gpio.env (lampe BCM17, sirène BCM27)"
else
    LOG "réglages conservés : /etc/previa/gpio.env"
fi
# Réglage ajouté après coup : on l'ajoute aux installations qui ne l'ont pas
grep -q '^#\?\s*PREVIA_VIDEO_FPS=' /etc/previa/gpio.env || printf '\n# Limite d image/s par camera (CPU du Raspberry). 0 = pas de limite.\nPREVIA_VIDEO_FPS=15\n' >> /etc/previa/gpio.env
# Réglages vidéo légers pour le Raspberry (image affichée plus petite et plus légère : flux plus fluide)
grep -q '^#\?\s*PREVIA_VIDEO_LARGEUR=' /etc/previa/gpio.env || printf '\n# Largeur max de l image affichee (px). 1280 = defaut sans reglage.\nPREVIA_VIDEO_LARGEUR=960\n' >> /etc/previa/gpio.env
grep -q '^#\?\s*PREVIA_VIDEO_QUALITE=' /etc/previa/gpio.env || printf '\n# Qualite JPEG : 2 = maximale, 31 = minimale. 6 = images 3x plus legeres.\nPREVIA_VIDEO_QUALITE=6\n' >> /etc/previa/gpio.env
command -v ffmpeg >/dev/null 2>&1 || WARN "ffmpeg absent : la vidéo des caméras ne fonctionnera pas (sudo apt install ffmpeg, internet requis)"

# ------------------------------------------------- 4. services PREVIA
unite_existe() { systemctl cat "$1" >/dev/null 2>&1; }

PY=""
if unite_existe previa-api.service; then
    EXEC="$(systemctl cat previa-api.service | sed -n 's/^ExecStart=[-@+!]*\([^ ]*\).*/\1/p' | head -1)"
    case "$(basename "$EXEC")" in
        python*) PY="$EXEC" ;;
        uvicorn*) [ -x "$(dirname "$EXEC")/python" ] && PY="$(dirname "$EXEC")/python" ;;
    esac
    LOG "service previa-api déjà présent (interpréteur : ${PY:-non détecté}) : conservé tel quel"
fi

creer_venv() {
    local venv="$APP_DIR/.venv" req="$APP_DIR/migration/backend/requirements.txt" sha
    if [ ! -x "$venv/bin/python" ]; then
        LOG "création de l'environnement Python : $venv"
        sudo -u "$DEST_USER" python3 -m venv --system-site-packages "$venv" || return 1
    fi
    sha="$(sha256sum "$req" | cut -d' ' -f1)"
    if [ "$(cat "$venv/.req_sha" 2>/dev/null)" != "$sha" ]; then
        en_ligne || { WARN "pas d'internet : paquets Python NON installés (relancez ce script une fois connecté)"; return 1; }
        LOG "installation des paquets Python (torch, ultralytics...) : peut prendre 20 à 40 minutes la première fois"
        if sudo -u "$DEST_USER" "$venv/bin/pip" install -r "$req"; then
            echo "$sha" | sudo -u "$DEST_USER" tee "$venv/.req_sha" >/dev/null
        else
            WARN "installation des paquets Python incomplète (voir messages ci-dessus)"
            return 1
        fi
    fi
    PY="$venv/bin/python"
}

if ! unite_existe previa-api.service; then
    [ -n "$PY" ] || creer_venv || WARN "l'API risque de ne pas démarrer tant que les paquets Python ne sont pas installés"
    [ -n "$PY" ] || PY="$APP_DIR/.venv/bin/python"
    cat > /etc/systemd/system/previa-api.service <<UNIT
[Unit]
Description=PREVIA - API (FastAPI, port 8012)
After=network-online.target
Wants=network-online.target

[Service]
Type=simple
User=$DEST_USER
WorkingDirectory=$APP_DIR/migration/backend
Environment=PYTHONUNBUFFERED=1
ExecStartPre=-$PY $SRC_DIR/preparer_certificat.py
ExecStart=$PY -m uvicorn fonctionnalites.main.main:app --host 0.0.0.0 --port 8012 --ssl-certfile certs/cert.pem --ssl-keyfile certs/key.pem
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    LOG "service créé : previa-api"
fi

if ! unite_existe previa-web.service; then
    cat > /etc/systemd/system/previa-web.service <<UNIT
[Unit]
Description=PREVIA - Tableau de bord web (HTTPS 5173, HTTP mobile 8080)
After=network-online.target previa-api.service
Wants=network-online.target

[Service]
Type=simple
User=$DEST_USER
WorkingDirectory=$APP_DIR/migration/frontend/web
Environment=PYTHONUNBUFFERED=1
ExecStart=/usr/bin/python3 $APP_DIR/migration/frontend/web/serveur_web_https.py
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
UNIT
    LOG "service créé : previa-web"
fi

# Complément (drop-in) pour le service API, qu'il soit nouveau ou ancien :
# réglages des broches + droit d'accès au GPIO. N'altère pas le service.
mkdir -p /etc/systemd/system/previa-api.service.d
{
    echo "[Service]"
    echo "EnvironmentFile=-/etc/previa/gpio.env"
    [ "$GROUPE_GPIO" = "1" ] && echo "SupplementaryGroups=gpio"
} > /etc/systemd/system/previa-api.service.d/gpio.conf

# gpiozero doit être importable PAR l'interpréteur du service. Ordre :
# 1) déjà présent -> rien ; 2) wheels embarquées dans raspberry/wheels (marche
# SANS internet, suffit sur un Pi 4) ; 3) PyPI si internet.
installer_gpiozero() {
    local py="$1" opts=""
    "$py" -c "import gpiozero" >/dev/null 2>&1 && return 0
    "$py" -c "import sys; sys.exit(0 if sys.prefix != sys.base_prefix else 1)" || opts="--break-system-packages"
    LOG "ajout de gpiozero dans l'environnement du service"
    sudo -u "$DEST_USER" "$py" -m pip install $opts --no-index --find-links "$SRC_DIR/wheels" gpiozero >/dev/null 2>&1 \
        || "$py" -m pip install $opts --no-index --find-links "$SRC_DIR/wheels" gpiozero >/dev/null 2>&1 \
        || { en_ligne && "$py" -m pip install $opts gpiozero >/dev/null 2>&1; }
    "$py" -c "import gpiozero" >/dev/null 2>&1
}
if [ -n "$PY" ] && [ -x "$PY" ]; then
    if installer_gpiozero "$PY"; then
        LOG "gpiozero disponible pour le service"
    else
        WARN "gpiozero non installé pour $PY : la sirène restera en SIMULATION (voir le journal : journalctl -u previa-api | grep alarme)"
    fi
else
    WARN "interpréteur Python du service previa-api non détecté : vérifiez que gpiozero y est installé (sinon la sirène reste en SIMULATION)"
fi

# --------------------------------------------- 5. annonce sur le réseau
if unite_existe previa-mdns.service; then
    WARN "un service 'previa-mdns' existe déjà : il peut entrer en conflit avec l'annonce avahi ci-dessous (si previa.local se comporte mal, faites : sudo systemctl disable --now previa-mdns)"
fi
mkdir -p /etc/avahi/services
cat > /etc/avahi/services/previa.service <<'XML'
<?xml version="1.0" standalone='no'?>
<!DOCTYPE service-group SYSTEM "avahi-service.dtd">
<service-group>
  <name>PREVIA Security</name>
  <service>
    <type>_previa._tcp</type>
    <port>5173</port>
    <txt-record>http_mobile=8080</txt-record>
  </service>
</service-group>
XML
systemctl enable avahi-daemon >/dev/null 2>&1
systemctl restart avahi-daemon >/dev/null 2>&1 && LOG "previa.local annoncé sur le réseau (avahi)" || WARN "avahi-daemon non démarré : previa.local ne sera pas résolu"

# ------------------------------------------ 6. démarrage automatique
systemctl daemon-reload
systemctl enable previa-api.service previa-web.service >/dev/null 2>&1
systemctl restart previa-api.service previa-web.service
LOG "PREVIA démarré et activé au démarrage du Raspberry"

# Attente du démarrage de l'API (chargement des modèles IA : jusqu'à 2 minutes)
for i in $(seq 1 40); do
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 3 https://127.0.0.1:8012/alarme/etat 2>/dev/null || true)"
    [ "$code" = "200" ] && break
    sleep 3
done
echo
if [ "${code:-}" = "200" ]; then
    LOG "API PREVIA : en ligne"
else
    WARN "l'API ne répond pas encore : journalctl -u previa-api -n 60 --no-pager"
fi
systemctl is-active previa-api.service previa-web.service | paste -sd' ' | sed 's/^/[previa] services : /'
journalctl -u previa-api.service -n 300 --no-pager 2>/dev/null | grep '\[alarme\]' | tail -1 | sed 's/^.*\[alarme\]/[previa] sirène\/lampe :/'
LOG "terminé. Test du câblage des relais : python3 $SRC_DIR/tester_relais.py (après : sudo systemctl stop previa-api)"
