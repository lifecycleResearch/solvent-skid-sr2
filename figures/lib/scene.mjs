// The scene: a list of primitives in world coordinates, and the renderer that
// draws them.
//
// One renderer, two callers: the build draws the default view into a static
// page, and the page redraws the same scene at another angle when the reader
// turns it. That is the only way a rotation is honest: the drawing is
// recomputed from the geometry, not turned as a picture.
//
// The scene is plain JSON, so a scene can be stored, diffed, checked against
// the geometry audit, and read by another program without this file.

import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import * as T from "../../kit/tube.mjs";

// One flat namespace, so the page can build the same object from the kit
// bundle and draw a figure exactly the way the build drew it.
const KIT = globalThis.KIT || { ...k, ...G, ...T };

export const SCENE_VERSION = 1;

// The drawing space. The scene is in world units (millimetres as the spec
// gives them, scaled to something a drawing can hold).
export const STAGE = { width: 1240, height: 900 };

const at = (point, P) => KIT.iso(point, P);

/** A cylinder standing on the deck. */
function drawCylinder(item, P) {
  const [cx, cy, z] = item.at;
  const paths = KIT.cylinder(cx, cy, item.r, z, item.h, P, item.steps || 36, item.bevel || 0);
  const parts = [KIT.solidSvg(paths, { tone: item.tone || "hi", crease: "faint" })];
  if (item.jacket) {
    const jacket = KIT.cylinder(cx, cy, item.jacket.r, z, item.jacket.h, P, item.steps || 36);
    parts.push(KIT.solidSvg(jacket, { tone: "lo", flat: true }));
  }
  if (item.media) {
    // The contents: a shorter cylinder of the media colour inside the shell.
    const media = KIT.cylinder(cx, cy, item.r * 0.94, z + 1, Math.max(2, item.h * (item.media.fill ?? 0.8)), P, item.steps || 36);
    parts.push(`<path class="sk-media" data-media="${item.media.kind}" d="${media.fill}"/>`);
  }
  if (item.rim) {
    const rim = KIT.onTop(KIT.circleRing(cx, cy, item.r + 1.2, item.steps || 36), z + item.h, P, true);
    parts.push(KIT.lineSvg(rim, { tone: "mid" }));
  }
  return parts.join("");
}

/** A horizontal shell, drawn along the x axis. */
function drawShell(item, P) {
  const [cx, cy, z] = item.at;
  const length = item.length;
  const frame = KIT.frameOf([cx - length / 2, cy, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);
  const paths = KIT.solidOf(frame, [[-item.r, 0], [item.r, 0]], { steps: item.steps || 32 });
  const parts = [KIT.solidSvg(paths, { tone: item.tone || "hi" })];
  for (const end of [-1, 1]) {
    const disc = KIT.disc(0, item.r * 2, item.r, frame, P, item.steps || 32);
    parts.push(KIT.solidSvg(disc, { tone: item.tone || "hi" }));
  }
  return parts.join("");
}

/** A box: a deck, a skid, a base plate. */
function drawBox(item, P) {
  const paths = KIT.slabOf(item.plan, item.z || 0, item.h || 6, P, item.steps || 8, item.bevel || 0);
  return KIT.solidSvg(paths, { tone: item.tone || "hi", flat: item.flat === true });
}

/** A pipe run: a tube along the route, with a flange at each end. */
function drawPipe(item, P) {
  const points = item.points;
  if (!points || points.length < 2) return "";
  const piece = KIT.tubePieces(points, item.r || 2, P, { maxLength: 40, spacing: 2.2, caps: true });
  const parts = [KIT.tubeSvg(piece, { tone: item.tone || "hi" })];
  if (item.flow) {
    // The flow overlay: the stream's colour, drawn along the centre line.
    parts.push(`<path class="sk-flow" data-stream="${item.id}" d="${KIT.pathOf(points.map((p) => at(p, P)))}"/>`);
  }
  for (const end of [0, points.length - 1]) {
    const point = points[end];
    const next = points[end === 0 ? 1 : points.length - 2];
    const dir = KIT.unit3(KIT.sub3(next, point));
    const ring = KIT.sideRing(point, (item.r || 2) * 1.45, dir, P, 20);
    parts.push(KIT.lineSvg(ring, { tone: "mid" }));
  }
  return parts.join("");
}

/** An instrument: a gauge, a valve, a pump, a chiller. */
function drawInstrument(item, P) {
  const [cx, cy, z] = item.at;
  const parts = [];
  if (item.kind === "gauge") {
    const paths = KIT.cylinder(cx, cy, item.r || 6, z, 2.4, P, 28, 0.5);
    parts.push(KIT.solidSvg(paths, { tone: "hi" }));
    const face = KIT.onTop(KIT.circleRing(cx, cy, (item.r || 6) * 0.8, 24), z + 2.4, P, true);
    parts.push(KIT.lineSvg(face, { tone: "lo" }));
  } else if (item.kind === "valve") {
    const paths = KIT.slabOf({ x: cx - 5, y: cy - 5, w: 10, d: 10, r: 1 }, z, 8, P, 4);
    parts.push(KIT.solidSvg(paths, { tone: "hi" }));
    const stem = KIT.rise([cx, cy], z + 8, z + 13, P);
    parts.push(KIT.lineSvg(stem, { tone: "mid" }));
  } else if (item.kind === "pump") {
    const paths = KIT.cylinder(cx, cy, item.r || 9, z, item.h || 14, P, 32);
    parts.push(KIT.solidSvg(paths, { tone: "hi" }));
    const base = KIT.slabOf({ x: cx - 12, y: cy - 9, w: 24, d: 18, r: 1 }, z - 1, 2.5, P, 4);
    parts.push(KIT.solidSvg(base, { tone: "lo", flat: true }));
  } else {
    const paths = KIT.cylinder(cx, cy, item.r || 7, z, item.h || 12, P, 28);
    parts.push(KIT.solidSvg(paths, { tone: "hi" }));
  }
  return parts.join("");
}

/**
 * A nameplate: the text that says what a thing is.
 *
 * The text is not drawn into the SVG. It is placed by the page in screen
 * space, over the projected position, because text on an isometric face
 * reads the wrong way round at half the angles -- and a nameplate that is
 * upside down is worse than no nameplate. The page owns the labels; the
 * scene only says where they belong.
 */
function drawLabel(item, P) {
  return "";
}

/** A stream label along a pipe. */
function drawStreamLabel(item, P) {
  return "";
}

/**
 * Render a scene at a projection.
 *
 * @param {object} scene   the scene
 * @param {object} P       the projection from fitProjection
 * @param {object} options {width, height, label}
 */
export function renderScene(scene, P, { width = STAGE.width, height = STAGE.height, label = "" } = {}) {
  const groups = [];
  for (const item of scene.items) {
    let svg = "";
    switch (item.kind) {
      case "deck":
        svg = drawBox(item, P);
        break;
      case "vessel":
        svg = drawCylinder(item, P);
        break;
      case "shell":
        svg = drawShell(item, P);
        break;
      case "box":
        svg = drawBox(item, P);
        break;
      case "pipe":
        svg = drawPipe(item, P);
        break;
      case "instrument":
        svg = drawInstrument(item, P);
        break;
      case "label":
        svg = drawLabel(item, P);
        break;
      case "stream-label":
        svg = drawStreamLabel(item, P);
        break;
      default:
        svg = "";
    }
    if (!svg) continue;
    const tags = Object.entries(item.tags || {})
      .map(([key, value]) => `data-${key}="${String(value).replace(/"/g, "&quot;")}"`)
      .join(" ");
    groups.push(`<g class="it" data-kind="${item.kind}" data-id="${item.id || ""}"${tags ? ` ${tags}` : ""}>${svg}</g>`);
  }
  const back = scene.back ? `<g class="sk-back">${scene.back}</g>` : "";
  return KIT.figureSvg({ width, height, label, body: [back, groups.join("")] });
}

/** The projection for a scene at a given angle. */
export function projectionFor(scene, { width = STAGE.width, height = STAGE.height, azimuth = 38, elevation = 27, pad = 40 } = {}) {
  const points = scene.bounds || [];
  return KIT.fitProjection(points, width, height, { pad, azimuth, elevation });
}
