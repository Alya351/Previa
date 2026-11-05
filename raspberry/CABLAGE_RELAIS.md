# Branchement de la sirène et de la lampe sur le Raspberry

Le Raspberry pilote **deux relais** : un pour la lampe, un pour la sirène.
Une broche du Raspberry ne peut JAMAIS alimenter directement une sirène ou
une lampe : elle sert seulement à commander le relais, qui coupe ou laisse
passer le courant de la sirène/lampe (alimentée à part).

## Carte relais (2 voies, 5 V, avec optocoupleur)

| Carte relais | Raspberry Pi (numérotation physique) | Rôle |
|---|---|---|
| VCC | broche 2 (5 V) | alimente la carte |
| GND | broche 6 (GND) | masse commune |
| IN1 | broche 11 (**BCM17**) | commande la **lampe** |
| IN2 | broche 13 (**BCM27**) | commande la **sirène** |

## Côté puissance (exemple sirène/lampe en 12 V continu)

Pour chaque relais : `COM` ← pôle + de l'alimentation 12 V ; `NO`
(normalement ouvert) → pôle + de la sirène (ou de la lampe) ; le pôle −
de la sirène revient directement au − de l'alimentation 12 V.
Au repos le circuit est ouvert (rien ne sonne) ; quand PREVIA active le
relais, `COM` et `NO` se ferment.

> ⚠ Sirène ou lampe en **220 V** : faites faire le câblage par une personne
> qualifiée, dans un boîtier fermé. Ne jamais toucher aux bornes sous tension.

## Réglages

Dans `/etc/previa/gpio.env` (créé par `installer_raspberry.sh`) : numéros
de broches (`PREVIA_GPIO_LAMPE`, `PREVIA_GPIO_SIRENE`) et polarité
(`PREVIA_RELAIS_ACTIF_BAS`, 1 par défaut). Puis `sudo systemctl restart previa-api`.

## Vérifier

1. `sudo systemctl stop previa-api`
2. `python3 ~/tech-impact/raspberry/tester_relais.py` : la lampe s'allume 3 s,
   puis la sirène sonne 1 s. Si c'est inversé (allumé au repos), changez la polarité.
3. `sudo systemctl start previa-api`, puis, dans l'application ou le
   tableau de bord, **Réarmer** déclenche lampe + sirène, **Arrêter l'alerte** les coupe
   (arrêt automatique après 2 minutes). Le journal du service indique le mode :
   `journalctl -u previa-api | grep "\[alarme\]"` → « mode GPIO » (branché) ou
   « mode simulation » (avec la raison).
