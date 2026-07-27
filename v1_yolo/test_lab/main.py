"""
Petit serveur isolé pour tester rapidement un modèle avant de l'intégrer
dans la vraie chaîne (main.py). Ne touche à rien d'autre : pas de narration,
pas de face memory, pas de logs. Caméra en direct (téléphone ou PC), on
envoie une image toutes les ~1s et on voit les boîtes revenir, en français,
avec la couleur dominante pour les vêtements.
"""
import base64
from pathlib import Path

import cv2
import numpy as np
import onnxruntime as ort
import torch
from facenet_pytorch import MTCNN
from fastapi import FastAPI, Request
from fastapi.responses import HTMLResponse, JSONResponse
from PIL import Image, ImageDraw, ImageFont
from ultralytics import YOLO

MODELS_DIR = Path(__file__).resolve().parent.parent / "models"
DEVICE = "cuda" if torch.cuda.is_available() else "cpu"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"

TEST_MODELS = {
    "ppe": "ppe-yolov8s.pt",
    "clothing": "clothing-yolov8s-seg.pt",
}

EXPRESSION_MODEL_DIR = MODELS_DIR / "expression-vit-onnx"
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

PPE_FR = {
    "Hardhat": "casque",
    "NO-Hardhat": "pas de casque",
    "Mask": "masque",
    "NO-Mask": "pas de masque",
    "Safety Vest": "gilet de sécurité",
    "NO-Safety Vest": "pas de gilet de sécurité",
    "Person": "personne",
    "Safety Cone": "cône de signalisation",
    "machinery": "machine",
    "vehicle": "véhicule",
}

CLOTHING_FR = {
    "short_sleeved_shirt": "chemise à manches courtes",
    "long_sleeved_shirt": "chemise à manches longues",
    "short_sleeved_outwear": "veste à manches courtes",
    "long_sleeved_outwear": "veste à manches longues",
    "vest": "gilet",
    "sling": "débardeur fin",
    "shorts": "short",
    "trousers": "pantalon",
    "skirt": "jupe",
    "short_sleeved_dress": "robe à manches courtes",
    "long_sleeved_dress": "robe à manches longues",
    "vest_dress": "robe sans manches",
    "sling_dress": "robe à bretelles fines",
}

LABELS_FR = {"ppe": PPE_FR, "clothing": CLOTHING_FR}

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


def dominant_color_fr(frame_bgr: np.ndarray, box, mask=None) -> str:
    x1, y1, x2, y2 = [max(0, int(v)) for v in box]
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return "?"

    if mask is not None:
        m = mask[y1:y2, x1:x2]
        pixels = crop[m > 0]
    else:
        pixels = crop.reshape(-1, 3)

    if pixels.size == 0:
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


app = FastAPI(title="YANFLÈ - Labo de test modèles")

_loaded = {}
_font_cache = {}
_mtcnn = None
_expression_session = None


def get_model(key: str) -> YOLO:
    if key not in _loaded:
        m = YOLO(MODELS_DIR / TEST_MODELS[key])
        m.to(DEVICE)
        _loaded[key] = m
        print(f"[Labo] modèle « {key} » chargé sur {DEVICE}", flush=True)
    return _loaded[key]


def get_mtcnn() -> MTCNN:
    global _mtcnn
    if _mtcnn is None:
        _mtcnn = MTCNN(keep_all=True, device=DEVICE)
        print("[Labo] détecteur de visage (MTCNN) chargé", flush=True)
    return _mtcnn


def get_expression_session() -> ort.InferenceSession:
    global _expression_session
    if _expression_session is None:
        _expression_session = ort.InferenceSession(
            str(EXPRESSION_MODEL_DIR / "model.onnx"), providers=["CPUExecutionProvider"]
        )
        print("[Labo] modèle d'expression (ONNX, CPU) chargé", flush=True)
    return _expression_session


def classify_expression(frame_bgr: np.ndarray, box) -> tuple[str, float]:
    x1, y1, x2, y2 = [max(0, int(v)) for v in box]
    crop = frame_bgr[y1:y2, x1:x2]
    if crop.size == 0:
        return "?", 0.0

    rgb = cv2.cvtColor(crop, cv2.COLOR_BGR2RGB)
    resized = cv2.resize(rgb, (224, 224)).astype(np.float32) / 255.0
    normalized = (resized - 0.5) / 0.5
    chw = np.transpose(normalized, (2, 0, 1))[None, ...].astype(np.float32)

    session = get_expression_session()
    logits = session.run(None, {session.get_inputs()[0].name: chw})[0][0]
    probs = np.exp(logits) / np.exp(logits).sum()
    idx = int(np.argmax(probs))
    return EMOTION_FR[EMOTION_LABELS[idx]], float(probs[idx])


def get_font(size: int) -> ImageFont.FreeTypeFont:
    if size not in _font_cache:
        _font_cache[size] = ImageFont.truetype(FONT_PATH, size)
    return _font_cache[size]


PAGE = """
<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>YANFLÈ - Labo de test modèles</title>
<style>
  body { font-family: sans-serif; max-width: 900px; margin: 1.5em auto; padding: 0 1em; background:#111; color:#eee; }
  h1 { font-size: 1.3em; }
  .controls { background:#1c1c1c; padding: 1em; border-radius: 8px; margin-bottom: 1em; }
  label { margin-right: 1em; }
  video, img { max-width: 100%; border-radius: 6px; display: block; }
  #wrap { display: flex; gap: 1em; flex-wrap: wrap; }
  #wrap > div { flex: 1; min-width: 280px; }
  table { border-collapse: collapse; margin-top: 0.7em; width: 100%; }
  td, th { border: 1px solid #444; padding: 4px 8px; text-align: left; }
  button { padding: 0.5em 1.2em; cursor: pointer; margin-right: 0.5em; }
  #status { color: #9c9; font-size: 0.9em; margin-top: 0.5em; }
  #err { color: #e66; font-size: 0.9em; margin-top: 0.5em; }
</style>
</head>
<body>
<h1>Labo de test - modèles non encore intégrés à la chaîne</h1>
<div class="controls">
  <label><input type="radio" name="model" value="ppe" checked> PPE (casque / gilet / masque)</label>
  <label><input type="radio" name="model" value="clothing"> Vêtements (type + couleur)</label>
  <label><input type="radio" name="model" value="expression"> Expression faciale</label>
  <br><br>
  <button id="start">Démarrer la caméra</button>
  <button id="stop" disabled>Arrêter</button>
  <div id="status"></div>
  <div id="err"></div>
</div>
<div id="wrap">
  <div>
    <p>Caméra</p>
    <video id="video" autoplay playsinline muted></video>
  </div>
  <div>
    <p>Détection</p>
    <img id="result" alt="en attente...">
    <table id="table"><tr><th>Classe</th><th>Confiance</th></tr></table>
  </div>
</div>
<canvas id="canvas" style="display:none"></canvas>
<script>
const video = document.getElementById('video');
const canvas = document.getElementById('canvas');
const resultImg = document.getElementById('result');
const table = document.getElementById('table');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('err');
const startBtn = document.getElementById('start');
const stopBtn = document.getElementById('stop');

let stream = null;
let loopHandle = null;
let busy = false;

function currentModel() {
  return document.querySelector('input[name="model"]:checked').value;
}

async function startCamera() {
  errEl.textContent = '';
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment' },
      audio: false
    });
    video.srcObject = stream;
    startBtn.disabled = true;
    stopBtn.disabled = false;
    statusEl.textContent = 'Caméra active, analyse en cours...';
    loopHandle = setInterval(captureAndSend, 1000);
  } catch (e) {
    errEl.textContent = 'Erreur caméra : ' + e.message +
      ' (HTTPS + autorisation navigateur requis)';
  }
}

function stopCamera() {
  if (loopHandle) clearInterval(loopHandle);
  if (stream) stream.getTracks().forEach(t => t.stop());
  startBtn.disabled = false;
  stopBtn.disabled = true;
  statusEl.textContent = 'Arrêté.';
}

function captureAndSend() {
  if (busy || video.videoWidth === 0) return;
  busy = true;
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  canvas.toBlob(async (blob) => {
    try {
      const resp = await fetch('/detect?model=' + currentModel(), {
        method: 'POST',
        body: blob
      });
      const data = await resp.json();
      resultImg.src = 'data:image/jpeg;base64,' + data.image;
      table.innerHTML = '<tr><th>Classe</th><th>Confiance</th></tr>' +
        (data.detections.length
          ? data.detections.map(d => `<tr><td>${d.name}</td><td>${d.conf.toFixed(2)}</td></tr>`).join('')
          : '<tr><td colspan="2">Aucune détection</td></tr>');
      statusEl.textContent = 'Dernière analyse OK (' + new Date().toLocaleTimeString() + ')';
    } catch (e) {
      errEl.textContent = 'Erreur analyse : ' + e.message;
    }
    busy = false;
  }, 'image/jpeg', 0.8);
}

startBtn.addEventListener('click', startCamera);
stopBtn.addEventListener('click', stopCamera);
</script>
</body>
</html>
"""


@app.get("/", response_class=HTMLResponse)
def index():
    return PAGE


def detect_expression(frame: np.ndarray) -> JSONResponse:
    rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
    pil_img = Image.fromarray(rgb)
    boxes, _ = get_mtcnn().detect(pil_img)

    img = pil_img.copy()
    draw = ImageDraw.Draw(img)
    font = get_font(max(14, img.height // 45))

    detections = []
    if boxes is not None:
        for box in boxes:
            label_fr, conf = classify_expression(frame, box)
            x1, y1, x2, y2 = box.tolist()

            draw.rectangle([x1, y1, x2, y2], outline=(255, 60, 60), width=3)
            text = f"{label_fr} {conf:.2f}"
            tb = draw.textbbox((x1, y1), text, font=font)
            draw.rectangle([tb[0], tb[1] - 2, tb[2] + 4, tb[3] + 2], fill=(255, 60, 60))
            draw.text((x1 + 2, y1 - 2), text, font=font, fill=(0, 0, 0))

            detections.append({"name": label_fr, "conf": conf})

    buf_bgr = cv2.cvtColor(np.array(img), cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", buf_bgr)
    b64 = base64.b64encode(buf).decode("ascii")
    return JSONResponse({"image": b64, "detections": detections})


@app.post("/detect")
async def detect(request: Request, model: str = "ppe"):
    data = await request.body()
    arr = np.frombuffer(data, dtype=np.uint8)
    frame = cv2.imdecode(arr, cv2.IMREAD_COLOR)
    if frame is None:
        return JSONResponse({"image": "", "detections": []})

    if model == "expression":
        return detect_expression(frame)

    yolo = get_model(model)
    results = yolo(frame, device=DEVICE, verbose=False)[0]
    fr_names = LABELS_FR[model]

    masks = None
    if results.masks is not None:
        h, w = frame.shape[:2]
        masks = [
            cv2.resize(m, (w, h), interpolation=cv2.INTER_NEAREST)
            for m in results.masks.data.cpu().numpy()
        ]

    img = Image.fromarray(cv2.cvtColor(frame, cv2.COLOR_BGR2RGB))
    draw = ImageDraw.Draw(img)
    font = get_font(max(14, img.height // 45))

    detections = []
    for i, box in enumerate(results.boxes):
        x1, y1, x2, y2 = box.xyxy[0].tolist()
        en_name = results.names[int(box.cls[0])]
        name_fr = fr_names.get(en_name, en_name)
        conf = float(box.conf[0])

        label = name_fr
        if model == "clothing":
            mask = masks[i] if masks else None
            color_fr = dominant_color_fr(frame, (x1, y1, x2, y2), mask)
            label = f"{name_fr} ({color_fr})"

        draw.rectangle([x1, y1, x2, y2], outline=(255, 60, 60), width=3)
        text = f"{label} {conf:.2f}"
        tb = draw.textbbox((x1, y1), text, font=font)
        draw.rectangle([tb[0], tb[1] - 2, tb[2] + 4, tb[3] + 2], fill=(255, 60, 60))
        draw.text((x1 + 2, y1 - 2), text, font=font, fill=(0, 0, 0))

        detections.append({"name": label, "conf": conf})

    buf_rgb = np.array(img)
    buf_bgr = cv2.cvtColor(buf_rgb, cv2.COLOR_RGB2BGR)
    ok, buf = cv2.imencode(".jpg", buf_bgr)
    b64 = base64.b64encode(buf).decode("ascii")

    return JSONResponse({"image": b64, "detections": detections})
