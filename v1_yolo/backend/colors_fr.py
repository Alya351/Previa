import cv2
import numpy as np

# (nom français, plage de teinte HSV en degrés 0-179 pour OpenCV)
HUE_RANGES = [
    ("rouge", (0, 8)),
    ("orange", (8, 20)),
    ("jaune", (20, 35)),
    ("vert", (35, 85)),
    ("cyan", (85, 100)),
    ("bleu", (100, 130)),
    ("violet", (130, 150)),
    ("rose", (150, 170)),
    ("rouge", (170, 180)),
]


def dominant_color_fr(frame_bgr: np.ndarray, box) -> str:
    """Couleur dominante (médiane HSV) dans une boîte englobante. Purement
    déterministe (calcul sur les pixels réels), pas une estimation de modèle."""
    x1, y1, x2, y2 = [max(0, int(v)) for v in box]
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return "?"

    pixels = crop.reshape(-1, 3)
    hsv = cv2.cvtColor(pixels.reshape(-1, 1, 3), cv2.COLOR_BGR2HSV).reshape(-1, 3)
    h, s, v = np.median(hsv, axis=0)

    if v < 50:
        return "noir"
    if s < 35 and v > 200:
        return "blanc"
    if s < 40:
        return "gris"
    for name, (lo, hi) in HUE_RANGES:
        if lo <= h < hi:
            return name
    return "?"
