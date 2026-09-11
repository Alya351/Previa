"""Télécharge et installe les modèles IA (migration/models/) — à lancer
UNE FOIS après avoir récupéré le projet (`git clone` ou copie du zip du
code), avant de démarrer le backend. Les modèles (~1,8 Go) ne sont PAS
dans le dépôt/l'archive du code (voir .gitignore) : trop lourds, et
inutiles pour quelqu'un qui veut juste lire/modifier le code.

Usage :
    cd migration
    python3 telecharger_modeles.py

Idempotent : si migration/models/ contient déjà des modèles (vérifié via
quelques fichiers attendus), le script ne retélécharge rien et s'arrête
tout de suite — relancer plusieurs fois ne fait rien de mal.

Utilise `gdown` plutôt qu'un simple téléchargement (requests/curl) :
Google Drive affiche une page "Analyse antivirus impossible" à la place
du fichier pour tout fichier volumineux (>100 Mo, notre cas à 1,7 Go) —
un téléchargement "brut" récupère cette page HTML de confirmation à la
place du zip. gdown gère cette confirmation automatiquement (bibliothèque
Python maintenue spécifiquement pour ce cas, testée ici avant d'écrire
ce script)."""
import subprocess
import sys
import zipfile
from pathlib import Path

# Id du fichier models.zip sur Google Drive (lien de partage : voir
# migration/models/TELECHARGEMENT.md) — extrait de l'URL de partage
# https://drive.google.com/file/d/<ID>/view?usp=sharing
ID_GOOGLE_DRIVE = "16bxJLlp2b2Prjsw9s_04Rr-FuZXAfIeP"

DOSSIER_MODELES = Path(__file__).resolve().parent / "models"

# Quelques fichiers attendus, pour savoir si les modèles sont déjà là
# sans avoir à tout vérifier (voir on_voit_qui.py/on_voit_quoi.py pour
# la liste complète attendue par le backend).
FICHIERS_REPERES = [
    "yolo11x-pose.pt",
    "yolo11x-seg.pt",
    "person-seg-yolo12l.pt",
    "clothing-yolov8s-seg.pt",
    "fire-yolo11s.pt",
]


def deja_installes() -> bool:
    return all((DOSSIER_MODELES / f).exists() for f in FICHIERS_REPERES)


def s_assurer_que_gdown_est_installe() -> None:
    try:
        import gdown  # noqa: F401
    except ImportError:
        print("[telecharger_modeles] gdown absent, installation via pip...", flush=True)
        subprocess.run([sys.executable, "-m", "pip", "install", "gdown"], check=True)


def telecharger_et_extraire() -> None:
    import gdown

    DOSSIER_MODELES.mkdir(parents=True, exist_ok=True)
    chemin_zip = DOSSIER_MODELES.parent / "models_telecharges.zip"

    print(f"[telecharger_modeles] téléchargement (~1,8 Go, ça prend un moment)...", flush=True)
    gdown.download(id=ID_GOOGLE_DRIVE, output=str(chemin_zip), quiet=False)

    print("[telecharger_modeles] extraction dans migration/models/...", flush=True)
    with zipfile.ZipFile(chemin_zip) as z:
        # L'archive contient un dossier "models/" à la racine (voir
        # migration/models/TELECHARGEMENT.md) — on extrait dans
        # migration/ (le parent), pas directement dans migration/models/,
        # pour ne pas se retrouver avec migration/models/models/.
        z.extractall(DOSSIER_MODELES.parent)

    chemin_zip.unlink()
    print("[telecharger_modeles] terminé — modèles installés dans migration/models/", flush=True)


if __name__ == "__main__":
    if deja_installes():
        print("[telecharger_modeles] modèles déjà présents dans migration/models/, rien à faire.", flush=True)
    else:
        s_assurer_que_gdown_est_installe()
        telecharger_et_extraire()
