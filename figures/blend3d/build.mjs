// The 3D figure: the plant, in three dimensions, with the inspector.
//
//   node figures/blend3d/build.mjs
//
// The drawing code is the kit's own 3D engine: every part is re-projected
// and re-shaded each frame, and the draw order is solved from separating
// planes, so the plant is drawn correctly from any angle. The page holds the
// scene and the engine, so dragging turns the plant for real.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as k from "../../kit/iso-kit.mjs";
import { scene3dOf } from "../lib/scene3d.mjs";
import { catalogueOf } from "../lib/parts.mjs";
import { turnScript, glScript } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const WIDTH = 1240;
const HEIGHT = 900;

// Which experiment this build draws. One app, any spec:
//   node figures/blend3d/build.mjs --spec ../spec/other.json
const specArg = process.argv.find((a) => a.startsWith("--spec="))?.slice(7);
const SPEC_PATH = specArg ? join(ROOT, specArg) : join(ROOT, "spec", "subzero-blend.json");
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const SLUG = spec.meta.slug || String(spec.meta.id || "spec").toLowerCase().replace(/[^a-z0-9]+/g, "-");

let evidence = { topics: {} };
try {
  evidence = JSON.parse(readFileSync(SPEC_PATH.replace(/\.json$/, "-evidence.json"), "utf8"));
} catch {
  evidence = { topics: {} };
}
const catalogue = catalogueOf(spec, evidence);

let grade = null;
try {
  const { balance } = await import("../../sim/massbalance.mjs");
  const { gradeDesign } = await import("../../deploy/design.mjs");
  grade = gradeDesign({ spec, evidence, catalogue, balance: balance(spec) });
} catch {
  grade = null;
}

const scene = scene3dOf(spec, { width: WIDTH, height: HEIGHT, azimuth: 38, elevation: 27 });

// The live layers: one per depth band, each a live SVG the engine updates.
const layers = scene.layers
  .map((name) => scene.layerSvg[name])
  .join("");

const stage = `<div class="iso-stage iso-turn td-stage" tabindex="0" role="application" aria-label="The plant in three dimensions: drag to turn it, click a part to read it">${layers}</div>`;

const body = k.plateHtml({
  fig: "Fig 3",
  title: `${spec.meta.name} — in three dimensions`,
  hint: "Drag to turn the plant · click a part to read it",
  readout: "yaw 0° · tilt 0°",
  keys: [
    { mark: "lit", label: "the part you have selected" },
    { mark: "amber", label: "crude extract" },
    { mark: "blue", label: "the carrier" },
    { mark: "violet", label: "solvent vapour" },
  ],
  caption: `The same plant, drawn in three dimensions by the kit's own engine: every part is re-projected and re-shaded each frame and the draw order is solved from separating planes, so the plant is drawn correctly from any angle. ${catalogue.length} parts, each with its record and its evidence.`,
  body: `<style>${scene.css}${readFileSync(join(ROOT, "figures", "skid", "skid.css"), "utf8")}${readFileSync(join(HERE, "blend3d.css"), "utf8")}</style>${stage}
  <div class="sk-controls">
    <button type="button" class="sk-btn" data-turn="-15" aria-label="turn left">&#8630; turn</button>
    <button type="button" class="sk-btn" data-turn="15" aria-label="turn right">turn &#8631;</button>
    <button type="button" class="sk-btn" data-tilt="up" aria-label="tilt up">tilt up</button>
    <button type="button" class="sk-btn" data-tilt="down" aria-label="tilt down">tilt down</button>
    <button type="button" class="sk-btn" data-reset>reset</button>
    <span class="sk-live" aria-live="polite" data-sk-live></span>
  </div>
  <aside class="sk-inspector" data-inspector hidden>
    <header>
      <div>
        <h3 data-insp-title></h3>
        <p class="sk-insp-kind" data-insp-kind></p>
      </div>
      <button type="button" data-insp-close title="close">✕</button>
    </header>
    <div class="sk-insp-body" data-insp-body></div>
    <div class="sk-insp-image" data-insp-image hidden></div>
    <footer class="sk-insp-foot">
      <button type="button" data-insp-upload>attach a photograph</button>
      <span>the picture stays in this browser</span>
    </footer>
  </aside>`,
});

const inspectorSource = readFileSync(join(ROOT, "figures", "lib", "inspector.mjs"), "utf8")
  .replace(/^export /gm, "")
  .replace(/^import .*$/gm, "");

const LIVE = `
const SCENE_DATA = ${JSON.stringify(scene.data)};
const CATALOGUE = ${JSON.stringify(catalogue)};
const GRADE = ${JSON.stringify(grade || {})};
${inspectorSource}
${readFileSync(join(HERE, "live.js"), "utf8")}
`;

const page = k.pageHtml({
  title: `${spec.meta.name} — in three dimensions`,
  theme: "dark",
  body,
  script: `${turnScript()}\n${glScript()}\n${LIVE}`,
  width: WIDTH,
});

writeFileSync(join(HERE, `${SLUG}3d.html`), page);
writeFileSync(join(ROOT, "deploy", "public", `${SLUG}3d.html`), page);
console.log(`wrote blend3d.html ${(page.length / 1024).toFixed(0)} KB · ${scene.report.parts} parts · ${scene.report.layers.map((l) => `${l.name}: ${l.planar} planes`).join(" · ")} · build ${scene.report.seconds.toFixed(1)} s`);
