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
    box.dataset.part = String(item.id || "").replace(/\.(name|target|label)$/, "");
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

// ------------------------------------------------------------- the review ---
//
// The review panel: the checks the design has to pass, and the state of the
// evidence behind every part. It is the same verdict the CI computes and the
// API serves, so the page cannot show a better design than the one that
// passed the build.

const GRADE = __GRADE__;

const reviewBox = document.querySelector("[data-review]");
const reviewToggle = document.querySelector("[data-review-toggle]");
if (reviewToggle) {
  reviewToggle.addEventListener("click", () => {
    reviewBox.hidden = !reviewBox.hidden;
    reviewToggle.setAttribute("aria-pressed", reviewBox.hidden ? "false" : "true");
    if (!reviewBox.hidden && !reviewBox.dataset.filled) {
      reviewBox.dataset.filled = "true";
      document.querySelector("[data-review-verdict]").textContent = `${GRADE.verdict} · ${GRADE.passedCount || 0}/${GRADE.total || 0} checks passed`;
      document.querySelector("[data-review-checks]").innerHTML = (GRADE.checks || [])
        .map((c) => `<li class="${c.ok ? "ok" : "fail"}"><b>${escapeHtml(c.name)}</b><span>${escapeHtml(c.detail || "")}</span></li>`)
        .join("");
      document.querySelector("[data-review-parts]").innerHTML = (GRADE.parts || [])
        .map((p) => `<tr class="state-${p.state}"><td>${escapeHtml(p.name)}<i>${escapeHtml(p.id)}</i></td><td>${escapeHtml(p.state)}</td><td>${p.papers}</td><td>${p.patents}</td></tr>`)
        .join("");
    }
  });
}

// ------------------------------------------------------------- the inspector ---
//
// Click a part and the page tells the reader what it is, what it does, the
// details that make it this part, and what it is doing in this process --
// with the papers and the patents that support it.

const inspector = document.querySelector("[data-inspector]");
const inspTitle = document.querySelector("[data-insp-title]");
const inspKind = document.querySelector("[data-insp-kind]");
const inspBody = document.querySelector("[data-insp-body]");

const escapeHtml = (value) =>
  String(value === undefined || value === null ? "" : value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

const link = (url, label) => (url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label));

function partHtml(part) {
  const rows = (part.details || [])
    .map((d) => `<div class="sk-insp-row"><span>${escapeHtml(d.label)}</span><b>${escapeHtml(d.value)}</b><i title="the field it came from">${escapeHtml(d.from || "")}</i></div>`)
    .join("");

  const here = [];
  if (part.here.steps && part.here.steps.length) here.push(["Steps", part.here.steps.join(" · ")]);
  if (part.here.streams && part.here.streams.length) here.push(["Carries", part.here.streams.join(" · ")]);
  if (part.here.targets && part.here.targets.length) here.push(["Targets", part.here.targets.join(" · ")]);
  if (part.here.acceptance) here.push(["Acceptance", part.here.acceptance]);
  const hereRows = here.map(([label, value]) => `<div class="sk-insp-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");

  const notes = (part.here.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");

  const evidence = (part.evidence || [])
    .map((topic) => {
      const papers = (topic.papers || []).slice(0, 4).map((p) => `<li>${link(p.url, p.title || p.doi)}${p.year ? ` <span class="sk-insp-year">${p.year}</span>` : ""}</li>`).join("");
      const patents = (topic.patents || []).slice(0, 3).map((p) => `<li>${link(p.url, p.number || p.title)}${p.year ? ` <span class="sk-insp-year">${p.year}</span>` : ""}</li>`).join("");
      return `<div class="sk-insp-evidence">
        <h4>${escapeHtml(topic.question || topic.topic)}</h4>
        <p class="sk-insp-query">${escapeHtml(topic.query)}</p>
        ${papers ? `<h5>Papers</h5><ul>${papers}</ul>` : ""}
        ${patents ? `<h5>Patents</h5><ul>${patents}</ul>` : ""}
        ${!papers && !patents ? `<p class="sk-insp-none">nothing retrieved for this one yet</p>` : ""}
      </div>`;
    })
    .join("");

  return `
    <section>
      <h4>What it is</h4>
      <p>${escapeHtml(part.what.text)}</p>
      ${rows ? `<div class="sk-insp-rows">${rows}</div>` : ""}
    </section>
    <section>
      <h4>What it does</h4>
      <p>${escapeHtml(part.does.text)}</p>
      ${part.does.isolation ? `<p class="sk-insp-note">${escapeHtml(part.does.isolation)}</p>` : ""}
    </section>
    <section>
      <h4>In this process</h4>
      ${hereRows ? `<div class="sk-insp-rows">${hereRows}</div>` : `<p class="sk-insp-none">the spec does not say</p>`}
      ${notes ? `<ul class="sk-insp-notes">${notes}</ul>` : ""}
    </section>
    ${evidence ? `<section><h4>The evidence</h4>${evidence}</section>` : ""}`;
}

function showPart(id) {
  const part = (CATALOGUE || []).find((p) => p.id === id);
  if (!part || !inspector) return;
  inspTitle.textContent = part.name;
  inspKind.textContent = `${part.id} · ${part.type || part.kind} · ${part.function}`;
  inspBody.innerHTML = partHtml(part);
  inspector.hidden = false;
  inspector.scrollIntoView({ block: "nearest" });
  say();
}

if (inspector) {
  document.querySelector("[data-insp-close]").addEventListener("click", () => {
    inspector.hidden = true;
  });
}

// Clicking a part opens it. The parts are the drawing's groups, and so are
// the nameplates, so the label opens the same record as the vessel.
svg.addEventListener("click", (event) => {
  const group = event.target.closest(".it");
  if (!group) return;
  const id = group.getAttribute("data-id");
  if (!id) return;
  showPart(id);
});

stage.addEventListener("click", (event) => {
  const label = event.target.closest(".sk-label");
  if (!label || !label.dataset.part) return;
  showPart(label.dataset.part);
});

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
