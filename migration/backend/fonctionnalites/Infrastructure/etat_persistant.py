"""Sauvegarde périodique de l'état comportemental en mémoire (RAM) vers un
fichier local, pour survivre à un redémarrage du serveur — sans ça, un
rôdage à 90% confirmé, ou le délai anti-spam d'une alerte déjà envoyée,
repartait de zéro à chaque redémarrage (crash, mise à jour, coupure). Pas
théorique : ce serveur a été redémarré des dizaines de fois pendant le
développement.

Pas de base de données pour ça : un simple fichier JSON, réécrit toutes
les SAUVEGARDE_INTERVALLE_S secondes (pas à chaque appel, pour ne pas
ralentir le pipeline d'un I/O disque à chaque image) — largement
suffisant à cette échelle (une poignée d'identités/zones suivies, pas des
millions de lignes).

Chaque module qui veut persister quelque chose s'enregistre lui-même via
`enregistrer(nom, get_etat, set_etat)` — CE fichier reste volontairement
"bête" (aucune connaissance du contenu de chaque module) ; c'est à chaque
module de savoir comment convertir SON état en JSON-safe (tuples -> listes,
deques -> listes...) et de décider CE QUI est sûr à restaurer.

Point important, décidé après réflexion et pas par oubli : l'état indexé
par un track_id du tracker YOLO général (on_voit_quoi.py, abandonne.py)
n'est PAS enregistré ici. Ce tracker (ByteTrack, model.track(persist=True))
garde son propre état en mémoire lui aussi — après un redémarrage, il
redistribue des track_id à partir de zéro, sans lien avec les anciens.
Restaurer une ancienne entrée "objet vu proche d'un rôdeur, track_id 42"
alors qu'un vrai redémarrage a fait que le même objet réapparaît sous
track_id 7 aurait un effet pervers : le vieux track_id 42 ne matchera plus
jamais rien, et evalue_disparition_objet finirait par le déclarer "disparu"
(donc VOL) alors que l'objet n'a jamais bougé — juste changé de numéro.
Mieux vaut repartir à zéro sur cette partie précise que risquer une fausse
alerte de vol au redémarrage. Les identités visage/corps, elles, sont
stables (déjà persistées dans Firebase indépendamment de ce fichier) —
c'est pour ça que rodeur.py peut, lui, persister sans risque équivalent."""
import json
import time
from pathlib import Path

FICHIER_ETAT = Path(__file__).resolve().parent.parent.parent.parent / "db" / "etat_comportemental.json"
SAUVEGARDE_INTERVALLE_S = 10.0

_registre = {}  # nom -> {"get": callable, "set": callable}
_derniere_sauvegarde = 0.0


def enregistrer(nom: str, get_etat, set_etat) -> None:
    """`get_etat()` renvoie l'état actuel du module, déjà converti en
    structures JSON-safe (dict/list/str/int/float/bool/None) — c'est à
    l'appelant de faire cette conversion, ce fichier ne devine rien sur la
    forme réelle des données. `set_etat(valeur)` fait l'inverse pour
    restaurer au démarrage."""
    _registre[nom] = {"get": get_etat, "set": set_etat}


def charger_tout() -> None:
    """À appeler UNE fois au démarrage du serveur, après que tous les
    modules se soient enregistrés (donc après leurs imports)."""
    if not FICHIER_ETAT.exists():
        print("[etat_persistant] aucun état sauvegardé trouvé, démarrage à froid", flush=True)
        return
    try:
        with open(FICHIER_ETAT) as f:
            data = json.load(f)
    except Exception as exc:
        print(f"[etat_persistant] fichier de sauvegarde illisible, ignoré : {exc}", flush=True)
        return

    for nom, valeur in data.items():
        entree = _registre.get(nom)
        if entree is None:
            continue  # module pas (encore) enregistré, ou retiré depuis — on ignore plutôt que de planter
        try:
            entree["set"](valeur)
        except Exception as exc:
            print(f"[etat_persistant] échec restauration de '{nom}', ce module repart à vide : {exc}", flush=True)
    print(f"[etat_persistant] état restauré depuis {FICHIER_ETAT}", flush=True)


def sauvegarder_si_temps(now: float | None = None) -> None:
    """Pensé pour être appelé à CHAQUE cycle d'analyse (une fois par
    image), mais n'écrit réellement sur disque qu'au maximum toutes les
    SAUVEGARDE_INTERVALLE_S secondes — un appel qui tombe entre deux ne
    fait qu'une comparaison de flottants, négligeable."""
    global _derniere_sauvegarde
    now = now if now is not None else time.time()
    if now - _derniere_sauvegarde < SAUVEGARDE_INTERVALLE_S:
        return
    _derniere_sauvegarde = now
    sauvegarder_maintenant()


def sauvegarder_maintenant() -> None:
    data = {}
    for nom, entree in _registre.items():
        try:
            data[nom] = entree["get"]()
        except Exception as exc:
            print(f"[etat_persistant] échec lecture de '{nom}' pour la sauvegarde (ignoré cette fois) : {exc}", flush=True)

    try:
        FICHIER_ETAT.parent.mkdir(parents=True, exist_ok=True)
        # Écriture atomique (fichier temporaire puis renommage) : si le
        # process est tué EN COURS d'écriture (le pire moment pour un
        # redémarrage), le fichier précédent reste intact au lieu d'être
        # à moitié écrit et corrompu au prochain chargement.
        tmp = FICHIER_ETAT.with_suffix(".tmp")
        with open(tmp, "w") as f:
            json.dump(data, f)
        tmp.replace(FICHIER_ETAT)
    except Exception as exc:
        print(f"[etat_persistant] échec sauvegarde sur disque : {exc}", flush=True)
