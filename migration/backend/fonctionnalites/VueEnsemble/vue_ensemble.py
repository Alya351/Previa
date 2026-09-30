"""Vue d'ensemble du BÂTIMENT : agrège les rapports de TOUTES les caméras
actives (voir Infrastructure/rapport_cam.py) en une seule réponse — le
morceau qui manquait pour répondre à "que se passe-t-il dans tout le
bâtiment en ce moment", au lieu de devoir interroger chaque caméra une
par une.

Ce module n'invente AUCUN nouveau jugement (pas de nouveau critère de
suspicion, pas de nouveau seuil) — il ne fait que relire et assembler ce
que chaque caméra a déjà décidé individuellement (voir
DetectionPrincipal/on_voit_quoi.py, on_voit_qui.py et
ComportementsSupects/rodeur.py) : une personne compte comme
"actuellement suspecte" ici si SA caméra l'a déjà jugée comme telle
(rôdage en cours, regard qui scanne, objet proche disparu) — pas de
nouvelle logique de décision, juste un tri/regroupement.

Dépend de DetectionPrincipal (via rapport_cam), de ComportementsSupects
(via profil_suspect) ET du registre fonctionnalites/cam/ (bâtiments/
pièces/caméras) — c'est pour ça que ce module vit à part (pas dans
Infrastructure, qui elle ne dépend jamais de la logique métier) : il se
place volontairement AU-DESSUS de tout le reste, comme
fonctionnalites/main/main.py se place au-dessus de tout pour le routage
HTTP.

Le registre cam/ sert ICI à enrichir chaque événement avec un contexte
humain (numéro de caméra, pièce, bâtiment) — sans ça, tout ce qui
circule en interne (rapportCam, profils) n'est qu'un id_camera brut
(UUID), illisible pour un opérateur. Résolu à la LECTURE, jamais stocké
en double dans rapportCam/profils : si une caméra est renommée ou
déplacée de pièce, le nom affiché ici suit immédiatement, sans avoir à
retoucher l'historique déjà écrit."""
import time
from fonctionnalites.cam.batiment import batiment
from fonctionnalites.cam.camera import camera
from fonctionnalites.cam.pieces import piece
from fonctionnalites.Infrastructure import rapport_cam


def contexte_camera(id_camera: str) -> dict:
    """Numéro de caméra + nom de la pièce + nom du bâtiment, résolus
    depuis le registre cam/ — None pour un champ si la caméra/pièce/
    bâtiment a été supprimée depuis (rapportCam garde l'historique même
    après suppression de la caméra dans le registre, volontairement :
    voir GET /cameras/{id}/historique, qui ne vérifie que l'EXISTENCE
    actuelle de la caméra, pas ses événements passés). Public : aussi
    réutilisé par main.py pour enrichir GET /alertes."""
    cam = camera.trouver_par_id(id_camera)
    if cam is None:
        return {"num": None, "piece": None, "batiment": None}

    p = piece.trouver_par_id(cam.get("piece_id"))
    b = batiment.trouver_par_id(p.get("batiment_id")) if p else None

    return {
        "num": cam.get("num"),
        "est_entree": cam.get("est_entree", False),
        "url_flux": cam.get("url_flux"),
        "piece": p.get("nom") if p else None,
        "batiment": b.get("nom") if b else None,
    }


def vue_ensemble() -> dict:
    """Un résumé par caméra active (avec son numéro, sa pièce, son
    bâtiment — voir contexte_camera), plus la liste des personnes
    actuellement suspectes n'importe où dans le bâtiment."""
    cameras = []
    personnes_suspectes = []

    toutes_les_cameras = camera.lister_cameras()
    ids_connus = [c["id"] for c in toutes_les_cameras]

    for id_camera in ids_connus:
        contexte = contexte_camera(id_camera)
        etat = rapport_cam.lire_etat(id_camera)
        vue_actuelle = etat.get("vueActuelle", {})
        personnes_vues = etat.get("personnesVues", {})

        cameras.append({
            "id_camera": id_camera,
            **contexte,
            "nombre_personnes": personnes_vues.get("nombre_personnes", vue_actuelle.get("nombre_personnes", 0)),
            "objets": vue_actuelle.get("objets", {}),
            "alertes_feu_fumee": vue_actuelle.get("alertes_feu_fumee", []),
            "zones_suspectes_anonymes": personnes_vues.get("zones_suspectes", []),
            "mis_a_jour_le": vue_actuelle.get("updated_at") or personnes_vues.get("updated_at") or (time.time() if contexte.get("url_flux") else None),
        })

        for profil in personnes_vues.get("personnes", []):
            comportement = profil.get("comportement", {})
            rodeur_actif = comportement.get("rodeur", {}).get("rodeur", False)
            scanne = comportement.get("regarde_autour", {}).get("scanne", False)
            objets_disparus = comportement.get("objets_disparus", [])
            infiltre = comportement.get("infiltration", {}).get("infiltre", False)
            intrusion = comportement.get("intrusion_zone", {}).get("intrusion", False)
            if not (rodeur_actif or scanne or objets_disparus or infiltre or intrusion):
                continue
            personnes_suspectes.append({
                "id": profil.get("id"),
                "id_camera": id_camera,
                **contexte,
                "genre": profil.get("genre"),
                "vetements": profil.get("vetements"),
                "rodeur": comportement.get("rodeur"),
                "regarde_autour": comportement.get("regarde_autour"),
                "objets_disparus": objets_disparus,
                "infiltration": comportement.get("infiltration"),
                "intrusion_zone": comportement.get("intrusion_zone"),
                "deja_suspect_ailleurs": comportement.get("deja_suspect_ailleurs"),
            })

    return {
        "nombre_cameras": len(cameras),
        "cameras": cameras,
        "nombre_personnes_suspectes": len(personnes_suspectes),
        "personnes_suspectes": personnes_suspectes,
    }
