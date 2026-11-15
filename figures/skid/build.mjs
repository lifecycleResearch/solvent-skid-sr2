import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import { tubePieces, tubeSvg } from "../../kit/tube.mjs";
import * as A from "../../kit/audit.mjs";
import { kitScript } from "../../scripts/inline-kit.mjs";
import * as M from "./model.mjs";
import { contextOf } from "./context.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const THEME = process.argv.includes("--light") ? "light" : "dark";
const DEG = Math.PI / 180;

const W = 1120;
const H = 860;
const AZ = 38;
const EL = 27;

const DECK = { x: -190, y: -90, w: 380, d: 180, r: 8 };
const DECK_T = 9;
const CASTER_H = 17;
const POST = 18;
const POST_X = 178;
const POST_Y = 80;
const TOP_RAIL = 220;
const MID_RAIL = 104;

const P = k.fitProjection(
  [
    ...k.boxCorners(DECK, -DECK_T - CASTER_H, 0),
    ...[[-POST_X, -POST_Y], [POST_X, -POST_Y], [-POST_X, POST_Y], [POST_X, POST_Y]].map(([x, y]) => [x, y, TOP_RAIL]),
    [176, 52, 150],
  ],
  W,
  H,
  { pad: 34, azimuth: AZ, elevation: EL },
);
const V = G.viewOf(P);
const KS = G.scaleOf(P);
const at = (point) => k.iso(point, P);
const S = (paths, style) => k.solidSvg(paths, style);
const Ln = (d, style) => k.lineSvg(d, style);
const Dots = (points, style) => k.dotsSvg(points, style);
const Faded = (list, style) => k.fadedSvg(list, style);

const R = A.recorder(P);
const { items, nameFor } = R;
const record = R.solid;

function put(piece, ref, svg, { bias = 0, shapes = [], name, route, chunk, live } = {}) {
  R.put({ piece, at: ref, bias, svg, shapes, name: name ?? nameFor(`${piece}.item`), route, chunk, live });
}

// ------------------------------------------------------------- primitives ---

function turned(piece, F, profile, style = {}, { extra = "", inner = "", bias = 0, name, owner, smooth, radius, slope, steps, rims, bevel = 0 } = {}) {
  const soft = smooth ?? profile.some((point) => point[2]);
  const options = { bevel, ...(rims ? { rims } : {}), ...(steps ? { steps } : {}) };
  if (soft) options.smooth = radius ? { radius, ...(slope ? { slope } : {}) } : true;
  const paths = G.solidOf(profile, F, P, options);
  const mid = (profile[0][0] + profile[profile.length - 1][0]) / 2;
  const id = nameFor(name ?? `${piece}.turned`);
  const shape = record(A.solid(F, profile, { name: id, owner, radius }));
  put(piece, G.add3(F.o, G.mul3(F.a, mid)), S(paths, { tone: "hi", ...style, inner: inner ? Ln(inner, { tone: "faint" }) : "" }) + extra, { bias, name: id, shapes: [shape] });
  return id;
}

function band(piece, F, s0, s1, r, style = {}, options = {}) {
  return turned(piece, F, [[s0, r], [s1, r]], style, options);
}

function flangeAt(piece, centre, axis, r, thick, { bolts = 8, tone = "hi", bias = 0, boltR, name, owner } = {}) {
  const F = G.frameAlong(centre, axis);
  const id = nameFor(name ?? `${piece}.flange`);
  const paths = G.disc(-thick / 2, thick / 2, r, F, P);
  const faces = [];
  const towards = G.dot3(F.a, V) > 0 ? thick / 2 : -thick / 2;
  if (Math.abs(G.dot3(F.a, V)) > 0.12 && bolts) faces.push(Dots(G.dotsOf(F, towards, boltR ?? r * 0.72, bolts, P, { all: true }), { size: 0.42, tone: "mid" }));
  put(piece, centre, S(paths, { tone }) + faces.join(""), { bias, name: id, shapes: [record(A.disc(F, -thick / 2, thick / 2, r, { name: id, owner }))] });
  return F;
}

function boxAt(piece, plan, z, h, style = {}, { extra = "", bias = 0, bevel = 0.5, steps = 3, name, owner } = {}) {
  const centre = [plan.x + plan.w / 2, plan.y + plan.d / 2, z + h / 2];
  const id = nameFor(name ?? `${piece}.box`);
  put(piece, centre, S(k.slabOf(plan, z, h, P, steps, bevel), { tone: "hi", ...style }) + extra, { bias, name: id, shapes: [record(A.box([plan.x, plan.y, z], [plan.x + plan.w, plan.y + plan.d, z + h], { name: id, owner }))] });
  return id;
}

function cylinderAt(piece, cx, cy, r, z, h, style = {}, { extra = "", bias = 0, steps = 48, name, owner, bevel = 0 } = {}) {
  const id = nameFor(name ?? `${piece}.cylinder`);
  put(piece, [cx, cy, z + h / 2], S(k.cylinder(cx, cy, r, z, h, P, steps, bevel), { tone: "hi", ...style }) + extra, { bias, name: id, shapes: [record(A.cylinder(cx, cy, r, z, h, { name: id, owner }))] });
  return id;
}

function ringBand(piece, F, s0, s1, rIn, rOut, style = {}, { name, owner } = {}) {
  const id = nameFor(name ?? `${piece}.ring`);
  const paths = G.ringBand(s0, s1, rIn, rOut, F, P);
  const shape = record(A.ring(F, s0, s1, rIn, rOut, { name: id, owner }));
  put(piece, G.add3(F.o, G.mul3(F.a, (s0 + s1) / 2)), S(paths, { tone: "hi", ...style }), { name: id, shapes: [shape] });
  return id;
}

function boss(piece, centre, outward, r, length, { tone = "hi", bias = 0.1, name, owner, ring = true } = {}) {
  const F = G.frameAlong(centre, outward);
  const id = nameFor(name ?? `${piece}.boss`);
  put(piece, G.add3(centre, G.mul3(F.a, length / 2)), S(G.disc(0, length, r, F, P), { tone }) + (ring && G.dot3(F.a, V) > 0.15 ? Ln(G.circleOf(F, length, r * 0.55, P, 16), { tone: "faint" }) : ""), { bias, name: id, shapes: [record(A.disc(F, 0, length, r, { name: id, owner }))] });
  return G.add3(centre, G.mul3(F.a, length));
}

// A patch of a cylinder's surface between two heights and two angles.
function surfacePatch(F, s0, s1, r, a0, a1, steps = 8) {
  const top = [];
  const bottom = [];
  for (let index = 0; index <= steps; index++) {
    const angle = a0 + ((a1 - a0) * index) / steps;
    top.push(k.iso(G.pointOf(F, s1, r, angle), P));
    bottom.push(k.iso(G.pointOf(F, s0, r, angle), P));
  }
  const d = top.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("");
  return `${d}L${bottom.reverse().map(([x, y]) => `${x.toFixed(1)} ${y.toFixed(1)}`).join("L")}Z`;
}

function pellets(F, s0, s1, r, count, seed = 1) {
  const out = [];
  let state = seed * 9301 + 49297;
  const random = () => {
    state = (state * 9301 + 49297) % 233280;
    return state / 233280;
  };
  for (let index = 0; index < count; index++) {
    const s = s0 + random() * (s1 - s0);
    const angle = Math.PI - 0.5 + random() * 1;
    out.push(k.iso(G.pointOf(F, s, r, angle), P));
  }
  return out;
}

// A dial gauge: body, ticks and a needle the live script turns.
function gauge(piece, centre, axis, R, { name, ticks = 24, every = 4, label = "" } = {}) {
  const F = G.frameAlong(centre, axis);
  const id = nameFor(name ?? `${piece}.gauge`);
  put(piece, centre, S(G.disc(0, 2.4, R, F, P, { bevel: 0.5 }), { tone: "hi", crease: "lo" }) + Ln(G.circleOf(F, 2.4, R - 1.8, P, 40), { tone: "lo" }), { name: `${id}.body`, shapes: [record(A.disc(F, 0, 2.4, R, { name: `${id}.body` }))] });
  const tickD = [];
  for (let index = 0; index < ticks; index++) {
    const angle = (index / ticks) * Math.PI * 2;
    const inner = R - (index % every === 0 ? 3.6 : 2.5);
    const a = k.iso(G.pointOf(F, 2.5, inner, angle), P);
    const b = k.iso(G.pointOf(F, 2.5, R - 1.9, angle), P);
    tickD.push(`M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`);
  }
  put(piece, centre, Ln(tickD.join(""), { tone: "lo" }), { bias: 0.2, name: `${id}.ticks` });
  const needle = `<path class="iso-line sk-needle" data-tone="lit" data-part="${id}.needle" data-gauge="${id}" data-free="start" stroke-width="1.2" d=""/>`;
  put(piece, centre, needle, { bias: 0.35, name: `${id}.needle` });
  if (label) {
    const [cx, cy, cz] = centre;
    put(piece, centre, k.faceTextSvg(k.sideMatrix([cx, cy - 0.2], cz - R * 0.42, P, "left"), label, { size: 2, tone: "lo", anchor: "middle" }), { bias: 0.4, name: `${id}.label` });
  }
  return { id, centre, R, u: F.u, v: F.v };
}

// A nameplate on a vertical face: a raised panel with rule lines standing for
// engraved text.
function nameplate(piece, centre, { w = 14, h = 7, name } = {}) {
  const [cx, cy, cz] = centre;
  const id = nameFor(name ?? `${piece}.plate`);
  const x0 = cx - w / 2;
  const x1 = cx + w / 2;
  const z0 = cz - h / 2;
  const z1 = cz + h / 2;
  const face = [
    [x0, cy, z0],
    [x1, cy, z0],
    [x1, cy, z1],
    [x0, cy, z1],
  ].map((point) => at(point));
  const d = face.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + "Z";
  put(piece, centre, `<path class="iso-fill sk-plate" d="${d}"/><path class="iso-line" data-tone="lo" d="${d}"/>`, { bias: 0.2, name: id, shapes: [record(A.box([x0, cy - 0.5, z0], [x1, cy + 0.5, z1], { name: id }))] });
  const rows = [0.52, 0.34, 0.16].map((share, index) => {
    const width = (w - 3) * [1, 0.7, 0.42][index];
    const a = at([x0 + 1.5, cy - 0.1, z0 + h * share]);
    const b = at([x0 + 1.5 + width, cy - 0.1, z0 + h * share]);
    return `M${a[0].toFixed(1)} ${a[1].toFixed(1)}L${b[0].toFixed(1)} ${b[1].toFixed(1)}`;
  });
  put(piece, centre, Ln(rows.join(""), { tone: "lo", free: true }), { bias: 0.25, name: `${id}.rules` });
  return id;
}

// ------------------------------------------------------------- the plumbing ---

const ROUTES = [];
const spanOf = (dense, points) => {
  if (!points || !points.length) return [];
  let start = 0;
  while (start < dense.length - 1 && !same3(dense[start], points[0])) start += 1;
  let back = start;
  let walked = 0;
  while (back > 0) {
    walked += G.len3(G.sub3(dense[back], dense[back - 1]));
    back -= 1;
    if (walked >= 7) break;
  }
  return dense.slice(back, start + points.length);
};
const same3 = (a, b) => Math.abs(a[0] - b[0]) < 1e-6 && Math.abs(a[1] - b[1]) < 1e-6 && Math.abs(a[2] - b[2]) < 1e-6;

function flowFor(dense, points, stream, modes) {
  if (!points || points.length < 2) return "";
  let start = 0;
  while (start < dense.length - 1 && !same3(dense[start], points[0])) start += 1;
  let back = start;
  let walked = 0;
  while (back > 0) {
    walked += G.len3(G.sub3(dense[back], dense[back - 1]));
    back -= 1;
    if (walked >= 7) break;
  }
  const end = Math.min(dense.length, start + points.length + 1);
  const slice = dense.slice(back, end);
  if (slice.length < 2) return "";
  const d = k.pathOf(slice.map((point) => k.iso(point, P)));
  return `<path class="sk-flow" data-stream="${stream}" data-modes="${modes}" d="${d}"/>`;
}

function pipe(piece, control, r, { bend = 2.6, tone = "hi", flanges = [false, false], flangeR = 1.55, bands = [], valve = null, bias = 0, maxLength = 26, spacing, name, touch, breaks = [], gaps: extra = [], stream, modes = "solvent product", owner } = {}) {
  const line = G.fillet(control, Math.max(r * bend, 3), r > 3 ? 24 : 12, { P, tube: r });
  const total = G.pathLength(line);
  const collars = [];
  [[0, -1], [total, 1]].forEach(([along, sign], index) => {
    if (!flanges[index]) return;
    const thick = Math.max(0.9, r * 0.55);
    const tangent = G.tangentAlong(line, along);
    collars.push({ kind: "flange", centre: G.add3(G.pointAlong(line, along), G.mul3(tangent, (-sign * thick) / 2)), tangent, radius: r * flangeR, thick, gap: sign < 0 ? [0, thick] : [total - thick, total] });
  });
  for (const share of bands) {
    const along = total * share;
    const thick = Math.max(0.8, r * 0.7);
    collars.push({ kind: "band", centre: G.pointAlong(line, along), tangent: G.tangentAlong(line, along), radius: r * 1.2, thick, gap: [along - thick / 2, along + thick / 2] });
  }
  const gaps = [...collars.map(({ gap }) => gap), ...extra];
  if (valve) {
    const along = valve[0] > 1 ? valve[0] : total * valve[0];
    gaps.push([along - valve[1] * 2.6, along + valve[1] * 2.6]);
  }
  const id = nameFor(name ?? `${piece}.pipe`);
  R.route(id, line, r, { owner: owner ?? id, touch, gaps, piece });
  const dense = G.resample(line, 2.2);
  tubePieces(line, r, P, { maxLength, spacing: spacing ?? Math.max(0.8, Math.min(2.4, r * 0.18)), breaks, gaps, caps: true }).forEach((part, index) => {
    const flow = stream ? flowFor(dense, part.points, stream, modes) : "";
    put(piece, part.mid, tubeSvg(part, { tone }) + flow, { bias, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(spanOf(dense, part.points), part.radii ? part.radii[part.radii.length - 1] : r)] });
  });
  for (const { kind, centre, tangent, radius, thick } of collars)
    flangeAt(piece, centre, tangent, radius, thick, { bolts: kind === "flange" && r > 3 ? 8 : 0, tone: kind === "flange" ? tone : "mid", bias, name: `${owner ?? id}.${kind}`, owner: owner ?? id });
  line.owner = id;
  ROUTES.push({ id, piece, line, r, stream, modes });
  return line;
}

function hose(piece, control, r, { name, stream, modes = "solvent product", bias = 0, tone = "hi" } = {}) {
  const line = G.fillet(control, Math.max(r * 5, 8), 16, { P, tube: r });
  const total = G.pathLength(line);
  const id = nameFor(name ?? `${piece}.hose`);
  R.route(id, line, r, { owner: id, piece, limp: true });
  const dense = G.resample(line, 2.2);
  tubePieces(line, r, P, { maxLength: 18, spacing: 1.2, rings: { pitch: 2.6, twist: 0.5, fade: [0.12, 0.5] } }).forEach((part, index) => {
    const flow = stream ? flowFor(dense, part.points, stream, modes) : "";
    put(piece, part.mid, tubeSvg(part, { tone }) + flow, { bias, name: `${id}:${index}`, route: id, chunk: index, shapes: [A.tube(part.points, part.radii)] });
  });
  [[0, -1], [total, 1]].forEach(([along, sign], index) => {
    const thick = Math.max(1.1, r * 0.7);
    const tangent = G.tangentAlong(line, along);
    flangeAt(piece, G.add3(G.pointAlong(line, along), G.mul3(tangent, (-sign * thick) / 2)), tangent, r * 1.5, thick, { bolts: 0, tone: "mid", bias, name: `${id}.collar`, owner: id });
  });
  ROUTES.push({ id, piece, line, r, stream, modes });
  return line;
}

// A four-way ball valve: a ball with four ports at north, east, south and west
// and a lever on top that points at the open outlet.
const LEVERS = [];
function valve4(piece, centre, r, { name, live } = {}) {
  const id = nameFor(name ?? `${piece}.valve`);
  put(piece, centre, S(G.sphereOf(centre, r * 1.4, P, { steps: 28 }), { tone: "hi" }), { name: id, shapes: [record(A.ball(centre, r * 1.4, { name: id }))] });
  const PORTS = [[0, 1], [1, 0], [0, -1], [-1, 0]];
  PORTS.forEach(([dx, dy], index) => {
    const dir = [dx, dy, 0];
    const F = G.frameAlong(centre, dir);
    put(piece, G.add3(centre, G.mul3(dir, r * 1.4)), S(G.disc(0, r * 1.7, r * 0.9, F, P), { tone: "hi" }), { bias: 0.1, name: `${id}.port${index}`, shapes: [record(A.disc(F, 0, r * 1.7, r * 0.9, { name: `${id}.port${index}` }))] });
  });
  const stem = G.add3(centre, [0, 0, r * 1.4]);
  const SF = G.frameAlong(stem, [0, 0, 1]);
  put(piece, stem, S(G.disc(0, r * 1.5, r * 0.4, SF, P), { tone: "mid" }), { bias: 0.2, name: `${id}.stem`, shapes: [record(A.disc(SF, 0, r * 1.5, r * 0.4, { name: `${id}.stem` }))] });
  const pivot = G.add3(stem, [0, 0, r * 1.5]);
  const lever = `<path class="iso-line sk-lever" data-part="${id}.lever" data-lever="${id}" data-tone="hi" stroke-width="2.6" d=""/>`;
  const grip = `<path class="iso-line sk-lever-grip" data-part="${id}.grip" data-tone="hi" stroke-width="4.2" d=""/>`;
  put(piece, pivot, lever + grip, { bias: 0.4, name: `${id}.lever`, live: live ? id : undefined });
  const entry = { key: live ?? id, id, pivot, r, angles: [90, 0, 270, 180], length: r * 3.6 };
  if (live) LEVERS.push(entry);
  return entry;
}

// An isolation valve on a horizontal line: the lever across the pipe is shut,
// along the pipe is open.
function valve2(piece, centre, axis, r, { name, live, open = 0, shut = 90 } = {}) {
  const F = G.frameAlong(centre, axis);
  const id = nameFor(name ?? `${piece}.valve`);
  const body = [[-r * 1.7, 0], [-r * 1.7, r * 1.3], [r * 1.7, r * 1.3], [r * 1.7, 0]];
  put(piece, centre, S(G.solidOf(body, F, P, { steps: 24 }), { tone: "hi" }), { name: id, shapes: [record(A.solid(F, body, { name: id }))] });
  const stem = G.add3(centre, [0, 0, r * 1.3]);
  const SF = G.frameAlong(stem, [0, 0, 1]);
  put(piece, stem, S(G.disc(0, r * 1.5, r * 0.4, SF, P), { tone: "mid" }), { bias: 0.2, name: `${id}.stem`, shapes: [record(A.disc(SF, 0, r * 1.5, r * 0.4, { name: `${id}.stem` }))] });
  const pivot = G.add3(stem, [0, 0, r * 1.5]);
  const lever = `<path class="iso-line sk-lever" data-part="${id}.lever" data-lever="${id}" data-tone="hi" stroke-width="2.4" d=""/>`;
  const grip = `<path class="iso-line sk-lever-grip" data-part="${id}.grip" data-tone="hi" stroke-width="3.8" d=""/>`;
  put(piece, pivot, lever + grip, { bias: 0.4, name: `${id}.lever`, live: live ? id : undefined });
  const entry = { key: live ?? id, id, pivot, r, angles: [open, shut], length: r * 3.2 };
  if (live) LEVERS.push(entry);
  return entry;
}
// ------------------------------------------------------------ the frame ---

const back = [];
back.push(`<path class="iso-halo" d="${k.haloOf(DECK, -DECK_T - CASTER_H, DECK_T, P)}"/>`);

const CASTERS = [[-168, -66], [168, -66], [-168, 66], [168, 66]].sort((a, b) => k.depthOf([a[0], a[1], 0], P) - k.depthOf([b[0], b[1], 0], P));
for (const [x, y] of CASTERS) {
  back.push(S(k.slabOf({ x: x - 9, y: y - 9, w: 18, d: 18, r: 2 }, -DECK_T - 3, 3, P, 3, 0.5), { tone: "lo" }));
  back.push(S(k.cylinder(x, y, 5.4, -DECK_T - 3, 3.4, P, 24), { tone: "mid" }));
  back.push(S(k.slabOf({ x: x - 7, y: y - 6, w: 14, d: 12, r: 2 }, -DECK_T - 6.4, 3.4, P, 3, 0.5), { tone: "mid" }));
  const WF = G.frameAlong([x, y, -DECK_T - 9.5], [1, 0, 0]);
  back.push(S(G.disc(-2.4, 2.4, 6.2, WF, P, { bevel: 0.6 }), { tone: "lo" }));
  back.push(S(G.disc(-2.8, 2.8, 2.4, WF, P), { tone: "mid" }));
}
back.push(S(k.slabOf(DECK, -DECK_T, DECK_T, P, 8, 1.4), { tone: "mid" }));
back.push(Ln(k.planOutline(k.insetPlan(DECK, 6), 0, P), { tone: "lo" }));
const DECK_SCREWS = k.corners(DECK, 12);
back.push(Ln(DECK_SCREWS.map(([x, y]) => k.ring(x, y, 2.4, 0, P, 16)).join(""), { tone: "lo" }));
back.push(Dots(DECK_SCREWS.map(([x, y]) => at([x, y, 0])), { size: 0.5 }));
record(A.box([DECK.x, DECK.y, -DECK_T], [DECK.x + DECK.w, DECK.y + DECK.d, 0], { name: "stand.deck" }));

const TRAY = { x: 74, y: -38, w: 96, d: 44, r: 4 };
back.push(S(k.slabOf(TRAY, 0, 1.2, P, 4, 0.4), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(TRAY, 2.4), 1.2, P, 4), { tone: "faint" }));

const POST_AT = [[-POST_X, -POST_Y], [POST_X, -POST_Y], [-POST_X, POST_Y], [POST_X, POST_Y]];
for (const [x, y] of POST_AT) {
  const plan = { x: x - POST / 2, y: y - POST / 2, w: POST, d: POST, r: 1.2 };
  back.push(S(k.slabOf(plan, 0, TOP_RAIL, P, 3, 0.9), { tone: "mid" }));
  const faceY = y < 0 ? y - POST / 2 : y + POST / 2;
  for (const side of [-1, 1]) {
    back.push(k.fadeLineSvg([at([x + side * (POST / 2 - 4), faceY, 0]), at([x + side * (POST / 2 - 4), faceY, TOP_RAIL])], { fade: [10, 0], tone: "faint" }));
  }
  record(A.box([x - POST / 2, y - POST / 2, 0], [x + POST / 2, y + POST / 2, TOP_RAIL], { name: "stand.post" }));
}
const RAILS = [
  { plan: { x: -POST_X + POST / 2, y: -POST_Y - POST / 2, w: POST_X * 2 - POST, d: POST, r: 1.2 }, z: TOP_RAIL - POST },
  { plan: { x: -POST_X + POST / 2, y: POST_Y - POST / 2, w: POST_X * 2 - POST, d: POST, r: 1.2 }, z: TOP_RAIL - POST },
  { plan: { x: -POST_X - POST / 2, y: -POST_Y + POST / 2, w: POST, d: POST_Y * 2 - POST, r: 1.2 }, z: TOP_RAIL - POST },
  { plan: { x: POST_X - POST / 2, y: -POST_Y + POST / 2, w: POST, d: POST_Y * 2 - POST, r: 1.2 }, z: TOP_RAIL - POST },
  { plan: { x: -POST_X + POST / 2, y: -POST_Y - POST / 2, w: POST_X * 2 - POST, d: POST, r: 1.2 }, z: MID_RAIL },
  { plan: { x: -POST_X + POST / 2, y: POST_Y - POST / 2, w: POST_X * 2 - POST, d: POST, r: 1.2 }, z: MID_RAIL },
];
for (const rail of RAILS) {
  back.push(S(k.slabOf(rail.plan, rail.z, POST, P, 3, 0.9), { tone: "mid" }));
  record(A.box([rail.plan.x, rail.plan.y, rail.z], [rail.plan.x + rail.plan.w, rail.plan.y + rail.plan.d, rail.z + POST], { name: "stand.rail" }));
}
for (const [x, y] of POST_AT) {
  const bracket = { x: x - 13, y: y - 13, w: 26, d: 26, r: 2 };
  back.push(S(k.slabOf(bracket, TOP_RAIL - POST - 3, 3, P, 3, 0.5), { tone: "mid" }));
  back.push(Dots(k.corners(bracket, 3.5).map(([bx, by]) => at([bx, by, TOP_RAIL])), { size: 0.5 }));
}

const DECK_PLATE = { x: -58, y: -84, w: 44, d: 8, r: 1 };
back.push(S(k.slabOf(DECK_PLATE, 0, 0.9, P, 3, 0.3), { tone: "lo", crease: "none" }));
back.push(Ln(k.planOutline(k.insetPlan(DECK_PLATE, 1.4), 0.9, P, 3), { tone: "faint" }));
back.push(k.faceTextSvg(k.topMatrix([-46, -80], 0.95, P, "x"), "SOLVENT SKID SR-2", { size: 3, tone: "lo" }));

// ------------------------------------------------------------- the feed end ---

const PNEUM = { x: -168, y: 30 };
const STRAIN = { x: -132, y: 30, r: 10, h: 22, z: 30 };

const AIR_F = G.frameAlong([PNEUM.x + 16, PNEUM.y, 15], [1, 0, 0]);
band("pump", AIR_F, -2, 8, 8.6, { tone: "hi" }, { name: "pump.airmotor", steps: 40 });
band("pump", AIR_F, 8, 13, 7, { tone: "hi" }, { name: "pump.motorend", steps: 32 });
put("pump", [PNEUM.x + 16, PNEUM.y, 15], Faded(G.ribsOf(AIR_F, -2, 8, 8.6, 12, P, { fade: [0.12, 0.5] }), { tone: "lo" }), { bias: 0.1, name: "pump.motorribs" });
record(A.disc(AIR_F, -2, 13, 8.6, { name: "pump.airmotor" }));
band("pump", G.frameAlong([PNEUM.x - 8, PNEUM.y, 14], [1, 0, 0]), 0, 15, 12, { tone: "hi" }, { name: "pump.head", steps: 40 });
band("pump", G.frameAlong([PNEUM.x, PNEUM.y, 14], [1, 0, 0]), 0, 5, 12.5, { tone: "hi" }, { name: "pump.plate", steps: 40 });
for (let index = 0; index < 4; index++) {
  const angle = 45 + index * 90;
  const rod = G.frameAlong([PNEUM.x - 2, PNEUM.y, 14], [Math.cos(angle * DEG), Math.sin(angle * DEG), 0]);
  band("pump", rod, 0, 13, 1.4, { tone: "mid" }, { name: `pump.tie${index}`, steps: 12 });
}
boss("pump", [PNEUM.x + 16, PNEUM.y + 8.6, 15], [0, 1, 0], 3.4, 5, { name: "pump.airin", tone: "mid" });
boss("pump", [PNEUM.x - 8, PNEUM.y, 14], [-1, 0, 0], 3, 6, { name: "pump.suction", tone: "hi" });
boss("pump", [PNEUM.x + 6, PNEUM.y, 26.5], [0, 0, 1], 2.6, 6, { name: "pump.outlet", tone: "hi" });
cylinderAt("pump", PNEUM.x + 4, PNEUM.y + 14, 5, 0, 12, { tone: "mid" }, { name: "pump.muffler" });
boxAt("pump", { x: PNEUM.x - 14, y: PNEUM.y - 14, w: 34, d: 28, r: 2 }, 0, 2.5, { tone: "lo" }, { name: "pump.base" });

cylinderAt("feed", STRAIN.x, STRAIN.y, STRAIN.r, STRAIN.z, STRAIN.h, { tone: "hi" }, { name: "strainer.body" });
band("feed", G.frameAlong([STRAIN.x, STRAIN.y, STRAIN.z + STRAIN.h], [0, 0, 1]), 0, 2.4, STRAIN.r + 2, { tone: "hi" }, { name: "strainer.lid", steps: 40 });
const LID_F = G.frameAlong([STRAIN.x, STRAIN.y, STRAIN.z + STRAIN.h + 2.4], [0, 0, 1]);
put("feed", [STRAIN.x, STRAIN.y, STRAIN.z + STRAIN.h + 2.4], Dots(G.dotsOf(LID_F, 2.4, STRAIN.r + 1.3, 8, P, { all: true }), { size: 0.45 }), { bias: 0.2, name: "strainer.bolts" });
boss("feed", [STRAIN.x, STRAIN.y - STRAIN.r, STRAIN.z + 4], [0, -1, 0], 2.2, 4, { name: "strainer.in", tone: "hi" });
boss("feed", [STRAIN.x, STRAIN.y, STRAIN.z + STRAIN.h + 4.4], [0, 0, 1], 2.2, 5, { name: "strainer.out", tone: "hi" });
boss("feed", [STRAIN.x, STRAIN.y - STRAIN.r, STRAIN.z + 2], [0, -1, 0], 1.8, 4, { name: "strainer.drain", tone: "mid" });
boxAt("feed", { x: STRAIN.x - 13, y: STRAIN.y - 11, w: 26, d: 22, r: 2 }, 0, STRAIN.z, { tone: "mid" }, { name: "strainer.bracket" });
gauge("feed", [STRAIN.x + 11, STRAIN.y - 4, STRAIN.z + STRAIN.h + 6], [0, -1, 0], 6, { name: "feed.dp", ticks: 16, every: 4 });

// --------------------------------------------------------- the feed drum ---

const DRUMFEED = { x: -146, y: 62, r: 20, h: 54 };
cylinderAt("feed", DRUMFEED.x, DRUMFEED.y, DRUMFEED.r, 0, DRUMFEED.h, { tone: "hi" }, { name: "feed.drum", steps: 56 });
band("feed", G.frameAlong([DRUMFEED.x, DRUMFEED.y, DRUMFEED.h - 4], [0, 0, 1]), 0, 3, DRUMFEED.r + 1.4, { tone: "hi" }, { name: "feed.drumrim", steps: 56 });
band("feed", G.frameAlong([DRUMFEED.x, DRUMFEED.y, DRUMFEED.h], [0, 0, 1]), 0, 2.6, DRUMFEED.r + 1.6, { tone: "hi" }, { name: "feed.drumlid", steps: 56 });
const DRUMFEED_F = G.frameAlong([DRUMFEED.x, DRUMFEED.y, 0], [0, 0, 1]);
put("feed", [DRUMFEED.x, DRUMFEED.y - DRUMFEED.r, 32], `<path class="sk-media" data-media="feed" d="${surfacePatch(DRUMFEED_F, 6, 56, DRUMFEED.r - 0.3, Math.PI - 0.22, Math.PI + 0.22, 6)}"/>` + Dots(pellets(DRUMFEED_F, 8, 54, DRUMFEED.r - 1.8, 12, 51), { size: 0.5 }), { bias: 0.2, name: "feed.drumlevel" });
boss("feed", [DRUMFEED.x, DRUMFEED.y - DRUMFEED.r, 12], [0, -1, 0], 2.4, 6, { name: "feed.drumoutlet", tone: "hi" });
boss("feed", [DRUMFEED.x, DRUMFEED.y, DRUMFEED.h + 2.6], [0, 0, 1], 2.4, 8, { name: "feed.druminlet", tone: "hi" });
boss("feed", [DRUMFEED.x, DRUMFEED.y, DRUMFEED.h + 2.6], [0, 0, 1], 2.4, 8, { name: "feed.druminlet", tone: "hi" });
nameplate("feed", [DRUMFEED.x + 10, DRUMFEED.y - DRUMFEED.r - 0.5, 50], { w: 16, h: 6, name: "feed.drumplate" });

// ------------------------------------------------------------- the membrane ---

const MEM = { x0: -106, x1: -36, y: 30, r: 12, z: 26 };
band("membrane", G.frameAlong([MEM.x0, MEM.y, MEM.z], [1, 0, 0]), 0, MEM.x1 - MEM.x0, MEM.r, { tone: "hi" }, { name: "membrane.shell", steps: 56 });
for (const x of [MEM.x0, MEM.x1]) flangeAt("membrane", [x, MEM.y, MEM.z], [1, 0, 0], MEM.r + 3, 2.6, { bolts: 10, name: `membrane.end${x < 0 ? "a" : "b"}` });
for (let index = 0; index < 4; index++) {
  const angle = 45 + index * 90;
  const rod = G.frameAlong([MEM.x0 + 2, MEM.y, MEM.z], [Math.cos(angle * DEG), Math.sin(angle * DEG), 0]);
  band("membrane", rod, 0, MEM.x1 - MEM.x0 - 4, 1.3, { tone: "mid" }, { name: `membrane.tie${index}`, steps: 12 });
}
boss("membrane", [MEM.x0 - 2, MEM.y, MEM.z], [-1, 0, 0], 3.4, 6, { name: "membrane.feed", tone: "hi" });
boss("membrane", [MEM.x1 + 2, MEM.y, MEM.z], [1, 0, 0], 3.4, 6, { name: "membrane.retentate", tone: "hi" });
boss("membrane", [(MEM.x0 + MEM.x1) / 2 - 18, MEM.y, MEM.z + MEM.r], [0, 0, 1], 2.6, 7, { name: "membrane.permeate", tone: "hi" });
boss("membrane", [(MEM.x0 + MEM.x1) / 2 + 18, MEM.y, MEM.z + MEM.r], [0, 0, 1], 2.2, 6, { name: "membrane.cip", tone: "mid" });
for (const x of [MEM.x0 + 22, MEM.x1 - 22]) {
  boxAt("membrane", { x: x - 9, y: MEM.y - 13, w: 18, d: 26, r: 2 }, 0, MEM.z - MEM.r + 1, { tone: "mid" }, { name: `membrane.cradle${x < -60 ? "a" : "b"}` });
  boxAt("membrane", { x: x - 9, y: MEM.y - 6, w: 18, d: 12, r: 2 }, MEM.z - MEM.r + 1, 3, { tone: "mid" }, { name: `membrane.saddle${x < -60 ? "a" : "b"}` });
}
gauge("membrane", [(MEM.x0 + MEM.x1) / 2 - 18, MEM.y - 6, MEM.z + MEM.r + 7], [0, -1, 0], 6.5, { name: "membrane.dp", ticks: 20, every: 5 });
nameplate("membrane", [(MEM.x0 + MEM.x1) / 2 + 22, MEM.y - MEM.r - 0.5, MEM.z - 3], { w: 20, h: 7, name: "membrane.plate" });

// ----------------------------------------------------- the carbon bed ---

const CARBON = { x0: -14, x1: 12, y: 8, r: 7.5, z: 46 };
band("carbon", G.frameAlong([CARBON.x0, CARBON.y, CARBON.z], [1, 0, 0]), 0, CARBON.x1 - CARBON.x0, CARBON.r, { tone: "hi" }, { name: "carbon.shell", steps: 44 });
for (const x of [CARBON.x0, CARBON.x1]) flangeAt("carbon", [x, CARBON.y, CARBON.z], [1, 0, 0], CARBON.r + 2.4, 2.2, { bolts: 8, name: `carbon.end${x < 0 ? "a" : "b"}` });
const CARB_WIN = G.frameAlong([CARBON.x0 + 4, CARBON.y, CARBON.z], [1, 0, 0]);
put("carbon", [CARBON.x0 + 13, CARBON.y, CARBON.z], `<path class="sk-media" data-media="carbon" d="${surfacePatch(CARB_WIN, -CARBON.r + 0.4, CARBON.r - 0.4, CARBON.r - 0.2, -0.5, 0.5, 8)}"/>` + Dots(pellets(CARB_WIN, -CARBON.r + 1.2, CARBON.r - 1.2, CARBON.r - 1.1, 44, 7), { size: 0.55 }), { bias: 0.2, name: "carbon.media" });
boxAt("carbon", { x: 2, y: CARBON.y - 9, w: 12, d: 18, r: 2 }, 0, CARBON.z - CARBON.r, { tone: "mid" }, { name: "carbon.post" });
nameplate("carbon", [7, CARBON.y - CARBON.r - 0.5, CARBON.z - 1], { w: 16, h: 6, name: "carbon.plate" });

// ------------------------------------------------------------ the valve block ---

const BLOCK = { x: 36, y: 24, z: 20 };
boxAt("block", { x: 12, y: BLOCK.y - 7, w: 48, d: 14, r: 2 }, BLOCK.z, 16, { tone: "hi" }, { name: "block.body", bevel: 0.6 });
boxAt("block", { x: 10, y: BLOCK.y - 9, w: 52, d: 18, r: 2 }, 0, BLOCK.z, { tone: "mid" }, { name: "block.post" });
[["v1", -14], ["v2", 14]].forEach(([key, dx]) => {
  valve4("block", [BLOCK.x + dx, BLOCK.y, BLOCK.z + 19], 2.4, { name: `block.${key}`, live: key });
});

// --------------------------------------------------------------- the sieve ---

const SIEVE = { x: 24, y: -56, r: 15, z0: 14, z1: 150 };
const BED_H = (SIEVE.z1 - SIEVE.z0) / 4;
M.BEDS.forEach((bed, index) => {
  const z0 = SIEVE.z0 + index * BED_H;
  const z1 = z0 + BED_H;
  const F = G.frameAlong([SIEVE.x, SIEVE.y, z0], [0, 0, 1]);
  band("sieve", F, 0, BED_H, SIEVE.r, { tone: "hi" }, { name: `sieve.bed${index}`, steps: 48 });
  const WIN = G.frameAlong([SIEVE.x, SIEVE.y, z0], [0, 0, 1]);
  put("sieve", [SIEVE.x, SIEVE.y - SIEVE.r, (z0 + z1) / 2], `<path class="sk-media" data-media="${bed.grade.toLowerCase()}" d="${surfacePatch(WIN, z0 + 4, z1 - 3, SIEVE.r - 0.3, Math.PI - 0.52, Math.PI + 0.52, 10)}"/>` + Dots(pellets(WIN, z0 + 5, z1 - 4, SIEVE.r - 1.2, 54, index + 3), { size: 0.55 }), { bias: 0.2, name: `sieve.media${index}` });
  const SEAM = G.frameAlong([SIEVE.x, SIEVE.y, z0], [0, 0, 1]);
  put("sieve", [SIEVE.x, SIEVE.y, z0], Ln(G.arcOf(SEAM, 0, SIEVE.r, P, { slope: 0 }) + G.arcOf(SEAM, BED_H, SIEVE.r, P, { slope: 0 }), { tone: "faint" }), { bias: 0.1, name: `sieve.seams${index}` });
  if (index < 3) flangeAt("sieve", [SIEVE.x, SIEVE.y, z1], [0, 0, 1], SIEVE.r + 2.2, 2.4, { bolts: 12, name: `sieve.flange${index}` });
  const port = boss("sieve", [SIEVE.x, SIEVE.y + SIEVE.r, z0 + 4], [0, 1, 0], 2.2, 6, { name: `sieve.cutport${index}`, tone: "hi" });
  valve2("sieve", G.add3(port, [0, 3.4, 0]), [0, 1, 0], 2.1, { name: `sieve.cut${index}`, live: `cut${index}`, open: 90, shut: 0 });
});
ringBand("sieve", G.frameAlong([SIEVE.x, SIEVE.y, SIEVE.z0 - 1.2], [0, 0, 1]), 0, 2.4, SIEVE.r - 0.4, SIEVE.r + 2.2, { tone: "hi" }, { name: "sieve.bottomflange" });
ringBand("sieve", G.frameAlong([SIEVE.x, SIEVE.y, SIEVE.z1 - 1.2], [0, 0, 1]), 0, 2.4, SIEVE.r - 0.4, SIEVE.r + 2.2, { tone: "hi" }, { name: "sieve.topflange" });
boss("sieve", [33, -44, 126], [1, 0, 0], 2.8, 6, { name: "sieve.inlet", tone: "hi" });
boss("sieve", [SIEVE.x, SIEVE.y + SIEVE.r, 20], [0, 1, 0], 2.2, 6, { name: "sieve.outlet", tone: "hi" });
boss("sieve", [SIEVE.x + SIEVE.r, SIEVE.y, SIEVE.z1 - 6], [1, 0, 0], 2.2, 5, { name: "sieve.vent", tone: "mid" });
for (const [dx, dy] of [[-10, -8], [10, -8], [0, 12]]) {
  boxAt("sieve", { x: SIEVE.x + dx - 2, y: SIEVE.y + dy - 2, w: 4, d: 4, r: 1 }, 0, SIEVE.z0 - 4, { tone: "mid" }, { name: `sieve.leg${dx}${dy}` });
}
boxAt("sieve", { x: SIEVE.x - 16, y: SIEVE.y - 16, w: 32, d: 32, r: 3 }, 0, 3, { tone: "mid" }, { name: "sieve.base" });
nameplate("sieve", [SIEVE.x + 13, SIEVE.y - SIEVE.r - 0.5, SIEVE.z1 - 8], { w: 18, h: 7, name: "sieve.plate" });

// ----------------------------------------------------------- the fraction cans ---

const CANS = [66, 90, 114, 138].map((x) => ({ x, y: 2 }));
CANS.forEach((can, index) => {
  cylinderAt("cans", can.x, can.y, 8.5, 0, 24, { tone: "hi" }, { name: `cans.body${index}` });
  band("cans", G.frameAlong([can.x, can.y, 24], [0, 0, 1]), 0, 2.2, 9.6, { tone: "hi" }, { name: `cans.lid${index}`, steps: 36 });
  const CAN_F = G.frameAlong([can.x, can.y, 0], [0, 0, 1]);
  put("cans", [can.x, can.y - 8.5, 13], `<path class="sk-media" data-media="${["water", "light", "paraffin", "heavy"][index]}" d="${surfacePatch(CAN_F, 2, 21, 8.2, Math.PI - 0.32, Math.PI + 0.32, 6)}"/>` + Dots(pellets(CAN_F, 3, 20, 8, 14, index + 11), { size: 0.45 }), { bias: 0.2, name: `cans.window${index}` });
  boss("cans", [can.x, can.y, 26.2], [0, 0, 1], 1.8, 5, { name: `cans.inlet${index}`, tone: "hi" });
  boss("cans", [can.x, can.y - 8.5, 4], [0, -1, 0], 1.6, 4, { name: `cans.drain${index}`, tone: "mid" });
  nameplate("cans", [can.x, can.y - 8.5, 16], { w: 12, h: 5, name: `cans.plate${index}` });
});

// ----------------------------------------------------------- the evaporator ---

const EVAP = { x: 90, y: -56, r: 17, z0: 12, z1: 104 };
const EVAP_F = G.frameAlong([EVAP.x, EVAP.y, 0], [0, 0, 1]);
const domeProfile = (r, s0, s1, n = 8) => {
  const rad = (s) => r * Math.sqrt(Math.max(0, 1 - ((s - s0) / (s1 - s0)) ** 2));
  const slope = (s) => {
    const t = (s - s0) / (s1 - s0);
    const d = Math.max(1e-3, Math.sqrt(Math.max(0, 1 - t * t)));
    return (-r * t) / (s1 - s0) / d;
  };
  const profile = [];
  for (let index = 0; index <= n; index++) {
    const s = s0 + ((s1 - s0) * index) / n;
    profile.push([s, rad(s), 1]);
  }
  return { profile, rad, slope };
};
const evapBottom = domeProfile(EVAP.r, 0, 12, 8);
turned("evap", EVAP_F, evapBottom.profile, { tone: "hi" }, { name: "evap.bottom", radius: evapBottom.rad, slope: evapBottom.slope });
band("evap", EVAP_F, 12, EVAP.z1, EVAP.r, { tone: "hi" }, { name: "evap.shell", steps: 56 });
ringBand("evap", G.frameAlong([EVAP.x, EVAP.y, 26], [0, 0, 1]), 0, 62, EVAP.r - 0.2, EVAP.r + 2.6, { tone: "mid" }, { name: "evap.jacket" });

ringBand("evap", G.frameAlong([EVAP.x, EVAP.y, EVAP.z1 - 1.3], [0, 0, 1]), 0, 2.6, EVAP.r - 0.4, EVAP.r + 3, { tone: "hi" }, { name: "evap.flange" });
const EVAP_TOP = G.frameAlong([EVAP.x, EVAP.y, EVAP.z1 + 2.6], [0, 0, 1]);
band("evap", EVAP_TOP, 0, 2.6, 9, { tone: "hi" }, { name: "evap.manway", steps: 32 });
put("evap", [EVAP.x, EVAP.y, EVAP.z1 + 5.2], Dots(G.dotsOf(EVAP_TOP, 2.6, 7.4, 8, P, { all: true }), { size: 0.45 }), { bias: 0.2, name: "evap.manwaybolts" });
boxAt("evap", { x: EVAP.x - 7, y: EVAP.y - 3, w: 14, d: 6, r: 1.5 }, EVAP.z1 + 5.2, 2, { tone: "mid" }, { name: "evap.handle" });
boxAt("evap", { x: EVAP.x - 8, y: EVAP.y - 8, w: 16, d: 16, r: 2 }, EVAP.z1 + 5.2, 11, { tone: "hi" }, { name: "evap.gearbox" });
cylinderAt("evap", EVAP.x, EVAP.y, 8, EVAP.z1 + 16.2, 20, { tone: "hi" }, { name: "evap.motor" });
const EVAP_MOTOR_F = G.frameAlong([EVAP.x, EVAP.y, EVAP.z1 + 16.2], [0, 0, 1]);
put("evap", [EVAP.x, EVAP.y, EVAP.z1 + 26], Faded(G.ribsOf(EVAP_MOTOR_F, 0, 20, 8, 14, P, { fade: [0.12, 0.5] }), { tone: "lo" }), { bias: 0.1, name: "evap.motorribs" });
boxAt("evap", { x: EVAP.x + 7, y: EVAP.y - 4, w: 6, d: 8, r: 1 }, EVAP.z1 + 22, 6, { tone: "mid" }, { name: "evap.terminalbox" });
boss("evap", [EVAP.x, EVAP.y + EVAP.r, EVAP.z1 - 6], [0, 1, 0], 2.8, 6, { name: "evap.vapour", tone: "hi" });
boss("evap", [EVAP.x, EVAP.y + EVAP.r, 44], [0, 1, 0], 2.2, 5, { name: "evap.inlet", tone: "hi" });
boss("evap", [EVAP.x, EVAP.y - EVAP.r, EVAP.z0 + 10], [0, -1, 0], 2.2, 5, { name: "evap.bottom", tone: "hi" });
boss("evap", [EVAP.x + EVAP.r + 2.6, EVAP.y, 30], [1, 0, 0], 1.8, 6, { name: "evap.jacketin", tone: "mid" });
boss("evap", [EVAP.x + EVAP.r + 2.6, EVAP.y, 84], [1, 0, 0], 1.8, 6, { name: "evap.jacketout", tone: "mid" });
const EVAP_WIN = G.frameAlong([EVAP.x, EVAP.y, 0], [0, 0, 1]);
put("evap", [EVAP.x, EVAP.y - EVAP.r, 60], `<path class="sk-media" data-media="oil" d="${surfacePatch(EVAP_WIN, 44, 76, EVAP.r - 0.3, Math.PI - 0.22, Math.PI + 0.22, 6)}"/>` + Dots(pellets(EVAP_WIN, 45, 75, EVAP.r - 1.4, 14, 21), { size: 0.45 }), { bias: 0.2, name: "evap.sight" });
for (const [dx, dy] of [[-11, -11], [11, -11], [0, 12]]) {
  boxAt("evap", { x: EVAP.x + dx - 2.5, y: EVAP.y + dy - 2.5, w: 5, d: 5, r: 1 }, 0, 12, { tone: "mid" }, { name: `evap.leg${dx}${dy}` });
}
nameplate("evap", [EVAP.x - 6, EVAP.y - EVAP.r - 0.5, 92], { w: 18, h: 7, name: "evap.plate" });

// ------------------------------------------------------- the condenser bank ---

const COND = { x0: 54, x1: 160, y: -56, z: [136, 158, 180, 202], r: 7 };
COND.z.forEach((z, index) => {
  const F = G.frameAlong([COND.x0, COND.y, z], [1, 0, 0]);
  band("cond", F, 0, COND.x1 - COND.x0, COND.r, { tone: "hi" }, { name: `cond.shell${index}`, steps: 44 });
  const inlet = index % 2 === 0 ? COND.x0 : COND.x1;
  const outlet = index % 2 === 0 ? COND.x1 : COND.x0;
  flangeAt("cond", [inlet, COND.y, z], [1, 0, 0], COND.r + 2.4, 2.2, { bolts: 8, name: `cond.inflange${index}` });
  flangeAt("cond", [outlet, COND.y, z], [1, 0, 0], COND.r + 2.4, 2.2, { bolts: 8, name: `cond.outflange${index}` });
  if (index === 0) boss("cond", [COND.x0 + 26, COND.y, z + COND.r], [0, 0, 1], 2, 6, { name: "cond.coolin", tone: "mid" });
  if (index === COND.z.length - 1) boss("cond", [COND.x1 - 26, COND.y, z - COND.r], [0, 0, -1], 2, 6, { name: "cond.coolout", tone: "mid" });
  boss("cond", [COND.x0 + 34 + index * 24, COND.y - COND.r, z], [0, -1, 0], 1.5, 4, { name: `cond.drain${index}`, tone: "mid" });
  const dial = G.frameAlong([COND.x0 + 18, COND.y - COND.r - 1, z], [0, -1, 0]);
  put("cond", [COND.x0 + 18, COND.y - COND.r - 1, z], S(G.disc(0, 1.8, 4.4, dial, P, { bevel: 0.4 }), { tone: "hi" }), { bias: 0.2, name: `cond.dial${index}`, shapes: [record(A.disc(dial, 0, 1.8, 4.4, { name: `cond.dial${index}` }))] });
  put("cond", [COND.x0 + 18, COND.y - COND.r - 2.8, z], Ln(G.circleOf(dial, 1.8, 3.2, P, 20), { tone: "faint" }), { bias: 0.25, name: `cond.dialface${index}` });
  nameplate("cond", [COND.x1 - 30, COND.y - COND.r - 0.5, z], { w: 16, h: 6, name: `cond.plate${index}` });
});
// support columns and saddles
boxAt("cond", { x: 44, y: COND.y - 5, w: 132, d: 10, r: 1 }, 206, 7, { tone: "mid" }, { name: "cond.beam" });
for (const x of [44, 175]) {
  boxAt("cond", { x: x - 4, y: -80, w: 8, d: 30, r: 1 }, 206, 7, { tone: "mid" }, { name: `cond.crossbeam${x}` });
}
for (const x of [72, 142]) {
  COND.z.forEach((z, index) => {
    boxAt("cond", { x: x - 4, y: COND.y - 8, w: 8, d: 16, r: 1.5 }, z - COND.r - 5, 5, { tone: "mid" }, { name: `cond.saddle${index}${x}` });
    band("cond", G.frameAlong([x, COND.y, z], [1, 0, 0]), -2.2, 2.2, COND.r + 1.2, { tone: "mid" }, { name: `cond.clamp${index}${x}`, steps: 40 });
    band("cond", G.frameAlong([x, COND.y, z], [0, 0, 1]), 0, 206 - z, 1.6, { tone: "mid" }, { name: `cond.hanger${index}${x}`, steps: 12 });
  });
}

// --------------------------------------------------------------- the solvent tank ---

const TANK = { x: 140, y: -56, r: 16, h: 76 };
const TANK_F = G.frameAlong([TANK.x, TANK.y, 0], [0, 0, 1]);
band("tank", TANK_F, 0, TANK.h, TANK.r, { tone: "hi" }, { name: "tank.shell", steps: 56 });
const tankTop = domeProfile(TANK.r, TANK.h, TANK.h + 10, 8);
turned("tank", TANK_F, tankTop.profile, { tone: "hi" }, { name: "tank.top", radius: tankTop.rad, slope: tankTop.slope });
boss("tank", [TANK.x, TANK.y, TANK.h + 10], [0, 0, 1], 2.4, 6, { name: "tank.inlet", tone: "hi" });
boss("tank", [TANK.x, TANK.y + TANK.r, 70], [0, 1, 0], 2.2, 6, { name: "tank.side", tone: "hi" });
boss("tank", [TANK.x + TANK.r, TANK.y, 70], [1, 0, 0], 1.6, 5, { name: "tank.breather", tone: "mid" });
boss("tank", [TANK.x, TANK.y - TANK.r, 10], [0, -1, 0], 2.2, 6, { name: "tank.outlet", tone: "hi" });
const TANK_WIN = G.frameAlong([TANK.x, TANK.y, 0], [0, 0, 1]);
put("tank", [TANK.x, TANK.y - TANK.r, 40], `<path class="sk-media" data-media="solvent" d="${surfacePatch(TANK_WIN, 8, 70, TANK.r - 0.3, Math.PI - 0.14, Math.PI + 0.14, 5)}"/>` + Dots(pellets(TANK_WIN, 10, 68, TANK.r - 1.6, 10, 31), { size: 0.45 }), { bias: 0.2, name: "tank.level" });
nameplate("tank", [TANK.x + 8, TANK.y - TANK.r - 0.5, 62], { w: 16, h: 6, name: "tank.plate" });

// ------------------------------------------------------------ the product drum ---

const DRUM = { x: -160, y: -56, r: 12, h: 46 };
cylinderAt("drum", DRUM.x, DRUM.y, DRUM.r, 0, DRUM.h, { tone: "hi" }, { name: "drum.body" });
band("drum", G.frameAlong([DRUM.x, DRUM.y, DRUM.h], [0, 0, 1]), 0, 2.4, DRUM.r + 1.6, { tone: "hi" }, { name: "drum.lid", steps: 44 });
boss("drum", [DRUM.x, DRUM.y + DRUM.r, 50], [0, 1, 0], 2.2, 6, { name: "drum.inlet", tone: "hi" });
const DRUM_WIN = G.frameAlong([DRUM.x, DRUM.y, 0], [0, 0, 1]);
put("drum", [DRUM.x, DRUM.y - DRUM.r, 28], `<path class="sk-media" data-media="oil" d="${surfacePatch(DRUM_WIN, 6, 42, DRUM.r - 0.3, Math.PI - 0.2, Math.PI + 0.2, 5)}"/>` + Dots(pellets(DRUM_WIN, 8, 40, DRUM.r - 1.5, 12, 41), { size: 0.45 }), { bias: 0.2, name: "drum.window" });
nameplate("drum", [DRUM.x, DRUM.y - DRUM.r - 0.5, 40], { w: 16, h: 6, name: "drum.plate" });

// ---------------------------------------------------------- the vacuum train ---

const MAN = { x0: 60, x1: 150, y: 66, z: 46, r: 3.2 };
band("vacuum", G.frameAlong([MAN.x0, MAN.y, MAN.z], [1, 0, 0]), 0, MAN.x1 - MAN.x0, MAN.r, { tone: "hi" }, { name: "vacuum.manifold", steps: 40 });
ringBand("vacuum", G.frameAlong([MAN.x0 - 1.2, MAN.y, MAN.z], [1, 0, 0]), 0, 2.2, MAN.r - 0.4, MAN.r + 2.4, { tone: "hi" }, { name: "vacuum.manleft" });
ringBand("vacuum", G.frameAlong([MAN.x1 - 1.2, MAN.y, MAN.z], [1, 0, 0]), 0, 2.2, MAN.r - 0.4, MAN.r + 2.4, { tone: "hi" }, { name: "vacuum.manright" });
const VAC_GAUGE = gauge("vacuum", [MAN.x0 + 26, MAN.y - MAN.r - 1, MAN.z], [0, -1, 0], 9, { name: "vacuum.dial", ticks: 30, every: 5 });

const PUMPS = [70, 102, 134].map((x, index) => ({ x, y: 30, index }));
PUMPS.forEach((pump, index) => {
  const body = G.frameAlong([pump.x, pump.y - 10, 18], [0, 1, 0]);
  const motor = G.frameAlong([pump.x, pump.y + 10, 18], [0, 1, 0]);
  boxAt("vacuum", { x: pump.x - 13, y: pump.y - 26, w: 26, d: 52, r: 2 }, 0, 3, { tone: "mid" }, { name: `vacuum.base${index}` });
  band("vacuum", body, 0, 18, 9.5, { tone: "hi" }, { name: `vacuum.pumpbody${index}`, steps: 44 });
  put("vacuum", [pump.x, pump.y - 10, 18], Faded(G.ribsOf(body, 0, 18, 9.5, 12, P, { fade: [0.12, 0.5] }), { tone: "lo" }), { bias: 0.1, name: `vacuum.pumpribs${index}` });
  boss("vacuum", [pump.x, pump.y - 10, 27.5], [0, 0, 1], 3, 5, { name: `vacuum.pumpin${index}`, tone: "hi" });
  boss("vacuum", [pump.x - 9.5, pump.y - 10, 18], [-1, 0, 0], 2.6, 5, { name: `vacuum.pumpexh${index}`, tone: "hi" });
  if (index < 2) {
    band("vacuum", motor, 0, 20, 8, { tone: "hi" }, { name: `vacuum.motor${index}`, steps: 44 });
    put("vacuum", [pump.x, pump.y + 10, 18], Faded(G.ribsOf(motor, 0, 20, 8, 12, P, { fade: [0.12, 0.5] }), { tone: "lo" }), { bias: 0.1, name: `vacuum.motorribs${index}` });
    boxAt("vacuum", { x: pump.x + 11, y: pump.y + 2, w: 6, d: 8, r: 1 }, 14, 8, { tone: "mid" }, { name: `vacuum.terminal${index}` });
  } else {
    band("vacuum", motor, 0, 22, 8.6, { tone: "hi" }, { name: "vacuum.boostair", steps: 44 });
    put("vacuum", [pump.x, pump.y + 10, 18], Faded(G.ribsOf(motor, 0, 22, 8.6, 12, P, { fade: [0.12, 0.5] }), { tone: "lo" }), { bias: 0.1, name: "vacuum.boostribs" });
    boss("vacuum", [pump.x, pump.y + 21, 18], [0, 1, 0], 2.2, 5, { name: "vacuum.boostairin", tone: "mid" });
    cylinderAt("vacuum", pump.x, pump.y + 26, 4, 0, 10, { tone: "mid" }, { name: "vacuum.muffler" });
  }
  nameplate("vacuum", [pump.x, pump.y - 24, 11], { w: 16, h: 6, name: `vacuum.plate${index}` });
});

// ------------------------------------------------------------ the gas scrubber ---

const SCRUB = { x: 176, y: -56, r: 12, z0: 10, z1: 118 };
const SCRUB_F = G.frameAlong([SCRUB.x, SCRUB.y, 0], [0, 0, 1]);
band("scrub", SCRUB_F, SCRUB.z0, SCRUB.z1, SCRUB.r, { tone: "hi" }, { name: "scrub.shell", steps: 52 });
const MEDIA = [
  { z0: 84, z1: 112, media: "carbon" },
  { z0: 48, z1: 84, media: "carbon" },
  { z0: 16, z1: 48, media: "zeolite" },
];
MEDIA.forEach((section, index) => {
  put("scrub", [SCRUB.x, SCRUB.y - SCRUB.r, (section.z0 + section.z1) / 2], `<path class="sk-media" data-media="${section.media}" d="${surfacePatch(SCRUB_F, section.z0, section.z1, SCRUB.r - 0.3, Math.PI - 0.32, Math.PI + 0.32, 8)}"/>` + Dots(pellets(SCRUB_F, section.z0 + 2, section.z1 - 2, SCRUB.r - 1.3, 32, index + 5), { size: 0.5 }), { bias: 0.2, name: `scrub.media${index}` });
});
for (const z of [SCRUB.z0, 48, 84, SCRUB.z1]) ringBand("scrub", G.frameAlong([SCRUB.x, SCRUB.y, z - 1.2], [0, 0, 1]), 0, 2.4, SCRUB.r - 0.4, SCRUB.r + 2.4, { tone: "hi" }, { name: `scrub.flange${z}` });
band("scrub", G.frameAlong([SCRUB.x, SCRUB.y, SCRUB.z1 + 2.4], [0, 0, 1]), 0, 3, SCRUB.r + 1.4, { tone: "hi" }, { name: "scrub.lid", steps: 48 });
boxAt("scrub", { x: SCRUB.x - 10, y: SCRUB.y - 3, w: 20, d: 6, r: 1.5 }, SCRUB.z1 + 5.4, 2.4, { tone: "mid" }, { name: "scrub.handle" });
band("scrub", G.frameAlong([SCRUB.x, SCRUB.y, SCRUB.z1 + 7.8], [0, 0, 1]), 0, 30, 5, { tone: "hi" }, { name: "scrub.stack", steps: 36 });
band("scrub", G.frameAlong([SCRUB.x, SCRUB.y, SCRUB.z1 + 37.8], [0, 0, 1]), 0, 3, 7.5, { tone: "hi" }, { name: "scrub.cap", steps: 36 });
boss("scrub", [SCRUB.x, SCRUB.y + SCRUB.r, 60], [0, 1, 0], 2.8, 6, { name: "scrub.inlet", tone: "hi" });
boss("scrub", [SCRUB.x, SCRUB.y - SCRUB.r, 16], [0, -1, 0], 2, 5, { name: "scrub.drain", tone: "mid" });
boss("tank", [TANK.x, TANK.y - TANK.r, 10], [0, -1, 0], 2.2, 6, { name: "tank.outlet", tone: "hi" });
gauge("scrub", [SCRUB.x - SCRUB.r - 1, SCRUB.y - 6, 96], [-1, 0, 0], 6, { name: "scrub.dp", ticks: 20, every: 5 });
for (const [dx, dy] of [[-10, -10], [10, -10], [0, 12]]) {
  boxAt("scrub", { x: SCRUB.x + dx - 2.5, y: SCRUB.y + dy - 2.5, w: 5, d: 5, r: 1 }, 0, SCRUB.z0, { tone: "mid" }, { name: `scrub.leg${dx}${dy}` });
}

// --------------------------------------------------------- the control panel ---

const PANEL = { x: -176, y: -104, z: 96, w: 30, h: 48 };
boxAt("panel", { x: PANEL.x - PANEL.w / 2, y: PANEL.y, w: PANEL.w, d: 16, r: 2 }, PANEL.z, PANEL.h, { tone: "hi" }, { name: "panel.box", bevel: 0.8 });
for (const z of [PANEL.z + 8, PANEL.z + 36]) {
  boxAt("panel", { x: PANEL.x - 8, y: PANEL.y + 15, w: 16, d: 18, r: 1 }, z, 4, { tone: "mid" }, { name: `panel.bracket${z}` });
}
const SCREEN = { x: PANEL.x, y: PANEL.y - 0.4, z: PANEL.z + 34, w: 24, h: 12 };
const screenQuad = [
  [SCREEN.x - SCREEN.w / 2, SCREEN.y, SCREEN.z],
  [SCREEN.x + SCREEN.w / 2, SCREEN.y, SCREEN.z],
  [SCREEN.x + SCREEN.w / 2, SCREEN.y, SCREEN.z + SCREEN.h],
  [SCREEN.x - SCREEN.w / 2, SCREEN.y, SCREEN.z + SCREEN.h],
].map((point) => at(point));
const screenD = screenQuad.map(([x, y], index) => `${index ? "L" : "M"}${x.toFixed(1)} ${y.toFixed(1)}`).join("") + "Z";
put("panel", [SCREEN.x, SCREEN.y, SCREEN.z], `<path class="sk-screen" d="${screenD}"/><path class="iso-line" data-tone="lo" d="${screenD}"/>`, { bias: 0.2, name: "panel.screen" });
const PANEL_MATRIX = k.sideMatrix([SCREEN.x, SCREEN.y], SCREEN.z, P, "left");
put("panel", [SCREEN.x, SCREEN.y, SCREEN.z], `<g transform="${PANEL_MATRIX}"><text class="sk-screen-text" data-part="panel.line1" x="-10" y="-4.4">SOLVENT</text><text class="sk-screen-text" data-part="panel.line2" x="-10" y="0.2">1 STAGE</text><text class="sk-screen-text" data-part="panel.line3" x="-10" y="4.8">35 MBAR</text></g>`, { bias: 0.25, name: "panel.readout" });
for (let index = 0; index < 4; index++) {
  const BX = PANEL.x - 8 + index * 5.5;
  const BF = G.frameAlong([BX, PANEL.y, PANEL.z + 12], [0, -1, 0]);
  put("panel", [BX, PANEL.y, PANEL.z + 12], S(G.disc(0, 1.6, 1.7, BF, P), { tone: "mid" }), { bias: 0.2, name: `panel.button${index}`, shapes: [record(A.disc(BF, 0, 1.6, 1.7, { name: `panel.button${index}` }))] });
}
const ESTOP = [PANEL.x + 9, PANEL.y, PANEL.z + 12];
const ESTOP_F = G.frameAlong([ESTOP[0], ESTOP[1], ESTOP[2]], [0, -1, 0]);
put("panel", ESTOP, S(G.disc(0, 2.2, 3.2, ESTOP_F, P, { bevel: 0.4 }), { tone: "mid" }), { bias: 0.2, name: "panel.estop", shapes: [record(A.disc(ESTOP_F, 0, 2.2, 3.2, { name: "panel.estop" }))] });
const MODE_SW = [PANEL.x - 9, PANEL.y, PANEL.z + 24];
const MODE_F = G.frameAlong([MODE_SW[0], MODE_SW[1], MODE_SW[2]], [0, -1, 0]);
put("panel", MODE_SW, S(G.disc(0, 2, 2.8, MODE_F, P, { bevel: 0.3 }), { tone: "mid" }), { bias: 0.2, name: "panel.modeswitch", shapes: [record(A.disc(MODE_F, 0, 2, 2.8, { name: "panel.modeswitch" }))] });
put("panel", MODE_SW, `<path class="iso-line sk-lever" data-part="panel.modehandle" data-tone="hi" stroke-width="1.8" d=""/>`, { bias: 0.45, name: "panel.modehandle", live: "mode" });

// ------------------------------------------------------------------- piping ---

const run = (piece, points, r, opts = {}) => pipe(piece, points, r, opts);

// the feed drum -> the pneumatic pump
run("feed", [[DRUMFEED.x, DRUMFEED.y - DRUMFEED.r - 6, 12], [-180, DRUMFEED.y - DRUMFEED.r - 6, 12], [-180, 30, 14], [PNEUM.x - 14, 30, 14]], 2.3, { name: "feed.suction", stream: "feed" });

// the pump -> the strainer
run("feed", [[PNEUM.x + 6, PNEUM.y, 32.5], [PNEUM.x + 6, 10, 32.5], [STRAIN.x, 10, 32.5], [STRAIN.x, 10, 34], [STRAIN.x, 16, 34]], 2.3, { name: "feed.pipe", stream: "feed" });

// the strainer -> the membrane
run("feed", [[STRAIN.x, STRAIN.y, 61.4], [STRAIN.x, STRAIN.y, 70], [-118, STRAIN.y, 70], [-118, MEM.y, 26], [MEM.x0 - 8, MEM.y, 26]], 2.3, { name: "feed.membrane", stream: "feed" });

// the membrane permeate -> the carbon bed
run("membrane", [[-89, MEM.y, 45], [-89, MEM.y, 58], [-26, MEM.y, 58], [-26, CARBON.y, 58], [-26, CARBON.y, CARBON.z], [CARBON.x0 - 2.2, CARBON.y, CARBON.z]], 2.1, { name: "membrane.permeate", stream: "solvent" });

// the carbon bed -> the block (V1 common, the west port)
run("carbon", [[CARBON.x1 + 2.2, CARBON.y, CARBON.z], [CARBON.x1 + 2.2, CARBON.y, 46], [6, CARBON.y, 46], [6, BLOCK.y, 46], [6, BLOCK.y, 39], [14.6, BLOCK.y, 39]], 2.1, { name: "carbon.out", stream: "solvent" });

// V1 south port -> the sieve inlet valve (V3)
run("block", [[22, 16.6, 39], [22, 10, 39], [22, 10, 126], [46.4, 10, 126], [46.4, -36.6, 126]], 2.1, { name: "block.sieve", stream: "solvent", modes: "solvent" });

// V1 east port -> the solvent tank
run("block", [[29.4, BLOCK.y, 39], [29.4, BLOCK.y, 70], [29.4, -20, 70], [TANK.x, -20, 70], [TANK.x, -34, 70]], 2.1, { name: "block.tank", stream: "solvent", modes: "product" });

// V2 east port -> the vacuum evaporator
run("block", [[57.4, BLOCK.y, 39], [57.4, 44, 39], [EVAP.x, 44, 39], [EVAP.x, 44, 44], [EVAP.x, -33, 44]], 2.1, { name: "block.evap", stream: "product", modes: "product" });

// V2 south port -> the product drum
run("block", [[46, 16.6, 39], [46, -35, 39], [DRUM.x, -35, 39], [DRUM.x, -35, 50], [DRUM.x, -38, 50]], 2.1, { name: "block.drum", stream: "product", modes: "solvent" });

// the membrane retentate -> the block (V2 common, the north port)
run("membrane", [[MEM.x1 + 8, MEM.y, MEM.z], [MEM.x1 + 8, MEM.y, 46], [MEM.x1 + 8, 44, 46], [46, 44, 46], [46, 44, 39], [46, 31.4, 39]], 2.1, { name: "membrane.retentate", stream: "product" });

// the sieve bottom -> the solvent tank
run("sieve", [[SIEVE.x, -35, 20], [TANK.x, -35, 20], [TANK.x, -35, 96], [TANK.x, TANK.y, 96], [TANK.x, TANK.y, 92]], 2.2, { name: "sieve.toTank", stream: "solvent" });

// the sieve bed cuts -> the collection cans
CANS.forEach((can, index) => {
  const z = SIEVE.z0 + index * BED_H + 4;
  const drop = SIEVE.x - index * 3;
  const level = 34 + index * 3.5;
  run("sieve", [[SIEVE.x, -35, z], [drop, -35, z], [drop, -12, z], [drop, -12, level], [can.x, -12, level], [can.x, can.y, level], [can.x, can.y, 31.2]], 1.6, { name: `sieve.cut${index}`, stream: "waste" });
});

// the evaporator vapour -> the top of the condenser bank
run("evap", [[EVAP.x, -33, 98], [EVAP.x, -33, 240], [24, -33, 240], [24, COND.y, 240], [24, COND.y, COND.z[3]], [COND.x0 - 1.2, COND.y, COND.z[3]]], 2.6, { name: "evap.vapour", stream: "vapour", modes: "product" });

// the bank: in at the top, down the stack
COND.z.forEach((z, index) => {
  const inlet = index % 2 === 0 ? COND.x0 : COND.x1;
  const outlet = index % 2 === 0 ? COND.x1 : COND.x0;
  if (index === 0) {
    run("cond", [[COND.x0 - 6, COND.y, COND.z[3]], [COND.x0 - 6, COND.y, COND.z[3] - 8], [COND.x0 - 1.2, COND.y, COND.z[3]]], 2.6, { name: "cond.in0", stream: "vapour", modes: "product" });
  } else {
    const dir = inlet < outlet ? 1 : -1;
    run("cond", [[outlet + dir * 7, COND.y, COND.z[index - 1]], [outlet + dir * 7, COND.y, z]], 2.6, { name: `cond.link${index}`, stream: "vapour", modes: "product", flanges: [true, true] });
  }
});

// the last shell -> the vacuum manifold
run("cond", [[COND.x0 - 7, COND.y, COND.z[0]], [46, COND.y, COND.z[0]], [46, COND.y, 46], [46, MAN.y, 46], [MAN.x0 - 1.2, MAN.y, MAN.z]], 2.6, { name: "cond.out", stream: "waste", modes: "product" });

// the condenser condensate -> the header -> the sieve inlet valve (V3)
COND.z.forEach((z, index) => {
  const dx = COND.x0 + 20 + index * 24;
  run("cond", [[dx, COND.y - COND.r - 4, z], [dx, -72, z], [dx, -72, 120]], 1.8, { name: `cond.condensate${index}`, stream: "solvent", modes: "product" });
});
run("cond", [[COND.x0 + 20, -72, 120], [52, -72, 120], [52, -72, 126], [46.4, -72, 126], [46.4, -51.4, 126]], 2.2, { name: "cond.header", stream: "solvent", modes: "product", gaps: [[41.6, 51.2]] });

// the manifold -> the pumps
PUMPS.forEach((pump, index) => {
  run("vacuum", [[pump.x, MAN.y, MAN.z], [pump.x, 20, MAN.z], [pump.x, 20, 32.5]], 2.4, { name: `vacuum.drop${index}`, stream: "waste" });
});
// the pumps -> the gas scrubber
PUMPS.forEach((pump, index) => {
  run("vacuum", [[pump.x - 14.5, 20, 18], [pump.x - 14.5, 66, 18], [pump.x - 14.5, 66, 12]], 2.2, { name: `vacuum.exh${index}`, stream: "waste" });
});
run("vacuum", [[PUMPS[0].x - 14.5, 66, 12], [176, 66, 12], [176, 66, 60], [176, -38, 60]], 2.4, { name: "vacuum.toScrubber", stream: "waste" });

// the cooling circuit
run("cond", [[COND.x0 + 26, COND.y, COND.z[3] + COND.r + 6], [COND.x0 + 26, COND.y, 236], [COND.x0 + 26, -40, 236], [COND.x1 + 6, -40, 236]], 1.8, { name: "cond.coolsupply", stream: "waste" });
run("cond", [[COND.x1 - 26, COND.y, COND.z[0] - COND.r - 6], [COND.x1 - 26, COND.y, 138], [COND.x1 - 26, -40, 138], [COND.x0 - 12, -40, 138]], 1.8, { name: "cond.coolreturn", stream: "waste" });

// the air hose to the pump
hose("pump", [[PNEUM.x + 16, PNEUM.y + 13.6, 15], [PNEUM.x + 16, PNEUM.y + 26, 15], [PNEUM.x - 26, PNEUM.y + 26, 15], [PNEUM.x - 26, PNEUM.y + 26, 46], [PNEUM.x + 44, PNEUM.y + 26, 46]], 1.5, { name: "pump.airhose" });

// the recovered solvent back to the feed drum
run("feed", [[TANK.x, TANK.y - TANK.r - 6, 10], [TANK.x, -84, 10], [DRUMFEED.x, -84, 10], [DRUMFEED.x, -84, 78], [DRUMFEED.x, DRUMFEED.y, 78], [DRUMFEED.x, DRUMFEED.y, DRUMFEED.h + 10.6]], 2.4, { name: "feed.recycle", stream: "solvent" });

// ------------------------------------------------------------ assemble the page ---

A.settle(R, P);
items.sort((a, b) => a.key - b.key);

// The geometry audit is the slow part, so it only runs when it is asked for.
// It runs here, before the page is assembled, so that the plant's description
// in the page can carry its counts.
const AUDIT_FILE = join(HERE, "skid-audit.json");
let audit = null;
try {
  audit = JSON.parse(readFileSync(AUDIT_FILE, "utf8"));
} catch {
  audit = null;
}
if (process.argv.includes("--audit")) {
  const result = A.auditOrExit(R, P);
  if (result) {
    audit = {
      measured: true,
      clearance: (result.clearance || []).length,
      terminals: (result.terminals || []).length,
      sunk: ((result.supports || {}).sunk || []).length,
      unsupported: ((result.supports || {}).loose || []).length,
      hanging: ((result.supports || {}).hanging || []).length,
      depth: (((result.depth || {}).problems) || []).length,
      crowding: (result.crowding || []).length,
      note: "counts from `node figures/skid/build.mjs --audit`",
    };
    writeFileSync(AUDIT_FILE, `${JSON.stringify(audit, null, 2)}\n`);
  }
}

const groups = items.map((item, index) => `<g class="it" data-piece="${item.piece}" data-name="${item.name}" data-i="${index}">${item.svg}</g>`);

const LABEL_TEXT =
  "A solvent recovery skid on an aluminium frame: a pneumatic diaphragm pump and basket strainer feed a cross-flow membrane module with a 0.001 micron pore, whose permeate runs through a carbon bed to a three-valve routing block; a molecular sieve stack of 3A, 4A, 5A and 13X beds collects four fractions into cans; a vacuum evaporator boils the retentate and its vapour is condensed in a bank of four shells; a one, two or three stage vacuum set pulls the vapour through a gas scrubber holding carbon and zeolite.";

const svg = k.figureSvg({ width: W, height: H, label: LABEL_TEXT, body: [back, groups.join("")] }).replace("<svg ", `<svg data-mode="solvent" `);

// The plant, written down: the chatbot's ground truth, and the Worker the
// deployed page asks for it.
const CONTEXT = contextOf(audit);
const PAGE_CONTEXT = { ...CONTEXT };
delete PAGE_CONTEXT.prompt;

const DATA = {
  W,
  H,
  P,
  levers: LEVERS.map((lever) => ({ key: lever.key, id: lever.id, pivot: lever.pivot, length: lever.length, r: lever.r, angles: lever.angles })),
  gauges: [{ id: VAC_GAUGE.id, centre: VAC_GAUGE.centre, r: VAC_GAUGE.R, u: VAC_GAUGE.u, v: VAC_GAUGE.v }],
  modePointer: { centre: MODE_SW, r: 2.8 },
  model: {
    vacuum: M.VACUUM,
    beds: M.BEDS,
    condenser: M.CONDENSERS,
    membrane: M.MEMBRANE,
    chiller: M.CHILLER,
    modes: M.MODES,
  },
  skidContext: PAGE_CONTEXT,
  iso: { x: k.iso([1, 0, 0], P), y: k.iso([0, 1, 0], P), z: k.iso([0, 0, 1], P), o: k.iso([0, 0, 0], P) },
};

const body = k.plateHtml({
  fig: "Fig 1",
  title: "Solvent recovery skid SR-2",
  hint: "Click the panel to change the setup",
  readout: "1-stage · 35 mbar · boil +12 °C",
  keys: [
    { mark: "lit", label: "the route the flow is on now" },
    { mark: "amber", label: "crude extract" },
    { mark: "blue", label: "recovered solvent" },
    { mark: "violet", label: "solvent vapour" },
    { mark: "green", label: "cannabinoid stream" },
  ],
  caption:
    "One skid, two setups, chosen by three valves on the routing block. In SOLVENT the membrane's permeate, stripped of its last cannabinoids by the CRC carbon bed, is dried on the 3A to 13X sieve stack and goes back to the tank, while the rich retentate goes straight to the product drum. In PRODUCT the routing is reversed: the permeate goes to the tank as wash, the rich retentate is stripped of its solvent in the vacuum evaporator, the vapour is condensed in the four shells and dried on the sieve before it returns, and the cannabinoid residue is left in the drum. Each bed of the stack can be cut on its own into a collection can. The vacuum set may be one, two or three stages: the deeper the vacuum, the lower the solvent boils, and the colder the condenser has to be.",
  body: `<div class="sk-stage" tabindex="0" role="group" aria-label="Solvent recovery skid. Press 1 for the pure solvent setup, 2 for the pure product setup, and 3, 4 or 5 for the one, two or three stage vacuum set.">${svg}</div>
  <div class="sk-controls">
    <button type="button" class="sk-btn" data-mode-btn="solvent" aria-pressed="true">Pure solvent</button>
    <button type="button" class="sk-btn" data-mode-btn="product" aria-pressed="false">Pure product</button>
    <span class="sk-sep"></span>
    <button type="button" class="sk-btn" data-stage-btn="1" aria-pressed="true">1 stage</button>
    <button type="button" class="sk-btn" data-stage-btn="2" aria-pressed="false">2 stages</button>
    <button type="button" class="sk-btn" data-stage-btn="3" aria-pressed="false">3 stages</button>
    <span class="sk-live" aria-live="polite" data-live></span>
  </div>`,
});

const CSS = readFileSync(join(HERE, "skid.css"), "utf8") + readFileSync(join(HERE, "chat.css"), "utf8");
const MODEL_SRC = `const satTempC = ${M.satTempC.toString().replace("export ", "")};
const coolantNeeded = ${M.coolantNeeded.toString().replace("export ", "")};`;
// The describer lives with the Worker, so the page and the API answer the
// same way; it is inlined here rather than fetched, so the figure works from
// a file on disk with no server at all.
const DESCRIBE_SRC = readFileSync(join(ROOT, "deploy", "describe.mjs"), "utf8").replace(/export (function|const|let)/g, "$1");
const LIVE = MODEL_SRC + readFileSync(join(HERE, "live.js"), "utf8").replace("__DATA__", JSON.stringify(DATA)) + DESCRIBE_SRC + readFileSync(join(HERE, "chat.js"), "utf8");
const page = k.pageHtml({ title: "Solvent recovery skid SR-2", theme: THEME, body: `<style>${CSS}</style>${body}`, script: kitScript() + LIVE, width: 1180 });
const name = THEME === "light" ? "skid-light.html" : "skid.html";
writeFileSync(join(HERE, name), page);
console.log("wrote", name, `${(page.length / 1024).toFixed(0)} KB`, `${items.length} items`, `${ROUTES.length} routes`);

// The description, as JSON: the page carries it inline, and the Worker serves
// it to anything that wants to ask the plant a question.
writeFileSync(join(HERE, "skid-context.json"), `${JSON.stringify(CONTEXT, null, 2)}\n`);
console.log("wrote skid-context.json", `${(JSON.stringify(CONTEXT).length / 1024).toFixed(0)} KB`);

