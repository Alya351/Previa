# Previa Security — Application Mobile React Native (Expo)

Cette application mobile a été développée en **React Native natif avec Expo**, reprenant exactement le design, l'architecture et les fonctionnalités présentés dans la maquette de référence :

1. **🚨 Écran Alertes** : En-tête bleu nuit avec vague organique, capsule logo Previa, cloche de notification avec compteur, filtres d'importance (*Importantes*, *En cours*, *Historique*), cartes d'alertes avec liserés latéraux colorés (rouge, orange, jaune), et bandeau inférieur d'information.
2. **🔍 Écran Détail de l'alerte** : Fiche d'alerte complète, instantané caméra HD avec horodatage, informations de criticité, statut des équipements en direct (*Lumières*, *Sirène*), et le **bouton tactile rouge d'arrêt immédiat de l'alerte**.
3. **👤 Écran Compte & Profil** : Salutations agent, bouton raccourci grand écran, paramètres généraux, déconnexion et vague fluide cyan/bleue au bas de l'écran.
4. **🧭 Navigation native** : Barre d'onglets inférieure tactile (*Alertes*, *Plateforme web*, *Compte*).

---

## 🚀 Démarrage et test sur smartphone

### Option 1 : Tester immédiatement sur votre iPhone ou Android avec Expo Go
1. Installez l'application gratuite **Expo Go** depuis l'App Store (iOS) ou le Google Play Store (Android).
2. Ouvrez un terminal dans ce dossier `mobile/` :
   ```bash
   cd mobile
   npx expo start
   ```
3. Scannez le **QR Code** affiché dans le terminal avec l'appareil photo de votre iPhone ou avec l'application Expo Go sur Android.
4. L'application native se lance directement sur votre téléphone !

---

### Option 2 : Générer un fichier APK Android pour l'installer sur n'importe quel smartphone
Pour générer un fichier `.apk` autonome distribuable :
```bash
# 1. Connexion ou création d'un compte gratuit Expo EAS
npx eas login

# 2. Configuration du build
npx eas build:configure

# 3. Lancement de la compilation de l'APK
npx eas build -p android --profile preview
```
Une fois le build terminé, Expo vous fournira le lien direct de téléchargement du fichier APK installable sur vos smartphones Android.
