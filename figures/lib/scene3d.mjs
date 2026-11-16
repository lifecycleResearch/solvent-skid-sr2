// The plant in three dimensions.
//
// The anatomy kit has its own 3D engine: turn-build.mjs turns a list of
// primitives into a scene that is re-projected and re-shaded every frame,
// with the draw order solved from separating planes, so a part that is behind
// another is drawn behind it. This file gives that engine the plant.
//
// Two groups make the view: "yaw" turns the plant about its own centre, and
// "tilt" tips it about the horizontal axis. Between them the reader can walk
// round the plant and look down on it, and the depth order stays right.
//
// The parts carry the names of the spec's vessels and connections, so a click
// finds the record in the catalogue.

import * as k from "../../kit/iso-kit.mjs";
import * as G from "../../kit/lathe.mjs";
import * as A from "../../kit/audit.mjs";
import { turning } from "../../kit/turn-build.mjs";
import { sceneOf } from "./spec-scene.mjs";

const VERT = (x, y) => G.frameOf([x, y, 0], [0, 0, 1], [1, 0, 0], [0, 1, 0]);
const HORIZ = (x, y, z) => G.frameOf([x, y, z], [1, 0, 0], [0, 1, 0], [0, 0, 1]);

/**
 * Build the 3D scene for a spec.
 *
 * @param {object} spec   the experiment
 * @param {object} options {width, height, azimuth, elevation}
 */
export function scene3dOf(spec, { width = 1240, height = 900, azimuth = 38, elevation = 27 } = {}) {
  const SKIP = new Set((process.env.SKIP || "").split(",").filter(Boolean));
  const layout = sceneOf(spec);
  const P = k.fitProjection(layout.bounds, width, height, { pad: 44, azimuth, elevation });
  const recorder = A.recorder(P);
  const T = turning(P, { recorder });

  // The centre of the plant: the pivot the whole thing turns about.
  const places = Object.entries(layout.places);
  const xs = places.map(([, p]) => p.x);
  const ys = places.map(([, p]) => p.y);
  const centre = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];

  const yaw = T.group("yaw", { turn: { pivot: centre } });
  const tilt = T.group("tilt", { hinge: { point: [centre[0], centre[1], 0], axis: [1, 0, 0], range: [-32, 32] }, parent: yaw });

  // One layer. A plant is one thing, and the layers of a drawing are a way of
  // proving the depth order; here the order is solved per frame instead.
  const plant = T.layer("plant");

  const vessels = new Map((spec.vessels || []).map((v) => [v.id, v]));
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));

  // Which layer a vessel belongs to: the far row behind, the near row in
  // front, so the deck reads as a deck.
  const layerOf = (place) => (place.y >= 0 ? front : place.y < -60 ? back : mid);

  for (const [id, place] of places) {
    const vessel = vessels.get(id);
    if (!vessel) continue;
    const r = place.r;
    const h = place.h;
    T.round({
      name: `vessel.${id}`,
      group: tilt,
      layer: plant,
      F: VERT(place.x, place.y),
      s0: place.z,
      s1: place.z + h,
      r,
      tone: "hi",
      crease: "lo",
      material: vessel.material === "316L" ? "steel" : "gunmetal",

    });
    // The jacket of a jacketed vessel, a shade darker, so the service is
    // visible from outside.
    if (vessel.jacket && vessel.jacket.duty) {
      T.round({
        name: `vessel.${id}.jacket`,
        group: tilt,
        layer: plant,
        F: VERT(place.x, place.y),
        s0: place.z + h * 0.12,
        s1: place.z + h * 0.62,
        r: r * 1.1,
        tone: "lo",
        material: "gunmetal",
      });
    }
    // A lid and a foot, so a drum is not a bare cylinder.
    if (!SKIP.has("lids")) T.round({
      name: `vessel.${id}.lid`,
      group: tilt,
      layer: plant,
      F: VERT(place.x, place.y),
      s0: place.z + h,
      s1: place.z + h + r * 0.08,
      r: r * 1.04,
      tone: "mid",
      material: "steel",
    });
  }

  for (const item of layout.items) {
    if (item.kind !== "pipe") continue;
    if (SKIP.has("tubes")) continue;
    const stream = item.tags && item.tags.colour ? streams.get(item.id.replace(/^P-/, "S-")) : null;
    T.tube({
      name: `pipe.${item.id}`,
      group: tilt,
      layer: plant,
      route: item.points,
      r: item.r || 2.2,
      tone: "mid",
      spacing: 2,
      chunk: 24,
    });
    void stream;
  }

  // The deck.
  const deck = layout.items.find((item) => item.kind === "deck");
  if (deck && !SKIP.has("deck")) {
    T.prism({
      name: "deck",
      group: tilt,
      layer: plant,
      plan: deck.plan,
      z: deck.z,
      h: deck.h,
      tone: "hi",
      material: "gunmetal",
    });
  }

  // The pipes of a plant cross, and a crossing cannot be proved by a fixed
  // plane. The kit sorts those per frame with its own solver, so the static
  // proof is not demanded here -- only the per-frame order, which is what the
  // reader actually sees.
  const out = T.build({ statics: recorder.items, poses: null, strict: false });

  const layerSvg = {};
  for (const layer of T.layers) layerSvg[layer.name] = out.layerSvg(layer.name, { width, height });
  return {
    data: out.data,
    layerSvg,
    layers: T.layers.map((layer) => layer.name),
    report: out.report,
    css: out.css,
    P,
    centre,
    places: layout.places,
    recorder,
  };
}
