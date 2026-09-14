# Recevoir et lancer PREVIA (sans reconstruire)

## Ce qu'on t'a envoyé

8 fichiers/dossiers :
- `previa.tar` — les images toutes prêtes (~1,3 Go)
- `models.zip` — les modèles IA (~2,9 Go), pour ne pas avoir à les
  retélécharger depuis Google Drive au premier démarrage
- `docker-compose.yml`
- `previastart` (Linux/Mac)
- `previastart.bat` (Windows)
- `python-windows/` — Python portable (~25 Mo, avec `zeroconf` déjà dedans)
  utilisé UNIQUEMENT par `previastart.bat` si Windows n'a pas déjà Python
  (voir plus bas) ; ignoré sur Linux/Mac, rien à faire avec
- `mdns_previa.py` — annonce `previa.local` sur le réseau (voir plus bas),
  et détecte automatiquement les boîtiers alarme ESP32 du réseau
- `esp_decouverts.json` — fichier vide, sert au démarrage à afficher les
  ESP32 alarme détectés dans le panneau admin ; rien à faire avec, laisse-le
  tel quel

Mets-les tous dans le même dossier (n'importe lequel, le nom du dossier
n'a pas d'importance) — `python-windows/` compris, avec sa structure
telle quelle.

## Prérequis

[Docker Desktop](https://docs.docker.com/get-docker/) installé (Windows,
Mac ou Linux).

Rien d'autre à installer pour l'annonce `previa.local` (mDNS) : sur
Windows, `previastart.bat` utilise automatiquement le Python portable
fourni (`python-windows/`) si le système n'a pas déjà Python avec
`zeroconf` — sur Mac/Linux, Python 3 est presque toujours déjà présent.
Sans aucun des deux, `previastart` fonctionne quand même normalement,
juste sans cette commodité (utilise l'adresse IP affichée à la place).

## Lancement

Un seul geste, rien d'autre à taper :

- **Linux / Mac** : `./previastart`
- **Windows** : double-clique sur `previastart.bat`

Le script charge `previa.tar` tout seul (la toute première fois
uniquement, ~1,3 Go, un peu de patience), puis démarre tout. Pas besoin
du code source ni de reconstruire quoi que ce soit.

## Première fois

Le tout premier démarrage télécharge les modèles IA (~3 Go, depuis
Google Drive) — ça prend un moment. Les démarrages suivants sont
quasi instantanés (les modèles restent en mémoire dans un volume
Docker).

## Une fois lancé

Le script affiche l'adresse détectée automatiquement, par exemple :
```
previastart : adresse détectée -> 192.168.1.42
previastart : previa.local annoncé sur le réseau local (mDNS)
```

Deux façons d'y accéder, au choix :
- **https://previa.local:5173** — marche directement sur Mac/Linux/iOS ;
  sur Android/Windows ça peut ne pas se résoudre selon l'appareil (pas
  de mDNS natif partout) — dans ce cas, utilise l'adresse IP.
- **https://<adresse IP affichée>:5173** — marche toujours, partout,
  quel que soit l'appareil.

Accepte l'avertissement de certificat auto-signé, normal — c'est un
certificat généré localement, pas un vrai certificat public. Le
système est complètement vierge (aucun compte) — inscris-toi via
"S'inscrire" sur la page de connexion. Un **code d'amorçage** (8
caractères) est demandé pour le tout premier compte : demande-le à la
personne qui t'a envoyé ce dossier — c'est elle qui l'obtient (previa-SV)
et qui l'active pour ton installation. Ce code, en plus de créer ton
premier compte admin, active ta licence pour 1 an (visible ensuite dans
la barre latérale de l'admin).

## Arrêter

`Ctrl+C` dans le terminal, ou `docker compose down` depuis ce dossier.
