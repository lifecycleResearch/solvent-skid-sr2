// The truth behind the figure.
//
// Every number the drawing shows comes from this file: the layout of the skid,
// the process routes, the vacuum stages, the sieve cuts and the two operating
// setups. The build script draws it; the live script reads it back.

export const DEG = Math.PI / 180;

// ---------------------------------------------------------------- the skid ---

export const DECK = { x: -190, y: -95, w: 380, d: 190, r: 8 };
export const DECK_T = 9; // deck plate thickness, top face at z = 0
export const CASTER_H = 17; // caster height under the deck
export const FRAME = { post: 18, x: 178, y: 84, top: 238, rail: 16 };

// Where each piece of plant stands, in world units (x right, y back, z up).
export const PLACE = {
  charge: { x: -158, y: -48, r: 22, h: 54 },
  pneum: { x: -116, y: -62 },
  strain: { x: -88, y: -60, r: 10, h: 22 },
  membrane: { x0: -60, x1: 32, y: -60, r: 12, z: 26 },
  block: { x: 52, y: -62 },
  cans: [76, 96, 116, 136].map((x) => ({ x, y: -70, r: 8.5, h: 26 })),
  product: { x: 172, y: -38, r: 15, h: 48 },
  pumps: [96, 124, 152].map((x) => ({ x, y: -16 })),
  manifold: { x0: 84, x1: 166, y: 16, z: 46 },
  evap: { x: -128, y: 46, r: 17 },
  sieve: { x: -30, y: 48, r: 15 },
  solvent: { x: 62, y: 50, r: 19 },
  scrub: { x: 140, y: 52, r: 16 },
  panel: { x: -178, y: -78 },
  cond: { x0: -178, x1: -50, y: 50, z: [150, 172, 194, 216], r: 7 },
};

// ------------------------------------------------------------ the chemistry ---

// Ethanol vapour pressure, fitted to its two anchors: 15.7 mbar at 0 °C and
// 1013 mbar at 78.4 °C. ln P = 21.446 - 5105 / T, P in mbar, T in kelvin.
export function satTempC(mbar) {
  return 5105 / (21.446 - Math.log(Math.max(0.05, mbar))) - 273.15;
}

// Three vacuum sets. The deeper the vacuum, the lower the solvent boils and
// the colder the condenser has to be.
export const VACUUM = [
  { stages: 1, mbar: 35, kw: 7.5, m3h: 63, pumps: 1, name: "one stage, rotary vane" },
  { stages: 2, mbar: 8, kw: 15, m3h: 160, pumps: 2, name: "two stages plus booster" },
  { stages: 3, mbar: 1.5, kw: 22, m3h: 300, pumps: 3, name: "three stages, oil sealed" },
];

export const CHILLER = { glycol: -15, cascade: -45 };

// The membrane: solvent nanofiltration, 1 nm pore.
export const MEMBRANE = {
  poreUm: 0.001,
  area: 12,
  feed: 100,
  permeate: 96,
  retentate: 4,
  bar: 18,
  ppm: 5,
  cbdRecovered: 99.4,
};

// The sieve stack, top bed first. Each bed is a cut with its own collection can.
export const BEDS = [
  { grade: "3A", pore: 3, cation: "K", cut: "water", load: 0.9, density: 0.58 },
  { grade: "4A", pore: 4, cation: "Na", cut: "CO₂ + methanol", load: 0.4, density: 0.62 },
  { grade: "5A", pore: 5, cation: "Ca", cut: "n-paraffins C5+", load: 0.6, density: 0.66 },
  { grade: "13X", pore: 8, cation: "Na", cut: "C₂–C₃ + heavy", load: 1.2, density: 0.74 },
];

// Condenser stages, warm end first. Each takes the fraction above its surface
// temperature: the highest boilers go to the warm stage, the light ends to the
// cold one.
export const CONDENSERS = [
  { temp: 45, takes: "toluene, bp 111 °C" },
  { temp: 20, takes: "heptane, bp 98 °C" },
  { temp: -5, takes: "ethanol, bp 78 °C" },
  { temp: -25, takes: "acetone, bp 56 °C" },
];

// The gas scrubber, in line with the vacuum pump exhaust.
export const SCRUBBER = {
  media: [
    { name: "CRC carbon", litres: 6, note: "cannabinoid retention" },
    { name: "activated carbon", litres: 8, note: "solvent vapour" },
    { name: "zeolite 13X", litres: 8, note: "water and CO₂" },
  ],
  dp: 60,
  efficiency: 99,
};

// --------------------------------------------------------------- the routes ---

// A stream carries one colour for the whole drawing. Same colour, same material.
export const STREAMS = {
  feed: { tone: "amber", label: "crude extract" },
  solvent: { tone: "blue", label: "recovered solvent" },
  product: { tone: "green", label: "cannabinoid stream" },
  vapour: { tone: "violet", label: "solvent vapour" },
  waste: { tone: "grey", label: "spent media and exhaust" },
};

// The two setups the skid can be run in. The valve block has three ball valves;
// each one turns between the two positions.
export const MODES = {
  solvent: {
    key: "solvent",
    title: "Pure solvent",
    goal: "cannabinoids taken out of the solvent, solvent back in the tank",
    valves: { permeate: "sieve", retentate: "drum", carbon: "permeate" },
    product: "permeate",
    lines: ["feed", "permeate", "solvent"],
  },
  product: {
    key: "product",
    title: "Pure product",
    goal: "everything but the cannabinoids taken out of the crude",
    valves: { permeate: "tank", retentate: "evap", carbon: "retentate" },
    product: "retentate",
    lines: ["feed", "retentate", "vapour", "condensate"],
  },
};

export const MODES_ORDER = ["solvent", "product"];

// What the routing block does in each mode, per valve.
export const VALVES = {
  permeate: { label: "V1 permeate", a: "to the sieve stack", b: "straight to the tank" },
  retentate: { label: "V2 retentate", a: "to the evaporator", b: "to the product drum" },
  inlet: { label: "V3 sieve inlet", a: "from the permeate", b: "from the condenser" },
};

// --------------------------------------------------------------- the readout ---

export function vacuumOf(stages) {
  return VACUUM[Math.max(0, Math.min(VACUUM.length - 1, stages - 1))];
}

export function coolantNeeded(mbar) {
  return Math.round(satTempC(mbar) - 12);
}

export function readoutOf({ mode, stages, bed, openCans }) {
  const vac = vacuumOf(stages);
  const boil = satTempC(vac.mbar);
  const coolant = coolantNeeded(vac.mbar);
  const m = MODES[mode];
  const bedInfo = bed === null ? null : BEDS[bed];
  const cut = openCans.length
    ? `cut ${openCans.map((index) => BEDS[index].grade).join(" ")}`
    : "no bed cut";
  return [
    `${vac.stages}-stage · ${vac.mbar} mbar · boil ${boil.toFixed(0)} °C · coolant ${coolant} °C`,
    `${m.title} · ${cut}`,
    bedInfo ? `${bedInfo.grade} bed takes ${bedInfo.cut} · ${bedInfo.load.toFixed(1)} kg on the bed` : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

export function wordsOf({ mode, stages }) {
  const vac = vacuumOf(stages);
  const m = MODES[mode];
  return `${m.title}. ${vac.stages} stage vacuum set holding ${vac.mbar} millibar absolute; the solvent boils at ${satTempC(vac.mbar).toFixed(0)} degrees and the condenser needs ${coolantNeeded(vac.mbar)} degrees of coolant. ${m.goal}.`;
}
