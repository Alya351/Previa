# Mettre PREVIA sur le Raspberry (jour J)

**Matériel** : Raspberry Pi 4 ou 5 (4 Go de RAM minimum, 8 Go conseillé), alimentation officielle,
carte microSD ou SSD, **câble Ethernet** vers le routeur, carte relais 2 voies (lampe + sirène).

## 1. Préparer le système (une seule fois)
- Raspberry Pi OS **64 bits** (Bookworm). Utilisateur `previa`, SSH activé.
- Brancher le Raspberry au routeur par Ethernet (le plus fiable). Wi-Fi possible :
  `sudo nmcli device wifi connect "NOM" password "MOT_DE_PASSE"`, une seule fois, il est mémorisé.

## 2. Tout installer en un clic (depuis le PC)
- Double-clic sur `LANCER_SUR_RASPBERRY.bat` : il trouve le Raspberry, envoie le code et les
  modèles IA, puis lance `raspberry/installer_raspberry.sh` (nom `previa.local`, droits GPIO,
  services qui démarrent seuls). Sans internet sur place, tout fonctionne si les paquets ont déjà
  été installés une fois.
- **La toute première fois** : prévoir internet et 20 à 40 minutes (installation de PyTorch).
  Faites-la AVANT le jour J, à la maison.

## 3. Brancher la sirène et la lampe
Voir `CABLAGE_RELAIS.md`, puis tester : `sudo systemctl stop previa-api`,
`python3 ~/tech-impact/raspberry/tester_relais.py`, `sudo systemctl start previa-api`.

## 4. Vérifier avant la présentation
1. Ouvrir `https://previa.local:5173` (ou `https://IP_DU_RASPBERRY:5173`) : la page s'affiche.
2. Créer le compte administrateur et saisir le code d'amorçage.
3. Installer l'application mobile, se connecter : elle trouve le boîtier.
4. Déclencher une alerte (ou « Réarmer ») : lampe + sirène s'activent ; « Arrêter l'alerte » les coupe.
5. **Test de coupure** : débrancher le Raspberry, le rebrancher, attendre ~2 minutes : `previa.local`
   répond de nouveau sans rien toucher.
6. Journal en direct : `journalctl -u previa-api -f` (cherchez `[alarme] mode GPIO`).

## Dépannage rapide
| Problème | Piste |
|---|---|
| `[alarme] mode simulation` dans le journal | la raison est écrite sur la même ligne (gpiozero absent, droits GPIO...) |
| Sirène allumée au repos | inverser `PREVIA_RELAIS_ACTIF_BAS` dans `/etc/previa/gpio.env`, puis `sudo systemctl restart previa-api` |
| `previa.local` introuvable sur le téléphone | utiliser l'adresse IP du Raspberry ; certains Android ne résolvent pas `.local` |
| L'API ne démarre pas | `journalctl -u previa-api -n 80 --no-pager` |
