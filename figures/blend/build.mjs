// The blend figure: a spec, drawn.
//
//   node figures/blend/build.mjs
//
// Nothing here is hand-drawn. The scene comes from spec/subzero-blend.json,
// the layout from figures/lib/spec-scene.mjs, and the drawing from
// figures/lib/scene.mjs -- the same renderer the page uses when the reader
// turns the plant. So the page can redraw at any angle because the page has
// the drawing code and the scene, not a picture of the plant.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as k from "../../kit/iso-kit.mjs";
import { sceneOf } from "../lib/spec-scene.mjs";
import { renderScene, projectionFor, STAGE } from "../lib/scene.mjs";
import { kitBundle } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

const spec = JSON.parse(readFileSync(join(ROOT, "spec", "subzero-blend.json"), "utf8"));

const scene = sceneOf(spec);
const projection = projectionFor(scene, { azimuth: 38, elevation: 27 });
const svg = renderScene(scene, projection, {
  width: STAGE.width,
  height: STAGE.height,
  label: `${spec.meta.name}: ${spec.meta.subtitle}`,
}).replace("<svg ", `<svg data-mode="solvent" `);

// The page carries the drawing code and the scene, so a turn is a redraw.
const sceneSource = readFileSync(join(ROOT, "figures", "lib", "scene.mjs"), "utf8")
  .replace(/^import .*$/gm, "")
  .replace(/^const KIT = globalThis\.KIT.*$/m, "")
  .replace(/^export /gm, "");

const LIVE = readFileSync(join(HERE, "live.js"), "utf8").replace("__SCENE__", JSON.stringify(scene));

const functions = [...new Set((spec.process || []).map((step) => step.kind))];
const targets = spec.targets || [];
const compounds = [...new Set(targets.map((t) => t.material))];
const streams = spec.streams || [];
const colours = [...new Set(streams.map((s) => s.colour).filter(Boolean))];

const body = k.plateHtml({
  fig: "Fig 2",
  title: spec.meta.name,
  hint: "Turn the plant · filter by compound, function or colour",
  readout: "drawn from the specification",
  keys: [
    { mark: "lit", label: "the route the flow is on now" },
    ...colours.slice(0, 4).map((colour, index) => ({ mark: colour, label: ["crude extract", "carrier", "vapour", "cannabinoid"][index] || "stream" })),
  ],
  caption: `${spec.meta.subtitle}. Drawn from ${spec.meta.id} revision ${spec.meta.revision}: ${spec.vessels.length} vessels, ${spec.connections.length} pipe runs, ${spec.streams.length} streams, ${spec.targets.length} targets. Every vessel carries its name, its identifier, its volume and its material of construction.`,
  body: `<div class="sk-stage" tabindex="0" role="group" aria-label="${spec.meta.name}. Use the arrow keys to turn the plant.">${svg}</div>
  <div class="sk-controls">
    <button type="button" class="sk-btn" data-turn="-45" aria-label="turn left">&#8630; turn</button>
    <button type="button" class="sk-btn" data-turn="45" aria-label="turn right">turn &#8631;</button>
    <span class="sk-sep"></span>
    <button type="button" class="sk-btn" data-filter-btn="compound" aria-pressed="false">by compound</button>
    <button type="button" class="sk-btn" data-filter-btn="function" aria-pressed="false">by function</button>
    <button type="button" class="sk-btn" data-filter-btn="colour" aria-pressed="false">by colour</button>
    <span class="sk-sep"></span>
    <button type="button" class="sk-btn" data-sop-toggle aria-pressed="false">the SOP</button>
    <span class="sk-live" aria-live="polite" data-live></span>
  </div>
  <div class="sk-filters" data-filters hidden></div>
  <div class="sk-sop" data-sop hidden>
    <div class="sk-sop-col">
      <h3>Standard operating procedure</h3>
      <p class="sk-sop-title">${spec.sop.title}</p>
      <ol class="sk-sop-steps">
        ${spec.sop.steps.map((step) => `<li><span class="sk-sop-id">${step.id}</span> ${step.text}<em>Accept: ${step.acceptance}</em></li>`).join("")}
      </ol>
    </div>
    <div class="sk-sop-col">
      <h3>Materials</h3>
      <table class="sk-register">
        <thead><tr><th>ID</th><th>Material</th><th>CAS</th><th>Role</th></tr></thead>
        <tbody>
          ${(spec.materials || []).map((m) => `<tr><td>${m.id}</td><td>${m.name}</td><td>${m.cas || "—"}</td><td>${m.role || ""}</td></tr>`).join("")}
        </tbody>
      </table>
      <h3>Vessels</h3>
      <table class="sk-register">
        <thead><tr><th>ID</th><th>Vessel</th><th>Volume</th><th>Material</th></tr></thead>
        <tbody>
          ${(spec.vessels || []).map((v) => `<tr><td>${v.id}</td><td>${v.name}</td><td>${v.volume ? `${v.volume.value} ${v.volume.unit}` : "—"}</td><td>${v.material || ""}</td></tr>`).join("")}
        </tbody>
      </table>
      <h3>Assumptions</h3>
      <ul class="sk-assumptions">
        ${(spec.assumptions || []).map((a) => `<li><span class="sk-sop-id">${a.id}</span> ${a.text}${a.confirmed ? "" : " <em>(open)</em>"}</li>`).join("")}
      </ul>
    </div>
  </div>`,
});

const CSS = readFileSync(join(HERE, "blend.css"), "utf8");
const page = k.pageHtml({
  title: spec.meta.name,
  theme: "light",
  body: `<style>${CSS}</style>${body}`,
  script: `${kitBundle()}\n${sceneSource}\n${LIVE}`,
  width: 1240,
});

writeFileSync(join(HERE, "blend.html"), page);
writeFileSync(join(ROOT, "deploy", "public", "blend.html"), page);
writeFileSync(join(ROOT, "figures", "blend", "scene.json"), `${JSON.stringify(scene, null, 1)}\n`);
console.log(`wrote blend.html ${(page.length / 1024).toFixed(0)} KB, ${scene.items.length} items`);
console.log(`  vessels ${spec.vessels.length}, connections ${spec.connections.length}, streams ${spec.streams.length}`);
console.log(`  functions: ${functions.join(", ")} · compounds: ${compounds.join(", ")}`);
