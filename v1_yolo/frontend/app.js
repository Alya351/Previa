const video = document.getElementById("video");
const overlay = document.getElementById("overlay");
const ctx = overlay.getContext("2d");
const toggleBtn = document.getElementById("toggle");
const photoInput = document.getElementById("photoInput");
const resetFacesBtn = document.getElementById("resetFaces");
const photoStage = document.getElementById("photoStage");
const photoCanvas = document.getElementById("photoCanvas");
const photoCtx = photoCanvas.getContext("2d");
const fpsEl = document.getElementById("fps");
const latencyEl = document.getElementById("latency");
const countEl = document.getElementById("count");
const resultsEl = document.getElementById("modelResults");
const narrationEl = document.getElementById("narration");

const nameModal = document.getElementById("nameModal");
const nameModalPhoto = document.getElementById("nameModalPhoto");
const nameModalPhotoFallback = document.getElementById("nameModalPhotoFallback");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");

const capture = document.createElement("canvas");
const captureCtx = capture.getContext("2d");

// Une couleur par modèle, pour distinguer qui dit quoi sur l'image
const MODEL_COLORS = {
  nano: "#9aa0a6",
  medium: "#5c9eff",
  xlarge: "#5cc98a",
  pose: "#ffb54d",
  threat: "#ff5c5c",
  fire: "#ff8c42",
  plate: "#b388ff",
  fight: "#ff5ca8",
  seg: "#2dd4bf",
  fall: "#c94f4f",
};

let stream = null;
let running = false;

// File d'attente des personnes fraîchement confirmées, en attente d'un nom
const pendingNames = [];
let modalOpen = false;

function queueNamePrompt(faceId, photo) {
  if (pendingNames.some((p) => p.faceId === faceId)) return;
  pendingNames.push({ faceId, photo });
  if (!modalOpen) showNextNamePrompt();
}

function showNextNamePrompt() {
  const next = pendingNames.shift();
  if (!next) {
    modalOpen = false;
    return;
  }
  modalOpen = true;
  nameModalPhoto.hidden = false;
  nameModalPhotoFallback.hidden = true;
  nameModalPhoto.src = `/${next.photo}`;
  nameInput.value = "";
  nameModal.hidden = false;
  nameForm.dataset.faceId = next.faceId;
  nameInput.focus();
}

nameModalPhoto.addEventListener("error", () => {
  nameModalPhoto.hidden = true;
  nameModalPhotoFallback.hidden = false;
});

nameForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const faceId = nameForm.dataset.faceId;
  const name = nameInput.value.trim();
  if (!name) return;

  await fetch(`/api/faces/${faceId}/name`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  nameModal.hidden = true;
  showNextNamePrompt();
});

function checkNewFaces(results) {
  results.face?.detections.forEach((f) => {
    if (f.status === "just_confirmed" && f.photo) {
      queueNamePrompt(f.face_id, f.photo);
    }
  });
}

async function start() {
  stream = await navigator.mediaDevices.getUserMedia({
    video: { width: 640, height: 480 },
    audio: false,
  });
  video.srcObject = stream;
  await video.play();

  capture.width = video.videoWidth;
  capture.height = video.videoHeight;
  overlay.width = video.videoWidth;
  overlay.height = video.videoHeight;

  running = true;
  toggleBtn.textContent = "Arrêter la caméra";
  toggleBtn.classList.add("active");
  loop();
}

function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  ctx.clearRect(0, 0, overlay.width, overlay.height);
  toggleBtn.textContent = "Démarrer la caméra";
  toggleBtn.classList.remove("active");
  resetStats();
}

function resetStats() {
  fpsEl.textContent = "–";
  latencyEl.textContent = "–";
  countEl.textContent = "–";
  resultsEl.innerHTML = "";
}

async function loop() {
  while (running) {
    const t0 = performance.now();

    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
    const blob = await new Promise((resolve) =>
      capture.toBlob(resolve, "image/jpeg", 0.75)
    );

    const form = new FormData();
    form.append("file", blob, "frame.jpg");

    try {
      const res = await fetch("/api/detect", { method: "POST", body: form });
      const data = await res.json();
      drawChain(ctx, overlay.width, overlay.height, data.results);
      updateResults(data.results);
      narrationEl.textContent = data.narration;
      checkNewFaces(data.results);
    } catch (err) {
      console.error(err);
    }

    const elapsed = performance.now() - t0;
    latencyEl.textContent = `${elapsed.toFixed(0)} ms`;
    fpsEl.textContent = (1000 / elapsed).toFixed(1);
  }
}

// Paires de points clés COCO (17 points) formant le squelette
const SKELETON = [
  [15, 13], [13, 11], [16, 14], [14, 12], [11, 12],
  [5, 11], [6, 12], [5, 6], [5, 7], [6, 8],
  [7, 9], [8, 10], [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
];
const KEYPOINT_MIN_CONF = 0.4;

function drawChain(targetCtx, width, height, results) {
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.lineWidth = 2;
  targetCtx.font = "13px sans-serif";
  targetCtx.textBaseline = "top";

  Object.entries(results).forEach(([modelId, r]) => {
    const color = MODEL_COLORS[modelId] || "#5cc98a";
    r.detections.forEach(({ label, confidence, box, track_id, keypoints, mask }) => {
      const [x1, y1, x2, y2] = box;

      if (mask) drawMask(targetCtx, mask, color);

      targetCtx.strokeStyle = color;
      targetCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const idTag = track_id != null ? `#${track_id} ` : "";
      const text = `${r.role} — ${idTag}${label} ${(confidence * 100).toFixed(0)}%`;
      const textWidth = targetCtx.measureText(text).width;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(x1, y1 - 16, textWidth + 8, 16);
      targetCtx.fillStyle = "#06251a";
      targetCtx.fillText(text, x1 + 4, y1 - 14);

      if (keypoints) drawSkeleton(targetCtx, keypoints, color);
    });
  });
}

function drawMask(targetCtx, points, color) {
  if (!points.length) return;
  targetCtx.beginPath();
  targetCtx.moveTo(points[0][0], points[0][1]);
  points.slice(1).forEach(([x, y]) => targetCtx.lineTo(x, y));
  targetCtx.closePath();
  targetCtx.fillStyle = color + "33"; // teinte semi-transparente
  targetCtx.fill();
}

function drawSkeleton(targetCtx, keypoints, color) {
  const visible = (i) => keypoints[i] && keypoints[i].confidence >= KEYPOINT_MIN_CONF;

  targetCtx.strokeStyle = color;
  SKELETON.forEach(([a, b]) => {
    if (!visible(a) || !visible(b)) return;
    targetCtx.beginPath();
    targetCtx.moveTo(keypoints[a].x, keypoints[a].y);
    targetCtx.lineTo(keypoints[b].x, keypoints[b].y);
    targetCtx.stroke();
  });

  targetCtx.fillStyle = color;
  keypoints.forEach((kp, i) => {
    if (!visible(i)) return;
    targetCtx.beginPath();
    targetCtx.arc(kp.x, kp.y, 3, 0, Math.PI * 2);
    targetCtx.fill();
  });
}

function updateResults(results) {
  let total = 0;

  resultsEl.innerHTML = Object.entries(results)
    .map(([modelId, r]) => {
      total += r.detections.length;
      const color = MODEL_COLORS[modelId] || "#5cc98a";
      const items = r.detections.length
        ? r.detections
            .map(
              (d) =>
                `<li>${d.track_id != null ? `#${d.track_id} ` : ""}${d.label}<span>${(d.confidence * 100).toFixed(0)}%</span></li>`
            )
            .join("")
        : `<li class="empty">rien détecté</li>`;

      return `
        <div class="model-block" style="--model-color:${color}">
          <h4>${r.role}<span>${r.inference_ms} ms</span></h4>
          <p class="focus">${r.focus}</p>
          <ul>${items}</ul>
        </div>`;
    })
    .join("");

  countEl.textContent = total;
}

toggleBtn.addEventListener("click", () => {
  if (running) stop();
  else start();
});

photoInput.addEventListener("change", async () => {
  const file = photoInput.files[0];
  if (!file) return;

  if (running) stop();

  const img = new Image();
  img.src = URL.createObjectURL(file);
  await img.decode();

  photoStage.hidden = false;
  photoCanvas.width = img.naturalWidth;
  photoCanvas.height = img.naturalHeight;
  photoCtx.drawImage(img, 0, 0);

  // La photo est envoyée telle quelle, sans redimensionnement ni recompression.
  const form = new FormData();
  form.append("file", file);

  resetStats();
  const t0 = performance.now();
  const res = await fetch("/api/detect", { method: "POST", body: form });
  const data = await res.json();
  const roundTrip = performance.now() - t0;

  photoCtx.drawImage(img, 0, 0);
  drawChain(photoCtx, photoCanvas.width, photoCanvas.height, data.results);
  updateResults(data.results);
  narrationEl.textContent = data.narration;
  checkNewFaces(data.results);
  latencyEl.textContent = `${roundTrip.toFixed(0)} ms`;

  URL.revokeObjectURL(img.src);
});

// Chrome/Firefox peuvent restaurer la page depuis le bfcache dans son état JS
// figé (ex: fenêtre de nom encore ouverte) sans ré-exécuter le script.
// On force une remise à zéro propre dans ce cas.
window.addEventListener("pageshow", (event) => {
  if (!event.persisted) return;
  stop();
  nameModal.hidden = true;
  modalOpen = false;
  pendingNames.length = 0;
});

resetFacesBtn.addEventListener("click", async () => {
  if (!(await confirmAction("Effacer toute la mémoire des visages (candidats, personnes confirmées, photos) ?"))) return;
  await fetch("/api/faces/reset", { method: "POST" });
  pendingNames.length = 0;
  modalOpen = false;
  nameModal.hidden = true;
  notify("Mémoire des visages réinitialisée.", "success");
});
