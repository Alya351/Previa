"""Profil d'usage : « particulier » (maison, petit commerce) ou « entreprise »."""
import json
from pathlib import Path

FICHIER = Path(__file__).resolve().parent.parent.parent.parent / "db" / "profil_usage.json"
PROFILS = ("particulier", "entreprise")
PROFIL_PAR_DEFAUT = "entreprise"

_LIBELLES = {
    "entreprise": {
        "lieu": "Bâtiment",
        "lieux": "Bâtiments & Sites Surveillés",
        "intro_lieux": "Créez les bâtiments de votre entreprise et assignez un responsable ou gardien référent.",
        "placeholder_lieu": "Nom du bâtiment (ex: Siège Principal)",
        "placeholder_adresse": "Lieu / Ville (ex: Abidjan)",
        "personne_connue": "Collaborateur",
        "utilisateur_simple": "Agent",
    },
    "particulier": {
        "lieu": "Lieu",
        "lieux": "Mes lieux surveillés",
        "intro_lieux": "Votre domicile est déjà créé. Ajoutez un autre lieu (résidence secondaire, boutique...) seulement si besoin.",
        "placeholder_lieu": "Nom du lieu (ex: Maison, Garage)",
        "placeholder_adresse": "Quartier / Ville (ex: Ouagadougou)",
        "personne_connue": "Membre de la famille",
        "utilisateur_simple": "Proche",
    },
}


def lire() -> str:
    try:
        profil = json.loads(FICHIER.read_text(encoding="utf-8")).get("profil")
    except (FileNotFoundError, json.JSONDecodeError, OSError, AttributeError):
        return PROFIL_PAR_DEFAUT
    return profil if profil in PROFILS else PROFIL_PAR_DEFAUT


def definir(profil: str) -> None:
    if profil not in PROFILS:
        raise ValueError(f"Profil inconnu : {profil!r}")
    FICHIER.parent.mkdir(parents=True, exist_ok=True)
    FICHIER.write_text(json.dumps({"profil": profil}, ensure_ascii=False), encoding="utf-8")


def libelles(profil: str | None = None) -> dict:
    return dict(_LIBELLES[profil or lire()])


def description() -> dict:
    profil = lire()
    return {"profil": profil, "libelles": libelles(profil)}


def appliquer_a_l_amorcage(profil: str, admin: dict) -> None:
    """Après la création du 1er admin : mémorise le profil et, pour un
    particulier, crée « Mon domicile » + une pièce « Entrée »."""
    definir(profil)
    if profil != "particulier":
        return
    try:
        from fonctionnalites.cam.batiment import batiment
        from fonctionnalites.cam.pieces import piece
        domicile = batiment.creer_batiment("Mon domicile", "", admin.get("id"))
        piece.creer_piece("Entrée", domicile["id"])
    except Exception as exc:  # noqa: BLE001
        print(f"[profil_usage] Préparation du domicile ignorée : {exc}", flush=True)
