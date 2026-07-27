function notify(message, type = "info") {
  const el = document.createElement("div");
  el.className = `toast toast-${type}`;
  el.textContent = message;
  document.body.appendChild(el);
  requestAnimationFrame(() => el.classList.add("show"));
  setTimeout(() => {
    el.classList.remove("show");
    setTimeout(() => el.remove(), 300);
  }, 3500);
}

function confirmAction(message) {
  return new Promise((resolve) => {
    const backdrop = document.createElement("div");
    backdrop.className = "modal-backdrop";
    backdrop.innerHTML = `
      <div class="modal">
        <p>${message}</p>
        <div class="confirm-actions">
          <button type="button" class="confirm-yes">Confirmer</button>
          <button type="button" class="danger confirm-no">Annuler</button>
        </div>
      </div>`;
    document.body.appendChild(backdrop);
    backdrop.querySelector(".confirm-yes").addEventListener("click", () => {
      backdrop.remove();
      resolve(true);
    });
    backdrop.querySelector(".confirm-no").addEventListener("click", () => {
      backdrop.remove();
      resolve(false);
    });
  });
}
