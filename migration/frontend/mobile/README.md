# PREVIA Mobile — Poste Nomade de Terrain

Application mobile native développée avec **React Native / Expo** pour les agents et opérateurs de sécurité sur le terrain, en complémentarité avec l'Operations Center web de **PREVIA**.

---

## 🎨 Charte Graphique & Design System

Les couleurs ont été strictement extraites du logo officiel PREVIA :
- **Bleu Primaire (`--previa-blue-primary`)** : `#009FE3` (Marque, CTA, onglet actif)
- **Bleu Profond (`--previa-blue-deep`)** : `#014791` (Dégradés, accents)
- **Bleu Moyen (`--previa-blue-medium`)** : `#2E9DE7`
- **Texte Fort (`--previa-navy-text`)** : `#152E4C`
- **Fond Barre Basse (`--previa-near-black`)** : `#111316`
- **Alerte Critique (`--previa-red-alert`)** : `#DB2323` (*réservé exclusivement aux badges et urgences critiques*)
- **Fond Clair (`--previa-bg-light`)** : `#F4F8FB`
- **Surfaces (`--previa-white`)** : `#FFFFFF`
- **Gris Secondaire (`--previa-gray-secondary`)** : `#6B7280`

---

## 🧭 Navigation (Bottom Tab Bar)

Barre basse fixe sur fond `--previa-near-black` (`#111316`), avec cible tactile minimale de **44×44 pt** et pilule active `--previa-blue-primary` :
1. **Accueil** : Tableau de bord synthétique, grille 2×2, CTA vers le direct.
2. **Direct** : Flux vidéo d'une seule caméra (ratio 16:9, pastille LIVE, bascule secours).
3. **Alertes** : Flux chronologique, vignettes, badge de sévérité strict, levée de doute et validation au pouce (SF-MOB-03).
4. **Profil** : Session opérateur, indicateur de santé du serveur local, bascule clair/sombre.

---

## 📋 Points d'Intégration Backend (Revue des `// TODO`)

Conformément aux consignes (« Ne fais aucune supposition non vérifiable »), voici la liste exhaustive des points marqués `// TODO` nécessitant validation avec l'équipe backend :

| Fonctionnalité | Fichier | Type d'intégration | Statut actuel |
|---|---|---|---|
| **Acquittement d'une alerte** | `App.js` (`handleVerifyAlert`) | `PATCH /alertes/{id}/acquitter` ou équivalent | Traitement optimiste local effectué, endpoint à brancher |
| **Rejet d'un faux positif** | `App.js` (`handleRejectAlert`) | `PATCH /alertes/{id}/rejeter` ou équivalent | Traitement optimiste local effectué, endpoint à brancher |
| **Signalement anomalie terrain** | `screens/LiveScreen.jsx` | `POST /alertes/signalement` | Modale de confirmation prête, route API à confirmer |
| **Statistiques hebdomadaires** | `screens/HomeScreen.jsx` | `GET /statistiques/agent` | Affichage "Bientôt disponible" actif sans fausses données |
| **Enregistrement Push Token** | `screens/ProfileScreen.jsx` | `POST /utilisateurs/push-token` | Switch UI actif, intégration expo-notifications à lier au serveur |

---

## 🚀 Lancement

```bash
# Dans le dossier migration/frontend/mobile
npm start
# ou
npx expo start
```
