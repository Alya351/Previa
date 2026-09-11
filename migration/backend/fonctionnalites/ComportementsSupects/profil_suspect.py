"""Profil de suspicion GLOBAL d'une personne (pid), agrégé à travers
TOUTES les caméras du bâtiment — complément de rodeur.py, pas un
remplacement.

rodeur.py juge le rôdage CAMÉRA PAR CAMÉRA (une "zone" n'a de sens que
dans le cadrage d'une caméra précise) : c'est le bon niveau pour "est-ce
que cette personne reste immobile là, MAINTENANT, sur CETTE caméra".
Mais ça laisse un vrai trou : une personne repérée suspecte par la
caméra de l'entrée, qui se déplace ensuite dans le champ de la caméra du
couloir, "repart de zéro" pour cette deuxième caméra — qui n'a aucun
moyen de savoir qu'elle a déjà été signalée il y a 40 secondes ailleurs.

Ce module répond à une question différente et complémentaire : "cette
personne a-t-elle déjà été suspecte, n'importe où dans le bâtiment,
récemment ?" — c'est ce qui permet aux caméras de s'associer pour
décrire/confirmer le profil d'une même personne plutôt que de juger
chacune dans l'isolement total. Ça marche parce que l'identité (pid) est
déjà globale (voir on_voit_qui.py, ré-identification par visage/apparence
indépendante de la caméra) — l'avantage du "même bâtiment" évoqué :
plusieurs caméras qui voient la même personne à des moments séparés
peuvent littéralement partager le même dossier plutôt que de repartir de
zéro chacune.

Stockage : un fichier JSON PAR PERSONNE, migration/db/profils/<pid>.json
— volontairement organisé par personne (pas par caméra, contrairement à
rapportCam/) puisque c'est justement le point : lisible directement quelle
que soit la caméra qui consulte.

Ne s'applique QU'aux identités réelles (pid issus de identify_face/
identify_body, préfixe "visage_"/"corps_") — jamais aux zones anonymes de
rodeur.py (préfixe "zone_", un id de zone est propre à une caméra et n'a
aucun sens ailleurs, voir assigner_zone_anonyme)."""
import json
import threading
import time
from collections import defaultdict
from pathlib import Path

PROFILS_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "profils"

_verrous: dict[str, threading.Lock] = defaultdict(threading.Lock)

# Évite qu'un fichier grossisse sans fin pour une identité suivie très
# longtemps (des mois de fonctionnement continu) — garde les plus récents.
MAX_EVENEMENTS = 100


def est_identite_reelle(pid: str) -> bool:
    """Faux pour une zone anonyme (voir docstring du module) — sert de
    garde-fou avant d'appeler signaler()/deja_suspect_ailleurs()."""
    return not pid.startswith("zone_")


def _chemin(pid: str) -> Path:
    PROFILS_DIR.mkdir(parents=True, exist_ok=True)
    return PROFILS_DIR / f"{pid}.json"


def signaler(pid: str, id_camera: str, evenement: str, details: dict | None = None) -> None:
    """Ajoute un événement suspect au profil global de `pid` — appelé par
    rodeur.py à chaque confirmation (rôdage confirmé/prolongé/à vérifier,
    objet disparu). Silencieux (ne fait rien) pour une zone anonyme —
    voir est_identite_reelle."""
    if not est_identite_reelle(pid):
        return
    with _verrous[pid]:
        chemin = _chemin(pid)
        profil = {"pid": pid, "evenements": []}
        if chemin.exists():
            with open(chemin, encoding="utf-8") as f:
                profil = json.load(f)
        entree = {"id_camera": id_camera, "evenement": evenement, "horodatage": time.time()}
        if details:
            entree.update(details)
        profil["evenements"].append(entree)
        if len(profil["evenements"]) > MAX_EVENEMENTS:
            profil["evenements"] = profil["evenements"][-MAX_EVENEMENTS:]
        with open(chemin, "w", encoding="utf-8") as f:
            json.dump(profil, f, ensure_ascii=False, indent=2)


def profil_de(pid: str) -> dict:
    """Profil global de `pid` : tous les événements suspects connus,
    toutes caméras confondues. {"pid": ..., "evenements": []} si aucun."""
    chemin = _chemin(pid)
    if not chemin.exists():
        return {"pid": pid, "evenements": []}
    with open(chemin, encoding="utf-8") as f:
        return json.load(f)


def deja_suspect_ailleurs(pid: str, id_camera_actuelle: str, fenetre_s: float = 300.0) -> dict | None:
    """Dernier événement suspect connu pour `pid` sur une AUTRE caméra que
    `id_camera_actuelle`, dans les `fenetre_s` dernières secondes (5 min
    par défaut) — None si rien de récent ou si `pid` est une zone
    anonyme. C'est ce qu'appelle on_voit_qui.py pour enrichir le profil
    d'une personne qui vient d'apparaître sur une nouvelle caméra avec ce
    qu'une AUTRE caméra a déjà observé d'elle."""
    if not est_identite_reelle(pid):
        return None
    profil = profil_de(pid)
    now = time.time()
    for entree in reversed(profil["evenements"]):
        if entree["id_camera"] == id_camera_actuelle:
            continue
        if now - entree["horodatage"] > fenetre_s:
            continue
        return entree
    return None
