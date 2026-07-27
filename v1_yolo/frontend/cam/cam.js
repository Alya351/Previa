const codeStep = document.getElementById("codeStep");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");

const camStep = document.getElementById("camStep");
const camName = document.getElementById("camName");
const camBuilding = document.getElementById("camBuilding");
const video = document.getElementById("video");
const toggleBtn = document.getElementById("toggle");

const capture = document.createElement("canvas");
const captureCtx = capture.getContext("2d");

const STORAGE_KEY = "yanfle_cam_code";

let code = null;
let stream = null;
let running = false;

async function verifyAndShow(codeValue) {
  const res = await fetch("/api/cam/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ code: codeValue }),
  });

  if (!res.ok) {
    localStorage.removeItem(STORAGE_KEY);
    codeError.textContent = "Code invalide.";
    codeError.hidden = false;
    codeStep.hidden = false;
    camStep.hidden = true;
    return;
  }

  const camera = await res.json();
  code = camera.code;
  localStorage.setItem(STORAGE_KEY, code);
  camName.textContent = camera.name;
  camBuilding.textContent = camera.building_name;
  codeStep.hidden = true;
  camStep.hidden = false;
}

codeForm.addEventListener("submit", (e) => {
  e.preventDefault();
  codeError.hidden = true;
  verifyAndShow(codeInput.value.trim());
});

document.getElementById("forgetCode").addEventListener("click", () => {
  if (running) stop();
  localStorage.removeItem(STORAGE_KEY);
  code = null;
  camStep.hidden = true;
  codeStep.hidden = false;
  codeInput.value = "";
});

// Reconnexion automatique si ce téléphone/PC s'est déjà identifié avant.
const savedCode = localStorage.getItem(STORAGE_KEY);
if (savedCode) verifyAndShow(savedCode);

async function start() {
  if (!window.isSecureContext || !navigator.mediaDevices) {
    notify(
      "Le navigateur bloque l'accès à la caméra ici : la page n'est pas servie en HTTPS. Recharge en https:// et réessaie.",
      "error"
    );
    return;
  }

  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: 640, height: 480 },
      audio: false,
    });
  } catch (err) {
    notify(`Impossible d'accéder à la caméra : ${err.name} — ${err.message}`, "error");
    return;
  }

  video.srcObject = stream;
  await video.play();

  capture.width = video.videoWidth;
  capture.height = video.videoHeight;

  running = true;
  toggleBtn.textContent = "Arrêter la caméra";
  toggleBtn.classList.add("active");
  loop();
}

function stop() {
  running = false;
  if (stream) stream.getTracks().forEach((t) => t.stop());
  toggleBtn.textContent = "Démarrer la caméra";
  toggleBtn.classList.remove("active");
}

async function loop() {
  while (running) {
    captureCtx.drawImage(video, 0, 0, capture.width, capture.height);
    const blob = await new Promise((resolve) => capture.toBlob(resolve, "image/jpeg", 0.75));

    const form = new FormData();
    form.append("file", blob, "frame.jpg");

    try {
      await fetch(`/api/cam/${code}/detect`, { method: "POST", body: form });
    } catch (err) {
      console.error(err);
    }
  }
}

toggleBtn.addEventListener("click", () => {
  if (running) stop();
  else start();
});
