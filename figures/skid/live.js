const DATA = __DATA__;
const { P, levers, gauges, modePointer, model } = DATA;
const stage = document.querySelector(".sk-stage");
const svg = stage.querySelector("svg");
const readoutEl = document.querySelector("[data-readout]");
const liveEl = document.querySelector("[data-live]");
const still = matchMedia("(prefers-reduced-motion: reduce)");
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const add3 = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
const mul3 = (a, k) => [a[0] * k, a[1] * k, a[2] * k];
const screen = (point) => iso(point, P);

const state = { mode: "solvent", stages: 1, cuts: new Set(), angles: {}, needle: 0, touring: !still.matches, clock: 0, hover: null };

// The valves: each lever turns to the port it is set to.
const valveNodes = new Map();
for (const lever of levers) {
  const bar = svg.querySelector(`[data-lever="${lever.id}"]`);
  const grip = svg.querySelector(`[data-part="${lever.id}.grip"]`);
  if (bar && grip) valveNodes.set(lever.key, { lever, bar, grip });
  state.angles[lever.key] = lever.angles[0];
}

const needleNodes = gauges.map((gauge) => {
  const path = svg.querySelector(`[data-gauge="${gauge.id}"]`);
  return { gauge, path };
});
const modeHandle = svg.querySelector('[data-part="panel.modehandle"]');
const screenLines = [1, 2, 3].map((n) => svg.querySelector(`[data-part="panel.line${n}"]`));

function angleFor(lever) {
  const key = lever.key;
  if (key === "v1") return state.mode === "solvent" ? lever.angles[2] : lever.angles[1];
  if (key === "v2") return state.mode === "solvent" ? lever.angles[2] : lever.angles[1];
  if (key === "v3") return state.mode === "solvent" ? lever.angles[0] : lever.angles[2];
  if (key.startsWith("cut")) return state.cuts.has(key) ? lever.angles[0] : lever.angles[1];
  return lever.angles[0];
}

function drawLever(entry, degrees) {
  const { lever, bar, grip } = entry;
  const rad = (degrees * Math.PI) / 180;
  const dir = [Math.cos(rad), Math.sin(rad), 0];
  const tip = add3(lever.pivot, mul3(dir, lever.length));
  const end = add3(tip, mul3(dir, lever.length * 0.28));
  const a = screen(lever.pivot);
  const b = screen(tip);
  const c = screen(end);
  bar.setAttribute("d", `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
  grip.setAttribute("d", `M${b[0].toFixed(1)} ${b[1].toFixed(1)}L${c[0].toFixed(1)} ${c[1].toFixed(1)}`);
}

function drawNeedle(entry, value, max) {
  const { gauge, path } = entry;
  if (!path) return;
  const phi = (-120 + 300 * Math.sqrt(clamp(value / max, 0, 1))) * (Math.PI / 180);
  const dir = add3(mul3(gauge.u, Math.cos(phi)), mul3(gauge.v, Math.sin(phi)));
  const tip = add3(gauge.centre, mul3(dir, gauge.r - 2.4));
  const tail = add3(gauge.centre, mul3(dir, -(gauge.r - 2.4) * 0.28));
  const a = screen(tail);
  const b = screen(tip);
  path.setAttribute("d", `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
}

function drawModeHandle(degrees) {
  if (!modeHandle) return;
  const rad = (degrees * Math.PI) / 180;
  const dir = [Math.cos(rad), Math.sin(rad), 0];
  const c = modePointer.centre;
  const tip = add3(c, mul3(dir, modePointer.r + 2.4));
  const a = screen(c);
  const b = screen(tip);
  modeHandle.setAttribute("d", `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
}

function setMode(mode, announce = true) {
  if (!model.modes[mode]) return;
  state.mode = mode;
  svg.setAttribute("data-mode", mode);
  document.querySelectorAll("[data-mode-btn]").forEach((button) => {
    button.setAttribute("aria-pressed", String(button.dataset.modeBtn === mode));
  });
  if (announce) say(`${model.modes[mode].title}: ${model.modes[mode].goal}.`);
}

function setStages(stages, announce = true) {
  state.stages = clamp(stages, 1, model.vacuum.length);
  document.querySelectorAll("[data-stage-btn]").forEach((button) => {
    button.setAttribute("aria-pressed", String(Number(button.dataset.stageBtn) === state.stages));
  });
  if (announce) say(`${state.stages} stage vacuum set holding ${vacuumOf(state.stages).mbar} millibar.`);
}

function vacuumOf(stages) {
  return model.vacuum[clamp(stages, 1, model.vacuum.length) - 1];
}

function say(text) {
  if (liveEl && liveEl.textContent !== text) liveEl.textContent = text;
}

function readout() {
  const vac = vacuumOf(state.stages);
  const boil = satTempC(vac.mbar);
  const cut = state.cuts.size ? `cut ${[...state.cuts].map((key) => model.beds[Number(key.slice(3))].grade).join(" ")}` : "no bed cut";
  return `${state.stages}-stage · ${vac.mbar} mbar · boil ${boil.toFixed(0)} °C · ${model.modes[state.mode].title.toLowerCase()} · ${cut}`;
}

function paint() {
  for (const [key, entry] of valveNodes) {
    const target = angleFor(entry.lever);
    const current = state.angles[key] ?? target;
    const next = still.matches ? target : current + (target - current) * 0.25;
    state.angles[key] = next;
    drawLever(entry, next);
  }
  const vac = vacuumOf(state.stages);
  const want = vac.mbar;
  state.needle = still.matches ? want : state.needle + (want - state.needle) * 0.2;
  for (const entry of needleNodes) drawNeedle(entry, state.needle, 60);
  drawModeHandle(state.mode === "solvent" ? -40 : 40);
  const text = readout();
  if (readoutEl && readoutEl.textContent !== text) readoutEl.textContent = text;
  const mode = model.modes[state.mode];
  const lines = [mode.title.toUpperCase(), `${state.stages} STAGE${state.stages > 1 ? "S" : ""}`, `${vac.mbar} MBAR`];
  screenLines.forEach((node, index) => {
    if (node && node.textContent !== lines[index]) node.textContent = lines[index];
  });
  stage.setAttribute("aria-valuetext", text);
}

// ----------------------------------------------------------- the controls ---

document.querySelectorAll("[data-mode-btn]").forEach((button) => {
  button.addEventListener("click", () => {
    state.touring = false;
    setMode(button.dataset.modeBtn);
  });
});
document.querySelectorAll("[data-stage-btn]").forEach((button) => {
  button.addEventListener("click", () => {
    state.touring = false;
    setStages(Number(button.dataset.stageBtn));
  });
});

stage.addEventListener("keydown", (event) => {
  const key = event.key;
  if (key === "1") setMode("solvent");
  else if (key === "2") setMode("product");
  else if (key === "3") setStages(1);
  else if (key === "4") setStages(2);
  else if (key === "5") setStages(3);
  else if (key === "b" || key === "B") {
    const index = state.hover === null ? 0 : state.hover;
    const name = `cut${index}`;
    if (state.cuts.has(name)) state.cuts.delete(name);
    else state.cuts.add(name);
    say(`${model.beds[index].grade} bed cut ${state.cuts.has(name) ? "open" : "shut"}.`);
  } else return;
  event.preventDefault();
  state.touring = false;
});

stage.addEventListener("pointermove", (event) => {
  const bed = event.target.closest("[data-bed]");
  state.hover = bed ? Number(bed.dataset.bed) : null;
  if (state.hover !== null) {
    const info = model.beds[state.hover];
    say(`${info.grade} bed, ${info.pore} angstrom pores, ${info.cation} form: takes ${info.cut}.`);
  }
});
stage.addEventListener("click", (event) => {
  const bed = event.target.closest("[data-bed]");
  if (!bed) return;
  const index = Number(bed.dataset.bed);
  const name = `cut${index}`;
  if (state.cuts.has(name)) state.cuts.delete(name);
  else state.cuts.add(name);
  state.touring = false;
  say(`${model.beds[index].grade} bed cut ${state.cuts.has(name) ? "open" : "shut"}.`);
});

// ---------------------------------------------------------------- the loop ---

const TOUR = [
  { mode: "solvent", stages: 3, cut: 2 },
  { mode: "product", stages: 2, cut: 3 },
  { mode: "product", stages: 1, cut: 0 },
];
let frame = 0;
let last = 0;
let visible = false;
let tourStep = 0;

function tour() {
  const step = TOUR[tourStep % TOUR.length];
  tourStep += 1;
  state.mode = step.mode;
  svg.setAttribute("data-mode", step.mode);
  state.stages = step.stages;
  state.cuts = new Set([`cut${step.cut}`]);
  document.querySelectorAll("[data-mode-btn]").forEach((button) => button.setAttribute("aria-pressed", String(button.dataset.modeBtn === step.mode)));
  document.querySelectorAll("[data-stage-btn]").forEach((button) => button.setAttribute("aria-pressed", String(Number(button.dataset.stageBtn) === step.stages)));
}

function tick(now) {
  const dt = last ? Math.min((now - last) / 1000, 1 / 30) : 1 / 60;
  last = now;
  if (state.touring) {
    state.clock += dt;
    if (state.clock > 5.5) {
      state.clock = 0;
      tour();
    }
  }
  paint();
  frame = visible ? requestAnimationFrame(tick) : 0;
}

const run = () => {
  if (!frame && visible) {
    last = 0;
    frame = requestAnimationFrame(tick);
  }
};
new IntersectionObserver((entries) => {
  visible = entries[entries.length - 1].isIntersecting;
  if (visible) run();
}, { rootMargin: "120px 0px" }).observe(stage);

setMode("solvent", false);
setStages(1, false);
paint();
