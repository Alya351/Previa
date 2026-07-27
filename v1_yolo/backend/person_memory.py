import time
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
from ultralytics import YOLO

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
EXPRESSION_MODEL_DIR = MODELS_DIR / "expression-vit-onnx"

GENDER_FR = {"female": "femme", "male": "homme"}
GENDER_MIN_CONF = 0.75

EMOTION_FR = {
    "angry": "colère",
    "disgust": "dégoût",
    "fear": "peur",
    "happy": "joie",
    "neutral": "neutre",
    "sad": "tristesse",
    "surprise": "surprise",
}
EMOTION_LABELS = ["angry", "disgust", "fear", "happy", "neutral", "sad", "surprise"]
EXPRESSION_MIN_CONF = 0.5

# Une personne restée plus longtemps que ça dans le même point, sans en
# ressortir, est signalée comme présence prolongée (rôdeur potentiel).
LOITER_SECONDS = 120
# Si on ne revoit plus le même track_id/visage pendant plus longtemps que ça,
# on considère qu'il est reparti : le compteur de présence repart de zéro.
STALE_SECONDS = 15


def _center(box) -> tuple:
    x1, y1, x2, y2 = box
    return (x1 + x2) / 2, (y1 + y2) / 2


def _center_in(inner_box, outer_box) -> bool:
    cx, cy = _center(inner_box)
    x1, y1, x2, y2 = outer_box
    return x1 <= cx <= x2 and y1 <= cy <= y2


class PersonMemory:
    """Fusionne posture, visage, vêtements et équipement en une fiche par
    personne, et mesure depuis combien de temps chacune est présente dans un
    même point — pour repérer une présence prolongée (rôdeur potentiel)."""

    def __init__(self, device: str):
        self.device = device
        self.model = YOLO(MODELS_DIR / "gender-yolov8n-cls.pt")
        self.model.to(device)
        # Modèle d'expression en ONNX/CPU : conflit de version CUDA avec
        # onnxruntime-gpu sur cette machine (exige CUDA 13, on a CUDA 12.1),
        # donc CPU par choix — un visage à classifier, pas un souci de débit.
        self.expression_session = ort.InferenceSession(
            str(EXPRESSION_MODEL_DIR / "model.onnx"), providers=["CPUExecutionProvider"]
        )
        # clé (camera_id, identité) -> {first_seen, last_seen, point_id}
        self.dwell: dict[tuple, dict] = {}

    def _classify_gender(self, frame: np.ndarray, box) -> str | None:
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        result = self.model.predict(crop, device=self.device, verbose=False)[0]
        conf = float(result.probs.top1conf)
        if conf < GENDER_MIN_CONF:
            return None
        return GENDER_FR.get(result.names[result.probs.top1])

    def _classify_expression(self, frame: np.ndarray, box) -> str | None:
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        crop = frame[y1:y2, x1:x2]
        if crop.size == 0:
            return None

        rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
        resized = cv2.resize(rgb, (224, 224)).astype(np.float32) / 255.0
        normalized = (resized - 0.5) / 0.5
        chw = np.transpose(normalized, (2, 0, 1))[None, ...].astype(np.float32)

        input_name = self.expression_session.get_inputs()[0].name
        logits = self.expression_session.run(None, {input_name: chw})[0][0]
        probs = np.exp(logits) / np.exp(logits).sum()
        idx = int(np.argmax(probs))
        if probs[idx] < EXPRESSION_MIN_CONF:
            return None
        return EMOTION_FR[EMOTION_LABELS[idx]]

    def _update_dwell(self, camera_id: str, key: str, point_id, face: dict | None) -> dict:
        """Le compteur de présence est ancré sur le track_id (stable tant que le
        tracker ne le perd pas), pas sur la détection de visage (qui rate
        certaines frames — angle, clignement — sans que la personne soit
        vraiment repartie). Le nom/l'autorisation du visage sont mémorisés sur
        cette même entrée et réutilisés tant qu'un visage plus récent ne les
        met pas à jour, pour ne pas perdre l'identité entre deux détections."""
        now = time.monotonic()
        state = self.dwell.get((camera_id, key))
        if state is None or (now - state["last_seen"]) > STALE_SECONDS or state["point_id"] != point_id:
            state = {
                "first_seen": now,
                "last_seen": now,
                "point_id": point_id,
                "name": None,
                "face_id": None,
                "unauthorized": False,
            }
            self.dwell[(camera_id, key)] = state
        else:
            state["last_seen"] = now

        if face:
            state["face_id"] = face["face_id"]
            if face.get("status") == "known" and face.get("name"):
                state["name"] = face["name"]
            state["unauthorized"] = bool(face.get("unauthorized"))

        return state

    def fuse(self, camera_id: str, frame: np.ndarray, results: dict, point_id, point_name) -> list[dict]:
        persons = []
        faces = results.get("face", {}).get("detections", [])
        clothing = results.get("clothing", {}).get("detections", [])
        ppe = results.get("ppe", {}).get("detections", [])

        for p in results.get("pose", {}).get("detections", []):
            box = p["box"]

            face = next((f for f in faces if _center_in(f["box"], box)), None)
            items = [c["label"] for c in clothing if _center_in(c["box"], box)]
            items += [e["label"] for e in ppe if _center_in(e["box"], box)]
            # Les deux modèles sont entraînés sur des crops de visage, pas de
            # corps entier : on préfère la boîte du visage quand elle existe.
            gender = self._classify_gender(frame, face["box"] if face else box)
            expression = self._classify_expression(frame, face["box"]) if face else None

            track_id = p.get("track_id")
            key = f"track_{track_id}" if track_id is not None else (face["face_id"] if face else None)

            if key:
                state = self._update_dwell(camera_id, key, point_id, face)
                dwell_s = state["last_seen"] - state["first_seen"]
                label = state["name"] or ("visage en observation" if state["face_id"] else "individu non identifié")
                unauthorized = state["unauthorized"]
                face_id = state["face_id"]
            else:
                dwell_s = 0.0
                label = "individu non identifié"
                unauthorized = False
                face_id = None

            loitering = dwell_s > LOITER_SECONDS

            persons.append(
                {
                    "key": key,
                    "label": label,
                    "gender": gender,
                    "expression": expression,
                    "description": items,
                    "box": box,
                    "track_id": track_id,
                    "face_id": face_id,
                    "unauthorized": unauthorized,
                    "point_name": point_name,
                    "dwell_seconds": round(dwell_s),
                    "loitering": loitering,
                }
            )

        # Oublie les identités qu'on n'a pas revues depuis longtemps, pour ne
        # pas accumuler indéfiniment de la mémoire.
        now = time.monotonic()
        stale_keys = [k for k, s in self.dwell.items() if (now - s["last_seen"]) > STALE_SECONDS * 4]
        for k in stale_keys:
            del self.dwell[k]

        return persons
