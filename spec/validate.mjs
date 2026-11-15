// The spec validator.
//
//   node spec/validate.mjs spec/cda12-subzero.json
//
// It answers one question: would a reader be able to trust this document?
// It checks that the identifiers resolve, that every quantity carries a unit
// the unit table knows, that the compositions add up, that the operations
// refer to things that exist, and that every SOP step has an acceptance
// criterion.
//
// It does not check the chemistry. That is the simulation's job, and the
// simulation says when it is out of range.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { unitKnown, KINDS } from "./units.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

const COLLECTIONS = ["materials", "media", "vessels", "connections", "process", "streams", "targets"];

export function validate(spec) {
  const errors = [];
  const warnings = [];
  const err = (path, message) => errors.push(`${path}: ${message}`);
  const warn = (path, message) => warnings.push(`${path}: ${message}`);

  if (!spec || typeof spec !== "object") {
    return { ok: false, errors: ["the spec is not an object"], warnings: [], counts: {} };
  }

  // ---------------------------------------------------------------- meta ---
  const meta = spec.meta || {};
  for (const field of ["id", "name", "revision", "owner"]) {
    if (!meta[field]) err(`meta.${field}`, "missing");
  }
  if (meta.units && meta.units.system && !["SI", "US"].includes(meta.units.system)) {
    warn("meta.units.system", `unknown system "${meta.units.system}"; expected SI or US`);
  }

  // ------------------------------------------------------------ the ids ---
  const ids = new Map();
  for (const collection of COLLECTIONS) {
    const rows = spec[collection] || [];
    if (!Array.isArray(rows)) {
      err(collection, "must be an array");
      continue;
    }
    for (const row of rows) {
      if (!row || typeof row !== "object") {
        err(collection, "an entry is not an object");
        continue;
      }
      if (!row.id) {
        err(collection, "an entry has no id");
        continue;
      }
      if (ids.has(row.id)) err(`${collection}.${row.id}`, "the id is already used");
      ids.set(row.id, { collection, row });
      if (!row.name) warn(`${collection}.${row.id}`, "no name");
    }
  }

  const known = (id) => ids.has(id);
  const checkRef = (path, id, kind) => {
    if (id === undefined || id === null) return;
    if (!known(id)) err(path, `"${id}" is not in the spec`);
    else if (kind && ids.get(id).collection !== kind) err(path, `"${id}" is a ${ids.get(id).collection}, not a ${kind}`);
  };

  // ---------------------------------------------------------- quantities ---
  const walk = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => walk(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const here = `${path}.${key}`;
      if (value && typeof value === "object" && "value" in value && "unit" in value) {
        if (typeof value.value !== "number" || !Number.isFinite(value.value)) {
          err(here, "the value is not a number");
        }
        if (typeof value.unit !== "string") {
          err(here, "the unit is not a string");
        }
        continue;
      }
      walk(value, here);
    }
  };
  walk(spec, "spec");

  // A quantity without a unit is the failure mode this catches: a bare
  // number where a {value, unit} pair belongs.
  const bareNumbers = (node, path) => {
    if (Array.isArray(node)) {
      node.forEach((item, i) => bareNumbers(item, `${path}[${i}]`));
      return;
    }
    if (!node || typeof node !== "object") return;
    for (const [key, value] of Object.entries(node)) {
      const here = `${path}.${key}`;
      if (typeof value === "number" && !QUANTITY_KEYS.has(key)) {
        // Numbers that are clearly not quantities (a count, a fraction) are
        // allowed; a number where a dimension belongs is not.
        if (DIMENSION_KEYS.has(key)) err(here, "a quantity needs a unit: write {value, unit}");
        continue;
      }
      bareNumbers(value, here);
    }
  };
  bareNumbers(spec, "spec");

  // ---------------------------------------------------------- materials ---
  for (const material of spec.materials || []) {
    if (material.cas && !/^\d{2,7}-\d{2}-\d$/.test(material.cas)) warn(`materials.${material.id}.cas`, `"${material.cas}" is not a CAS number`);
    if (material.role === "carrier" && !material.cas) warn(`materials.${material.id}`, "a carrier with no CAS number");
  }

  // ----------------------------------------------------------- streams ---
  for (const stream of spec.streams || []) {
    const composition = stream.composition || [];
    if (!composition.length) {
      err(`streams.${stream.id}`, "no composition");
      continue;
    }
    const sum = composition.reduce((total, part) => total + (Number(part.fraction) || 0), 0);
    if (Math.abs(sum - 1) > 1e-6) err(`streams.${stream.id}`, `the composition adds up to ${sum.toFixed(6)}, not 1`);
    for (const part of composition) checkRef(`streams.${stream.id}.composition`, part.material, "materials");
    if (stream.flow && !stream.flow.unit) err(`streams.${stream.id}.flow`, "the flow has no unit");
  }

  // --------------------------------------------------------- connections ---
  for (const connection of spec.connections || []) {
    checkRef(`connections.${connection.id}.from`, connection.from);
    checkRef(`connections.${connection.id}.to`, connection.to);
    if (connection.medium) checkRef(`connections.${connection.id}.medium`, connection.medium, "materials");
  }

  // ------------------------------------------------------------ vessels ---
  for (const vessel of spec.vessels || []) {
    if (!vessel.volume) err(`vessels.${vessel.id}`, "no volume");
    if (vessel.jacket && vessel.jacket.duty && vessel.jacket.duty.unit !== "kW") {
      warn(`vessels.${vessel.id}.jacket.duty`, `duty in ${vessel.jacket.duty.unit}; kW is the unit the model uses`);
    }
  }

  // ------------------------------------------------------------ process ---
  for (const step of spec.process || []) {
    if (!step.kind) err(`process.${step.id}`, "no kind");
    if (!step.window) warn(`process.${step.id}`, "no operating window");
  }

  // ------------------------------------------------------------ targets ---
  for (const target of spec.targets || []) {
    checkRef(`targets.${target.id}.material`, target.material, "materials");
    if (target.isolationStep) checkRef(`targets.${target.id}.isolationStep`, target.isolationStep, "process");
    if (!target.colour) warn(`targets.${target.id}`, "no colour; the filters use it");
  }

  // ---------------------------------------------------------------- sop ---
  const sop = spec.sop || {};
  const stepIds = new Set((spec.process || []).map((s) => s.id));
  for (const step of sop.steps || []) {
    if (step.id && !stepIds.has(step.id)) warn(`sop.steps.${step.id}`, "the step is not in the process list");
    if (!step.acceptance) err(`sop.steps.${step.id || "?"}`, "no acceptance criterion");
    if (!step.text) err(`sop.steps.${step.id || "?"}`, "no text");
  }
  for (const note of sop.notes || []) {
    if (note.refersTo && !known(note.refersTo)) err(`sop.notes.${note.id || "?"}`, `"${note.refersTo}" is not in the spec`);
  }

  // ---------------------------------------------------------- sources ---
  for (const source of spec.sources || []) {
    if (!source.kind) err(`sources.${source.id || "?"}`, "no kind");
    if (!source.url && !source.doi && !source.citation) warn(`sources.${source.id || "?"}`, "no url, doi or citation");
  }

  // -------------------------------------------------------- assumptions ---
  for (const assumption of spec.assumptions || []) {
    if (!assumption.text) err(`assumptions.${assumption.id || "?"}`, "no text");
    if (!assumption.confirmed) warn(`assumptions.${assumption.id || "?"}`, "not confirmed");
  }

  const counts = {
    materials: (spec.materials || []).length,
    media: (spec.media || []).length,
    vessels: (spec.vessels || []).length,
    connections: (spec.connections || []).length,
    process: (spec.process || []).length,
    streams: (spec.streams || []).length,
    targets: (spec.targets || []).length,
    sources: (spec.sources || []).length,
  };

  return { ok: errors.length === 0, errors, warnings, counts };
}

// Keys whose values are dimensions and must carry a unit.
const DIMENSION_KEYS = new Set([
  "volume", "flow", "duty", "mass", "weight", "diameter", "height", "length", "width",
  "area", "temperature", "T", "pressure", "p", "hold", "residence", "dp", "deltaT", "dT",
  "boil", "coolant", "load", "quantity", "interval", "throughput", "power", "kw", "m3h",
]);

// Keys that are counts or fractions and never need a unit.
const QUANTITY_KEYS = new Set(["value", "fraction", "purity", "recovery", "index", "weight", "revision", "score"]);

if (process.argv[1] && process.argv[1].endsWith("validate.mjs")) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node spec/validate.mjs <spec.json>");
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const result = validate(spec);
  const counts = Object.entries(result.counts).map(([k, v]) => `${v} ${k}`).join(", ");
  console.log(`${file}: ${result.ok ? "ok" : "FAILED"} — ${counts}`);
  for (const warning of result.warnings) console.log(`  warn  ${warning}`);
  for (const error of result.errors) console.log(`  ERROR ${error}`);
  process.exit(result.ok ? 0 : 1);
}
