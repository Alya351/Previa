#!/bin/bash
# acces_distant.sh — accès à PREVIA depuis l'extérieur (Tailscale) et sortie Internet par la clé 4G.
#
# Appelé par installer_raspberry.sh (en root). Sans danger à relancer, ne bloque jamais l'installation.
#
# Contexte : les caméras sont sur la box (câble Ethernet), mais la box n'a PAS d'Internet. Une clé 4G
# (USB) ou un téléphone en partage de connexion (Wi-Fi) donne Internet au Raspberry. Ce script :
#   1. repère l'interface qui a vraiment Internet et demande à l'Ethernet de la box de ne plus servir
#      de route par défaut (les caméras restent joignables : leur réseau est local, pas besoin de route) ;
#   2. installe Tailscale (réseau privé chiffré, gratuit pour un usage personnel) et connecte le
#      Raspberry à votre compte avec une clé d'authentification.
#
# La clé d'authentification Tailscale est déposée par LANCER_SUR_RASPBERRY.bat dans
# ~/tech-impact/.previa_tailscale.key (droits 600) et SUPPRIMÉE dès qu'elle a servi.
set -u

LOG()  { printf '\033[1m[previa-distant]\033[0m %s\n' "$*"; }
WARN() { printf '\033[33m[previa-distant] ATTENTION : %s\033[0m\n' "$*" >&2; }

SRC_DIR="$(cd "$(dirname "$0")" && pwd)"
APP_DIR="$(dirname "$SRC_DIR")"
CLE_FICHIER="${PREVIA_TS_CLE_FICHIER:-$APP_DIR/.previa_tailscale.key}"
SYS_NET="${PREVIA_SYS_NET:-/sys/class/net}"
NOM_NOEUD="${PREVIA_TS_NOM:-previa}"

# ------------------------------------------------------------- outils
a_internet() {  # a_internet <interface> : vrai si cette interface atteint Internet (réponse HTTP 204)
    local code
    code="$(timeout 9 curl -s --interface "$1" --max-time 6 -o /dev/null -w '%{http_code}' \
        http://connectivitycheck.gstatic.com/generate_204 2>/dev/null || true)"
    [ "$code" = "204" ]
}
internet_global() {
    local code
    code="$(timeout 9 curl -s --max-time 6 -o /dev/null -w '%{http_code}' \
        http://connectivitycheck.gstatic.com/generate_204 2>/dev/null || true)"
    [ "$code" = "204" ]
}
interface_filaire() {  # l'Ethernet qui va vers la box
    local i
    for i in eth0 end0; do
        [ -e "$SYS_NET/$i" ] && { echo "$i"; return 0; }
    done
    return 1
}

# ------------------------------------------- 1. route Internet par la clé 4G
configurer_route() {
    local filaire autre candidats="" i
    filaire="$(interface_filaire)" || { LOG "pas d'Ethernet filaire détecté : réseau laissé tel quel"; return 0; }

    if a_internet "$filaire"; then
        LOG "la box ($filaire) a Internet : réseau laissé tel quel"
        return 0
    fi

    for i in $(ls "$SYS_NET" 2>/dev/null); do
        case "$i" in
            lo|"$filaire"|docker*|veth*|br-*|virbr*|tailscale*|ts*) continue ;;
        esac
        candidats="$candidats $i"
    done

    autre=""
    for i in $candidats; do
        if a_internet "$i"; then autre="$i"; break; fi
    done
    if [ -z "$autre" ]; then
        WARN "aucune interface avec Internet (la box n'en a pas). Branchez la clé 4G (ou activez le partage de connexion du téléphone), puis relancez LANCER_SUR_RASPBERRY.bat."
        return 1
    fi
    LOG "Internet disponible via $autre (la box $filaire n'a pas Internet)"

    if ! command -v nmcli >/dev/null 2>&1; then
        WARN "NetworkManager (nmcli) absent : impossible de régler la route automatiquement. Si Internet ne marche pas, retirez la passerelle de $filaire."
        return 0
    fi
    local conn
    conn="$(nmcli -g GENERAL.CONNECTION device show "$filaire" 2>/dev/null | head -1)"
    if [ -z "$conn" ] || [ "$conn" = "--" ]; then
        WARN "connexion réseau de $filaire introuvable dans NetworkManager : route non modifiée"
        return 0
    fi
    if [ "$(nmcli -g ipv4.never-default connection show "$conn" 2>/dev/null)" = "yes" ]; then
        LOG "route déjà réglée : $filaire ($conn) n'est pas la route Internet par défaut"
        return 0
    fi
    nmcli connection modify "$conn" ipv4.never-default yes \
        && LOG "$filaire ($conn) ne sert plus de route Internet par défaut (les caméras restent joignables)" \
        || { WARN "réglage de la route refusé par NetworkManager"; return 0; }
    # Application immédiate SANS couper la liaison (la session SSH du lanceur passe par ce câble)
    nmcli device reapply "$filaire" >/dev/null 2>&1 \
        || WARN "réglage enregistré, appliqué au prochain redémarrage du Raspberry"
    return 0
}

# ------------------------------------------------------------- 2. Tailscale
installer_tailscale() {
    command -v tailscale >/dev/null 2>&1 && return 0
    if ! internet_global; then
        WARN "pas d'Internet : Tailscale non installé. Branchez la clé 4G puis relancez LANCER_SUR_RASPBERRY.bat."
        return 1
    fi
    LOG "installation de Tailscale (script officiel tailscale.com/install.sh)"
    if curl -fsSL --max-time 60 https://tailscale.com/install.sh | sh >/dev/null 2>&1 && command -v tailscale >/dev/null 2>&1; then
        LOG "Tailscale installé"
        return 0
    fi
    WARN "installation de Tailscale échouée (voir : curl -fsSL https://tailscale.com/install.sh | sudo sh)"
    return 1
}

etat_tailscale() {  # affiche l'état : Running, NeedsLogin, Stopped...
    tailscale status --json 2>/dev/null | sed -n 's/.*"BackendState": *"\([A-Za-z]*\)".*/\1/p' | head -1
}

connecter_tailscale() {
    systemctl enable --now tailscaled >/dev/null 2>&1 || true
    local etat; etat="$(etat_tailscale)"
    if [ "$etat" = "Running" ]; then
        LOG "Tailscale déjà connecté"
    elif [ -s "$CLE_FICHIER" ]; then
        LOG "connexion du Raspberry à votre compte Tailscale (nom : $NOM_NOEUD)"
        if timeout 90 tailscale up --authkey="$(cat "$CLE_FICHIER")" --hostname="$NOM_NOEUD" --accept-dns=false >/dev/null 2>&1; then
            LOG "Tailscale connecté"
        else
            WARN "connexion Tailscale refusée : clé expirée, déjà utilisée ou invalide ? Créez-en une nouvelle (voir LISEZMOI)."
        fi
    else
        WARN "Tailscale n'est pas connecté à un compte et aucune clé n'a été fournie : ajoutez PREVIA_TAILSCALE_AUTHKEY=tskey-... dans le fichier .env du PC, puis relancez."
    fi
    # La clé ne doit pas rester sur le Raspberry
    [ -e "$CLE_FICHIER" ] && { shred -u "$CLE_FICHIER" 2>/dev/null || rm -f "$CLE_FICHIER"; }

    if [ "$(etat_tailscale)" = "Running" ]; then
        local ip; ip="$(tailscale ip -4 2>/dev/null | head -1)"
        LOG "réseau privé Tailscale prêt : adresse du Raspberry = ${ip:-inconnue}"
        activer_funnel
        return 0
    fi
    return 1
}

# Lien public HTTPS (Tailscale Funnel) : les utilisateurs de l'application n'ont RIEN à installer.
# Désactivable avec PREVIA_TS_FUNNEL=0. Nécessite, une seule fois, deux réglages dans la console
# Tailscale : DNS -> « HTTPS Certificates » activé, et Access controls -> « Add Funnel to policy ».
activer_funnel() {
    if [ "${PREVIA_TS_FUNNEL:-1}" != "1" ]; then
        LOG "lien public (Funnel) désactivé (PREVIA_TS_FUNNEL=0)"
        return 0
    fi
    timeout 40 tailscale funnel --bg 8080 </dev/null >/dev/null 2>&1
    local nom
    nom="$(tailscale status --json 2>/dev/null | sed -n 's/.*"DNSName": *"\([^"]*\)".*/\1/p' | head -1)"
    nom="${nom%.}"
    if tailscale funnel status 2>/dev/null | grep -qi "funnel on"; then
        LOG "lien public prêt (aucune installation pour les utilisateurs) : https://${nom:-<nom du Raspberry>}"
    else
        WARN "lien public (Funnel) non actif. Console Tailscale : DNS -> activer « HTTPS Certificates » ; Access controls -> « Add Funnel to policy » ; puis relancez LANCER_SUR_RASPBERRY.bat."
    fi
}

# ------------------------------------------------------------------ main
resultat=0
configurer_route || resultat=1
if installer_tailscale; then
    connecter_tailscale || resultat=1
else
    resultat=1
    [ -e "$CLE_FICHIER" ] && { shred -u "$CLE_FICHIER" 2>/dev/null || rm -f "$CLE_FICHIER"; }
fi
[ "$resultat" -eq 0 ] || LOG "accès à distance NON prêt (le fonctionnement sur place n'est pas affecté)"
exit 0
