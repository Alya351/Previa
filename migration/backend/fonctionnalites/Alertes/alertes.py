"""Alertes PREVIA — "ce qui nous intéresse le plus", isolé du reste :
là où chaque comportement anormal CONFIRMÉ (rôdage, objet abandonné,
objet disparu, feu/fumée, infiltration, intrusion dans une zone
surveillée) atterrit, filtré et enrichi (caméra, personne, description,
avis du comparateur IA), au lieu de rester noyé dans l'historique brut
de chaque caméra (voir Infrastructure/rapport_cam.py, TOUS les
événements, y compris anodins) ou le profil neutre d'une personne (voir
ComportementsSupects/profil_suspect.py).

Alimenté par CHAQUE module de détection (rodeur.py, abandonne.py,
feu_fume.py, infiltre.py, zoneCam/detectionEnZone.py) au moment EXACT où ils confirment un
comportement — c'est-à-dire, pour la plupart, au même moment où ils
appellent déjà comparaison_ia.comparer() pour un second avis validé par
la base de référence de comportements normaux/suspects (voir
Alertes/comparaison_ia.py — "on compare bien les comportements à une
base de données") : cet avis est ici PERSISTÉ avec l'alerte, pas juste
renvoyé une fois dans la réponse HTTP puis perdu.

Stockage : un fichier JSON par alerte, migration/db/alertes/<id>.json —
volontairement séparé de rapportCam/ (par caméra, tout confondu) et de
profils/ (par personne, événements suspects) : celui-ci est LA vue
"tout confondu, uniquement ce qui compte", triable par caméra ET par
personne à la fois.

Un instantané JPEG est AUSSI sauvegardé à côté (migration/db/alertes/
<id>.jpg, voir _enregistrer_instantane ci-dessous) — SEULE image
durable de tout le projet (voir Infrastructure/derniere_image.py : la
"dernière image" par caméra n'est elle jamais écrite sur disque, elle
disparaît/est remplacée en continu). Sert le détail d'une alerte (app
mobile, voir GET /alertes/{id}/image dans main.py) : "l'image qui a
déclenché CETTE alerte", pas "ce que montre la caméra maintenant" —
sans ça, consulter une alerte de la veille afficherait une image du
moment présent, sans rapport."""
import json
import threading
import time
import uuid
from pathlib import Path

from fonctionnalites.Infrastructure import derniere_image, alarme_physique, clips_service

ALERTES_DIR = Path(__file__).resolve().parent.parent.parent.parent / "db" / "alertes"

# Types d'alerte assez graves pour déclencher la VRAIE alarme physique
# (lampe + sirène, voir Infrastructure/alarme_physique.py et
# migration/arduino/esp.ino) — même liste que côté web
# (frontend/web/src/pages/admin.jsx, couleurNiveau) et mobile
# (mobile/api.js, TYPES_CRITIQUES) : une seule vérité sur "qu'est-ce qui
# est critique", pas trois définitions qui pourraient diverger.
TYPES_CRITIQUES = {"feu_fumee", "intrusion_zone", "infiltration"}


def _chemin_image(id_alerte: str) -> Path:
    return ALERTES_DIR / f"{id_alerte}.jpg"


def _enregistrer_instantane(id_alerte: str, id_camera: str) -> None:
    """Copie la dernière image connue de cette caméra vers un fichier durable propre à CETTE alerte (REQ-ALT-02).
    Si l'image en mémoire n'est pas encore disponible, tente une capture directe depuis le buffer vidéo ou l'URL RTSP."""
    contenu = derniere_image.lire(id_camera)
    
    # Fallback 1 : Récupérer depuis le buffer circulaire de clips vidéo si la mémoire vive était vide
    if not contenu or len(contenu) < 500:
        try:
            from fonctionnalites.Infrastructure import clips_service
            contenu = clips_service.obtenir_derniere_trame(id_camera)
        except Exception:
            pass

    # Fallback 2 : Capture snapshot RTSP FFmpeg d'urgence
    if not contenu or len(contenu) < 500:
        try:
            from fonctionnalites.cam.camera import rtsp_service, camera_registre
            cam = camera_registre.trouver_par_id(id_camera)
            if cam and cam.get("url_flux"):
                contenu = rtsp_service.capturer_snapshot_unique(cam["url_flux"], timeout_sec=3)
        except Exception:
            pass

    if not contenu or len(contenu) < 500:
        print(f"[alertes] ⚠️ Impossible d'extraire la preuve photo pour l'alerte {id_alerte} (caméra {id_camera})", flush=True)
        return

    ALERTES_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin_image(id_alerte), "wb") as f:
        f.write(contenu)


def lire_instantane(id_alerte: str) -> bytes | None:
    chemin = _chemin_image(id_alerte)
    if not chemin.exists():
        return None
    return chemin.read_bytes()

TYPES_VALIDES = {"rodeur", "objet_abandonne", "objet_disparu", "feu_fumee", "infiltration", "intrusion_zone"}


def _chemin(id_alerte: str) -> Path:
    return ALERTES_DIR / f"{id_alerte}.json"


from fonctionnalites.Infrastructure.local_store import db


def _est_autorise(pid: str | None) -> bool:
    if not pid:
        return False
    try:
        vus = set()
        cur = pid
        while cur and cur not in vus:
            vus.add(cur)
            rec = db.reference(f"corps/registry/{cur}").get()
            if not rec or "lie_a" not in rec:
                break
            cur = rec["lie_a"]

        personnel_db = db.reference("personnel").get() or {}
        personnel_liste = list(personnel_db.values()) if isinstance(personnel_db, dict) else (personnel_db if isinstance(personnel_db, list) else [])
        for emp in personnel_liste:
            if not emp:
                continue
            e_id = emp.get("id")
            f_id = emp.get("face_id")
            if (
                e_id == pid
                or f_id == pid
                or e_id == cur
                or f_id == cur
                or (e_id and str(e_id) in str(pid))
                or (e_id and str(e_id) in str(cur))
            ):
                if emp.get("statut") != "revoque":
                    return True
    except Exception:
        pass
    return False


_dernieres_alertes_enregistrees: dict[str, float] = {}
_lock_alertes = threading.Lock()
DELAI_ANTI_FLOOD_S = 60.0  # Évite d'envoyer la même alerte en boucle toutes les secondes


def enregistrer_alerte(
    type_evenement: str,
    id_camera: str,
    pid: str | None,
    description: str,
    avis_ia: dict | None,
    now: float | None = None,
) -> dict:
    """Enregistre une alerte confirmée avec filtre anti-flood (60s)."""
    if type_evenement not in TYPES_VALIDES:
        raise ValueError(f"type_evenement invalide : {type_evenement!r} (attendu : {TYPES_VALIDES})")

    # Un collaborateur autorisé en règle n'est jamais un rôdeur ni un infiltré
    if type_evenement in {"rodeur", "infiltration"} and _est_autorise(pid):
        return {"id": "ignored", "statut": "collaborateur_autorise_ignore"}

    ts = now if now is not None else time.time()
    cle_anti_flood = f"{id_camera}_{type_evenement}_{pid or 'anonyme'}"

    with _lock_alertes:
        dernier_envoi = _dernieres_alertes_enregistrees.get(cle_anti_flood, 0.0)
        if ts - dernier_envoi < DELAI_ANTI_FLOOD_S:
            return {"id": "ignored", "statut": "anti_flood_ignore"}
        _dernieres_alertes_enregistrees[cle_anti_flood] = ts

    alerte = {
        "id": uuid.uuid4().hex,
        "type_evenement": type_evenement,
        "id_camera": id_camera,
        "pid": pid,
        "description": description,
        "avis_ia": avis_ia,
        "horodatage": ts,
    }
    ALERTES_DIR.mkdir(parents=True, exist_ok=True)
    with open(_chemin(alerte["id"]), "w", encoding="utf-8") as f:
        json.dump(alerte, f, ensure_ascii=False, indent=2)
    _enregistrer_instantane(alerte["id"], id_camera)
    threading.Thread(target=clips_service.enregistrer_clip, args=(alerte["id"], id_camera), daemon=True).start()
    if type_evenement in TYPES_CRITIQUES:
        alarme_physique.activer()
    return alerte



def lister_alertes(id_camera: str | None = None, pid: str | None = None) -> list[dict]:
    """Toutes les alertes, les plus récentes en premier — filtrables par
    caméra et/ou par personne (voir GET /alertes dans main.py)."""
    ALERTES_DIR.mkdir(parents=True, exist_ok=True)
    alertes = []
    for fichier in ALERTES_DIR.glob("*.json"):
        try:
            with open(fichier, encoding="utf-8") as f:
                alertes.append(json.load(f))
        except Exception:
            pass
    if id_camera is not None:
        alertes = [a for a in alertes if a.get("id_camera") == id_camera]
    if pid is not None:
        alertes = [a for a in alertes if a.get("pid") == pid]
    return sorted(alertes, key=lambda a: a.get("horodatage", 0), reverse=True)


def supprimer_alerte(id_alerte: str) -> bool:
    """Supprime une alerte ainsi que son image, son extrait vidéo et son entrée SQLite."""
    fichier_json = _chemin(id_alerte)
    fichier_img = _chemin_image(id_alerte)
    fichier_clip = ALERTES_DIR / f"{id_alerte}.mp4"
    supprime = False
    if fichier_json.exists():
        fichier_json.unlink(missing_ok=True)
        supprime = True
    if fichier_img.exists():
        fichier_img.unlink(missing_ok=True)
    if fichier_clip.exists():
        fichier_clip.unlink(missing_ok=True)

    try:
        from fonctionnalites.Infrastructure.sqlite_db import get_connection
        conn = get_connection()
        with conn:
            conn.execute("DELETE FROM evenements_historique WHERE payload_json LIKE ?", (f'%"{id_alerte}"%',))
    except Exception:
        pass

    return supprime


def supprimer_toutes_alertes() -> int:
    """Supprime l'ensemble des alertes, images, clips archivés ET la table SQLite evenements_historique."""
    ALERTES_DIR.mkdir(parents=True, exist_ok=True)
    count = 0
    for f in list(ALERTES_DIR.glob("*")):
        if f.is_file():
            if f.suffix == ".json":
                count += 1
            f.unlink(missing_ok=True)

    try:
        from fonctionnalites.Infrastructure.sqlite_db import get_connection
        conn = get_connection()
        with conn:
            conn.execute("DELETE FROM evenements_historique;")
    except Exception:
        pass

    return count

