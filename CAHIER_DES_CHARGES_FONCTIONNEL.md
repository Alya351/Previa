# 📋 CAHIER DES CHARGES FONCTIONNEL
# **PREVIA — OPERATIONS CENTER**
### *Plateforme Web de Vidéosurveillance Intelligente et d'Analyse Comportementale par IA*

* **Type d'application** : Application Web Responsive (SPA — React / Vite)
* **Version du document** : 2.2 — Document de référence consolidé (Version de Production Edge AI Raspberry Pi)
* **Date** : 2 octobre 2026
* **Statut** : Diffusable

---

## 📌 Sommaire
1. [Contexte](#1-contexte)
2. [Objectifs du portail web](#2-objectifs-du-portail-web)
3. [Profils Utilisateurs et Droits d'Accès](#3-profils-utilisateurs-et-droits-daccès)
4. [Arborescence et Parcours de Navigation](#4-arborescence-et-parcours-de-navigation)
   - [4.1. MODULE 1 : Authentification, Sécurité et Gestion des Licences](#41-module-1--authentification-sécurité-et-gestion-des-licences)
   - [4.2. MODULE 2 : Tableau de Bord & Supervision Vidéo Temps Réel](#42-module-2--tableau-de-bord--supervision-vidéo-temps-réel)
   - [4.3. MODULE 3 : Cartographie Caméras & Dessin de Zones de Sécurité](#43-module-3--cartographie-caméras--dessin-de-zones-de-sécurité)
   - [4.4. MODULE 4 : Module Personnel & Reconnaissance Faciale (Face ID)](#44-module-4--module-personnel--reconnaissance-faciale-face-id)
   - [4.5. MODULE 5 : Module Objets & Détection des Comportements Suspects](#45-module-5--module-objets--détection-des-comportements-suspects)
   - [4.6. MODULE 6 : Centre de Gestion des Alertes](#46-module-6--centre-de-gestion-des-alertes)
   - [4.7. MODULE 7 : Historique, Traçabilité & Export de Rapports](#47-module-7--historique-traçabilité--export-de-rapports)
   - [4.8. MODULE 8 : Organisation Multi-sites](#48-module-8--organisation-multi-sites)
5. [Exigences Non Fonctionnelles](#5-exigences-non-fonctionnelles)
   - [5.1. Performance & Réactivité](#51-performance--réactivité)
   - [5.2. Ergonomie & Accessibilité (UI/UX)](#52-ergonomie--accessibilité-uiux)
6. [Matrice de Recette et Critères d'Acceptation](#6-matrice-de-recette-et-critères-dacceptation)
7. [Annexe — Glossaire](#annexe--glossaire)

---

## 1. Contexte
La vidéosurveillance conventionnelle génère un volume massif d'images que les équipes de sécurité ne peuvent traiter en continu de façon proactive. Le projet PREVIA vise à automatiser la détection des anomalies de sécurité en temps réel grâce à l'intelligence artificielle appliquée aux flux vidéo existants, afin de transformer une surveillance passive en un dispositif de prévention active.

---

## 2. Objectifs du portail web
* Fournir aux opérateurs de sécurité un poste de contrôle centralisé, fluide et sans latence perceptible.
* Réduire le temps de réaction humaine face aux incidents critiques (intrusions, départs de feu, colis suspects, rôdeurs).
* Offrir une interface d'administration autonome pour la gestion des accès biométriques (Face ID) et des infrastructures multi-sites.
* Garantir la traçabilité légale de tous les événements et faciliter la production de rapports d'audit.

---

## 3. Profils Utilisateurs et Droits d'Accès

| Profil | Rôle métier | Droits sur la plateforme web |
| :--- | :--- | :--- |
| **Superadministrateur** | Équipe Prévia : concepteur et éditeur de la solution | Suivi du nombre de clients utilisant la plateforme ; consultation de la période d'abonnement (date de début, de fin et statut) de chaque client ; résiliation d'un abonnement (désactivation immédiate de l'accès du client à la plateforme, action journalisée). |
| **Administrateur Principal** | Gestionnaire/Responsable principal du site ou du domicile | Accès complet à la plateforme, y compris à l'organisation : création/suppression des comptes manager et utilisateur, gestion des bâtiments, pièces et caméras, configuration des boîtiers d'alarme, dessin des zones non autorisées par caméra ; plus tableau de bord, flux vidéo en direct, journal des événements, alertes en temps réel et génération de rapports (PDF/Excel). |
| **Manager Département** | Responsable d'un site à surveiller ou d'un département | Accès à la plateforme à l'exception de la gestion de l'organisation (ne peut pas affecter de bâtiments à surveiller, puisque lui-même s’est vu attribuer la gestion d’un bâtiment) ; il peut cependant affecter la surveillance d’une pièce de son bâtiment a un subordonné ; tableau de bord (caméras actives, personnes détectées, comportements suspects, taux de disponibilité), flux vidéo en direct, détail des personnes et objets détectés, journal des événements filtrable, alertes de sécurité en temps réel, génération et téléchargement de rapports. |
| **Utilisateur** | Employé, agent de sécurité, habitant d’un domicile | Réception d'alertes automatiques en cas de comportement suspect ; consultation de l'historique des alertes ; visualisation du flux vidéo en direct depuis l'application mobile ; accès à la plateforme web depuis l'application mobile ; validation ou rejet manuel de chaque alerte, aucune action n'étant déclenchée automatiquement par le système. |

---

## 4. Arborescence et Parcours de Navigation

| Écran / Route | Contenu principal |
| :--- | :--- |
| `/login` | Connexion et amorçage initial du premier compte |
| `/admin › Tableau de bord` | KPIs, grille vidéo en direct, mini-cartes IA |
| `/admin › Caméras` | Grille des flux, dessin de zones interdites |
| `/admin › Personnel & Face ID` | Annuaire, enrôlement photo, journal des accès |
| `/admin › Objets & Colis` | Inventaire temps réel, alertes colis abandonnés |
| `/admin › Historique` | Journal des événements chronologique et filtrable |
| `/admin › Alertes` | Centre de tri des alertes, levée de doute |
| `/admin › Rapports` | Générateur et export PDF / Excel |
| `/admin › Organisation *Admin` | Arborescence Bâtiments / Pièces / Caméras / Comptes |

---

### 4.1. MODULE 1 : Authentification, Sécurité et Gestion des Licences

* **REQ-AUTH-01 (Connexion standard)** :
  * Saisie de l'email et du mot de passe, avec option d'affichage/masquage du mot de passe.
  * Stockage sécurisé de la session utilisateur (`sessionStorage`) avec gestion des rôles associés.
* **REQ-AUTH-02 (Amorçage de licence - premier compte)** :
  * Formulaire dédié à la première mise en service, exigeant un code secret d'amorçage validé par le Superadministrateur.
* **REQ-AUTH-03 (Contrôle d'expiration de licence)** :
  * Vérification continue de la validité de la licence (durée : 1 an).
  * Affichage automatique d'un écran de blocage complet avec formulaire de réactivation si la licence est échue.
  * Affichage discret du nombre de jours restants dans la barre de menu.

---

### 4.2. MODULE 2 : Tableau de Bord & Supervision Vidéo Temps Réel

* **REQ-DASH-01 (Indicateurs clés - KPIs)** :
  * Affichage dynamique de 4 compteurs : caméras actives / total, personnes détectées, comportements suspects en cours, taux de disponibilité du système.
  * Clic sur un KPI pour naviguer directement vers la section détaillée associée.
* **REQ-DASH-02 (Mosaïque vidéo en direct)** :
  * Grille réactive (1 à 4 colonnes selon la taille de l'écran) avec badge pulsant « LIVE » par caméra.
  * Flux en direct via protocole WebRTC avec bascule de secours automatique sur rafraîchissement d'images instantanées en cas de perte de signal.
* **REQ-DASH-03 (Bannière d'alerte critique)** :
  * Affichage prioritaire avec pulsation visuelle rouge en cas d'alerte majeure en cours (ex. feu, intrusion).
* **REQ-DASH-04 (Modale HUD haute définition)** :
  * Agrandissement d'une caméra sélectionnée avec bascule WebRTC / repli automatique.
  * Actions rapides : prise d'instantané photo, commande de test webcam locale, fermeture au clavier (touche Échap).

---

### 4.3. MODULE 3 : Cartographie Caméras & Dessin de Zones de Sécurité

* **REQ-CAM-01 (Inventaire et état des caméras)** :
  * Liste des caméras avec état de connexion, emplacement (bâtiment / pièce), résolution et statut de streaming.
* **REQ-CAM-02 (Éditeur de zones polygonales)** :
  * Outil graphique interactif permettant de tracer, point par point, un polygone d'exclusion directement sur l'image fixe d'une caméra.
  * Sauvegarde et suppression des coordonnées polygonales associées à chaque caméra.
* **REQ-CAM-03 (Détection d'intrusion en zone)** :
  * Génération d'une alerte immédiate dès qu'une boîte englobante humaine franchit le polygone tracé.

---

### 4.4. MODULE 4 : Module Personnel & Reconnaissance Faciale (Face ID)

* **REQ-FACE-01 (Annuaire biométrique)** :
  * Liste des personnes enregistrées : nom, prénom, département / fonction, photo d'enrôlement, statut (actif / bloqué).
* **REQ-FACE-02 (Enrôlement photographique)** :
  * Formulaire d'ajout d'une personne avec téléversement d'une ou plusieurs photos de référence pour l'entraînement du modèle Face ID.
* **REQ-FACE-03 (Journal des reconnaissances & repli gros plan)** :
  * Historique horodaté des détections faciales avec indice de confiance de l'IA (reconnu / inconnu).
  * Repli d'urgence en détection faciale directe (InsightFace ArcFace) lorsque le corps n'est pas intégralement visible (ex: gros plan visage / selfie de très près).
* **REQ-FACE-04 (Auto-redressement d'orientation des caméras à 90°)** :
  * Détection automatique des trames orientées en mode portrait (`Hauteur > Largeur`) envoyées par les caméras pivotées sur leur support physique.
  * Pivotement logiciel instantané par cv2.ROTATE_90_CLOCKWISE avant l'inférence pour présenter les corps humains à la verticale et garantir la détection nominale par YOLO.

---

### 4.5. MODULE 5 : Module Objets & Détection des Comportements Suspects

* **REQ-OBJ-01 (Suivi d'objets en direct)** :
  * Inventaire temps réel des objets détectés (sacs, colis, valises, véhicules) avec attribution d'un identifiant de suivi (Track ID).
* **REQ-OBJ-02 (Détection d'objets abandonnés)** :
  * Analyse spatiale de proximité : calcul de la distance entre l'objet détecté et les personnes environnantes.
  * Qualification automatique en « Objet Abandonné » si aucun propriétaire n'est à proximité au-delà d'un délai configurable (valeur par défaut : 2 minutes).
* **REQ-OBJ-03 (Détection de rôdeurs & immobilité - REQ-CAM-04)** :
  * Identification d'individus stationnant de façon prolongée dans une zone avec seuil temporel paramétrable par zone/caméra (défaut : 60 secondes).
  * Neutralisation des fausses alertes : les personnes assises normalement ou effectuant des arrêts courts ne déclenchent pas d'alerte.
* **REQ-OBJ-04 (Détection d'Infiltration & qualification des accès - REQ-CAM-05)** :
  * Qualification formelle de l'infiltration par coïncidence de zone intérieure, absence de badge/Face ID autorisé et apparition non précédée par une caméra d'entrée.
  * Règle de suspicion bienveillante : la non-reconnaissance biométrique Face ID attribue le statut neutre Visiteur/Non identifié (🟢/🔵). La suspicion (🔴) exige une anomalie comportementale ou d'accès avérée.

---

### 4.6. MODULE 6 : Centre de Gestion des Alertes

* **REQ-ALT-01 (Panneau d'alertes temps réel & validation multi-frames)** :
  * Liste chronologique des alertes avec confirmation préalable sur au moins 3 trames consécutives pour supprimer les flashs de faux positifs.
  * Filtre par niveau d'urgence : Critique, Élevé, Informatif.
* **REQ-ALT-02 (Modale de levée de doute avec extrait vidéo MP4 10s)** :
  * Affichage automatique d'un clip vidéo de 10s (5s avant / 5s après l'incident) en complément de la photo instantanée pour une levée de doute rapide et décisive.
  * Fiche de consigne d'intervention (Playbook d'action) personnalisée selon le type d'alerte et la zone concernée.
* **REQ-ALT-03 (Acquittement & suivi des faux positifs)** :
  * Bouton d'action « Marquer comme Vérifié » ou « Faux Positif » avec enregistrement de la raison pour alimenter le calibrage statistique du système.

---

### 4.7. MODULE 7 : Historique, Traçabilité & Export de Rapports

* **REQ-REP-01 (Journal d'audit exhaustif)** :
  * Registre infalsifiable de tous les passages, détections et actions opérateurs, avec date, heure, caméra, type d'événement et image de capture.
* **REQ-REP-02 (Moteur de recherche et filtres multicritères)** :
  * Filtrage combiné par plage de dates, site / bâtiment, type d'incident et niveau de gravité.
* **REQ-REP-03 (Exportation de rapports)** :
  * Export des données filtrées au format PDF (rapport de synthèse prêt pour la direction) et Excel / CSV (pour analyse statistique et audit).

---

### 4.8. MODULE 8 : Organisation Multi-sites

* **REQ-ORG-01 (Structure organisationnelle)** :
  * Interface d'administration pour créer et organiser la hiérarchie : Sites → Bâtiments → Pièces → Caméras rattachées.
* **REQ-ORG-02 (Gestion des comptes utilisateurs)** :
  * Création, modification, révocation des comptes et attribution des rôles définis.

---

## 5. Exigences Non Fonctionnelles

### 5.1. Performance & Réactivité
* **Latence d'affichage vidéo** : Moins de 500 ms pour l'affichage des flux en direct via WebRTC.
* **Délai de notification** : Moins de 2 secondes entre la détection par l'IA et l'affichage de l'alerte sur le tableau de bord web.

### 5.2. Ergonomie & Accessibilité (UI/UX)
* **Design System** : Charte graphique moderne, typographies lisibles.
* **Adaptabilité (Responsive)** : Fonctionnement fluide sur moniteurs de sécurité de bureau, ordinateurs portables, tablettes et smartphones.
* **Navigation clavier** : Prise en charge des raccourcis usuels (fermeture des modales par Échap, sélection par Entrée).

### 5.3. Sécurité Informatique, Biométrie & Conformité RGPD / CIL
* **Authentification Renforcée (2FA)** : Support du second facteur d'authentification (TOTP / OTP) obligatoire pour les comptes Administrateur.
* **Chiffrement au repos** : Chiffrement AES-256 des empreintes faciales au repos et registre de traitement CIL formalisé avec durées de rétention strictes.
* **Journal d'audit inviolable** : Journalisation immuable de toutes les actions d'administration et d'exploitation (création/suppression de compte, modification de zones, révocations).
* **Signalétique réglementaire** : Mentions légales obligatoires et panneaux d'information de vidéosurveillance intégrés.

### 5.4. Résilience Matérielle, API Ouverte & Exploitation
* **Alimentation secourue (UPS)** : Interfaçage et recommandation d'une alimentation sans interruption pour la continuité de service en cas de coupure de courant.
* **Détection de masquage / coupure caméra** : Alerte immédiate en cas d'obstruction optique, de masquage ou de câble débranché (> 15s sans frame).
### 5.5. Architecture Edge AI, Décodage GPU & Traitement Vidéo Basse Latence
* **NFA-AI-01 : Accélération Inférence ONNX C++** — Exécution des réseaux de neurones (YOLOv8n / YOLO11n) privilégiée au format ONNX via OpenCV DNN C++ avec instructions vectorielles ARM NEON, pour supprimer la surcharge d'exécution PyTorch et maintenir la latence d'inférence au plus bas.
* **NFA-AI-02 : Décodage Vidéo Matériel GPU (v4l2m2m) & Repli à Chaud** — Décodage des flux RTSP pris en charge par le bloc GPU (VideoCore VI `h264_v4l2m2m` sous Linux/Pi 4) placé en option d'entrée FFmpeg. En cas d'incompatibilité de profil vidéo ou d'échec d'ouverture, basculement automatique et silencieux en décodage logiciel CPU sans interruption de service.
* **NFA-AI-03 : Stockage Zéro-Disque & Tampons RAM Circulaires** — Conservation des instantanés vidéo et des clips de preuve (10s) exclusivement en mémoire vive (RAM) via des structures circulaires à taille fixe (`deque maxlen=150`). Garantit la protection contre le débordement mémoire (OOM) et élimine la contention I/O d'écriture sur carte SD.
* **NFA-AI-04 : Verrou Anti-Contention & Télémétrie de Santé IA** — Protection par verrou d'exclusion mutuelle non-bloquant (`_analyses_lock`) éliminant tout risque d'accumulation de file d'attente. Suivi télémétrique continu du taux de ticks d'analyse ignorés sur fenêtre glissante de 60 secondes, avec alerte système si le taux dépasse 20%.
* **NFA-AI-05 : Calibrage Statistique du Cadencement (`P95 × 1,3`)** — Définition de l'intervalle de cycle du worker IA basée sur le 95e percentile (P95) de latence d'inférence mesurée à chaud sous tension nominale, augmenté d'une marge de sécurité de 30% pour absorber la variance naturelle d'exécution.
* **NFA-AI-06 : Synchronisation Automatique de l'Horloge Système PC vers Edge (Raspberry Pi)** — Injection automatique de la date et heure système du PC de supervision (`date -s 'YYYY-MM-DD HH:MM:SS'`) lors du lancement 1-clic pour pallier l'absence de batterie horloge (RTC) matérielle sur les boîtiers Edge et prévenir les décalages d'horodatage.
* **NFA-AI-07 : Transactions SQLite Isolées & Synchronisation Non Bloquante** — Exécution des requêtes d'historisation `INSERT` dans des blocs transactionnels isolés sans changement de pragma dynamique pendant les transactions (`PRAGMA synchronous`), prévenant tout blocage `OperationalError`.

---

## 6. Matrice de Recette et Critères d'Acceptation

| ID | Scénario de test | Résultat attendu pour validation |
| :---: | :--- | :--- |
| **TEST-01** | Connexion avec identifiants valides | Redirection immédiate vers le tableau de bord avec session active. |
| **TEST-02** | Clic sur une caméra dans la grille | Ouverture instantanée de la modale vidéo en direct HD. |
| **TEST-03** | Appui sur la touche Échap dans une modale | Fermeture propre de la modale et retour au tableau de bord. |
| **TEST-04** | Tracé d'une zone interdite sur une caméra | Le polygone est enregistré et persiste après rechargement de la page. |
| **TEST-05** | Détection d'un événement par le backend | Apparition d'une notification avec badge rouge et signal sonore en moins de 2 secondes. |
| **TEST-06** | Clic sur « Marquer comme vérifié » | L'alerte change d'état et l'action de l'opérateur est inscrite au journal d'audit. |
| **TEST-07** | Exportation d'un rapport d'historique | Téléchargement immédiat d'un fichier PDF / Excel conforme aux filtres sélectionnés. |
| **TEST-08** | Expiration de la licence | Blocage complet de l'interface avec invitation de renouvellement. |
| **TEST-09** | Enrôlement d'une nouvelle personne (Face ID) | La personne apparaît dans l'annuaire et est reconnue lors du passage suivant devant une caméra. |
| **TEST-10** | Objet laissé sans surveillance > délai configuré | Alerte « Objet Abandonné » générée automatiquement. |

---

## Annexe — Glossaire

| Terme | Définition |
| :--- | :--- |
| **WebRTC** | Protocole de communication permettant la diffusion de flux audio/vidéo en temps réel et à faible latence dans un navigateur web. |
| **RTSP** | Real Time Streaming Protocol : protocole standard utilisé par les caméras IP pour la diffusion de flux vidéo. |
| **Face ID** | Fonction de reconnaissance faciale permettant d'identifier automatiquement une personne enregistrée à partir d'un flux vidéo. |
| **Raspberry Pi (Edge AI)** | Serveur embarqué autonome hébergeant le moteur d'IA, la base de données locale SQLite et le serveur web HTTPS (aucun boîtier externe requis). |
| **mDNS** | Multicast DNS : protocole de découverte automatique d'appareils sur un réseau local sans serveur DNS central. |
| **Track ID** | Identifiant unique attribué par le module de vision par ordinateur à un objet suivi d'image en image. |
| **Levée de doute** | Processus de vérification humaine d'une alerte générée par l'IA avant décision d'action. |
| **SPA** | Single Page Application : application web fonctionnant sur une page unique rechargée dynamiquement. |
