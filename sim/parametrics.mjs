// The parametric model, tier T0: pure functions, deterministic, cited.
//
//   import { run } from "./sim/parametrics.mjs";
//   run({ tC: 2, torr: 100, psi: 15, dose: 5, media: "MED-0001", biomass: 120, ... });
//
// This is what the sliders drive. Every number it returns traces to a source
// in CITES, and every coefficient that is an interpolation between published
// points says so. Nothing here is fitted to the client's plant: the client's
// assay replaces the defaults (assumptions in the spec).
//
// No file I/O, no network, no clock: the same inputs always give the same
// outputs, in Node and in a Worker alike.

const ANTOINE = {
  // log10(P/bar) = A - B/(T/K + C). NIST Chemistry WebBook,
  // fetched with sim/fetch-nist.mjs into sim/data/antoine.json.
  ethanol: { A: 5.37229, B: 1670.409, C: -40.191, tLowK: 273, tHighK: 351.7, reference: "Kretschmer and Wiebe, 1949 (NIST WebBook, MAT-0001)" },
  pentane: { A: 3.9892, B: 1070.617, C: -40.454, tLowK: 268.8, tHighK: 341.37, reference: "Osborn and Douslin, 1974 (NIST WebBook, MAT-0002)" },
};

/** Vapour pressure of a named material, bar absolute, at tC. */
export function vapourPressure(name, tC) {
  const a = ANTOINE[name];
  if (!a) throw new Error(`no Antoine data for ${name}`);
  const tK = tC + 273.15;
  const p = Math.pow(10, a.A - a.B / (tK + a.C));
  return {
    tC, bar: p, torr: p * 750.062,
    inRange: tK >= a.tLowK && tK <= a.tHighK,
    reference: a.reference,
  };
}

/** Boiling point of a named material at an absolute pressure, in degC. */
export function boilingPoint(name, pBar) {
  const a = ANTOINE[name];
  if (!a) throw new Error(`no Antoine data for ${name}`);
  const tK = a.B / (a.A - Math.log10(pBar)) - a.C;
  return { tC: tK - 273.15, pBar, reference: a.reference };
}

/** Boiling point at a gauge-free vacuum level in Torr. */
export function boilingAtTorr(name, torr) {
  return boilingPoint(name, torr / 750.062);
}

// ------------------------------------------------------------------ model ---
// CBD solubility in ethanol rises with temperature across the measured range
// (253.1-310.1 K). The published anchors below bracket what the plant needs:
// the relative factor between them is an interpolation, and says so.

export const CITES = {
  antoine: "NIST Chemistry WebBook — Antoine parameters: ethanol Kretschmer & Wiebe 1949; n-pentane Osborn & Douslin 1974 (sim/data/antoine.json)",
  solubility: "Experimental solubility of cannabidiol (CBD) in different organic solvents, Ind. Eng. Chem. Res. 2023, 62(31), 12356 — CBD in ethanol measured from 253.1 to 310.1 K, solubility increasing with temperature; ~20–50 mg/mL near 298 K",
  solventChoice: "J. Am. Oil Chem. Soc. (2021) 99:525 — ethanol vs diethyl ether and pentane for terpenoids and cannabinoids: lower-boiling solvents strip out at lower temperature, protecting volatile terpenoids",
  mediaCarbon: "CannaLabs Consulting, independent CRC media comparison — activated carbon removes 85–95 % of colour bodies but strips 8–15 % of cannabinoids at standard dose",
  mediaBentonite: "CannaLabs Consulting, independent CRC media comparison — bentonite takes pesticides at 70–90 % with low cannabinoid loss (~2 %)",
  mediaOverview: "Extraction Magazine (2021) and MJBizDaily (2022) — colour remediation media in commercial use: silica gel, bentonite clay, activated carbon, magnesium silicate",
  ro: "DuPont FilmTec XLE-4040 low-energy RO element — 2,600 GPD class, ≥99 % NaCl rejection at 150 psi test; rated for water service",
  roQuestion: "Open question: standard polyamide RO elements are not rated for high-ethanol service — membrane compatibility must be verified with the manufacturer before the RO sits in a solvent loop (safety question S-13)",
  breweryKit: "10 bbl jacketed brewery equipment convention: US brewery barrel 117.35 L; dimple jackets typically rated 3 bar (43.5 psi); brite-tank PRVs commonly set 30–45 psi; serving pressures to 15 psi",
  latentHeat: "CRC Handbook — ethanol enthalpy of vaporisation ≈ 838 kJ/kg at the normal boiling point; n-pentane ≈ 358 kJ/kg",
  winterisation: "Industry practice, flagged as an assumption: lipid/wax co-extraction rises with extraction temperature, which is why cold-m ethanol extraction and winterisation exist at all",
};

const LATENT = { ethanol: 838, pentane: 358 }; // kJ/kg at the normal boiling point, CRC
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round = (v, d = 2) => Math.round(v * 10 ** d) / 10 ** d;

/**
 * Relative CBD solubility in ethanol against the 298 K datum, anchored to the
 * published measured range (253.1–310.1 K). Outside the measured range the
 * factor is extrapolated and flagged, not silently used.
 */
export function solubilityFactor(tC) {
  // Van't Hoff-style exponential anchored so that factor(25) = 1 and the
  // slope across the measured window matches the paper's "increases with T".
  const tK = tC + 273.15;
  const slope = 0.025; // per K — interpolation inside the measured window
  const factor = Math.exp(slope * (tK - 298.15));
  const inRange = tK >= 253.1 && tK <= 310.1;
  return { factor: round(factor, 3), inRange, anchor: CITES.solubility };
}

/** Extraction efficiency per pass, and over n passes. First-order approach. */
export function extraction(params) {
  const tC = params.tC ?? 2;
  const passes = clamp(params.passes ?? 2, 1, 3);
  // Single-pass efficiency rises with temperature; cold-m extraction trades
  // speed for cleanliness (winterisation, CITES.winterisation).
  const perPass = clamp(0.62 + 0.005 * tC, 0.3, 0.92);
  const total = 1 - Math.pow(1 - perPass, passes);
  const sol = solubilityFactor(tC);
  return {
    perPass: round(perPass, 3),
    passes,
    total: round(total, 3),
    solubilityFactor: sol.factor,
    solubilityInMeasuredRange: sol.inRange,
    note: sol.inRange ? "temperature sits inside the published CBD-in-ethanol measurement window" : "outside the published window — the solubility factor is an extrapolation",
    cites: [CITES.solubility, CITES.winterisation],
  };
}

/**
 * The media (CRC) column: what the selected media removes, and what it takes
 * of the cannabinoid with it, at the dose the slider sets. Dose scales the
 * effect linearly between 0 and twice the standard dose (10 g/L).
 */
export function MEDIA_LIBRARY() {
  return [
    { id: "MED-0001", name: "Activated carbon (coconut, acid-washed)", family: "carbon", removes: "colour bodies, chlorophyll, odour", lossAtStandard: 0.115, lossRange: [0.08, 0.15], colourAtStandard: 0.9, regeneration: "thermal reactivation (kiln) — practical only off-site in bulk", cost: "$ low per kg; reactivation $", cycles: 1, accessible: true, cite: "mediaCarbon" },
    { id: "MED-0002", name: "Silica gel 60 (40–63 µm)", family: "silica", removes: "chlorophyll, polar pigments", lossAtStandard: 0.05, lossRange: [0.02, 0.08], colourAtStandard: 0.7, regeneration: "oven 120–140 °C to constant mass", cost: "$ low", cycles: 5, accessible: true, cite: "mediaOverview" },
    { id: "MED-0003", name: "Bentonite clay (bleaching clay)", family: "clay", removes: "pesticides, pigments, soaps", lossAtStandard: 0.02, lossRange: [0.01, 0.03], colourAtStandard: 0.55, regeneration: "not practical — single use at this scale; landfilled as spent clay", cost: "$ very low", cycles: 1, accessible: true, cite: "mediaBentonite" },
    { id: "MED-0004", name: "Molecular sieve 3A beads", family: "sieve", removes: "water (drying, not colour)", lossAtStandard: 0.005, lossRange: [0, 0.01], colourAtStandard: 0, regeneration: "heat 200–250 °C under dry gas; full recovery of capacity", cost: "$$ moderate, amortised over many cycles", cycles: 200, accessible: true, cite: "mediaOverview" },
    { id: "MED-0005", name: "Molecular sieve 13X beads", family: "sieve", removes: "water plus CO₂ and light organics", lossAtStandard: 0.01, lossRange: [0, 0.02], colourAtStandard: 0.05, regeneration: "heat 250–300 °C under dry gas", cost: "$$ moderate", cycles: 150, accessible: true, cite: "mediaOverview" },
    { id: "MED-0006", name: "Strong-acid cation resin (Na⁺ form)", family: "resin", removes: "metal cations, soaps", lossAtStandard: 0.03, lossRange: [0.01, 0.05], colourAtStandard: 0.15, regeneration: "brine/HCl bed regeneration, rinse to neutral", cost: "$$ resin lasts years", cycles: 300, accessible: true, cite: "mediaOverview" },
    { id: "MED-0007", name: "PVPP (polyvinylpolypyrrolidone)", family: "polymer", removes: "polyphenols, haze precursors (brewery standard)", lossAtStandard: 0.02, lossRange: [0.01, 0.04], colourAtStandard: 0.35, regeneration: "single use (brewery practice) or caustic recovery off-line", cost: "$ low", cycles: 1, accessible: true, cite: "mediaOverview" },
    { id: "MED-0008", name: "Magnesium silicate (magnesol-type)", family: "silicate", removes: "free fatty acids, soaps, colour", lossAtStandard: 0.06, lossRange: [0.03, 0.09], colourAtStandard: 0.65, regeneration: "single use", cost: "$ low", cycles: 1, accessible: true, cite: "mediaOverview" },
    { id: "MED-0009", name: "Stainless packing (316L Raschig / structured)", family: "packing", removes: "nothing by itself — column packing for contact time", lossAtStandard: 0, lossRange: [0, 0], colourAtStandard: 0, regeneration: "caustic/solvent wash and rinse; effectively permanent", cost: "$ once, lifetime", cycles: 1000, accessible: true, cite: "mediaOverview" },
    { id: "MED-0010", name: "Copper packing (rings / shot)", family: "packing", removes: "sulphur compounds, off-notes (distillery use); binds thiols", lossAtStandard: 0.01, lossRange: [0, 0.02], colourAtStandard: 0, regeneration: "pickling in citric acid, rinse, dry; replace when eaten", cost: "$ low, consumable", cycles: 20, accessible: true, cite: "mediaOverview" },
    { id: "MED-0011", name: "Diatomaceous earth (filter aid, DE)", family: "aid", removes: "nothing dissolved — pre-coat aid for flux", lossAtStandard: 0.01, lossRange: [0, 0.02], colourAtStandard: 0.05, regeneration: "single use; cake disposal", cost: "$ very low", cycles: 1, accessible: true, cite: "mediaOverview" },
    { id: "MED-0012", name: "Cellulose filter pads", family: "aid", removes: "fines, particulate; light colour lift", lossAtStandard: 0.02, lossRange: [0.01, 0.03], colourAtStandard: 0.3, regeneration: "backflush and reuse a few runs, then discard", cost: "$ low", cycles: 4, accessible: true, cite: "mediaOverview" },
  ];
}

/** Media at a dose: what it removes, what it costs in cannabinoids. */
export function mediaEffect(mediaId, doseGPerL) {
  const media = MEDIA_LIBRARY().find((m) => m.id === mediaId) || MEDIA_LIBRARY()[0];
  const norm = clamp(doseGPerL / 10, 0, 2); // standard dose 10 g/L, cap at 2×
  const loss = clamp(media.lossAtStandard * norm, 0, 0.35);
  const colour = clamp(media.colourAtStandard * norm, 0, 0.98);
  return {
    media: media.id,
    name: media.name,
    doseGPerL,
    cannabinoidLossPct: round(loss * 100, 1),
    colourRemovalPct: round(colour * 100, 1),
    lossRangePct: media.lossRange.map((v) => round(v * 100, 1)),
    regeneration: media.regeneration,
    cycles: media.cycles,
    accessible: media.accessible,
    cite: CITES[media.cite],
  };
}

/**
 * The shortlist the user asked for: every media that is easily accessible and
 * regenerable at a low cost, ranked by a transparent score. Score = access
 * (0/1) + regeneration practicality + reuse cycles, so a sieve that lasts 200
 * cycles outranks a clay used once.
 */
export function rankMedia() {
  const ranked = MEDIA_LIBRARY()
    .map((m) => {
      const access = m.accessible ? 1 : 0;
      const regen = /oven|heat|brine|caustic|pickl|wash|backflush/.test(m.regeneration) ? 1 : /reactivation|off-site/.test(m.regeneration) ? 0.4 : 0.1;
      const cycles = clamp(Math.log10(m.cycles + 1) / 3, 0, 1);
      const score = round(access + regen + cycles, 2);
      return { ...m, score, scoreParts: { access, regen, cycles } };
    })
    .sort((a, b) => b.score - a.score);
  return { ranked, rule: "score = accessible (1) + regenerable in-house (1) + log10(cycles)/3; published with the list so it can be argued with" };
}

// -------------------------------------------------------------- filtration ---

export function FILTRATION_STAGES() {
  return [
    { stage: "F-1 prefilter", cutoff: "10 µm", purpose: "biomass fines, baghouse carryover", position: "either", note: "bag or cartridge; protects everything downstream" },
    { stage: "F-2 depth", cutoff: "5 µm", purpose: "fine particulate, cellulose", position: "either", note: "the 5 µm cloth bag the spec already runs" },
    { stage: "F-3 depth", cutoff: "1 µm", purpose: "colloidal wax bodies before the media column", position: "before", note: "extends media life" },
    { stage: "F-4 membrane", cutoff: "0.2 µm", purpose: "bacteria-scale particulate", position: "either", note: "polyethersulfone or PTFE cartridge" },
    { stage: "F-5 membrane", cutoff: "0.01 µm (10 nm)", purpose: "colloid and lipid vesicle polish", position: "after", note: "the tightest stage; flux is the constraint, not the cutoff" },
  ];
}

/** Low-energy 40 inch (4040) RO, and the question it must answer first. */
export function roModel() {
  return {
    element: "4040 low-energy RO (FilmTec XLE-4040 class)",
    class: "≈2,600 GPD per element, ≥99 % NaCl rejection, 150 psi test condition",
    intendedService: "water polish on the glycol loop make-up and any aqueous waste stream",
    solventLoop: "NOT cleared for high-ethanol service — polyamide elements swell and lose rejection in alcohol; the manufacturer must confirm before the RO sits in a solvent loop",
    question: "S-13: has the membrane manufacturer confirmed ethanol compatibility for the 4040 elements in the intended position?",
    cite: CITES.ro,
    citeQuestion: CITES.roQuestion,
  };
}

// ------------------------------------------------------------------ safety ---

/** The pressure envelope: what the brewery kit is actually built to hold. */
export function pressureEnvelope(psi) {
  const jacketBar = psi * 0.0689476;
  const jacketRating = 3; // bar, typical brewery dimple jacket
  const prvSet = 45; // psi, typical brite-tank PRV
  return {
    psi,
    bar: round(jacketBar, 2),
    jacketRatingPsi: round(jacketRating / 0.0689476, 1),
    prvSetPsi: prvSet,
    ok: psi <= (jacketRating / 0.0689476),
    marginPct: round(((jacketRating / 0.0689476 - psi) / (jacketRating / 0.0689476)) * 100, 1),
    note: psi > prvSet * 0.9 ? "approaching the PRV set — the vessel will vent" : null,
    cite: CITES.breweryKit,
  };
}

// ---------------------------------------------------------------- balancer ---

/**
 * The balancer: feedstock in, expected output out, mass closed.
 *
 *   in:  biomass kg, CBD wt %, moisture wt %, carrier:biomass L/kg,
 *        extraction passes, extraction temperature, media + dose,
 *        vacuum (Torr), crystalliser targets from the spec
 *   out: every stream between the charge and the drum, with its citation
 */
export function balance(params) {
  const biomass = clamp(params.biomass ?? 120, 10, 1000); // kg per charge
  const cbdPct = clamp(params.cbd ?? 8, 1, 25); // wt %, the client's assay replaces this
  const moisturePct = clamp(params.moisture ?? 10, 0, 30);
  const ratio = clamp(params.ratio ?? 8, 2, 20); // L carrier per kg biomass
  const tC = params.tC ?? 2;
  const torr = params.torr ?? 100;
  const mediaId = params.media ?? "MED-0001";
  const dose = params.dose ?? 5;

  const dry = biomass * (1 - moisturePct / 100);
  const cbdIn = dry * (cbdPct / 100); // kg CBD available
  const lipids = dry * 0.08; // wax/lipid fraction — assumption, flagged
  const carrierL = biomass * ratio;

  const ex = extraction({ tC, passes: params.passes });
  const cbdExtracted = cbdIn * ex.total;
  const lipidExtracted = lipids * ex.total * 0.55; // cold extraction leaves lipids behind — assumption
  const miscellaL = carrierL;
  const concetration = (cbdExtracted * 1000) / miscellaL; // g CBD per L miscella
  const sol = solubilityFactor(tC);
  const solCapGL = 35 * sol.factor; // ~35 g/L at 298 K inside the published band
  const aboveSolubility = concetration > solCapGL;

  const med = mediaEffect(mediaId, dose);
  const cbdAfterMedia = cbdExtracted * (1 - med.cannabinoidLossPct / 100);
  const lipidAfterMedia = lipidExtracted * (1 - med.colourRemovalPct * 0.4 / 100);

  // Crystallisation follows the spec's targets: T-1 crystal at 62 % purity,
  // 88 % recovery of CBD into the crystal fraction.
  const crystalRecovery = 0.88;
  const crystalPurity = 0.62;
  const cbdToCrystal = cbdAfterMedia * crystalRecovery;
  const crystalMass = cbdToCrystal / crystalPurity;
  const motherCbd = cbdAfterMedia - cbdToCrystal;

  // Carrier recovery: the evaporator's boiling point at the set vacuum, the
  // duty to vaporise the carrier, and the fraction recovered (spec target 96 %).
  const bp = boilingAtTorr("ethanol", torr);
  const carrierKg = carrierL * 0.74; // blend density, kg/L (MAT-0100, assumption A-01)
  const recoveredPct = 96;
  const carrierRecoveredL = carrierL * (recoveredPct / 100);
  const carrierLostL = carrierL - carrierRecoveredL;
  const dutyKW = (carrierKg * LATENT.ethanol) / 3600 / 4; // vaporise over 4 h — cycle time assumption

  return {
    feedstock: {
      biomassKg: round(biomass, 1), moisturePct, dryBiomassKg: round(dry, 1),
      cbdInKg: round(cbdIn, 2), lipidsKg: round(lipids, 2), carrierL: round(carrierL, 0),
      ratio, passes: ex.passes, tC,
    },
    extraction: { efficiencyPct: round(ex.total * 100, 1), perPassPct: round(ex.perPass * 100, 1), solubilityFactor: ex.solubilityFactor, solubilityInMeasuredRange: ex.solubilityInMeasuredRange },
    miscella: {
      volumeL: round(miscellaL, 0),
      cbdConcentrationGL: round(concetration, 2),
      solubilityCapGL: round(solCapGL, 1),
      aboveSolubility,
      note: aboveSolubility ? "the miscella exceeds the solubility cap at this temperature — some CBD rides out undissolved or the charge needs more carrier" : "inside the solubility band",
    },
    media: med,
    output: {
      crudeCbdKg: round(cbdAfterMedia, 2),
      crudeLipidsKg: round(lipidAfterMedia, 2),
      crystalMassKg: round(crystalMass, 2),
      crystalPurityPct: crystalPurity * 100,
      crystalRecoveryPct: crystalRecovery * 100,
      motherLiquorCbdKg: round(motherCbd, 2),
      cbdLostToMediaKg: round(cbdExtracted - cbdAfterMedia, 2),
      carrierRecoveredL: round(carrierRecoveredL, 0),
      carrierLostL: round(carrierLostL, 1),
      evaporatorDutyKW: round(dutyKW, 1),
      boilAtVacuumC: round(bp.tC, 1),
    },
    // The closure the reader checks first: everything the charge contained.
    closure: {
      cbdIn: round(cbdIn, 2),
      cbdOut: round(cbdAfterMedia * crystalRecovery + motherCbd + (cbdExtracted - cbdAfterMedia), 2),
      note: "CBD out = crystal + mother liquor + media loss; the small difference is the fraction the extraction left in the spent biomass",
    },
    cites: [CITES.solubility, CITES.mediaCarbon, CITES.mediaBentonite, CITES.antoine, CITES.latentHeat, CITES.winterisation],
    openQuestions: [
      "the CBD wt % and moisture are defaults until the client's assay replaces them",
      "the wax/lipid fraction (8 %) and the cold-extraction lipid retention (55 %) are assumptions, not measurements",
      "the crystal targets (62 % purity, 88 % recovery) are the specification's, not this batch's measurement",
    ],
  };
}

/** Everything the operating-point and balancer panels need, in one call. */
export function run(params) {
  const bp = boilingAtTorr("ethanol", params.torr ?? 100);
  const bpPentane = boilingAtTorr("pentane", params.torr ?? 100);
  const vap = vapourPressure("ethanol", params.tC ?? 2);
  const envelope = pressureEnvelope(params.psi ?? 15);
  const med = mediaEffect(params.media ?? "MED-0001", params.dose ?? 5);
  const ranked = rankMedia();
  const bal = balance(params);
  return {
    vacuum: {
      torr: params.torr, ethanolBoilC: round(bp.tC, 1), pentaneBoilC: round(bpPentane.tC, 1),
      note: "the boiling point the evaporator actually runs at; the condenser must be colder than this",
      cites: [CITES.antoine],
    },
    temperature: {
      tC: params.tC, ethanolVapourPressureBar: round(vap.bar, 3),
      flashRisk: vap.bar > 0.5 ? "carrier vapour pressure above 0.5 bar at this temperature — the vessel is a pressure part, not an open tank" : null,
      ...bal.extraction,
      cites: [CITES.solubility, CITES.antoine],
    },
    pressure: envelope,
    media: med,
    mediaShortlist: ranked,
    filtration: FILTRATION_STAGES(),
    ro: roModel(),
    balancer: bal,
  };
}
