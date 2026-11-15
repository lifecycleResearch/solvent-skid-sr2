// The live behaviour of the spec-driven figure: turning the plant, and
// filtering it.
//
// A turn is a redraw: the page holds the scene and the drawing code, so the
// plant is recomputed from its geometry at the new angle. A filter is a
// question about the tags every item carries -- which compounds it touches,
// what it does, what is in it, what colour it is.

const SCENE = __SCENE__;
const stage = document.querySelector(".sk-stage");
const svg = stage.querySelector("svg");
const liveEl = document.querySelector("[data-live]");
const filterBox = document.querySelector("[data-filters]");
const sopBox = document.querySelector("[data-sop]");

const state = { azimuth: 38, elevation: 27, filter: null, value: null };

const FUNCTIONS = ["heat-exchange", "storage", "reaction", "separation", "transport", "filtration"];
const FUNCTION_LABEL = {
  "heat-exchange": "heat exchange",
  storage: "storage",
  reaction: "reaction",
  separation: "separation",
  transport: "pipe runs",
  filtration: "filtration",
};

function draw() {
  const P = KIT.fitProjection(SCENE.bounds, 1240, 900, { pad: 40, azimuth: state.azimuth, elevation: state.elevation });
  const body = SCENE.items.map((item) => {
      let svg = "";
      switch (item.kind) {
        case "deck":
          svg = KIT.solidSvg(KIT.slabOf(item.plan, item.z || 0, item.h || 6, P, item.steps || 8, item.bevel || 0), { tone: item.tone || "hi", flat: item.flat === true });
          break;
        case "vessel": {
          const [cx, cy, z] = item.at;
          const paths = KIT.cylinder(cx, cy, item.r, z, item.h, P, 36, 0);
          const parts = [KIT.solidSvg(paths, { tone: item.tone || "hi", crease: "faint" })];
          if (item.jacket) parts.push(KIT.solidSvg(KIT.cylinder(cx, cy, item.jacket.r, z, item.jacket.h, P, 36), { tone: "lo", flat: true }));
          if (item.media) {
            const media = KIT.cylinder(cx, cy, item.r * 0.94, z + 1, Math.max(2, item.h * (item.media.fill ?? 0.8)), P, 36);
            parts.push(`<path class="sk-media" data-media="${item.media.kind}" d="${media.fill}"/>`);
          }
          if (item.rim) parts.push(KIT.lineSvg(KIT.onTop(KIT.circleRing(cx, cy, item.r + 1.2, 36), z + item.h, P, true), { tone: "mid" }));
          svg = parts.join("");
          break;
        }
        case "pipe": {
          const piece = KIT.tubePieces(item.points, item.r || 3.2, P, { maxLength: 40, spacing: 2.2, caps: true });
          const parts = [KIT.tubeSvg(piece, { tone: item.tone || "hi" })];
          if (item.flow) parts.push(`<path class="sk-flow" data-stream="${item.id}" d="${KIT.pathOf(item.points.map((p) => KIT.iso(p, P)))}"/>`);
          for (const end of [0, item.points.length - 1]) {
            const point = item.points[end];
            const next = item.points[end === 0 ? 1 : item.points.length - 2];
            const dir = KIT.unit3(KIT.sub3(next, point));
            parts.push(KIT.lineSvg(KIT.sideRing(point, (item.r || 3.2) * 1.45, dir, P, 20), { tone: "mid" }));
          }
          svg = parts.join("");
          break;
        }
        default:
          svg = "";
      }
      if (!svg) return "";
      const tags = Object.entries(item.tags || {})
        .map(([key, value]) => `data-${key}="${String(value).replace(/"/g, "&quot;")}"`)
        .join(" ");
      return `<g class="it" data-kind="${item.kind}" data-id="${item.id || ""}"${tags ? ` ${tags}` : ""}>${svg}</g>`;
  }).join("");
  svg.innerHTML = body;
  placeLabels(P);
  applyFilter();
  say();
}

/**
 * The nameplates, in screen space.
 *
 * Each label is projected with the drawing and put over it as an ordinary
 * piece of HTML: horizontal, the right way up, and legible at every angle.
 */
function placeLabels(P) {
  let layer = stage.querySelector(".sk-labels");
  if (!layer) {
    layer = document.createElement("div");
    layer.className = "sk-labels";
    stage.appendChild(layer);
  }
  layer.innerHTML = "";
  const scale = stage.clientWidth / 1240;
  for (const item of SCENE.items) {
    if (item.kind !== "label" && item.kind !== "stream-label") continue;
    const [x, y] = KIT.iso(item.at, P);
    const box = document.createElement("div");
    box.className = `sk-label ${item.kind === "stream-label" ? "sk-label-stream" : ""}${item.emphasis ? " sk-label-name" : ""}`;
    box.textContent = item.text || "";
    box.style.left = `${x * scale}px`;
    box.style.top = `${y * scale}px`;
    box.style.fontSize = `${(item.size || 8) * scale * 0.72}px`;
    const tags = item.tags || {};
    box.dataset.compound = tags.compound || "";
    box.dataset.function = tags.function || "";
    box.dataset.colour = tags.colour || "";
    layer.appendChild(box);
  }
}

function applyFilter() {
  const groups = [...svg.querySelectorAll(".it")];
  const labels = [...stage.querySelectorAll(".sk-label")];
  if (!state.filter) {
    groups.forEach((group) => group.removeAttribute("data-active"));
    labels.forEach((label) => label.removeAttribute("data-active"));
    svg.removeAttribute("data-filtering");
    return;
  }
  svg.setAttribute("data-filtering", state.filter);
  const mark = (node) => {
    const value = node.getAttribute(`data-${state.filter}`) || "";
    node.setAttribute("data-active", value.split(" ").includes(state.value) ? "true" : "false");
  };
  groups.forEach(mark);
  labels.forEach(mark);
}

function say() {
  const parts = [`${Math.round((state.azimuth + 360) % 360)}°`];
  if (state.filter && state.value) {
    const label = state.filter === "function" ? FUNCTION_LABEL[state.value] || state.value : state.value;
    parts.push(`filter: ${label}`);
  } else {
    parts.push("no filter");
  }
  liveEl.textContent = parts.join(" · ");
}

function setFilter(kind, value) {
  if (state.filter === kind && state.value === value) {
    state.filter = null;
    state.value = null;
  } else {
    state.filter = kind;
    state.value = value;
  }
  buildFilters();
  applyFilter();
  say();
}

function buildFilters() {
  const kind = state.filter;
  filterBox.hidden = !kind;
  if (!kind) return;
  let options = [];
  if (kind === "function") {
    options = FUNCTIONS.map((fn) => [fn, FUNCTION_LABEL[fn] || fn]);
  } else if (kind === "compound") {
    const seen = new Map();
    for (const item of SCENE.items) {
      for (const id of String(item.tags?.compound || "").split(" ").filter(Boolean)) {
        if (!seen.has(id)) seen.set(id, id);
      }
    }
    options = [...seen.keys()].map((id) => [id, id]);
  } else if (kind === "colour") {
    const seen = new Map();
    for (const item of SCENE.items) {
      for (const colour of String(item.tags?.colour || "").split(" ").filter(Boolean)) {
        if (!seen.has(colour)) seen.set(colour, colour);
      }
    }
    options = [...seen.keys()].map((colour) => [colour, colour]);
  }
  filterBox.innerHTML = options
    .map(([value, label]) => `<button type="button" class="sk-chip" data-filter-value="${value}" aria-pressed="${state.value === value}"><i style="background:${value.startsWith("#") ? value : "var(--sk-flow-line)"}"></i>${label}</button>`)
    .join("");
  for (const button of filterBox.querySelectorAll("[data-filter-value]")) {
    button.addEventListener("click", () => setFilter(kind, button.getAttribute("data-filter-value")));
  }
}

for (const button of document.querySelectorAll("[data-turn]")) {
  button.addEventListener("click", () => {
    state.azimuth += Number(button.getAttribute("data-turn"));
    draw();
  });
}

for (const button of document.querySelectorAll("[data-filter-btn]")) {
  button.addEventListener("click", () => {
    const kind = button.getAttribute("data-filter-btn");
    if (state.filter === kind) {
      state.filter = null;
      state.value = null;
    } else {
      state.filter = kind;
      state.value = null;
    }
    for (const other of document.querySelectorAll("[data-filter-btn]")) {
      other.setAttribute("aria-pressed", other.getAttribute("data-filter-btn") === state.filter ? "true" : "false");
    }
    buildFilters();
    applyFilter();
    say();
  });
}

const sopToggle = document.querySelector("[data-sop-toggle]");
if (sopToggle) {
  sopToggle.addEventListener("click", () => {
    sopBox.hidden = !sopBox.hidden;
    sopToggle.setAttribute("aria-pressed", sopBox.hidden ? "false" : "true");
  });
}

stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    state.azimuth -= 15;
    draw();
    event.preventDefault();
  }
  if (event.key === "ArrowRight") {
    state.azimuth += 15;
    draw();
    event.preventDefault();
  }
});

buildFilters();
draw();
