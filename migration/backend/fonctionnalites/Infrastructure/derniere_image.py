"""Cache EN MÉMOIRE de la dernière image reçue par caméra — sert
uniquement à alimenter un aperçu "quasi temps réel" côté admin
(GET /cameras/{id}/image, voir main.py). Jamais écrit sur disque, jamais
gardé dans un historique : chaque nouvelle image reçue via /voir
remplace simplement la précédente en mémoire, et tout disparaît si le
serveur redémarre. C'est volontaire — l'architecture ne conserve jamais
une image de façon durable (voir DetectionPrincipal/on_voit_quoi.py) ;
ce module ne fait pas exception, il garde juste LE DERNIER instantané
"vivant", le temps qu'il reste pertinent (~2s, la cadence de capture de
camera.jsx), jamais plus.
"""

_DERNIERES_IMAGES: dict[str, bytes] = {}


def enregistrer(id_camera: str, contenu_jpeg: bytes) -> None:
    _DERNIERES_IMAGES[id_camera] = contenu_jpeg


def lire(id_camera: str) -> bytes | None:
    return _DERNIERES_IMAGES.get(id_camera)


def oublier(id_camera: str) -> None:
    """Appelé quand une caméra est supprimée (voir DELETE /cameras/{id}
    dans main.py) — évite de continuer à servir la dernière image d'une
    caméra qui n'existe plus."""
    _DERNIERES_IMAGES.pop(id_camera, None)
