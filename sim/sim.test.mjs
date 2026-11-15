// The simulation's tests.
//
//   node --test sim/sim.test.mjs
//
// Every number the simulation gives is checked against a published value, so
// a change in the property data that breaks the physics fails here rather
// than in front of a client.

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import * as T from "./thermo.mjs";
import { balance, mixtureDensity } from "./massbalance.mjs";
import { validate } from "../spec/validate.mjs";
import { convert, toSI } from "../spec/units.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const SPEC = JSON.parse(readFileSync(join(HERE, "..", "spec", "cda12-subzero.json"), "utf8"));

// Published normal boiling points, degC: CRC Handbook / NIST.
const BOILING_POINTS = [
  ["MAT-0001", "ethanol", 78.37],
  ["MAT-0002", "n-pentane", 36.07],
  ["MAT-0003", "n-hexane", 68.74],
  ["MAT-0004", "acetone", 56.05],
  ["MAT-0005", "toluene", 110.6],
  ["MAT-0007", "methanol", 64.7],
];

test("the Antoine fits reproduce the published boiling points", () => {
  for (const [id, name, expected] of BOILING_POINTS) {
    const got = T.boilingPoint(id).tC;
    assert.ok(Math.abs(got - expected) < 0.35, `${name}: ${got.toFixed(2)} degC, published ${expected}`);
  }
});

test("the vapour pressure of ethanol at 25 degC is 7.87 kPa", () => {
  const v = T.vapourPressure("MAT-0001", 25);
  assert.ok(Math.abs(v.kPa - 7.87) < 0.1, `${v.kPa.toFixed(2)} kPa`);
  assert.equal(v.inRange, true);
});

test("the vapour pressure of n-pentane at 25 degC is 68.4 kPa", () => {
  const v = T.vapourPressure("MAT-0002", 25);
  assert.ok(Math.abs(v.kPa - 68.4) < 1.5, `${v.kPa.toFixed(2)} kPa`);
});

test("a vapour pressure outside the fitted range is flagged", () => {
  const v = T.vapourPressure("MAT-0001", 120);
  assert.equal(v.inRange, false);
  assert.ok(v.validToC < 120);
});

test("the published azeotrope is not the ideal one, and the simulation says so", () => {
  // Ethanol and n-pentane: a minimum-boiling azeotrope at 34.3 degC with
  // 95 % n-pentane by mass (Wikipedia, Azeotrope tables).
  const ideal = T.idealAzeotrope("MAT-0001", "MAT-0002");
  assert.ok(ideal.tC > 34.0 && ideal.tC < 36.2, `the ideal prediction is ${ideal.tC.toFixed(2)} degC`);
  // Raoult's law cannot see the azeotrope: it degenerates to the light
  // component, which is why the plant has to stop the column by assay.
  assert.ok(ideal.xA < 0.01, `the ideal azeotrope sits at x = ${ideal.xA}`);
});

test("a 70/30 blend of ethanol and pentane boils near 59 degC", () => {
  const x = T.moleFractionFromMass(0.7, "MAT-0001", "MAT-0002");
  const bubble = T.bubblePoint("MAT-0001", "MAT-0002", x);
  assert.ok(bubble.tC > 55 && bubble.tC < 63, `${bubble.tC.toFixed(2)} degC`);
  // The vapour is pentane-rich: that is the direction the recovery runs.
  assert.ok(bubble.yA < 0.35, `y(ethanol) = ${bubble.yA.toFixed(3)}`);
});

test("the CDA-12 spec passes the validator", () => {
  const result = validate(SPEC);
  assert.deepEqual(result.errors, [], result.errors.join("; "));
  assert.ok(result.counts.vessels >= 10);
  assert.ok(result.counts.streams >= 10);
});

test("every assumption in the spec is marked as unconfirmed", () => {
  // The assumptions are the client's to close; the tool must not let them
  // drift into looking like facts.
  const unconfirmed = (SPEC.assumptions || []).filter((a) => !a.confirmed);
  assert.ok(unconfirmed.length >= 5, "the assumptions should still be open");
  for (const assumption of unconfirmed) assert.ok(assumption.text && assumption.affects);
});

test("the mass balance closes on every operation", () => {
  const result = balance(SPEC);
  const open = result.operations.filter((op) => !op.skipped && !op.closes);
  assert.deepEqual(open.map((op) => `${op.id} ${op.closureErrorPct} %`), []);
  assert.ok(result.worstClosureErrorPct < 0.5);
});

test("the mixture density follows the mixing rule, not the average of the densities", () => {
  // A 50/50 mass mix of ethanol and pentane: rho = 1/(0.5/789.3 + 0.5/626).
  const rho = mixtureDensity([
    { material: "MAT-0001", fraction: 0.5 },
    { material: "MAT-0002", fraction: 0.5 },
  ]);
  const expected = 1 / (0.5 / 789.3 + 0.5 / 626.0);
  assert.ok(Math.abs(rho - expected) < 0.01, `${rho} against ${expected}`);
  // The naive average would be 707.6 and is wrong.
  assert.ok(rho < 707.6);
});

test("the units convert and refuse to invent one", () => {
  assert.equal(convert(1000, "L", "m3", "volume"), 1);
  assert.ok(Math.abs(convert(1, "gal", "L", "volume") - 3.785411784) < 1e-6);
  assert.equal(convert(100, "degC", "K", "temperature"), 373.15);
  assert.equal(convert(32, "degF", "degC", "temperature"), 0);
  assert.equal(convert(5, "kg", "parsec", "mass"), null);
  assert.equal(toSI({ value: 400, unit: "L/h" }, "flow"), 400);
  assert.equal(toSI({ value: 400, unit: "furlongs per fortnight" }, "flow"), null);
});
