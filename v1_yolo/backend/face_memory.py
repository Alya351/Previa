import json
import time
from pathlib import Path

import cv2
import numpy as np
import torch
from facenet_pytorch import MTCNN, InceptionResnetV1
from PIL import Image

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DB_DIR = Path(__file__).resolve().parent.parent / "db"
CANDIDATES_FILE = DB_DIR / "faces_candidates.json"
REGISTRY_FILE = DB_DIR / "faces_registry.json"
PHOTOS_DIR = DB_DIR / "faces"

MATCH_THRESHOLD = 0.5  # similarité cosinus minimale pour considérer que c'est le même visage
CONFIRM_THRESHOLD = 5  # nombre de fois vu avant de devenir une "personne confirmée"
FACE_MIN_CONF = 0.92  # en dessous, trop de faux positifs (ombres, motifs, stores...)


def cosine_similarity(a: np.ndarray, b: np.ndarray) -> float:
    return float(np.dot(a, b) / (np.linalg.norm(a) * np.linalg.norm(b) + 1e-8))


class FaceMemory:
    def __init__(self, device: str):
        self.device = device
        self.mtcnn = MTCNN(keep_all=True, device=device)

        self.resnet = InceptionResnetV1(pretrained=None, classify=False)
        state_dict = torch.load(MODELS_DIR / "facenet-vggface2.pt", map_location=device)
        self.resnet.load_state_dict(state_dict, strict=False)
        self.resnet = self.resnet.eval().to(device)

        PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
        self.candidates = self._load(CANDIDATES_FILE)
        self.registry = self._load(REGISTRY_FILE)

        migrated = False
        for rec in self.registry:
            if "authorized_points" not in rec:
                rec["authorized_points"] = []
                migrated = True
        if migrated:
            self._save_registry()

        print(
            f"[FaceMemory] chargé : {len(self.candidates)} candidat(s), "
            f"{len(self.registry)} personne(s) confirmée(s)",
            flush=True,
        )

    @staticmethod
    def _load(path: Path) -> list:
        if path.exists():
            with open(path, encoding="utf-8") as f:
                return json.load(f)
        return []

    @staticmethod
    def _save(path: Path, data: list) -> None:
        path.parent.mkdir(exist_ok=True)
        with open(path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False, indent=2)

    def _save_candidates(self) -> None:
        self._save(CANDIDATES_FILE, self.candidates)

    def _save_registry(self) -> None:
        self._save(REGISTRY_FILE, self.registry)

    @staticmethod
    def _best_match(embedding: np.ndarray, records: list):
        best, best_sim = None, -1.0
        for rec in records:
            sim = cosine_similarity(embedding, np.array(rec["embedding"]))
            if sim > best_sim:
                best_sim, best = sim, rec
        return best, best_sim

    def _save_photo(self, frame_bgr: np.ndarray, box, face_id: str):
        x1, y1, x2, y2 = [max(0, int(v)) for v in box]
        crop = frame_bgr[y1:y2, x1:x2]
        if crop.size == 0:
            return None
        PHOTOS_DIR.mkdir(parents=True, exist_ok=True)  # au cas où le dossier ait été supprimé entre-temps
        photo_path = PHOTOS_DIR / f"{face_id}.jpg"
        ok = cv2.imwrite(str(photo_path), crop)
        if not ok:
            print(f"[FaceMemory] échec d'écriture photo : {photo_path}", flush=True)
            return None
        return f"faces/{face_id}.jpg"

    def reset(self) -> None:
        self.candidates = []
        self.registry = []
        self._save_candidates()
        self._save_registry()
        PHOTOS_DIR.mkdir(parents=True, exist_ok=True)
        for photo in PHOTOS_DIR.glob("*.jpg"):
            photo.unlink()
        print("[FaceMemory] réinitialisé : candidats et registre vidés", flush=True)

    def delete_person(self, face_id: str) -> bool:
        before = len(self.registry)
        rec = next((r for r in self.registry if r["id"] == face_id), None)
        self.registry = [r for r in self.registry if r["id"] != face_id]
        if len(self.registry) == before:
            return False
        self._save_registry()
        if rec and rec.get("photo"):
            photo_path = PHOTOS_DIR / f"{face_id}.jpg"
            photo_path.unlink(missing_ok=True)
        return True

    def set_name(self, face_id: str, name: str) -> bool:
        for rec in self.registry:
            if rec["id"] == face_id:
                rec["name"] = name
                self._save_registry()
                return True
        return False

    def mark_unknown(self, face_id: str) -> str | None:
        existing = [r for r in self.registry if (r.get("name") or "").startswith("Inconnu ")]
        name = f"Inconnu {len(existing) + 1}"
        return name if self.set_name(face_id, name) else None

    def get_authorized_points(self, face_id: str) -> list:
        rec = next((r for r in self.registry if r["id"] == face_id), None)
        return rec.get("authorized_points", []) if rec else []

    def set_authorized_points_for_building(
        self, face_id: str, building_point_ids: list, selected_point_ids: list
    ) -> bool:
        for rec in self.registry:
            if rec["id"] == face_id:
                current = set(rec.get("authorized_points", []))
                current -= set(building_point_ids)
                current |= set(selected_point_ids)
                rec["authorized_points"] = sorted(current)
                self._save_registry()
                return True
        return False

    def list_people(self) -> list:
        return [
            {
                "id": r["id"],
                "name": r.get("name"),
                "photo": r.get("photo"),
                "authorized_points": r.get("authorized_points", []),
            }
            for r in self.registry
        ]

    def set_activity(self, face_id: str, activity: str) -> None:
        for rec in self.registry:
            if rec["id"] == face_id:
                rec["activity"] = activity
                rec["last_seen"] = time.time()
                self._save_registry()
                return

    def _identify(self, embedding: np.ndarray, frame_bgr: np.ndarray, box) -> dict:
        now = time.time()

        # 1. Déjà une personne confirmée ?
        match, sim = self._best_match(embedding, self.registry)
        if match is not None and sim >= MATCH_THRESHOLD:
            match["last_seen"] = now
            self._save_registry()
            return {
                "status": "known",
                "face_id": match["id"],
                "name": match.get("name"),
                "photo": match.get("photo"),
                "similarity": round(sim, 3),
            }

        # 2. Un candidat en cours d'observation ?
        match, sim = self._best_match(embedding, self.candidates)
        if match is not None and sim >= MATCH_THRESHOLD:
            match["seen_count"] += 1
            match["last_seen"] = now

            if match["seen_count"] >= CONFIRM_THRESHOLD:
                self.candidates.remove(match)
                self._save_candidates()

                photo = self._save_photo(frame_bgr, box, match["id"])
                self.registry.append(
                    {
                        "id": match["id"],
                        "embedding": match["embedding"],
                        "name": None,
                        "photo": photo,
                        "activity": None,
                        "authorized_points": [],
                        "first_seen": match["first_seen"],
                        "last_seen": now,
                    }
                )
                self._save_registry()

                return {
                    "status": "just_confirmed",
                    "face_id": match["id"],
                    "photo": photo,
                    "seen_count": match["seen_count"],
                }

            self._save_candidates()
            return {
                "status": "candidate",
                "face_id": match["id"],
                "seen_count": match["seen_count"],
                "similarity": round(sim, 3),
            }

        # 3. Visage jamais vu
        new_id = f"personne_{len(self.candidates) + len(self.registry) + 1}"
        self.candidates.append(
            {
                "id": new_id,
                "embedding": embedding.tolist(),
                "seen_count": 1,
                "first_seen": now,
                "last_seen": now,
            }
        )
        self._save_candidates()
        return {"status": "candidate", "face_id": new_id, "seen_count": 1, "similarity": None}

    def process(self, frame_bgr: np.ndarray) -> list:
        rgb = frame_bgr[:, :, ::-1]
        img = Image.fromarray(rgb)

        boxes, probs = self.mtcnn.detect(img)
        if boxes is None:
            return []

        crops = self.mtcnn.extract(img, boxes, save_path=None)
        if crops is None:
            return []

        embeddings = self.resnet(crops.to(self.device)).detach().cpu().numpy()

        results = []
        for box, prob, emb in zip(boxes, probs, embeddings):
            if prob < FACE_MIN_CONF:
                continue  # trop incertain pour être compté comme un visage
            info = self._identify(emb, frame_bgr, box)
            results.append(
                {
                    "box": [round(float(v), 1) for v in box.tolist()],
                    "confidence": round(float(prob), 3),
                    **info,
                }
            )
        return results
