const codeStep = document.getElementById("codeStep");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");

const batStep = document.getElementById("batStep");
const buildingNameEl = document.getElementById("buildingName");
const narrationEl = document.getElementById("narration");
const camerasGrid = document.getElementById("camerasGrid");

const nameModal = document.getElementById("nameModal");
const nameModalPhoto = document.getElementById("nameModalPhoto");
const nameModalPhotoFallback = document.getElementById("nameModalPhotoFallback");
const nameForm = document.getElementById("nameForm");
const nameInput = document.getElementById("nameInput");
const markUnknownBtn = document.getElementById("markUnknownBtn");

const tabCameras = document.getElementById("tabCameras");
const tabPeople = document.getElementById("tabPeople");
const openChatBtn = document.getElementById("openChat");
const camerasView = document.getElementById("camerasView");
const peopleView = document.getElementById("peopleView");
const peopleGrid = document.getElementById("peopleGrid");

const STORAGE_KEY = "yanfle_bat_code";

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

let building = null;
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

markUnknownBtn.addEventListener("click", async () => {
  const faceId = nameForm.dataset.faceId;
  const res = await fetch(`/api/faces/${faceId}/mark-unknown`, { method: "POST" });
  const data = await res.json();
  notify(`Marqué comme « ${data.name} » — aucune autorisation.`, "success");
  nameModal.hidden = true;
  showNextNamePrompt();
});

tabCameras.addEventListener("click", () => switchTab("cameras"));
tabPeople.addEventListener("click", () => {
  switchTab("people");
  loadPeople();
});
openChatBtn.addEventListener("click", () => {
  window.location.href = "/bat/chat/";
});

function switchTab(tab) {
  tabCameras.classList.toggle("active", tab === "cameras");
  tabPeople.classList.toggle("active", tab === "people");
  camerasView.hidden = tab !== "cameras";
  peopleView.hidden = tab !== "people";
}

async function loadPeople() {
  const res = await fetch(`/api/bat/${building.id}/people`, { cache: "no-store" });
  if (!res.ok) return;
  const data = await res.json();
  renderPeople(data.points, data.people);
}

function renderPeople(points, people) {
  if (!people.length) {
    peopleGrid.innerHTML = `<p class="cam-info">Aucune personne enregistrée pour l'instant.</p>`;
    return;
  }

  peopleGrid.innerHTML = people
    .map((p) => {
      const photoHtml = p.photo
        ? `<img src="/${p.photo}" alt="${p.name || p.id}" onerror="this.replaceWith(Object.assign(document.createElement('div'), {className:'photo-fallback', textContent:'(pas de photo)'}))">`
        : `<div class="photo-fallback">(pas de photo)</div>`;

      const checklist = points
        .map(
          (pt) => `
          <label>
            <input type="checkbox" data-person="${p.id}" value="${pt.id}" ${p.authorized_here.includes(pt.id) ? "checked" : ""}>
            ${pt.name}
          </label>`
        )
        .join("") || `<p class="cam-info">Aucun point dans ce bâtiment.</p>`;

      return `
        <div class="person-card" data-person-card="${p.id}">
          <div class="person-head">
            ${photoHtml}
            <form class="name-form" data-name-form="${p.id}">
              <input type="text" value="${p.name || ""}" placeholder="Nom">
              <button type="submit">OK</button>
            </form>
          </div>
          <div class="points-checklist">${checklist}</div>
          <button type="button" class="save-auth" data-person="${p.id}">Enregistrer les autorisations</button>
          <button type="button" class="danger delete-person" data-person="${p.id}">Supprimer cette personne</button>
        </div>`;
    })
    .join("");

  peopleGrid.querySelectorAll("[data-name-form]").forEach((form) => {
    form.addEventListener("submit", async (e) => {
      e.preventDefault();
      const personId = form.dataset.nameForm;
      const name = form.querySelector("input").value.trim();
      if (!name) return;
      await fetch(`/api/faces/${personId}/name`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      notify("Nom mis à jour.", "success");
    });
  });

  peopleGrid.querySelectorAll(".save-auth").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const personId = btn.dataset.person;
      const checked = [...peopleGrid.querySelectorAll(`input[data-person="${personId}"]:checked`)].map((i) => i.value);
      await fetch(`/api/bat/${building.id}/people/${personId}/authorized-points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ point_ids: checked }),
      });
      notify("Autorisations mises à jour.", "success");
    });
  });

  peopleGrid.querySelectorAll(".delete-person").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const personId = btn.dataset.person;
      if (!(await confirmAction("Supprimer définitivement cette personne (nom, photo, autorisations) ?"))) return;
      await fetch(`/api/people/${personId}`, { method: "DELETE" });
      notify("Personne supprimée.", "success");
      loadPeople();
    });
  });
}

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

function renderCameras() {
  camerasGrid.innerHTML = building.cameras
    .map(
      (c) => `
      <div class="camera-tile offline" id="${tileId(c.id)}">
        <div class="frame-wrap">
          <img id="img-${c.id}" alt="${c.name}">
          <canvas id="canvas-${c.id}"></canvas>
        </div>
        <div class="tile-info"><h4>${c.name}</h4></div>
      </div>`
    )
    .join("");
}

async function pollCamera(camera) {
  const img = document.getElementById(`img-${camera.id}`);
  const canvas = document.getElementById(`canvas-${camera.id}`);
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
    tile.classList.remove("offline");

    (entry.results.face?.detections || []).forEach((f) => {
      const needsName = f.status === "just_confirmed" || (f.status === "known" && !f.name);
      if (needsName && f.photo) queueNamePrompt(f.face_id, f.photo);
    });
  } catch {
    tile.classList.add("offline");
  }
}

async function pollNarration() {
  try {
    const res = await fetch(`/api/bat/${building.id}/narration`, { cache: "no-store" });
    if (!res.ok) return;
    const data = await res.json();
    narrationEl.textContent = data.narration;
  } catch {
    // silencieux — on retentera au prochain tick
  }
}

codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  verifyAndShow(codeInput.value.trim());
});

async function verifyAndShow(code) {
  const res = await fetch("/api/bat/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code }),
  });

  if (!res.ok) {
    localStorage.removeItem(STORAGE_KEY);
    codeError.textContent = "Code invalide.";
    codeError.hidden = false;
    codeStep.hidden = false;
    batStep.hidden = true;
    return;
  }

  building = await res.json();
  localStorage.setItem(STORAGE_KEY, building.code);
  buildingNameEl.textContent = `SENTINEL X — ${building.name}`;
  codeStep.hidden = true;
  batStep.hidden = false;

  renderCameras();
  setInterval(() => building.cameras.forEach(pollCamera), 1000);
  setInterval(pollNarration, 2000);
  pollNarration();
}

const savedCode = localStorage.getItem(STORAGE_KEY);
if (savedCode) verifyAndShow(savedCode);
