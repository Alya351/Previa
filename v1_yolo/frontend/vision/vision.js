const buildingsContainer = document.getElementById("buildingsContainer");

const nameModal = document.getElementById("nameModal");
const nameModalPhoto = document.getElementById("nameModalPhoto");
const nameModalPhotoFallback = document.getElementById("nameModalPhotoFallback");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");

const MODEL_COLORS = {
  nano: "#9aa0a6", medium: "#5c9eff", xlarge: "#5cc98a", pose: "#ffb54d",
  threat: "#ff5c5c", fire: "#ff8c42", plate: "#b388ff", fight: "#ff5ca8",
  seg: "#2dd4bf", fall: "#c94f4f",
};
const SKELETON = [
  [15, 13], [13, 11], [16, 14], [14, 12], [11, 12],
  [5, 11], [6, 12], [5, 6], [5, 7], [6, 8],
  [7, 9], [8, 10], [1, 2], [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 6],
];
const KEYPOINT_MIN_CONF = 0.4;

const pendingNames = [];
let modalOpen = false;
const seenFaceIds = new Set();

function queueNamePrompt(faceId, photo) {
  if (seenFaceIds.has(faceId)) return;
  seenFaceIds.add(faceId);
  pendingNames.push({ faceId, photo });
  if (!modalOpen) showNextNamePrompt();
}

function showNextNamePrompt() {
  const next = pendingNames.shift();
  if (!next) { modalOpen = false; return; }
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

function drawChain(targetCtx, width, height, results) {
  targetCtx.clearRect(0, 0, width, height);
  targetCtx.lineWidth = 2;
  targetCtx.font = "12px sans-serif";
  targetCtx.textBaseline = "top";

  Object.entries(results).forEach(([modelId, r]) => {
    const color = MODEL_COLORS[modelId] || "#5cc98a";
    r.detections.forEach(({ label, confidence, box, track_id, keypoints, mask }) => {
      const [x1, y1, x2, y2] = box;
      if (mask) drawMask(targetCtx, mask, color);
      targetCtx.strokeStyle = color;
      targetCtx.strokeRect(x1, y1, x2 - x1, y2 - y1);

      const idTag = track_id != null ? `#${track_id} ` : "";
      const text = `${idTag}${label} ${(confidence * 100).toFixed(0)}%`;
      const textWidth = targetCtx.measureText(text).width;
      targetCtx.fillStyle = color;
      targetCtx.fillRect(x1, y1 - 14, textWidth + 6, 14);
      targetCtx.fillStyle = "#06251a";
      targetCtx.fillText(text, x1 + 3, y1 - 12);

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
  targetCtx.fillStyle = color + "33";
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
    targetCtx.arc(kp.x, kp.y, 2.5, 0, Math.PI * 2);
    targetCtx.fill();
  });
}

function tileId(cameraId) { return `tile-${cameraId}`; }

function renderBuildings(buildings) {
  buildingsContainer.innerHTML = buildings
    .map((b) => {
      if (!b.cameras.length) return "";
      const tiles = b.cameras
        .map(
          (c) => `
        <div class="camera-tile offline" id="${tileId(c.id)}">
          <div class="frame-wrap">
            <img id="img-${c.id}" alt="${c.name}">
            <canvas id="canvas-${c.id}"></canvas>
          </div>
          <div class="tile-info">
            <h4>${c.name}</h4>
            <p id="narration-${c.id}">En attente...</p>
          </div>
        </div>`
        )
        .join("");
      return `<div class="vision-building"><h2>${b.name}</h2><div class="vision-grid">${tiles}</div></div>`;
    })
    .join("");
}

async function pollCamera(camera) {
  const img = document.getElementById(`img-${camera.id}`);
  const canvas = document.getElementById(`canvas-${camera.id}`);
  const narrationEl = document.getElementById(`narration-${camera.id}`);
  const tile = document.getElementById(tileId(camera.id));
  if (!img) return;

  try {
    const res = await fetch(`/api/vision/cameras/${camera.id}/latest`, { cache: "no-store" });
    if (!res.ok) return;
    const entry = await res.json();

    img.src = `/api/vision/cameras/${camera.id}/frame.jpg?t=${Date.now()}`;
    canvas.width = entry.width;
    canvas.height = entry.height;
    drawChain(canvas.getContext("2d"), entry.width, entry.height, entry.results);
    narrationEl.textContent = entry.narration;
    tile.classList.remove("offline");

    (entry.results.face?.detections || []).forEach((f) => {
      const needsName = f.status === "just_confirmed" || (f.status === "known" && !f.name);
      if (needsName && f.photo) queueNamePrompt(f.face_id, f.photo);
    });
  } catch {
    tile.classList.add("offline");
  }
}

async function loadAndPoll() {
  const res = await fetch("/api/vision/buildings");
  const buildings = await res.json();
  renderBuildings(buildings);

  const allCameras = buildings.flatMap((b) => b.cameras);
  setInterval(() => allCameras.forEach(pollCamera), 1000);
}

loadAndPoll();
