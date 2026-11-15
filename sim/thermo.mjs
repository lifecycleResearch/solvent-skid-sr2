// Thermodynamics, tier T0: closed form, deterministic, free.
//
//   vapour pressure, boiling point, and the ideal (Raoult) behaviour of a
//   binary — which is how the ethanol/pentane blend is checked against the
//   published azeotrope.
//
// The Antoine coefficients come from the NIST Chemistry WebBook
// (sim/data/antoine.json), each with its own reference and temperature
// range. A value asked for outside that range is still returned, but it is
// flagged: outside the fitted range, a vapour pressure is a guess.
//
// Everything here is a pure function of the data file. No I/O, no network, no
// clock: the same inputs always give the same numbers, which is what makes a
// simulation worth showing a client.

import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));

let DATA = null;

export function data() {
  if (!DATA) DATA = JSON.parse(readFileSync(join(HERE, "data", "antoine.json"), "utf8"));
  return DATA;
}

// Liquid densities at 20 degC, kg/m3. Standard handbook values; the source
// is in the file so a client can be told where they came from.
const DENSITY = {
  "MAT-0001": { value: 789.3, source: "CRC Handbook, ethanol 20 degC" },
  "MAT-0002": { value: 626.0, source: "CRC Handbook, n-pentane 20 degC" },
  "MAT-0003": { value: 654.4, source: "CRC Handbook, n-hexane 20 degC" },
  "MAT-0004": { value: 784.5, source: "CRC Handbook, acetone 20 degC" },
  "MAT-0005": { value: 866.9, source: "CRC Handbook, toluene 20 degC" },
  "MAT-0006": { value: 998.2, source: "CRC Handbook, water 20 degC" },
  "MAT-0007": { value: 791.8, source: "CRC Handbook, methanol 20 degC" },
  // The CDA-12 blend: the density follows the ratio, so it is only as good as
  // the ratio. It is computed here from the assumed 70/30 blend (assumption
  // A-01 in the spec) and must be recomputed when the client confirms it.
  "MAT-0100": { value: 740.3, source: "computed from the assumed 70 % ethanol / 30 % n-pentane blend (spec assumption A-01)" },
  "MAT-0061": { value: 1036.0, source: "CRC Handbook, propylene glycol 20 degC" },
  // The extractables: crystalline solids and a lipid fraction. These are
  // approximate — they move the balance by a few tenths of a percent — and
  // the client's own assay replaces them.
  "MAT-0042": { value: 1000.0, source: "approximate, crystalline solid" },
  "MAT-0043": { value: 1000.0, source: "approximate, crystalline solid" },
  "MAT-0044": { value: 1000.0, source: "approximate, crystalline solid" },
  "MAT-0060": { value: 900.0, source: "approximate, lipid fraction" },
  "MAT-0070": { value: 400.0, source: "approximate, loose biomass" },
  "MAT-0071": { value: 1400.0, source: "approximate, cellulosic residue" },
  "MAT-0080": { value: 1.25, source: "nitrogen at 0 degC, 1 atm" },
};

export function material(id) {
  const entry = data().materials[id];
  if (!entry) throw new Error(`no property data for ${id}`);
  return entry;
}

export function density(id) {
  const row = DENSITY[id];
  if (!row) throw new Error(`no density for ${id}`);
  return row;
}

/** Vapour pressure, bar absolute, at tC degrees Celsius. */
export function vapourPressure(id, tC) {
  const { antoine, name } = material(id);
  const tK = tC + 273.15;
  const log10p = antoine.A - antoine.B / (tK + antoine.C);
  const p = Math.pow(10, log10p);
  return {
    id,
    name,
    tC,
    bar: p,
    kPa: p * 100,
    inRange: tK >= antoine.tLowK && tK <= antoine.tHighK,
    validFromC: antoine.tLowK - 273.15,
    validToC: antoine.tHighK - 273.15,
    reference: antoine.reference,
    source: data().source.name,
  };
}

/** Boiling point at pBar absolute, in degrees Celsius. */
export function boilingPoint(id, pBar = 1.01325) {
  const { antoine } = material(id);
  const p = Math.pow(10, Math.log10(pBar));
  const tK = antoine.B / (antoine.A - Math.log10(p)) - antoine.C;
  return {
    id,
    tC: tK - 273.15,
    pBar,
    reference: antoine.reference,
    source: data().source.name,
  };
}

/** Raoult's law: bubble point of a binary at a given pressure. */
export function bubblePoint(aId, bId, xA, pBar = 1.01325) {
  const pA = (t) => vapourPressure(aId, t).bar;
  const pB = (t) => vapourPressure(bId, t).bar;
  const f = (t) => xA * pA(t) + (1 - xA) * pB(t) - pBar;
  let lo = -100;
  let hi = 200;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) < 0) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const yA = (xA * pA(t)) / pBar;
  return { tC: t, yA, xA, pBar, model: "Raoult (ideal)" };
}

/** Raoult's law: dew point of a binary at a given pressure. */
export function dewPoint(aId, bId, yA, pBar = 1.01325) {
  const pA = (t) => vapourPressure(aId, t).bar;
  const pB = (t) => vapourPressure(bId, t).bar;
  const f = (t) => yA * pBar / pA(t) + (1 - yA) * pBar / pB(t) - 1;
  let lo = -100;
  let hi = 200;
  for (let i = 0; i < 200; i++) {
    const mid = (lo + hi) / 2;
    if (f(mid) > 0) lo = mid;
    else hi = mid;
  }
  const t = (lo + hi) / 2;
  const xA = (yA * pBar) / pA(t);
  return { tC: t, xA, yA, pBar, model: "Raoult (ideal)" };
}

/**
 * The ideal azeotrope of a binary: the composition where the bubble point and
 * the dew point meet. For a real system this is only a starting point — the
 * published azeotrope is the datum to compare against, and the difference
 * between the two is the size of the deviation from ideality.
 */
export function idealAzeotrope(aId, bId, pBar = 1.01325) {
  let best = null;
  for (let i = 1; i < 999; i++) {
    const xA = i / 1000;
    const bubble = bubblePoint(aId, bId, xA, pBar);
    const dew = dewPoint(aId, bId, bubble.yA, pBar);
    const gap = Math.abs(bubble.tC - dew.tC);
    if (!best || gap < best.gap) best = { gap, xA, tC: bubble.tC, yA: bubble.yA };
  }
  return { ...best, model: "Raoult (ideal)", note: "compare with the published azeotrope before trusting it" };
}

/** Mass fraction from mole fractions, using the densities above. */
export function massFractionFromMole(xA, aId, bId) {
  const mA = xA * density(aId).value;
  const mB = (1 - xA) * density(bId).value;
  return mA / (mA + mB);
}

/** Mole fraction from mass fraction. */
export function moleFractionFromMass(wA, aId, bId) {
  const mA = wA / density(aId).value;
  const mB = (1 - wA) / density(bId).value;
  return mA / (mA + mB);
}

/**
 * The vapour pressure of a binary at a temperature under Raoult's law, with
 * the bubble point it implies. This is what the recovery column sees.
 */
export function binaryEquilibrium(aId, bId, xA, tC) {
  const pA = vapourPressure(aId, tC).bar;
  const pB = vapourPressure(bId, tC).bar;
  const p = xA * pA + (1 - xA) * pB;
  return {
    tC,
    pBar: p,
    yA: (xA * pA) / p,
    model: "Raoult (ideal)",
    sources: [material(aId).reference, material(bId).reference],
  };
}
