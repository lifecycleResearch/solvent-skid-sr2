// Derive the streams of a spec from its splits.
//
//   node sim/derive-streams.mjs spec/cda12-subzero.json
//
// A stream's volumetric flow and composition are not typed by hand: they are
// computed from what enters each operation and how it divides. The split
// rules live here, per operation, and they are the assumptions a client will
// argue with — so they are written as rules, not as numbers buried in a
// table.
//
// The rules for the first release of the CDA-12 scenario:
//
//   OP-10  extraction   the carrier washes the biomass: 97 % of the carrier
//                        and 90 % of the cannabinoids and all of the wax go
//                        into the extract, the rest stays in the marc
//   OP-20  filtration   nothing leaves but the solids; the filtrate is the
//                        extract minus the biomass it carried
//   OP-30  crystallise  the carrier holds all but a little of the CBD; the
//                        cake takes the crystals
//   OP-40  separation   the mother liquor is the carrier with what is left
//                        in solution; the cake is the crystals
//   OP-50  recovery     the solvent vapour leaves; the residue keeps what
//                        does not evaporate
//   OP-60  return       the recovered carrier goes back to the day tank
//
// Everything the script computes is written back into the spec, so the spec
// stays the single source of truth and the numbers in it are consistent by
// construction.

import { readFileSync, writeFileSync } from "node:fs";
import { density } from "./thermo.mjs";

// The rules. Per output stream: which fraction of each input material goes
// there. The fractions that are not given are zero.
const RULES = {
  "OP-10": {
    // The carrier washes the biomass: 97 % of the carrier, 90 % of the
    // cannabinoids and all of the wax go into the extract; the marc keeps
    // the rest of the carrier and the biomass.
    out: {
      "S-202": { "MAT-0100": 0.97, "MAT-0042": 0.9, "MAT-0043": 0.9, "MAT-0044": 0.9, "MAT-0060": 1.0, "MAT-0006": 1.0, "MAT-0070": 0, "MAT-0071": 0 },
      "S-202m": { default: "rest" },
    },
  },
  "OP-20": {
    // Filtration: the solids are already in the marc, so the filtrate is the
    // extract. The operation is in the chain because its acceptance criteria
    // are about pressure, not because it changes the mass.
    out: { "S-202b": { default: "same" } },
  },
  "OP-30": {
    // Crystallisation: the carrier keeps all but a little of the CBD; the
    // crystals go to the cake.
    out: {
      "S-203": { "MAT-0100": 1.0, "MAT-0042": 0.12, "MAT-0043": 0.35, "MAT-0044": 0.5, "MAT-0006": 0.9, "MAT-0060": 1.0 },
      "S-204": { default: "rest" },
    },
  },
  "OP-40": {
    // Mother liquor separation: a transfer, not a change of mass.
    out: { "S-208": { default: "same" } },
  },
  "OP-50": {
    // Carrier recovery: the solvent leaves as vapour; everything that does
    // not evaporate is the cannabinoid-rich distillate.
    out: {
      "S-205": { "MAT-0100": 0.995, "MAT-0006": 0.5, "MAT-0042": 0, "MAT-0043": 0, "MAT-0044": 0, "MAT-0060": 0 },
      "S-209": { default: "rest" },
    },
  },
  "OP-55": {
    // Condensation: the vapour comes back as liquid.
    out: { "S-206": { default: "same" } },
  },
  "OP-60": {
    // The recovered carrier goes back to the day tank.
    out: { "S-207b": { default: "same" } },
  },
};

// The density of a mixture from its mass fractions: rho = 1 / sum(w_i / rho_i).
const rho = (id) => density(id).value;

function mixtureDensity(parts) {
  const entries = Object.entries(parts).filter(([, kg]) => Math.abs(kg) > 1e-12);
  const total = entries.reduce((sum, [, kg]) => sum + kg, 0);
  if (!total) return null;
  let sum = 0;
  for (const [material, kg] of entries) sum += kg / total / rho(material);
  return sum > 0 ? 1 / sum : null;
}

function toStream(parts) {
  const entries = Object.entries(parts).filter(([, kg]) => Math.abs(kg) > 1e-9);
  const total = entries.reduce((sum, [, kg]) => sum + kg, 0);
  const rhoMix = mixtureDensity(parts);
  const litresPerHour = (total / rhoMix) * 1000;
  return {
    parts: Object.fromEntries(entries.map(([m, kg]) => [m, Number(kg.toFixed(6))])),
    total,
    litresPerHour,
    composition: entries.map(([m, kg]) => ({ material: m, fraction: Number((kg / total).toFixed(8)) })),
  };
}

export function derive(spec) {
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));
  const byId = (id) => streams.get(id);

  for (const step of spec.process || []) {
    const rule = RULES[step.id];
    if (!rule) continue;
    const inputs = (step.in || []).map(byId).filter(Boolean);
    const incoming = {};
    for (const stream of inputs) {
      const mass = streamMass(stream);
      for (const [material, kg] of Object.entries(mass)) incoming[material] = (incoming[material] || 0) + kg;
    }

    // First pass: what each output takes explicitly.
    const explicit = {};
    for (const [outId, allocation] of Object.entries(rule.out)) {
      const parts = {};
      for (const [material, kg] of Object.entries(incoming)) {
        if (allocation[material] === undefined) continue;
        parts[material] = kg * allocation[material];
      }
      explicit[outId] = parts;
    }
    const taken = {};
    for (const parts of Object.values(explicit)) {
      for (const [material, kg] of Object.entries(parts)) taken[material] = (taken[material] || 0) + kg;
    }

    // Second pass: the outputs that take what is left.
    for (const [outId, allocation] of Object.entries(rule.out)) {
      const target = byId(outId);
      if (!target) continue;
      const parts = { ...explicit[outId] };
      if (allocation.default === "rest") {
        for (const [material, kg] of Object.entries(incoming)) {
          parts[material] = (parts[material] || 0) + (kg - (taken[material] || 0));
        }
      } else if (allocation.default === "same") {
        for (const [material, kg] of Object.entries(incoming)) parts[material] = (parts[material] || 0) + kg;
      }
      const derived = toStream(parts);
      target.composition = derived.composition;
      target.flow = { value: Number(derived.litresPerHour.toFixed(1)), unit: "L/h" };
      target.massKgPerHour = Number(derived.total.toFixed(3));
    }
  }

  // Stamp the mass flow on the feeds too, so every stream in the spec states
  // what it weighs and not only how much of it there is.
  for (const stream of spec.streams || []) {
    const mass = streamMass(stream);
    const total = Object.values(mass).reduce((sum, kg) => sum + kg, 0);
    stream.massKgPerHour = Number(total.toFixed(3));
  }
  return spec;
}

/** The mass flow of a stream, by material, from its flow and composition. */
export function streamMass(stream) {
  if (!stream.composition || !stream.flow) return {};
  const fractions = Object.fromEntries(stream.composition.map((p) => [p.material, p.fraction]));
  const rhoMix = mixtureDensity(fractions);
  if (!rhoMix) return {};
  const kgPerHour = (stream.flow.value / 1000) * rhoMix;
  const out = {};
  for (const [material, fraction] of Object.entries(fractions)) out[material] = kgPerHour * fraction;
  return out;
}

if (process.argv[1] && process.argv[1].endsWith("derive-streams.mjs")) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node sim/derive-streams.mjs <spec.json>");
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, "utf8"));
  derive(spec);
  writeFileSync(file, `${JSON.stringify(spec, null, 2)}\n`);
  console.log(`derived the streams of ${file}`);
  for (const stream of spec.streams) {
    console.log(`  ${stream.id} ${stream.name}: ${stream.flow.value} L/h, ${stream.massKgPerHour} kg/h`);
  }
}
