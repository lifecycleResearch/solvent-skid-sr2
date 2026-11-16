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
import { catalogueOf } from "../lib/parts.mjs";
import { renderScene, projectionFor, STAGE } from "../lib/scene.mjs";
import { kitBundle } from "../../scripts/inline-kit.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");

// Which experiment this build draws. One app, any spec:
//   node figures/blend/build.mjs --spec ../spec/other.json
const specArg = process.argv.find((a) => a.startsWith("--spec="))?.slice(7);
const SPEC_PATH = specArg ? join(ROOT, specArg) : join(ROOT, "spec", "subzero-blend.json");
const spec = JSON.parse(readFileSync(SPEC_PATH, "utf8"));
const SLUG = spec.meta.slug || String(spec.meta.id || "spec").toLowerCase().replace(/[^a-z0-9]+/g, "-");

// The evidence: what the literature and the patents say. It is retrieved by
// sim/evidence.mjs and read from here, so the page is built from a file and
// not from a live search.
let evidence = { topics: {} };
try {
  evidence = JSON.parse(readFileSync(SPEC_PATH.replace(/\.json$/, "-evidence.json"), "utf8"));
} catch {
  evidence = { topics: {} };
}
const catalogue = catalogueOf(spec, evidence);

// The design grade: the checks that catch a process that looks finished and
// is not. The same code runs in the CI and behind the API.
let grade = null;
try {
  const { balance } = await import("../../sim/massbalance.mjs");
  const { gradeDesign } = await import("../../deploy/design.mjs");
  grade = gradeDesign({ spec, evidence, catalogue, balance: balance(spec) });
} catch (err) {
  console.log(`  (the design grade did not run: ${err.message})`);
}

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

const LIVE = readFileSync(join(HERE, "live.js"), "utf8")
  .replace("__SCENE__", JSON.stringify(scene))
  .replace("__GRADE__", JSON.stringify(grade || { checks: [], parts: [], verdict: "not graded", score: 0 }));

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
    <button type="button" class="sk-btn" data-review-toggle aria-pressed="false">the review</button>
    <button type="button" class="sk-btn" data-legitimacy-toggle aria-pressed="false">legitimacy</button>
    <button type="button" class="sk-btn" data-diagram-toggle aria-pressed="false">diagrams</button>
    <button type="button" class="sk-btn" data-safety-toggle aria-pressed="false">safety</button>
    <button type="button" class="sk-btn" data-sop-toggle aria-pressed="false">the SOP</button>
    <span class="sk-live" aria-live="polite" data-sk-live></span>
  </div>
  <div class="sk-filters" data-filters hidden></div>
  <aside class="sk-inspector" data-inspector hidden>    <header>
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
  </aside>
  <section class="sk-legitimacy" data-legitimacy hidden>
    <div class="sk-review-head">
      <h3>Is this real?</h3>
      <p data-legitimacy-verdict></p>
    </div>
    <div class="sk-legitimacy-cols">
      <div>
        <h4>What applies to the plant</h4>
        <ul class="sk-legitimacy-rules" data-legitimacy-rules></ul>
      </div>
      <div>
        <h4>What is still open</h4>
        <ul class="sk-legitimacy-open" data-legitimacy-open></ul>
      </div>
    </div>
  </section>
  <section class="sk-safety" data-safety hidden>
    <div class="sk-review-head">
      <h3>What has to be closed before it is built</h3>
      <p data-safety-verdict></p>
    </div>
    <ol class="sk-safety-list" data-safety-list></ol>
  </section>
  <section class="sk-diagrams" data-diagrams hidden>
    <div class="sk-review-head">
      <h3>The process, as a diagram</h3>
      <p>Mermaid: paste it into any tool that reads it.</p>
    </div>
    <div class="sk-diagram-list" data-diagram-list></div>
  </section>
  <section class="sk-review" data-review hidden>
    <div class="sk-review-head">
      <h3>The review</h3>
      <p data-review-verdict></p>
      <button type="button" class="sk-btn" data-judge>ask a model to judge this design</button>
      <div class="sk-review-rubric" data-review-rubric hidden></div>
    </div>
    <div class="sk-review-cols">
      <div>
        <h4>The checks</h4>
        <ul class="sk-review-checks" data-review-checks></ul>
      </div>
      <div>
        <h4>What supports what</h4>
        <table class="sk-review-table">
          <thead><tr><th>Part</th><th>State</th><th>Papers</th><th>Patents</th></tr></thead>
          <tbody data-review-parts></tbody>
        </table>
      </div>
    </div>
  </section>
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
  script: `${kitBundle()}\n${sceneSource}\nconst CATALOGUE = ${JSON.stringify(catalogue)};\n${LIVE}`,
  width: 1240,
});

writeFileSync(join(HERE, `${SLUG}.html`), page);
writeFileSync(join(ROOT, "deploy", "public", `${SLUG}.html`), page);
writeFileSync(join(ROOT, "figures", "blend", "scene.json"), `${JSON.stringify(scene, null, 1)}\n`);
// The catalogue, the evidence and the grade are served beside the figure, so
// an agent can read the same records the page shows.
writeFileSync(join(ROOT, "deploy", "public", `catalogue-${SLUG}.json`), `${JSON.stringify({ parts: catalogue }, null, 1)}\n`);
writeFileSync(join(ROOT, "deploy", "public", `evidence-${SLUG}.json`), `${JSON.stringify(evidence, null, 1)}\n`);
writeFileSync(join(ROOT, "deploy", "public", `spec-${SLUG}.json`), `${JSON.stringify(spec, null, 1)}\n`);
if (grade) writeFileSync(join(ROOT, "deploy", "public", `design-grade-${SLUG}.json`), `${JSON.stringify(grade, null, 1)}\n`);
// The manifest: which experiments this deployment carries.
const manifestPath = join(ROOT, "deploy", "public", "specs.json");
let manifest = [];
try { manifest = JSON.parse(readFileSync(manifestPath, "utf8")); } catch { manifest = []; }
const entry = { slug: SLUG, id: spec.meta.id, name: spec.meta.name, figure: `${SLUG}.html`, threeD: `${SLUG}3d.html`, catalogue: `catalogue-${SLUG}.json`, evidence: `evidence-${SLUG}.json`, spec: `spec-${SLUG}.json`, grade: grade ? `design-grade-${SLUG}.json` : null, parts: catalogue.length };
manifest = [...manifest.filter((m) => m.slug !== SLUG), entry].sort((a, b) => a.slug.localeCompare(b.slug));
writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 1)}\n`);
console.log(`wrote blend.html ${(page.length / 1024).toFixed(0)} KB, ${scene.items.length} items, ${catalogue.length} parts in the catalogue`);
if (grade) console.log(`  design grade: ${grade.verdict} · ${grade.passedCount}/${grade.total} checks`);
console.log(`  vessels ${spec.vessels.length}, connections ${spec.connections.length}, streams ${spec.streams.length}`);
console.log(`  functions: ${functions.join(", ")} · compounds: ${compounds.join(", ")}`);
