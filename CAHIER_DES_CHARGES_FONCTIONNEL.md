# 📋 CAHIER DES CHARGES FONCTIONNEL
# **PREVIA — OPERATIONS CENTER & COMPANION MOBILE**
### *Plateforme Multiplateforme de Vidéosurveillance Intelligente et de Sécurité Prédictive par IA*

* **Type d'application** : Application Web Responsive (React / Vite) & Application Mobile (React Native / Expo)
* **Version du document** : 3.0 — Document Consolidé et Restructuré (Version de Production Edge AI & Jury OSC)
* **Date** : 3 octobre 2026
* **Statut** : Diffusable

---

## 📌 Sommaire
1. [Contexte et Problématique](#1-contexte-et-problématique)
2. [Objectifs du Système PREVIA](#2-objectifs-du-système-previa)
3. [Profils Utilisateurs, Rôles et Matrice des Droits](#3-profils-utilisateurs-rôles-et-matrice-des-droits)
4. [Architecture des Modules et Fonctionnalités](#4-architecture-des-modules-et-fonctionnalités)
   - [4.1. MODULE 1 : Authentification, Sécurité et Gestion des Sessions](#41-module-1--authentification-sécurité-et-gestion-des-sessions)
   - [4.2. MODULE 2 : Supervision Vidéo Temps Réel & Dashboard (Web & Mobile)](#42-module-2--supervision-vidéo-temps-réel--dashboard-web--mobile)
   - [4.3. MODULE 3 : Cartographie, Bâtiments et Dessin de Zones de Sécurité](#43-module-3--cartographie-bâtiments-et-dessin-de-zones-de-sécurité)
   - [4.4. MODULE 4 : Annuaire Personnel, Biométrie & Reconnaissance Faciale (Face ID)](#44-module-4--annuaire-personnel-biométrie--reconnaissance-faciale-face-id)
   - [4.5. MODULE 5 : Détection des Anomalies Comportementales & Objets](#45-module-5--détection-des-anomalies-comportementales--objets)
   - [4.6. MODULE 6 : Centre de Gestion des Alertes & Levée de Doute](#46-module-6--centre-de-gestion-des-alertes--levée-de-doute)
   - [4.7. MODULE 7 : Historique, Traçabilité & Export de Rapports](#47-module-7--historique-traçabilité--export-de-rapports)
   - [4.8. MODULE 8 : Administration Multi-sites et Affectation des Rôles](#48-module-8--administration-multi-sites-et-affectation-des-rôles)
   - [4.9. MODULE 9 : Console d'Administration Globale (Superadmin) & Licences](#49-module-9--console-dadministration-globale-superadmin--licences)
   - [4.10. MODULE 10 : Application Mobile Companion & Notifications Push](#410-module-10--application-mobile-companion--notifications-push)
5. [Exigences Non Fonctionnelles et Qualité de Service](#5-exigences-non-fonctionnelles-et-qualité-de-service)
   - [5.1. Performance, Latence et Mesures Chiffrées](#51-performance-latence-et-mesures-chiffrées)
   - [5.2. Ergonomie, UI/UX et Accessibilité](#52-ergonomie-uiux-et-accessibilité)
   - [5.3. Sécurité, Biométrie et Conformité Légale (APDP Burkina Faso)](#53-sécurité-biométrie-et-conformité-légale-apdp-burkina-faso)
   - [5.4. Exploitation, Résilience et Horodatage NTP](#54-exploitation-résilience-et-horodatage-ntp)
6. [Cadre Technique et Limites Connues de la Solution](#6-cadre-technique-et-limites-connues-de-la-solution)
7. [Scénario de Démonstration Réelle (3 Minutes)](#7-scénario-de-démonstration-réelle-3-minutes)
8. [Matrice de Recette et Critères d'Acceptation](#8-matrice-de-recette-et-critères-dacceptation)
9. [Annexe — Glossaire](#annexe--glossaire)

---

## 1. Contexte et Problématique
La vidéosurveillance conventionnelle génère un volume massif d'images que les équipes de sécurité ne peuvent pas traiter en continu de façon proactive. Dans les entreprises comme dans les domiciles, la majorité des incidents (intrusions, vols, rôdeurs) sont constatés *a posteriori*, transformant les caméras en simples enregistreurs passifs. 

Le système **PREVIA** automatise la détection d'anomalies en temps réel grâce à une intelligence artificielle déployée localement (*Edge AI*). Il analyse en continu les flux vidéo existants sans recourir au cloud, garantissant la confidentialité des données et réduisant le temps d'intervention des équipes de sécurité.

---

## 2. Objectifs du Système PREVIA
* **Supervision Unifiée** : Offrir une interface Web et une application Mobile synchronisées sans latence perceptible.
* **Prévention Active** : Alerter en moins de 2 secondes lors d'une intrusion en zone protégée ou d'un comportement suspect (rôdage prolongé).
* **Autonomie Edge AI** : Fonctionner à 100% sur un boîtier local (Raspberry Pi 4 / 5) sans dépendance vers des serveurs externes.
* **Traçabilité Légale** : Enregistrer de manière infalsifiable les événements, photos de preuve et clips vidéo.

---

## 3. Profils Utilisateurs, Rôles et Matrice des Droits

| Profil | Rôle Métier | Droits d'Accès sur la Plateforme (Web & Mobile) |
| :--- | :--- | :--- |
| **Superadministrateur** | Équipe PREVIA / Éditeur de la solution | Consultation du parc client, suivi des périodes d'abonnement, activation/résiliation à distance des licences, monitoring global des boîtiers Edge. |
| **Administrateur Principal** | Responsible Sécurité / Directeur de Site / Propriétaire | Accès total : gestion de l'organisation multi-sites (bâtiments, pièces, caméras), création/révocation des comptes, configuration des zones d'intrusion, enrôlement Face ID, validation d'alertes, export de rapports. |
| **Manager Département** | Responsable d'un bâtiment ou d'une zone spécifique | Supervision du bâtiment attribué, affectation des pièces à surveiller aux agents sous sa responsabilité, consultation du direct, traitement des alertes, export des rapports du site. |
| **Utilisateur / Agent** | Agent de sécurité, employé, résident | Réception des notifications push d'alerte sur l'application mobile, consultation du flux vidéo direct, levée de doute et validation/rejet manuel des alertes assignées. |

---

## 4. Architecture des Modules et Fonctionnalités

### 4.1. MODULE 1 : Authentification, Sécurité et Gestion des Sessions
* **REQ-AUTH-01 (Connexion & Validation Serveur)** :
  * Authentification par email/mot de passe avec contrôle de validité effectué strictement par le serveur (jetons de session sécurisés HTTP/JWT).
  * Verrouillage automatique du compte pendant 15 minutes après 5 tentatives d'authentification infructueuses.
* **REQ-AUTH-02 (Authentification Renforcée 2FA)** :
  * Prise en charge du second facteur d'authentification (TOTP / Google Authenticator) optionnel pour les utilisateurs et obligatoire pour les comptes Administrateur.
* **REQ-AUTH-03 (Amorçage de licence & premier compte)** :
  * Formulaire initial exigeant une clé d'activation signée par le Superadministrateur pour initialiser l'Administrateur Principal.
* **REQ-AUTH-04 (Contrôle d'expiration de licence)** :
  * Vérification continue de la validité de la licence (1 an). Blocage de l'interface d'administration et alerte de renouvellement en cas d'expiration.

---

### 4.2. MODULE 2 : Supervision Vidéo Temps Réel & Dashboard (Web & Mobile)
* **REQ-DASH-01 (Indicateurs Clés - KPIs)** :
  * Affichage dynamique de 4 compteurs : caméras actives, personnes détectées, comportements suspects en cours, taux de disponibilité global du système.
* **REQ-DASH-02 (Mosaïque Vidéo Multi-flux)** :
  * Grille vidéo réactive (1 à 4 caméras) avec indicateur « LIVE », bascule automatique WebRTC / flux image secours.
* **REQ-DASH-03 (Bannière d'Urgence Critique)** :
  * Signalisation visuelle et sonore prioritaire en cas d'incident majeur (intrusion, rôdage suspect).
* **REQ-DASH-04 (Agrandissement HD & Instantané)** :
  * Ouverture d'une caméra en plein écran avec capture d'instantané photo manuelle à tout moment.

---

### 4.3. MODULE 3 : Cartographie, Bâtiments et Dessin de Zones de Sécurité
* **REQ-CAM-01 (Inventaire et État des Caméras)** :
  * Répertoire des caméras IP (RTSP, ONVIF) avec statut de connexion et affectation bâtiment/pièce.
* **REQ-CAM-02 (Éditeur de Zones Polygonales)** :
  * Outil graphique interactif pour dessiner des polygones d'exclusion directement sur le flux vidéo d'une caméra.
* **REQ-CAM-03 (Détection d'Intrusion en Zone)** :
  * Déclenchement d'une alerte immédiate lorsqu'un individu franchit le polygone tracé pendant la plage horaire active.
* **REQ-CAM-04 (Auto-redressement d'Orientation 0°/90°/180°/270°)** :
  * Analyse automatique de l'orientation de l'image (caméra montée sur le côté ou la tête en bas) et pivotement logiciel pour présenter les corps humains à la verticale aux modèles d'IA.

---

### 4.4. MODULE 4 : Annuaire Personnel, Biométrie & Reconnaissance Faciale (Face ID)
* **REQ-FACE-01 (Annuaire Biométrique)** :
  * Gestion du personnel et des résidents : nom, prénom, fonction, photo d'enrôlement, statut d'accès.
* **REQ-FACE-02 (Enrôlement Photographique)** :
  * Téléversement de photos de référence pour la création d'empreintes faciales biométriques.
* **REQ-FACE-03 (Journal des Accès & Repli Gros Plan)** :
  * Historique horodaté des identifications faciales avec taux de confiance.
  * Repli d'urgence biométrique (InsightFace ArcFace) lorsque le corps entier n'est pas visible (ex: gros plan visage / selfie devant caméra).

---

### 4.5. MODULE 5 : Détection des Anomalies Comportementales & Objets
* **REQ-OBJ-01 (Détection de Rôdeurs & Immobilité)** :
  * Alerte lors du stationnement prolonge d'un individu dans une zone au-delà d'un seuil configurable (défaut : 60 secondes).
* **REQ-OBJ-02 (Détection d'Objets & Colis Abandonnés)** :
  * Analyse de proximité spatiale : alerte si un sac ou colis reste séparé de toute personne pendant plus de 2 minutes.
* **REQ-OBJ-03 (Détection de Départ de Feu & Fumée)** :
  * Modèle de vision IA dédié identifiant la présence de flammes ou de colonnes de fumée sur l'ensemble des caméras actives.
* **REQ-OBJ-04 (Détection d'Infiltration)** :
  * Qualification d'une infiltration lors de l'apparition d'une personne non autorisée dans une zone interne sans passage préalable par une caméra d'entrée.

---

### 4.6. MODULE 6 : Centre de Gestion des Alertes & Levée de Doute
* **REQ-ALT-01 (Validation Multi-trames Anti-Faux Positifs)** :
  * Obligation de confirmation d'une anomalie sur au moins 3 trames consécutives avant de notifier l'opérateur.
* **REQ-ALT-02 (Levée de Doute avec Extrait Vidéo 10s)** :
  * Génération automatique d'un clip vidéo de 10 secondes (5s avant / 5s après l'incident) accessible dans la modale de décision.
* **REQ-ALT-03 (Acquittement & Qualification de l'Incident)** :
  * Action opérateur obligatoire : « Valider l'Alerte » ou « Marquer Faux Positif » avec enregistrement de la raison.

---

### 4.7. MODULE 7 : Historique, Traçabilité & Export de Rapports
* **REQ-REP-01 (Journal d'Audit Infalsifiable)** :
  * Enregistrement immuable dans une base SQLite locale de tous les incidents, détections, photos de preuve et actions opérateurs.
* **REQ-REP-02 (Formatage Temporel Relatif & Absolu)** :
  * Affichage de l'heure exacte et bascule automatique en format relatif : secondes (<60s), minutes (<60m), heures (<24h), jours (1 à 6j) et semaines (≥7j).
* **REQ-REP-03 (Exportation PDF & Excel/CSV)** :
  * Export des historiques filtrés au format PDF (rapport synthétique) et Excel (audit détaillé).

---

### 4.8. MODULE 8 : Administration Multi-sites et Affectation des Rôles
* **REQ-ORG-01 (Arborescence Hiérarchique)** :
  * Structuration : Sites → Bâtiments → Pièces → Caméras rattachées.
* **REQ-ORG-02 (Délégation des Droits Manager)** :
  * Possibilité pour un Manager d'affecter la supervision de pièces spécifiques de son bâtiment à des agents subordonnés.

---

### 4.9. MODULE 9 : Console d'Administration Globale (Superadmin) & Licences
* **REQ-SUP-01 (Supervision du Parc de Boîtiers Edge)** :
  * Vue globale de l'état de santé des Raspberry Pi déployés (charge CPU, mémoire, température, état des services).
* **REQ-SUP-02 (Gestion des Abonnements & Résiliation)** :
  * Suivi des dates d'échéance des licences clients avec capacité de suspension à distance en cas de résiliation.

---

### 4.10. MODULE 10 : Application Mobile Companion & Notifications Push
* **REQ-MOB-01 (Notifications Push Instantanées)** :
  * Envoi d'alertes push prioritaires sur smartphone (iOS / Android) dès la validation d'une alerte critique par le backend (< 2s).
* **REQ-MOB-02 (Supervision Mobile & Consultation Directe)** :
  * Visualisation des flux vidéo caméras en direct et de l'historique des alertes depuis l’application mobile.
* **REQ-MOB-03 (Validation Mobile en Mobilité)** :
  * Capacité pour l'agent en ronde de valider ou rejeter une alerte directement depuis son téléphone.

---

## 5. Exigences Non Fonctionnelles et Qualité de Service

### 5.1. Performance, Latence et Mesures Chiffrées
* **Capacité Cible du Boîtier Edge (Raspberry Pi 4)** :
  * **Nombre de caméras simultanées** : 2 à 4 flux caméras IP (résolution 1080p, 15-20 fps).
  * **Latence vidéo WebRTC** : Moins de 500 ms.
  * **Délai d’alerte global** : Moins de 2,0 secondes de la détection à l'affichage web/mobile.
* **Formule de Calcul du Taux de Disponibilité** :
  $$\text{Disponibilité (\%)} = \left( \frac{\text{Temps de fonctionnement actif du service (heures)}}{\text{Temps total de la période (heures)}} \right) \times 100$$
* **Matrice de Classification des Événements** :
  * **Critique (🔴)** : Intrusion en Zone Polygonale Interdite, Infiltration non autorisée.
  * **Élevé (🟠)** : Rôdeur immobile (immobilité suspecte > 60s).
  * **Informatif (🔵)** : Reconnaissance faciale (Employé Autorisé 🟢 / Visiteur Non Identifié 🔵).

---

### 5.2. Ergonomie, UI/UX et Accessibilité
* **Charte Visuelle** : Interface sombre moderne (*Dark Theme*) conçue pour réduire la fatigue visuelle des opérateurs en PC Sécurité.
* **Responsive Web & Mobile** : Adaptation fluide de l'écran 32 pouces de contrôle aux smartphones de 6 pouces.

---

### 5.3. Sécurité, Biométrie et Conformité Légale (APDP Burkina Faso)
* **Conformité Réglementaire (Loi N° 001-2021/AN du Burkina Faso sur la Protection des Données)** :
  * Le traitement des données biométriques faciales respecte les principes de proportionnalité et de transparence préconisés par l'**APDP (Autorité de Protection des Données Personnelles)** du Burkina Faso.
  * **Durées de rétention des données** : Paramétrable (30 jours par défaut) pour les journaux d'historique et clips d'incidents (purge automatique SQLite au-delà), et conservation des empreintes jusqu'à révocation explicite par l'administrateur.
* **Protection des Flux & Identifiants Caméras** :
  * Chiffrement des mots de passe RTSP au repos et transmission HTTPS obligatoire (certificats TLS générés en local).

---

### 5.4. Exploitation, Résilience et Horodatage NTP
* **Résilience aux Coupures de Courant & Sauvegarde Disque** :
  * Les clips vidéo de preuve (10s) sont conservés en mémoire vive (RAM) et **écrits immédiatement sur disque persistant dès la confirmation d'une alerte**, garantissant la conservation des preuves en cas de coupure secteur.
* **Synchronisation Automatique de l'Horloge (NTP & Host Sync)** :
  * Synchronisation continue via démon NTP local et injection de l'heure du PC de supervision (`date -s`) au démarrage du boîtier Edge pour garantir la valeur juridique des horodatages.

---

## 6. Cadre Technique et Limites Connues de la Solution

| Paramètre / Condition | Limite Technique Identifiée | Mesure de Contournement / Mitigation Appliquée |
| :--- | :--- | :--- |
| **Caméra installée sur le côté (90° / 270°)** | Effondrement de la détection sur sujets allongés | Auto-redressement logiciel au premier passage humain et mémorisation d'orientation par caméra (réinitialisable en administration). |
| **Éclairage nocturne nul (< 5 Lux)** | Bruit numérique sur l'image, perte de contrastes | Bascule automatique sur flux infrarouge N&B des caméras IP. |
| **Visage masqué / Selfie de très près** | YOLO corps non détecté par manque de posture | Repli automatique sur le réseau biométrique facial direct InsightFace. |
| **Matériel Cible Raspberry Pi 5 vs Pi 4** | Le Pi 5 n'a plus de décodeur H.264 matériel (`v4l2m2m`) | Basculement automatique transparent en décodage logiciel multi-cœur CPU. |
| **Alerte SMS hors-ligne (sans Internet)** | API web externe (ex: Twilio) inopérante sans réseau | Option d'interfaçage avec un modem GSM USB physique connecté directement au Pi. |

---

## 7. Scénario de Démonstration Réelle (3 Minutes)

* **Minute 00:00 - 01:00 (Présentation & Supervision)** :
  * Connexion à l'interface PREVIA Operations Center. Visualisation du tableau de bord avec KPIs et des caméras en direct en WebRTC / MJPEG.
* **Minute 01:00 - 02:00 (Intrusion en Zone Polygonale)** :
  * Franchissement d'une zone polygonale de sécurité tracée sur le flux vidéo. Déclenchement de la bannière rouge (Critique 🔴) et notification mobile.
* **Minute 02:00 - 03:00 (Rôdage & Qualification Face ID)** :
  * Immobilité prolongée (> 60s) en zone sensible (Alerte Élevée 🟠). Demonstration Face ID : passage d'un membre enrôlé (**🟢 Autorisé**) puis d'un profil non enregistré (**🔵 Visiteur**), démontrant la règle éthique *Inconnu $\neq$ Suspect*.

---

## 8. Matrice de Recette et Critères d'Acceptation

| ID | Scénario de Test | Résultat Attendu pour Validation |
| :---: | :--- | :--- |
| **TEST-01** | Connexion avec identifiants valides | Redirection immédiate vers le tableau de bord avec session active. |
| **TEST-02** | Clic sur une caméra dans la grille | Ouverture instantanée de la modale vidéo en direct HD. |
| **TEST-03** | Tracé d'une zone polygonale interdite | Le polygone est enregistré et persiste après rechargement. |
| **TEST-04** | Détection d'une intrusion en zone polygonale | Notification visuelle et sonore en moins de 2 secondes. |
| **TEST-05** | Notification Push sur l'application mobile | Réception de l'alerte sur smartphone en moins de 2 secondes. |
| **TEST-06** | Suppression complète de l'historique | Purge simultanée des fichiers de preuve et de la table SQLite. |
| **TEST-07** | Basculement Caméra Inclinée (90°) | Redressement de l'image, détection et mémorisation de l'orientation. |
| **TEST-08** | Incompatibilité GPU (`v4l2m2m`) | Basculement automatique en décodage CPU sans interruption. |
| **TEST-09** | Exportation d'un rapport d'historique | Téléchargement immédiat d'un fichier PDF ou Excel conforme. |
| **TEST-10** | Expiration de la licence | Blocage de l'accès avec écran de réactivation. |
| **TEST-11** | Tentative de connexion infructueuse (>5 fois) | Verrouillage temporaire du compte pendant 15 minutes. |
| **TEST-12** | Test de coupure réseau local | Maintien de l'analyse locale Edge AI et reconnexion automatique. |

---

## 9. Annexe — Glossaire

| Terme | Définition |
| :--- | :--- |
| **APDP** | Autorité de Protection des Données Personnelles du Burkina Faso (ex-CIL), régissant la collecte et le traitement des données biométriques. |
| **Edge AI** | Traitement de l'intelligence artificielle directement sur l'équipement local (Raspberry Pi) sans passer par des serveurs Cloud. |
| **WebRTC** | Protocole de communication permettant la diffusion de flux vidéo en temps réel et à très faible latence dans un navigateur. |
| **RTSP** | Real Time Streaming Protocol : protocole standard d'échange de flux vidéo pour caméras IP. |
| **Face ID** | Module de reconnaissance biométrique faciale basé sur le réseau de neurones InsightFace ArcFace. |
| **Track ID** | Identifiant unique attribué par le tracker de vision par ordinateur à un objet ou une personne suivie d'image en image. |
| **Levée de Doute** | Procédure de vérification humaine d'une alerte générée par l'IA avant intervention. |
