import json
import time
from collections import Counter
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np
import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel
from ultralytics import YOLO

from buildings import Buildings
from chat import ask as chat_ask
from colors_fr import dominant_color_fr
from face_memory import CONFIRM_THRESHOLD, FaceMemory
from labels_fr import COCO_FR
from narrator import summarize, summarize_building
from person_memory import PersonMemory

app = FastAPI(title="YANFLÈ — serveur multi-caméras")

DEVICE = "cuda" if torch.cuda.is_available() else "cpu"

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DB_DIR = Path(__file__).resolve().parent.parent / "db"
DB_DIR.mkdir(exist_ok=True)

# La chaîne : une image traverse ces modèles dans l'ordre, chacun donne son avis
# selon son rôle d'expert — même image, plusieurs regards différents.
MODELS_INFO = [
    {
        "id": "nano",
        "role": "Le Vigile",
        "focus": "Premier coup d'œil rapide sur toute la scène",
        "file": "yolo11n.pt",
    },
    {
        "id": "medium",
        "role": "L'Observateur",
        "focus": "Une lecture plus posée, plus fiable",
        "file": "yolo11m.pt",
    },
    {
        "id": "xlarge",
        "role": "L'Expert",
        "focus": "L'analyse la plus précise, jusqu'aux petits détails",
        "file": "yolo11x.pt",
    },
    {
        "id": "pose",
        "role": "Le Comportementaliste",
        "focus": "Étudie la posture et suit chaque personne dans le temps",
        "file": "yolo11x-pose.pt",
    },
    {
        "id": "threat",
        "role": "La Sentinelle",
        "focus": "Ne surveille qu'une chose : armes et objets dangereux",
        "file": "threat-yolov8n.pt",
        "conf": 0.75,
    },
    {
        "id": "fire",
        "role": "Le Guetteur",
        "focus": "Repère un départ de feu ou de fumée",
        "file": "fire-yolo11s.pt",
        "conf": 0.6,
    },
    {
        "id": "plate",
        "role": "Le Greffier",
        "focus": "Repère les plaques d'immatriculation des véhicules",
        "file": "plate-yolov11n.pt",
        "conf": 0.7,
    },
    {
        "id": "fight",
        "role": "L'Arbitre",
        "focus": "Repère une bagarre ou un comportement violent",
        "file": "fight-yolov8s.pt",
        "classes": [1],  # ne garder que "violence", pas "non_violence"
        "conf": 0.6,
    },
    {
        "id": "seg",
        "role": "Le Silhouette",
        "focus": "Dessine le contour exact de chaque objet, pixel par pixel",
        "file": "yolo11n-seg.pt",
    },
    {
        "id": "ppe",
        "role": "L'Inspecteur",
        "focus": "Vérifie le port des équipements de sécurité : casque, gilet, masque",
        "file": "ppe-yolov8s.pt",
        "classes": [0, 1, 2, 3, 4, 6, 7],  # équipements uniquement, pas personne/véhicule/machine (déjà vus ailleurs)
        "conf": 0.6,
    },
    {
        "id": "clothing",
        "role": "Le Couturier",
        "focus": "Décrit le type et la couleur des vêtements portés",
        "file": "clothing-yolov8s-seg.pt",
        "conf": 0.5,
    },
]
DEFAULT_CONF = 0.25

# Chaque caméra a son propre jeu de modèles (chargé à la demande) pour que le
# suivi (track_id, durée de présence) ne mélange jamais deux flux différents.
camera_model_pools: dict[str, dict] = {}


def get_models_for_camera(camera_id: str) -> dict:
    if camera_id not in camera_model_pools:
        pool = {}
        for info in MODELS_INFO:
            m = YOLO(MODELS_DIR / info["file"])
            m.to(DEVICE)
            pool[info["id"]] = m
        camera_model_pools[camera_id] = pool
        print(f"[Models] nouveau jeu de modèles chargé pour la caméra « {camera_id} »", flush=True)
    return camera_model_pools[camera_id]


face_memory = FaceMemory(DEVICE)
person_memory = PersonMemory(DEVICE)
buildings = Buildings()


def camera_dir(camera_id: str) -> Path:
    d = DB_DIR / "cameras" / camera_id
    d.mkdir(parents=True, exist_ok=True)
    return d


def log_detection(camera_id: str, entry: dict) -> None:
    log_file = camera_dir(camera_id) / f"detections_{datetime.now():%Y-%m-%d}.jsonl"
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def log_narration(camera_id: str, text: str) -> None:
    log_file = camera_dir(camera_id) / f"narration_{datetime.now():%Y-%m-%d}.jsonl"
    entry = {"timestamp": datetime.now().isoformat(timespec="milliseconds"), "narration": text}
    with open(log_file, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry, ensure_ascii=False) + "\n")


def run_model(model, frame, conf: float, classes=None) -> dict:
    kwargs = dict(device=DEVICE, persist=True, conf=conf, verbose=False)
    if classes is not None:
        kwargs["classes"] = classes

    t0 = time.perf_counter()
    result = model.track(frame, **kwargs)[0]
    inference_ms = round((time.perf_counter() - t0) * 1000, 1)

    detections = []
    for i, box in enumerate(result.boxes):
        det = {
            "label": COCO_FR.get(model.names[int(box.cls[0])], model.names[int(box.cls[0])]),
            "confidence": round(float(box.conf[0]), 3),
            "box": [round(v, 1) for v in box.xyxy[0].tolist()],
            "track_id": int(box.id[0]) if box.id is not None else None,
        }

        if result.keypoints is not None:
            xy = result.keypoints.xy[i].tolist()
            kpt_conf = result.keypoints.conf[i].tolist() if result.keypoints.conf is not None else None
            det["keypoints"] = [
                {
                    "x": round(x, 1),
                    "y": round(y, 1),
                    "confidence": round(c, 3) if kpt_conf else None,
                }
                for (x, y), c in zip(xy, kpt_conf or [None] * len(xy))
            ]

        if result.masks is not None:
            poly = result.masks.xy[i]
            step = max(1, len(poly) // 40)
            det["mask"] = [[round(float(x), 1), round(float(y), 1)] for x, y in poly[::step]]

        detections.append(det)

    return {"inference_ms": inference_ms, "detections": detections}


# Points clés COCO-pose utilisés pour la détection de chute (épaules / hanches)
SHOULDER_KP = (5, 6)
HIP_KP = (11, 12)
KP_MIN_CONF = 0.4


def detect_falls(pose_detections: list) -> list:
    falls = []
    for det in pose_detections:
        kpts = det.get("keypoints")
        box = det["box"]
        width, height = box[2] - box[0], box[3] - box[1]
        if not kpts or height <= 0:
            continue

        shoulders = [kpts[i] for i in SHOULDER_KP if kpts[i]["confidence"] and kpts[i]["confidence"] > KP_MIN_CONF]
        hips = [kpts[i] for i in HIP_KP if kpts[i]["confidence"] and kpts[i]["confidence"] > KP_MIN_CONF]
        if not shoulders or not hips:
            continue

        shoulder_y = sum(p["y"] for p in shoulders) / len(shoulders)
        hip_y = sum(p["y"] for p in hips) / len(hips)
        torso_is_flat = abs(hip_y - shoulder_y) < 0.35 * height
        box_is_horizontal = width > height * 1.3

        if torso_is_flat and box_is_horizontal:
            falls.append(
                {
                    "label": "personne au sol",
                    "confidence": det["confidence"],
                    "box": box,
                    "track_id": det.get("track_id"),
                }
            )
    return falls


def chain_signature(results: dict) -> tuple:
    return tuple(
        (model_id, tuple(sorted(Counter(d["label"] for d in r["detections"]).items())))
        for model_id, r in sorted(results.items())
    )


def face_label(f: dict) -> str:
    if f["status"] == "known":
        return f["name"] or f"{f['face_id']} (sans nom)"
    if f["status"] == "just_confirmed":
        return f"{f['face_id']} — personne confirmée !"
    return f"visage en observation ({f['seen_count']}/{CONFIRM_THRESHOLD})"


MIN_LOG_INTERVAL_S = 2.0
NARRATION_INTERVAL_S = 3.0

# État par caméra : signature/narration ne doivent jamais se mélanger entre caméras.
camera_state: dict[str, dict] = {}
# Dernier résultat connu par caméra, pour que /vision puisse l'afficher sans
# redemander une analyse.
camera_latest: dict[str, dict] = {}


def get_camera_point(camera_id: str) -> tuple:
    """Retourne (point_id, point_name) associés à cette caméra, ou (None, None)."""
    camera = buildings.find_camera_by_id(camera_id)
    if camera is None or not camera.get("point_id"):
        return None, None
    for b in buildings.list():
        if b["id"] == camera["building_id"]:
            point = next((p for p in b["points"] if p["id"] == camera["point_id"]), None)
            return (point["id"], point["name"]) if point else (None, None)
    return None, None


def get_camera_state(camera_id: str) -> dict:
    if camera_id not in camera_state:
        camera_state[camera_id] = {
            "last_signature": None,
            "last_log_time": 0.0,
            "last_narration": "En attente de la première analyse...",
            "last_narration_time": 0.0,
        }
    return camera_state[camera_id]


def run_full_chain(camera_id: str, frame: np.ndarray) -> dict:
    models = get_models_for_camera(camera_id)
    state = get_camera_state(camera_id)

    results = {}
    for info in MODELS_INFO:
        results[info["id"]] = {
            "role": info["role"],
            "focus": info["focus"],
            **run_model(models[info["id"]], frame, info.get("conf", DEFAULT_CONF), info.get("classes")),
        }

    # La couleur n'est pas une classe du modèle : calculée sur les pixels réels
    # de chaque boîte détectée, pas une estimation du modèle.
    for det in results["clothing"]["detections"]:
        color = dominant_color_fr(frame, det["box"])
        det["label"] = f"{det['label']} {color}"

    results["fall"] = {
        "role": "Le Secouriste",
        "focus": "Repère une personne qui semble être tombée au sol",
        "inference_ms": 0.0,
        "detections": detect_falls(results["pose"]["detections"]),
    }

    t0 = time.perf_counter()
    faces = face_memory.process(frame)
    face_ms = round((time.perf_counter() - t0) * 1000, 1)

    point_id, point_name = get_camera_point(camera_id)
    for f in faces:
        if f["status"] == "known" and f.get("name"):
            authorized = face_memory.get_authorized_points(f["face_id"])
            f["unauthorized"] = point_id is not None and point_id not in authorized
            f["point_name"] = point_name

    results["face"] = {
        "role": "Le Physionomiste",
        "focus": "Reconnaît un visage déjà croisé grâce à une mémoire persistante",
        "inference_ms": face_ms,
        "detections": [
            {
                "label": ("🚫 " if f.get("unauthorized") else "") + face_label(f),
                "confidence": f["confidence"],
                "box": f["box"],
                "track_id": None,
                **f,
            }
            for f in faces
        ],
    }

    persons = person_memory.fuse(camera_id, frame, results, point_id, point_name)

    entry = {
        "timestamp": datetime.now().isoformat(timespec="milliseconds"),
        "camera_id": camera_id,
        "width": frame.shape[1],
        "height": frame.shape[0],
        "results": results,
        "persons": persons,
    }

    now = time.monotonic()

    if (now - state["last_narration_time"]) >= NARRATION_INTERVAL_S:
        try:
            state["last_narration"] = summarize(results, persons)
        except Exception as exc:  # clé manquante, API indisponible, etc.
            state["last_narration"] = f"(narration indisponible : {exc})"
        state["last_narration_time"] = now
        log_narration(camera_id, state["last_narration"])

    for f in faces:
        if f["status"] == "known" and f.get("name"):
            face_memory.set_activity(f["face_id"], state["last_narration"])

    signature = chain_signature(results)
    if signature != state["last_signature"] and (now - state["last_log_time"]) >= MIN_LOG_INTERVAL_S:
        log_detection(camera_id, entry)
        state["last_signature"] = signature
        state["last_log_time"] = now

    entry["narration"] = state["last_narration"]
    return entry


@app.get("/api/models")
async def list_models():
    roles = [{"id": m["id"], "role": m["role"], "focus": m["focus"]} for m in MODELS_INFO]
    roles.append({"id": "fall", "role": "Le Secouriste", "focus": "Repère une personne qui semble être tombée au sol"})
    roles.append(
        {
            "id": "face",
            "role": "Le Physionomiste",
            "focus": "Reconnaît un visage déjà croisé grâce à une mémoire persistante",
        }
    )
    roles.append(
        {
            "id": "person",
            "role": "Le Profileur",
            "focus": (
                "Fusionne visage, posture, vêtements et équipement en une fiche par "
                "personne (genre, expression, signalement), et repère une présence "
                "prolongée au même endroit (rôdeur potentiel)"
            ),
        }
    )
    return roles


# ---------- Caméra de démo unique (page d'accueil "/") ----------


@app.post("/api/detect")
async def detect(file: UploadFile = File(...)):
    data = await file.read()
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    entry = run_full_chain("local", frame)
    camera_latest["local"] = {"entry": entry, "frame_jpg": data}
    return entry


class NameUpdate(BaseModel):
    name: str


@app.post("/api/faces/{face_id}/name")
async def name_face(face_id: str, body: NameUpdate):
    ok = face_memory.set_name(face_id, body.name)
    return {"ok": ok}


@app.post("/api/faces/reset")
async def reset_faces():
    face_memory.reset()
    return {"ok": True}


@app.post("/api/faces/{face_id}/mark-unknown")
async def mark_unknown(face_id: str):
    name = face_memory.mark_unknown(face_id)
    if name is None:
        raise HTTPException(404, "Visage introuvable")
    return {"name": name}


@app.get("/api/people")
async def list_people():
    return face_memory.list_people()


@app.delete("/api/people/{face_id}")
async def delete_person(face_id: str):
    if not face_memory.delete_person(face_id):
        raise HTTPException(404, "Personne introuvable")
    return {"ok": True}


# ---------- /admin : gestion des bâtiments, points, caméras ----------


class BuildingCreate(BaseModel):
    name: str


class PointCreate(BaseModel):
    name: str


class CameraCreate(BaseModel):
    name: str
    point_id: str | None = None


@app.get("/api/admin/buildings")
async def admin_list_buildings():
    return buildings.list()


@app.post("/api/admin/buildings")
async def admin_create_building(body: BuildingCreate):
    return buildings.create_building(body.name)


@app.post("/api/admin/buildings/{building_id}/points")
async def admin_add_point(building_id: str, body: PointCreate):
    point = buildings.add_point(building_id, body.name)
    if point is None:
        raise HTTPException(404, "Bâtiment introuvable")
    return point


@app.post("/api/admin/buildings/{building_id}/cameras")
async def admin_add_camera(building_id: str, body: CameraCreate):
    camera = buildings.add_camera(building_id, body.name, body.point_id)
    if camera is None:
        raise HTTPException(404, "Bâtiment introuvable")
    return camera


@app.delete("/api/admin/buildings/{building_id}")
async def admin_delete_building(building_id: str):
    if not buildings.delete_building(building_id):
        raise HTTPException(404, "Bâtiment introuvable")
    return {"ok": True}


@app.delete("/api/admin/buildings/{building_id}/points/{point_id}")
async def admin_delete_point(building_id: str, point_id: str):
    if not buildings.delete_point(building_id, point_id):
        raise HTTPException(404, "Point introuvable")
    return {"ok": True}


@app.delete("/api/admin/buildings/{building_id}/cameras/{camera_id}")
async def admin_delete_camera(building_id: str, camera_id: str):
    if not buildings.delete_camera(building_id, camera_id):
        raise HTTPException(404, "Caméra introuvable")
    return {"ok": True}


# ---------- /cam : le client caméra (PC ou téléphone) ----------


class CodeCheck(BaseModel):
    code: str


@app.post("/api/cam/verify")
async def cam_verify(body: CodeCheck):
    camera = buildings.find_camera_by_code(body.code)
    if camera is None:
        raise HTTPException(404, "Code invalide")
    return camera


@app.post("/api/cam/{code}/detect")
async def cam_detect(code: str, file: UploadFile = File(...)):
    camera = buildings.find_camera_by_code(code)
    if camera is None:
        raise HTTPException(404, "Code invalide")

    data = await file.read()
    frame = cv2.imdecode(np.frombuffer(data, np.uint8), cv2.IMREAD_COLOR)
    entry = run_full_chain(camera["id"], frame)
    camera_latest[camera["id"]] = {"entry": entry, "frame_jpg": data}
    return entry


# ---------- /vision : supervision de toutes les caméras ----------


@app.get("/api/vision/buildings")
async def vision_buildings():
    return buildings.list()


@app.get("/api/vision/cameras/{camera_id}/latest")
async def vision_latest(camera_id: str):
    latest = camera_latest.get(camera_id)
    if latest is None:
        raise HTTPException(404, "Pas encore de donnée pour cette caméra")
    return latest["entry"]


@app.get("/api/vision/cameras/{camera_id}/frame.jpg")
async def vision_frame(camera_id: str):
    latest = camera_latest.get(camera_id)
    if latest is None:
        raise HTTPException(404, "Pas encore de frame pour cette caméra")
    return Response(content=latest["frame_jpg"], media_type="image/jpeg")


# ---------- /bat : supervision d'un seul bâtiment, un seul message ----------

BUILDING_NARRATION_INTERVAL_S = 4.0
building_narration_state: dict[str, dict] = {}


@app.post("/api/bat/verify")
async def bat_verify(body: CodeCheck):
    building = buildings.find_building_by_code(body.code)
    if building is None:
        raise HTTPException(404, "Code invalide")
    return building


@app.get("/api/bat/{building_id}/cameras")
async def bat_cameras(building_id: str):
    for b in buildings.list():
        if b["id"] == building_id:
            return b
    raise HTTPException(404, "Bâtiment introuvable")


@app.get("/api/bat/{building_id}/narration")
async def bat_narration(building_id: str):
    building = next((b for b in buildings.list() if b["id"] == building_id), None)
    if building is None:
        raise HTTPException(404, "Bâtiment introuvable")

    state = building_narration_state.setdefault(
        building_id, {"text": "En attente de la première analyse...", "time": 0.0}
    )

    now = time.monotonic()
    if (now - state["time"]) >= BUILDING_NARRATION_INTERVAL_S:
        camera_facts = {
            c["name"]: (
                camera_latest[c["id"]]["entry"]["results"],
                camera_latest[c["id"]]["entry"].get("persons", []),
            )
            for c in building["cameras"]
            if c["id"] in camera_latest
        }
        if camera_facts:
            try:
                state["text"] = summarize_building(camera_facts)
            except Exception as exc:
                state["text"] = f"(narration indisponible : {exc})"
            state["time"] = now

    return {"narration": state["text"]}


class AuthorizedPoints(BaseModel):
    point_ids: list


@app.get("/api/bat/{building_id}/people")
async def bat_people(building_id: str):
    building = next((b for b in buildings.list() if b["id"] == building_id), None)
    if building is None:
        raise HTTPException(404, "Bâtiment introuvable")
    building_point_ids = {p["id"] for p in building["points"]}
    people = []
    for p in face_memory.list_people():
        people.append(
            {
                **p,
                "authorized_here": [pid for pid in p["authorized_points"] if pid in building_point_ids],
            }
        )
    return {"points": building["points"], "people": people}


@app.post("/api/bat/{building_id}/people/{face_id}/authorized-points")
async def bat_set_authorized_points(building_id: str, face_id: str, body: AuthorizedPoints):
    building = next((b for b in buildings.list() if b["id"] == building_id), None)
    if building is None:
        raise HTTPException(404, "Bâtiment introuvable")
    building_point_ids = [p["id"] for p in building["points"]]
    ok = face_memory.set_authorized_points_for_building(face_id, building_point_ids, body.point_ids)
    if not ok:
        raise HTTPException(404, "Personne introuvable")
    return {"ok": True}


class ChatMessage(BaseModel):
    message: str


@app.post("/api/bat/{building_id}/chat")
async def bat_chat(building_id: str, body: ChatMessage):
    building = next((b for b in buildings.list() if b["id"] == building_id), None)
    if building is None:
        raise HTTPException(404, "Bâtiment introuvable")

    point_names = {p["id"]: p["name"] for p in building["points"]}

    lines = [
        f"Bâtiment : {building['name']}",
        f"Nombre de caméras : {len(building['cameras'])}",
        "Points : " + (", ".join(point_names.values()) or "aucun"),
        "Caméras :",
    ]
    for c in building["cameras"]:
        point_name = point_names.get(c.get("point_id"))
        latest = camera_latest.get(c["id"])
        if latest:
            description = summarize(latest["entry"]["results"], latest["entry"].get("persons", []))
        else:
            description = "hors ligne, aucune donnée récente"
        location = f" (point : {point_name})" if point_name else ""
        lines.append(f"- Caméra « {c['name']} »{location} : {description}")

    lines.append("Personnes enregistrées :")
    people = face_memory.list_people()
    if not people:
        lines.append("- aucune")
    for p in people:
        auth_names = [point_names[pid] for pid in p["authorized_points"] if pid in point_names]
        lines.append(f"- {p['name'] or p['id']} : autorisé à [{', '.join(auth_names) or 'aucun point de ce bâtiment'}]")

    context = "\n".join(lines)

    try:
        answer = chat_ask(body.message, context)
    except Exception as exc:
        answer = f"(chat indisponible : {exc})"

    return {"answer": answer}


faces_dir = DB_DIR / "faces"
faces_dir.mkdir(parents=True, exist_ok=True)
app.mount("/faces", StaticFiles(directory=faces_dir), name="faces")

frontend_dir = Path(__file__).resolve().parent.parent / "frontend"
app.mount("/admin", StaticFiles(directory=frontend_dir / "admin", html=True), name="admin")
app.mount("/cam", StaticFiles(directory=frontend_dir / "cam", html=True), name="cam")
app.mount("/vision", StaticFiles(directory=frontend_dir / "vision", html=True), name="vision")
app.mount("/bat", StaticFiles(directory=frontend_dir / "bat", html=True), name="bat")
app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")
