const codeStep = document.getElementById("codeStep");
const codeForm = document.getElementById("codeForm");
const codeInput = document.getElementById("codeInput");
const codeError = document.getElementById("codeError");

const chatStep = document.getElementById("chatStep");
const buildingNameEl = document.getElementById("buildingName");
const messagesEl = document.getElementById("messages");
const chatForm = document.getElementById("chatForm");
const chatInput = document.getElementById("chatInput");

const STORAGE_KEY = "yanfle_bat_code";
let building = null;

function addMessage(text, who) {
  const el = document.createElement("div");
  el.className = `chat-bubble chat-${who}`;
  el.textContent = text;
  messagesEl.appendChild(el);
  messagesEl.scrollTop = messagesEl.scrollHeight;
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
    chatStep.hidden = true;
    return;
  }

  building = await res.json();
  localStorage.setItem(STORAGE_KEY, building.code);
  buildingNameEl.textContent = `SENTINEL X — Chat — ${building.name}`;
  codeStep.hidden = true;
  chatStep.hidden = false;
  addMessage(`Prêt à répondre sur « ${building.name} ». Demande-moi ce que tu veux savoir.`, "bot");
}

chatForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const message = chatInput.value.trim();
  if (!message) return;

  addMessage(message, "user");
  chatInput.value = "";
  chatInput.disabled = true;

  try {
    const res = await fetch(`/api/bat/${building.id}/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message }),
    });
    const data = await res.json();
    addMessage(data.answer, "bot");
  } catch {
    notify("Le chat n'a pas répondu, réessaie.", "error");
  } finally {
    chatInput.disabled = false;
    chatInput.focus();
  }
});

const savedCode = localStorage.getItem(STORAGE_KEY);
if (savedCode) verifyAndShow(savedCode);
