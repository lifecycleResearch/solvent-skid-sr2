// Units.
//
// Every quantity in a spec is a {value, unit} pair, and this is the only
// place a conversion happens. The rule that makes it work: a spec states its
// quantities in one system, and the renderer converts them to whatever the
// reader uses. A number without a unit is a number without a meaning, and the
// validator rejects it.

export const KINDS = {
  volume: { L: 1, m3: 1000, gal: 3.785411784, "gal(US)": 3.785411784, mL: 0.001, ft3: 28.316846592 },
  mass: { kg: 1, g: 0.001, mg: 1e-6, lb: 0.45359237, t: 1000, "kg/h": 1 },
  time: { s: 1, min: 60, h: 3600, day: 86400 },
  pressure: { bar: 1, "bar(a)": 1, kPa: 0.01, MPa: 10, mbar: 0.001, Pa: 1e-5, psi: 0.0689476, atm: 1.01325 },
  temperature: { degC: 1, C: 1, degF: 1, K: 1 },
  energy: { kJ: 1, MJ: 1000, kWh: 3600, J: 0.001 },
  power: { kW: 1, W: 0.001, MW: 1000, hp: 0.7457 },
  flow: { "L/h": 1, "m3/h": 1000, "L/min": 60, "gal/h": 3.785411784, "kg/h": 1, "kg/min": 60 },
  concentration: { "%": 1, ppm: 1e-4, "wt%": 1, "mol%": 1, "mg/kg": 1e-6, "g/L": 1 },
  length: { mm: 1, cm: 10, m: 1000, in: 25.4, ft: 304.8 },
  diameter: { mm: 1, cm: 10, in: 25.4, m: 1000 },
  area: { m2: 1, cm2: 0.0001, ft2: 0.09290304 },
};

/** The temperature kinds are special: they do not scale, they convert. */
export function convertTemperature(value, from, to) {
  let celsius;
  if (from === "degC" || from === "C") celsius = value;
  else if (from === "K") celsius = value - 273.15;
  else if (from === "degF") celsius = ((value - 32) * 5) / 9;
  else throw new Error(`cannot read a temperature in ${from}`);
  if (to === "K") return celsius + 273.15;
  if (to === "degC" || to === "C") return celsius;
  if (to === "degF") return (celsius * 9) / 5 + 32;
  throw new Error(`cannot convert ${from} to ${to}`);
}

/**
 * Convert a quantity to the unit the reader wants.
 * Returns null when the conversion is not known, so the caller can say
 * "unknown unit" rather than quietly returning the input.
 */
export function convert(value, from, to, kind) {
  if (from === to) return value;
  const group = KINDS[kind];
  if (!group) return null;
  if (kind === "temperature") return convertTemperature(value, from, to);
  const factorFrom = group[from];
  const factorTo = group[to];
  if (factorFrom === undefined || factorTo === undefined || factorFrom === null || factorTo === null) return null;
  return (value * factorFrom) / factorTo;
}

export function unitKnown(unit, kind) {
  const group = KINDS[kind];
  if (!group) return false;
  return Object.hasOwn(group, unit) && group[unit] !== null;
}

/** Every unit a kind knows, for the UI and for the validator's messages. */
export function unitsFor(kind) {
  return Object.keys(KINDS[kind] || {});
}

/** Read a {value, unit} pair into SI. */
export function toSI(quantity, kind) {
  if (!quantity || typeof quantity !== "object") return null;
  const { value, unit } = quantity;
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  if (!unitKnown(unit, kind)) return null;
  return convert(value, unit, Object.keys(KINDS[kind])[0], kind);
}

/** The unit a kind is written in by default. */
export function baseUnit(kind) {
  return Object.keys(KINDS[kind] || {})[0] || null;
}
