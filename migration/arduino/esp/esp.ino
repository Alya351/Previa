// ESP32 "autonome" — pilote deux broches réelles, LAMPE et SIRÈNE,
// d'après l'état de l'alarme côté backend PREVIA (voir
// Infrastructure/alarme_physique.py et GET /alarme/etat dans main.py).
//
// - Peut retenir PLUSIEURS réseaux WiFi (pas un seul) — au démarrage,
//   essaie chacun dans l'ordre jusqu'à ce qu'un fonctionne. Pratique
//   pour un appareil qui bouge entre deux lieux (bureau/maison) sans
//   jamais avoir à reconfigurer.
// - Si ça marche : passe en mode client, s'annonce lui-même en mDNS
//   (voir demarrerMdnsClient — "previa-alarme-XXXXXX.local", suffixe
//   basé sur son adresse MAC pour rester unique si plusieurs appareils
//   Previa existent), retrouve le backend via mDNS ("previa.local",
//   voir docker/mdns_previa.py côté serveur) et interroge en boucle
//   l'état de l'alarme, qu'il reflète directement sur les deux
//   broches. Sert aussi une petite API HTTP (/api/...) qui permettra
//   au futur écran "configAlerte" de l'admin web de voir sur quel
//   réseau est cet appareil, lister/ajouter/supprimer ses réseaux
//   enregistrés, et le faire basculer vers un autre à la volée.
// - Si ça ne marche pas (aucun réseau enregistré, ou aucun joignable) :
//   bascule en mode point d'accès (serveur de configuration) avec une
//   IP fixe, sert une page web où on choisit le WiFi dans une liste
//   (scan en direct) + mot de passe. À la validation : le réseau est
//   AJOUTÉ à la liste (pas un remplacement) et l'appareil redémarre.
#include <WiFi.h>
#include <WebServer.h>
#include <Preferences.h>
#include <ESPmDNS.h>
#include <HTTPClient.h>
#include "soc/soc.h"
#include "soc/rtc_cntl_reg.h"

// ==== Mode configuration (point d'acces cree par l'ESP32) ====
#define AP_PASSWORD "123456789"
IPAddress AP_IP(192, 168, 4, 1);
IPAddress AP_GATEWAY(192, 168, 4, 1);
IPAddress AP_SUBNET(255, 255, 255, 0);

// ==== Mode client (une fois connecte a un vrai reseau) ====
// "previa" -> previa.local, annonce par docker/mdns_previa.py (tourne
// sur la machine qui heberge Docker, pas dans un conteneur -- voir sa
// docstring : le multicast mDNS ne sort pas d'une VM Docker Desktop
// sur Windows/Mac). Port 8080 : l'acces HTTP simple (sans certificat a
// gerer) expose par nginx pour les clients qui, comme cet ESP32, ne
// peuvent pas facilement accepter un certificat auto-signe -- meme
// raison que le choix fait pour l'app mobile, voir docker/nginx.conf.
#define BACKEND_MDNS_NAME     "previa"
#define BACKEND_PORT          8080
#define LAMPE_PIN             2
#define SIRENE_PIN            4
#define POLL_INTERVAL_MS      3000
#define CLIGNOTEMENT_LAMPE_MS 400  // vitesse du clignotement en danger (~1,25 Hz)
#define WIFI_CONNECT_TIMEOUT_MS 20000
#define MAX_RESEAUX             5

WebServer configServer(80);
Preferences prefs;
IPAddress backendIP;
bool backendResolved = false;
unsigned long lastPoll = 0;
// Etat du clignotement de la lampe -- separe du polling (toutes les 3s,
// bien trop lent pour clignoter) : gere a chaque tour de loop() via
// gererClignotementLampe(), independamment de quand appliquerEtatAlarme()
// a ete appele pour la derniere fois.
bool alarmeLampeActive = false;
bool etatPinLampe = false;
unsigned long dernierToggleLampe = 0;
String ssidActuel = "";  // rempli une fois vraiment connecte

// ---------------------------------------------------------------------------
// Identifiant de l'appareil (3 derniers octets de l'adresse MAC) -- sert
// a la fois de suffixe pour le nom mDNS et pour le SSID du point
// d'acces de configuration, pour que PLUSIEURS appareils Previa sur le
// meme reseau ne se marchent jamais dessus.
// ---------------------------------------------------------------------------
String idAppareil() {
  uint8_t mac[6];
  WiFi.macAddress(mac);
  char buf[7];
  snprintf(buf, sizeof(buf), "%02X%02X%02X", mac[3], mac[4], mac[5]);
  return String(buf);
}

// ---------------------------------------------------------------------------
// Reseaux WiFi enregistres -- une LISTE (pas un seul), stockee en NVS
// via Preferences (contrairement a l'ancienne version qui utilisait
// EEPROM pour UN SEUL reseau) : "n" = nombre de reseaux, puis
// "ssid0"/"pass0", "ssid1"/"pass1", etc.
// ---------------------------------------------------------------------------
int nombreReseaux() {
  return prefs.getInt("n", 0);
}

String cleSsid(int i) { return "ssid" + String(i); }
String clePass(int i) { return "pass" + String(i); }

String ssidReseau(int i) { return prefs.getString(cleSsid(i).c_str(), ""); }
String motDePasseReseau(int i) { return prefs.getString(clePass(i).c_str(), ""); }

int indexReseau(const String& ssid) {
  int n = nombreReseaux();
  for (int i = 0; i < n; i++) {
    if (ssidReseau(i) == ssid) return i;
  }
  return -1;
}

// Ajoute un nouveau reseau, ou MET A JOUR le mot de passe si ce SSID
// est deja enregistre. Renvoie false uniquement si la liste est pleine
// (MAX_RESEAUX) et que ce SSID est vraiment nouveau.
bool ajouterReseau(const String& ssid, const String& password) {
  int idx = indexReseau(ssid);
  if (idx == -1) {
    int n = nombreReseaux();
    if (n >= MAX_RESEAUX) return false;
    idx = n;
    prefs.putInt("n", n + 1);
  }
  prefs.putString(cleSsid(idx).c_str(), ssid);
  prefs.putString(clePass(idx).c_str(), password);
  return true;
}

// Supprime un reseau par SSID -- decale les suivants pour ne jamais
// laisser de trou dans les index (0..n-1 toujours contigus, sinon
// nombreReseaux()/ssidReseau(i) se desynchroniseraient).
bool supprimerReseau(const String& ssid) {
  int idx = indexReseau(ssid);
  if (idx == -1) return false;
  int n = nombreReseaux();
  for (int i = idx; i < n - 1; i++) {
    prefs.putString(cleSsid(i).c_str(), ssidReseau(i + 1));
    prefs.putString(clePass(i).c_str(), motDePasseReseau(i + 1));
  }
  prefs.remove(cleSsid(n - 1).c_str());
  prefs.remove(clePass(n - 1).c_str());
  prefs.putInt("n", n - 1);
  return true;
}

// ---------------------------------------------------------------------------
// Mode configuration : point d'acces + page web (choix du WiFi + mdp)
// ---------------------------------------------------------------------------
String scanNetworksOptionsHtml() {
  // Scan materiel en direct sur les canaux 2.4 GHz
  WiFi.scanDelete();
  int n = WiFi.scanNetworks(false, false, false, 300, 0);
  if (n <= 0) {
    delay(200);
    n = WiFi.scanNetworks(false, false, false, 300, 0);
  }
  String options = "";
  String vus = "|";

  for (int i = 0; i < n; i++) {
    String ssid = WiFi.SSID(i);
    if (ssid.length() == 0 || vus.indexOf("|" + ssid + "|") != -1) continue;
    vus += ssid + "|";
    options += "<option value='" + ssid + "'>" + ssid + "</option>";
  }

  if (options.length() == 0) {
    options = "<option value='' disabled selected>(Aucun réseau détecté, actualisez)</option>";
  }
  return options;
}

// Logo Previa (le meerkat, voir mobile/assets/icon_adaptive.png —
// même image que l'icône de l'app mobile) encodé en base64 et intégré
// directement dans la page : aucun accès internet en mode point
// d'accès (le téléphone n'est connecté QU'À l'ESP32), donc pas moyen
// de charger une image via une URL externe. ~8,3 Ko en PROGMEM (flash),
// négligeable vu la marge restante après compilation.
const char LOGO_B64[] PROGMEM =
#include "logo_b64.h"
;

// Mêmes jetons que le design Previa (voir frontend/web/src/pages/
// admin.css, --primary-blue etc.) — pas de police Google Fonts ici
// (aucun accès internet en mode point d'accès, le téléphone n'est
// connecté QU'À l'ESP32), donc pile de polices système uniquement,
// mais mêmes couleurs/rayons/ombres que le reste de Previa.
const char PAGE_STYLE[] PROGMEM = R"CSS(
<style>
  *{box-sizing:border-box;margin:0;padding:0}
  body{
    font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;
    background:linear-gradient(135deg,#1e5da0 0%,#0d3666 48%,#061a34 100%);
    min-height:100vh;display:flex;align-items:center;justify-content:center;
    padding:32px 16px;
  }
  .carte{
    background:#ffffff;border-radius:20px;box-shadow:0 20px 50px rgba(0,0,0,0.25);
    max-width:400px;width:100%;padding:32px 28px;
  }
  .marque{display:flex;align-items:center;gap:10px;justify-content:center;margin-bottom:6px}
  .marque .badge{width:40px;height:40px;object-fit:contain}
  .marque span{font-size:1.3rem;font-weight:800;color:#0284c7;letter-spacing:-0.02em}
  .sous-titre{text-align:center;color:#64748b;font-size:0.78rem;font-weight:600;
    letter-spacing:0.06em;text-transform:uppercase;margin-bottom:24px}
  h1{font-size:1.15rem;font-weight:700;color:#0f172a;margin-bottom:6px}
  .intro{color:#64748b;font-size:0.85rem;margin-bottom:22px;line-height:1.45}
  label{display:block;font-size:0.78rem;font-weight:700;color:#334155;margin-bottom:6px}
  .champ{margin-bottom:16px}
  select,input[type=password]{
    width:100%;padding:12px 14px;font-size:0.95rem;color:#0f172a;
    background:#f8fafc;border:1px solid #cbd5e1;border-radius:10px;outline:none;
    display:block;
  }
  select{cursor:pointer;background:#f1f5f9;font-weight:600}
  select:focus,input:focus{border-color:#0284c7;background:#ffffff}
  button{
    width:100%;padding:13px;margin-top:8px;font-size:0.95rem;font-weight:700;
    color:#ffffff;background:#0284c7;border:none;border-radius:999px;cursor:pointer;
  }
  button:hover{background:#0369a1}
  .lien-refresh{display:block;text-align:center;margin-top:16px;font-size:0.8rem;
    color:#0284c7;font-weight:600;text-decoration:none}
  .icone-ok{width:56px;height:56px;border-radius:50%;background:#dcfce7;
    display:flex;align-items:center;justify-content:center;font-size:28px;
    margin:0 auto 18px}
  .confirmation{text-align:center}
</style>
)CSS";

void handleConfigRoot() {
  String html = String(
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<title>Previa — Configuration</title>") + PAGE_STYLE +
    "</head><body><div class='carte'>"
    "<div class='marque'><img class='badge' src='data:image/png;base64,"
    + String(LOGO_B64) +
    "' alt='Previa'><span>Previa</span></div>"
    "<div class='sous-titre'>Surveillance intelligente</div>"
    "<h1>Connecter cette alarme au Wi-Fi</h1>"
    "<p class='intro'>Choisissez votre réseau Wi-Fi dans la liste :</p>"
    "<form method='POST' action='/save'>"
    "<div class='champ'><label>Réseau Wi-Fi</label>"
    "<select name='ssid' required>"
    "<option value='' disabled selected>-- Sélectionnez votre réseau Wi-Fi --</option>"
    + scanNetworksOptionsHtml() +
    "</select></div>"
    "<div class='champ'><label>Mot de passe</label>"
    "<input type='password' name='password' placeholder='••••••••' required></div>"
    "<button type='submit'>Connecter</button>"
    "</form>"
    "<a class='lien-refresh' href='/'>↻ Actualiser la liste des réseaux</a>"
    "</div></body></html>";
  configServer.send(200, "text/html", html);
}

void handleConfigSave() {
  String ssid = configServer.arg("ssid");
  String password = configServer.arg("password");
  if (ssid.length() > 0) {
    ajouterReseau(ssid, password);  // AJOUTE a la liste, n'efface pas les autres
  }
  String html = String(
    "<!DOCTYPE html><html><head><meta charset='utf-8'>"
    "<meta name='viewport' content='width=device-width, initial-scale=1'>"
    "<title>Previa — Configuration</title>") + PAGE_STYLE +
    "</head><body><div class='carte confirmation'>"
    "<div class='marque'><img class='badge' src='data:image/png;base64,"
    + String(LOGO_B64) +
    "' alt='Previa'><span>Previa</span></div>"
    "<div class='icone-ok'>\xE2\x9C\x93</div>"
    "<h1>Configuration enregistree</h1>"
    "<p class='intro'>L'appareil redemarre et va tenter de se connecter au reseau Previa...</p>"
    "</div></body></html>";
  configServer.send(200, "text/html", html);
  delay(1500);
  ESP.restart();
}

void startConfigMode() {
  String apSsid = "PreviaAlarme-" + idAppareil();
  Serial.println("=== Mode configuration (point d'acces) ===");
  WiFi.mode(WIFI_AP_STA);  // AP_STA : permet de scanner les reseaux tout en servant l'AP
  WiFi.disconnect();
  delay(100);
  WiFi.softAPConfig(AP_IP, AP_GATEWAY, AP_SUBNET);
  WiFi.softAP(apSsid.c_str(), AP_PASSWORD);
  Serial.printf("Connecte-toi au WiFi '%s' (mdp '%s') puis va sur http://%s\n",
                apSsid.c_str(), AP_PASSWORD, AP_IP.toString().c_str());

  WiFi.scanNetworks(true);  // Scan asynchrone immediat en arriere-plan

  configServer.on("/", handleConfigRoot);
  configServer.on("/save", HTTP_POST, handleConfigSave);
  configServer.begin();

  while (true) {
    configServer.handleClient();
    delay(2);
  }
}

// ---------------------------------------------------------------------------
// Mode client : connexion WiFi (essaie chaque reseau enregistre), API
// locale (/api/...), mDNS, puis polling du backend.
// ---------------------------------------------------------------------------
bool connecterReseauParIndex(int idx) {
  String ssid = ssidReseau(idx);
  String password = motDePasseReseau(idx);
  Serial.printf("Tentative de connexion a '%s' (reseau enregistre %d/%d)...\n",
                ssid.c_str(), idx + 1, nombreReseaux());

  WiFi.softAPdisconnect(true);
  WiFi.disconnect(true);
  delay(150);
  WiFi.mode(WIFI_STA);
  WiFi.begin(ssid.c_str(), password.c_str());

  unsigned long start = millis();
  while (WiFi.status() != WL_CONNECTED) {
    if (millis() - start > WIFI_CONNECT_TIMEOUT_MS) {
      Serial.println("  -> echec (reseau introuvable ou mot de passe refuse).");
      return false;
    }
    delay(400);
    Serial.print(".");
  }
  Serial.println();
  ssidActuel = ssid;
  Serial.printf("Connecte a '%s' ! IP : %s\n", ssid.c_str(), WiFi.localIP().toString().c_str());
  return true;
}

// Essaie CHAQUE reseau enregistre, dans l'ordre, jusqu'a ce qu'un
// fonctionne -- permet par exemple de garder le WiFi du bureau ET
// celui de la maison enregistres a la fois, l'appareil bascule tout
// seul selon lequel est disponible au demarrage.
bool connecterAUnReseauEnregistre() {
  int n = nombreReseaux();
  for (int i = 0; i < n; i++) {
    if (connecterReseauParIndex(i)) return true;
  }
  return false;
}

// Reconnexion EN DIRECT vers un reseau DEJA enregistre (pas besoin de
// redonner le mot de passe) -- utilise par POST /api/basculer, donc
// par le futur ecran "configAlerte" de l'admin.
bool basculerVers(const String& ssid) {
  int idx = indexReseau(ssid);
  if (idx == -1) return false;
  WiFi.disconnect();
  backendResolved = false;  // le backend sera peut-etre ailleurs sur le nouveau reseau
  return connecterReseauParIndex(idx);
}

// previa-alarme-XXXXXX.local (XXXXXX = idAppareil(), voir plus haut) --
// service _previaalarme._tcp annonce en plus du nom d'hote, pour qu'un
// navigateur/backend puisse DECOUVRIR tous les appareils Previa du
// reseau sans connaitre leur identifiant a l'avance (parcourir
// "_previaalarme._tcp.local." plutot que deviner un nom).
void demarrerMdnsClient() {
  String hostname = "previa-alarme-" + idAppareil();
  if (!MDNS.begin(hostname.c_str())) {
    Serial.println("Erreur demarrage mDNS");
    return;
  }
  MDNS.addService("previaalarme", "tcp", 80);
  MDNS.addServiceTxt("previaalarme", "tcp", "id", idAppareil());
  MDNS.addServiceTxt("previaalarme", "tcp", "ssid", ssidActuel);
  Serial.printf("mDNS : %s.local annonce (service _previaalarme._tcp)\n", hostname.c_str());
}

// ---- API HTTP locale (port 80, meme reseau) ---------------------------
// Destinee au futur ecran "configAlerte" de l'admin web -- CORS ouvert
// (accès direct depuis un navigateur sur previa.local, une origine
// differente de previa-alarme-XXXXXX.local) et corps de requete en
// application/x-www-form-urlencoded pour les POST (comme un <form>
// HTML classique, pas du JSON), pareil que /save en mode configuration.
void ajouterEntetesCors() {
  configServer.sendHeader("Access-Control-Allow-Origin", "*");
  configServer.sendHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  configServer.sendHeader("Access-Control-Allow-Headers", "Content-Type");
}

void handleApiOptions() {
  ajouterEntetesCors();
  configServer.send(204);
}

// GET /api/etat -> { id, ssid_actuel, ip, rssi, reseaux: [ssid, ...] }
// Les mots de passe ne sont JAMAIS renvoyes, seulement les SSID.
void handleApiEtat() {
  ajouterEntetesCors();
  String json = "{";
  json += "\"id\":\"" + idAppareil() + "\",";
  json += "\"ssid_actuel\":\"" + ssidActuel + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"rssi\":" + String(WiFi.RSSI()) + ",";
  json += "\"reseaux\":[";
  int n = nombreReseaux();
  for (int i = 0; i < n; i++) {
    if (i > 0) json += ",";
    json += "\"" + ssidReseau(i) + "\"";
  }
  json += "]}";
  configServer.send(200, "application/json", json);
}

// POST /api/reseaux (ssid, password) -- ajoute un reseau a la liste
// SANS redemarrer ni se deconnecter du reseau actuel : le nouveau ne
// sera essaye qu'au prochain demarrage ou via /api/basculer.
void handleApiAjouterReseau() {
  ajouterEntetesCors();
  String ssid = configServer.arg("ssid");
  String password = configServer.arg("password");
  if (ssid.length() == 0) {
    configServer.send(400, "application/json", "{\"erreur\":\"ssid manquant\"}");
    return;
  }
  bool ok = ajouterReseau(ssid, password);
  configServer.send(ok ? 200 : 409, "application/json",
                     ok ? "{\"ok\":true}" : "{\"erreur\":\"liste pleine\"}");
}

// POST /api/reseaux/supprimer (ssid)
void handleApiSupprimerReseau() {
  ajouterEntetesCors();
  String ssid = configServer.arg("ssid");
  bool ok = supprimerReseau(ssid);
  configServer.send(ok ? 200 : 404, "application/json",
                     ok ? "{\"ok\":true}" : "{\"erreur\":\"introuvable\"}");
}

// POST /api/basculer (ssid) -- reconnecte vers un reseau DEJA
// enregistre. Repond AVANT de couper le WiFi (sinon l'appelant reste
// bloque a attendre une reponse qui n'arrivera qu'une fois reconnecte,
// voire jamais si le nouveau reseau echoue).
void handleApiBasculer() {
  ajouterEntetesCors();
  String ssid = configServer.arg("ssid");
  if (indexReseau(ssid) == -1) {
    configServer.send(404, "application/json", "{\"erreur\":\"reseau non enregistre\"}");
    return;
  }
  configServer.send(200, "application/json", "{\"ok\":true,\"info\":\"bascule en cours\"}");
  delay(200);
  basculerVers(ssid);
}

void demarrerApiClient() {
  configServer.on("/api/etat", HTTP_GET, handleApiEtat);
  configServer.on("/api/etat", HTTP_OPTIONS, handleApiOptions);
  configServer.on("/api/reseaux", HTTP_POST, handleApiAjouterReseau);
  configServer.on("/api/reseaux", HTTP_OPTIONS, handleApiOptions);
  configServer.on("/api/reseaux/supprimer", HTTP_POST, handleApiSupprimerReseau);
  configServer.on("/api/reseaux/supprimer", HTTP_OPTIONS, handleApiOptions);
  configServer.on("/api/basculer", HTTP_POST, handleApiBasculer);
  configServer.on("/api/basculer", HTTP_OPTIONS, handleApiOptions);
  configServer.begin();
}

bool resolveBackend() {
  Serial.printf("Resolution mDNS de %s.local ...\n", BACKEND_MDNS_NAME);
  IPAddress ip = MDNS.queryHost(BACKEND_MDNS_NAME);
  if (ip.toString() == "0.0.0.0") {
    Serial.println("  -> introuvable (le backend est-il lance et sur le meme reseau ?)");
    return false;
  }
  backendIP = ip;
  Serial.print("  -> trouve : "); Serial.println(backendIP);
  return true;
}

// Lit une valeur booleenne "cle":true/false dans un JSON plat sans
// bibliotheque de parsing (le corps de GET /alarme/etat est toujours
// exactement {"lampe":true,"sirene":false} ou equivalent -- pas besoin
// de plus pour un microcontroleur).
bool extraireBool(const String& json, const char* cle, bool valeurParDefaut) {
  String motif = String("\"") + cle + "\":";
  int idx = json.indexOf(motif);
  if (idx == -1) return valeurParDefaut;
  int debut = idx + motif.length();
  return json.substring(debut, debut + 4) == "true";
}

// La lampe CLIGNOTE en cas de danger (plus visible/dissuasif qu'une
// lumiere fixe, et permet de la distinguer d'un simple eclairage laisse
// allume) ; la sirene, elle, reste continue -- son role est d'etre
// entendue, pas vue, pas besoin de la couper/rallumer.
void appliquerEtatAlarme(bool lampe, bool sirene) {
  digitalWrite(SIRENE_PIN, sirene ? HIGH : LOW);
  alarmeLampeActive = lampe;
  if (!lampe) {
    digitalWrite(LAMPE_PIN, LOW);
    etatPinLampe = false;
  }
  // Si lampe==true, c'est gererClignotementLampe() (appelee a chaque
  // tour de loop(), voir plus bas) qui pilote reellement la broche.
}

void gererClignotementLampe() {
  if (!alarmeLampeActive) return;
  unsigned long now = millis();
  if (now - dernierToggleLampe >= CLIGNOTEMENT_LAMPE_MS) {
    dernierToggleLampe = now;
    etatPinLampe = !etatPinLampe;
    digitalWrite(LAMPE_PIN, etatPinLampe ? HIGH : LOW);
  }
}

void pollBackend() {
  if (!backendResolved) {
    backendResolved = resolveBackend();
    if (!backendResolved) return;
  }

  HTTPClient http;
  String url = "http://" + backendIP.toString() + ":" + String(BACKEND_PORT) + "/alarme/etat";
  http.begin(url);
  http.setTimeout(2000);
  int code = http.GET();

  if (code == 200) {
    String payload = http.getString();
    bool lampe = extraireBool(payload, "lampe", false);
    bool sirene = extraireBool(payload, "sirene", false);
    appliquerEtatAlarme(lampe, sirene);
    Serial.printf("Etat alarme : lampe=%s sirene=%s\n", lampe ? "ON" : "off", sirene ? "ON" : "off");
  } else {
    Serial.printf("Backend injoignable (code=%d), nouvelle resolution mDNS au prochain essai.\n", code);
    backendResolved = false;
  }
  http.end();
}

// ---------------------------------------------------------------------------
void setup() {
  WRITE_PERI_REG(RTC_CNTL_BROWN_OUT_REG, 0);  // evite les resets en boucle sur alim USB faible

  Serial.begin(115200);
  pinMode(LAMPE_PIN, OUTPUT);
  pinMode(SIRENE_PIN, OUTPUT);
  appliquerEtatAlarme(false, false);  // etat sur au demarrage : tout eteint
  prefs.begin("previaAlarme", false);

  if (nombreReseaux() > 0 && connecterAUnReseauEnregistre()) {
    demarrerMdnsClient();
    demarrerApiClient();
  } else {
    Serial.println("Aucun reseau enregistre joignable.");
    startConfigMode();  // boucle infinie : ne rend la main qu'apres ESP.restart()
  }
}

void loop() {
  // On n'arrive ici que si on est bien connecte en mode client.
  if (WiFi.status() != WL_CONNECTED) {
    Serial.println("Connexion WiFi perdue -> redemarrage pour re-tenter / repasser en config si besoin.");
    delay(1000);
    ESP.restart();
  }

  configServer.handleClient();
  gererClignotementLampe();

  unsigned long now = millis();
  if (now - lastPoll >= POLL_INTERVAL_MS) {
    lastPoll = now;
    pollBackend();
  }
}
