// The mass balance, tier T0.
//
//   node sim/massbalance.mjs spec/cda12-subzero.json
//
// For every operation in the spec: what goes in, what comes out, and whether
// the mass closes. The composition in a stream is a mass fraction, so the
// mass flow of a stream is its volumetric flow times the mass-fraction
// weighted density of its components.
//
// A balance that does not close is reported, not smoothed over. The number
// that does not close is where the money is.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { density } from "./thermo.mjs";
import { toSI } from "../spec/units.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));

/**
 * Density of a mixture from its mass fractions: rho = 1 / sum(w_i / rho_i).
 * (The arithmetic mean of the densities is wrong for a mass-fraction mix;
 * this is the rule that makes the volumes and the masses agree.)
 */
export function mixtureDensity(composition) {
  if (!composition || !composition.length) return null;
  let sum = 0;
  for (const part of composition) {
    const rho = density(part.material);
    if (!part.fraction) continue;
    sum += part.fraction / rho.value;
  }
  return sum > 0 ? 1 / sum : null;
}

/** Mass flow of a stream, kg/h. */
export function streamMassFlow(stream, materials) {
  const flowLh = toSI(stream.flow, "flow");
  if (flowLh === null || !stream.flow.unit.startsWith("L")) return null;
  const rho = mixtureDensity(stream.composition);
  if (!rho) return null;
  const litresPerHour = stream.flow.unit === "L/h" ? stream.flow.value : null;
  if (litresPerHour === null) return null;
  return (litresPerHour / 1000) * rho;
}

/** The composition of a stream by material, in mass fraction. */
export function compositionOf(stream) {
  const out = new Map();
  for (const part of stream.composition || []) out.set(part.material, part.fraction);
  return out;
}

export function balance(spec) {
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));
  const operations = [];
  let worst = 0;

  for (const step of spec.process || []) {
    const inputs = (step.in || []).map((id) => streams.get(id)).filter(Boolean);
    const outputs = (step.out || []).map((id) => streams.get(id)).filter(Boolean);
    if (!inputs.length && !outputs.length) {
      operations.push({ id: step.id, name: step.name, skipped: "no streams declared" });
      continue;
    }

    const inMass = inputs.reduce((sum, s) => sum + (streamMassFlow(s) || 0), 0);
    const outMass = outputs.reduce((sum, s) => sum + (streamMassFlow(s) || 0), 0);
    const error = inMass > 0 ? (outMass - inMass) / inMass : 0;
    worst = Math.max(worst, Math.abs(error));

    // What each material does through the step.
    const perMaterial = new Map();
    const add = (stream, sign) => {
      for (const [material, fraction] of compositionOf(stream)) {
        const mass = (streamMassFlow(stream) || 0) * fraction * sign;
        perMaterial.set(material, (perMaterial.get(material) || 0) + mass);
      }
    };
    inputs.forEach((s) => add(s, 1));
    outputs.forEach((s) => add(s, -1));
    const drift = [...perMaterial.entries()]
      .map(([material, mass]) => ({ material, kgPerHour: Number(mass.toFixed(3)) }))
      .filter((row) => Math.abs(row.kgPerHour) > 0.05);

    operations.push({
      id: step.id,
      name: step.name,
      in: inputs.map((s) => s.id),
      out: outputs.map((s) => s.id),
      inKgPerHour: Number(inMass.toFixed(2)),
      outKgPerHour: Number(outMass.toFixed(2)),
      closureErrorPct: Number((error * 100).toFixed(3)),
      closes: Math.abs(error) < 0.005,
      materialDrift: drift,
    });
  }

  return { operations, worstClosureErrorPct: Number((worst * 100).toFixed(3)), closes: worst < 0.005 };
}

/** The carrier the plant actually moves in a day, for the tanker comparison. */
export function carrierTurnover(spec) {
  const stream = (spec.streams || []).find((s) => s.id === "S-206") || (spec.streams || [])[0];
  if (!stream) return null;
  const mass = streamMassFlow(stream);
  const litresPerHour = stream.flow.value;
  const hoursPerWeek = 168;
  const litresPerWeek = litresPerHour * (spec.process || []).length * 24; // continuous running
  return {
    stream: stream.id,
    kgPerHour: mass ? Number(mass.toFixed(2)) : null,
    litresPerHour,
    litresPerWeekContinuous: Number(litresPerWeek.toFixed(0)),
    note: "the carrier moves continuously; the weekly figure assumes the plant runs every hour of the week",
  };
}

if (process.argv[1] && process.argv[1].endsWith("massbalance.mjs")) {
  const file = process.argv[2];
  if (!file) {
    console.error("usage: node sim/massbalance.mjs <spec.json>");
    process.exit(2);
  }
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const result = balance(spec);
  console.log(`${file}: ${result.closes ? "balances" : "DOES NOT BALANCE"} — worst closure error ${result.worstClosureErrorPct} %`);
  for (const op of result.operations) {
    if (op.skipped) {
      console.log(`  ${op.id} ${op.name}: skipped (${op.skipped})`);
      continue;
    }
    console.log(`  ${op.id} ${op.name}: in ${op.inKgPerHour} kg/h, out ${op.outKgPerHour} kg/h, error ${op.closureErrorPct} % ${op.closes ? "ok" : "NOT CLOSED"}`);
    for (const drift of op.materialDrift) console.log(`      ${drift.material}: ${drift.kgPerHour} kg/h`);
  }
  process.exit(result.closes ? 0 : 1);
}
