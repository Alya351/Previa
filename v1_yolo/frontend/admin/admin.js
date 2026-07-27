const buildingForm = document.getElementById("buildingForm");
const buildingName = document.getElementById("buildingName");
const buildingsList = document.getElementById("buildingsList");

async function loadBuildings() {
  const res = await fetch("/api/admin/buildings");
  const buildings = await res.json();
  buildingsList.innerHTML = buildings.map(renderBuilding).join("");

  buildings.forEach((b) => {
    document.getElementById(`point-form-${b.id}`).addEventListener("submit", async (e) => {
      e.preventDefault();
      const input = document.getElementById(`point-input-${b.id}`);
      await fetch(`/api/admin/buildings/${b.id}/points`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: input.value.trim() }),
      });
      loadBuildings();
    });

    document.getElementById(`cam-form-${b.id}`).addEventListener("submit", async (e) => {
      e.preventDefault();
      const nameInput = document.getElementById(`cam-input-${b.id}`);
      const pointSelect = document.getElementById(`cam-point-${b.id}`);
      await fetch(`/api/admin/buildings/${b.id}/cameras`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: nameInput.value.trim(),
          point_id: pointSelect.value || null,
        }),
      });
      loadBuildings();
    });
  });
}

function renderBuilding(b) {
  const pointOptions = b.points
    .map((p) => `<option value="${p.id}">${p.name}</option>`)
    .join("");

  const pointsHtml = b.points.length
    ? b.points
        .map(
          (p) => `<li>
            <span>${p.name}</span>
            <button type="button" class="danger small" data-delete="point" data-building="${b.id}" data-point="${p.id}">Supprimer</button>
          </li>`
        )
        .join("")
    : `<li class="empty">Aucun point</li>`;

  const camerasHtml = b.cameras.length
    ? b.cameras
        .map((c) => {
          const point = b.points.find((p) => p.id === c.point_id);
          return `<li>
            <b>${c.name}</b> ${point ? `<span>(${point.name})</span>` : ""}
            <span class="code-badge">${c.code}</span>
            <button type="button" class="danger small" data-delete="camera" data-building="${b.id}" data-camera="${c.id}">Supprimer</button>
          </li>`;
        })
        .join("")
    : `<li class="empty">Aucune caméra</li>`;

  return `
    <div class="model-block wide">
      <h4>
        ${b.name} <span class="code-badge">${b.code}</span>
        <button type="button" class="danger small" data-delete="building" data-building="${b.id}">Supprimer le bâtiment</button>
      </h4>
      <p class="focus">Code du bâtiment (pour /bat) : <b>${b.code}</b></p>

      <div class="admin-columns">
        <div>
          <label class="field-label">Points</label>
          <ul class="plain-list">${pointsHtml}</ul>
          <form id="point-form-${b.id}" class="inline-form">
            <input type="text" id="point-input-${b.id}" placeholder="Nom du point (ex: portail)" required>
            <button type="submit">Ajouter</button>
          </form>
        </div>

        <div>
          <label class="field-label">Caméras</label>
          <ul class="plain-list">${camerasHtml}</ul>
          <form id="cam-form-${b.id}" class="inline-form">
            <input type="text" id="cam-input-${b.id}" placeholder="Nom de la caméra" required>
            <select id="cam-point-${b.id}">
              <option value="">— point (optionnel) —</option>
              ${pointOptions}
            </select>
            <button type="submit">Ajouter</button>
          </form>
        </div>
      </div>
    </div>`;
}

buildingForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  await fetch("/api/admin/buildings", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: buildingName.value.trim() }),
  });
  buildingName.value = "";
  notify("Bâtiment créé.", "success");
  loadBuildings();
});

buildingsList.addEventListener("click", async (e) => {
  const btn = e.target.closest("[data-delete]");
  if (!btn) return;

  const kind = btn.dataset.delete;
  const buildingId = btn.dataset.building;

  if (kind === "building") {
    if (!(await confirmAction("Supprimer ce bâtiment et toutes ses caméras/points ?"))) return;
    await fetch(`/api/admin/buildings/${buildingId}`, { method: "DELETE" });
    notify("Bâtiment supprimé.", "success");
  } else if (kind === "point") {
    if (!(await confirmAction("Supprimer ce point ?"))) return;
    await fetch(`/api/admin/buildings/${buildingId}/points/${btn.dataset.point}`, { method: "DELETE" });
    notify("Point supprimé.", "success");
  } else if (kind === "camera") {
    if (!(await confirmAction("Supprimer cette caméra ? Son code ne sera plus valide."))) return;
    await fetch(`/api/admin/buildings/${buildingId}/cameras/${btn.dataset.camera}`, { method: "DELETE" });
    notify("Caméra supprimée.", "success");
  }

  loadBuildings();
});

loadBuildings();
