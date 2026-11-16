// The legitimacy register.
//
// Every component in a plant has to be real: the material it is made of, the
// standard it is built to, the rule that applies to it, and the evidence that
// it does what it is claimed to do.
//
// This file holds what can be said without a client's data, and — as much more
// importantly — what cannot. A component with an open question is marked open
// and names the question, because a register that only lists what is settled
// is a brochure.
//
// Nothing here states a regulatory status as settled unless the rule is
// unambiguous. Where the answer depends on the plant's own numbers, the entry
// says so and says who has to close it. That is the house rule: no EPA or
// hazardous-waste status unless it has been confirmed.

const MATERIALS = {
  "MAT-0001": {
    name: "Ethanol",
    standard: "Industrial: SDA 40-B (denatured, US) or technical grade. Pharmaceutical: USP/NF/EP monograph grade.",
    regulation: "DOT 49 CFR: UN 1263, Class 3 flammable liquid. Transport is the broker's and the carrier's, with the placarding and labelling the rule requires.",
    question: "Which grade does the plant actually buy, and does the carrier's paperwork match the blend's composition?",
    strength: "specified",
  },
  "MAT-0002": {
    name: "n-Pentane",
    standard: "Technical or pure grade; the pentane isomer mix matters for the boiling range, and the azeotrope depends on it.",
    regulation: "DOT 49 CFR: UN 1158, Class 3. It is the light end of the blend, so it carries the flash point and the vapour pressure of the carrier.",
    question: "What isomer mix, and what flash point does the datasheet give? The carrier's flash point is the plant's flash point.",
    strength: "specified",
  },
  "MAT-0100": {
    name: "The carrier blend",
    standard: "A blend, so it has no monograph: it has a specification, and every property of it follows from the ratio.",
    regulation: "The blend is transported and classified as its most hazardous component until the carrier has assessed it.",
    question: "The ratio (assumption A-01). Everything downstream of it -- the boiling point, the azeotrope, the duty, the flash point -- is a function of it.",
    strength: "open",
  },
  "MAT-0042": {
    name: "Cannabidiol",
    standard: "Not a commodity chemical: a botanical extract. The assay, the residual solvent profile and the water content are the specification.",
    regulation: "Whether the residue is a waste is determined by the composition and the process, not by the name.",
    question: "The client's assay, their residual solvent limits and their water spec. The simulation uses their numbers, not ours.",
    strength: "open",
  },
  "MAT-0043": { name: "Delta-9-THC", standard: "Botanical extract; assay and residual solvent profile are the specification.", regulation: "As above: the waste status follows the composition and the process.", question: "The client's limits, and the legal status in the jurisdictions the product ships to.", strength: "open" },
  "MAT-0044": { name: "Cannabinol", standard: "Botanical extract; assay and residual solvent profile are the specification.", regulation: "As above.", question: "Whether it is separated, left in the mother liquor, or sold with the CBD.", strength: "open" },
  "MAT-0006": { name: "Water", standard: "Process water. For a pharmaceutical product, the water grade and the monitoring regime are set by the process validation, not by us.", regulation: "The discharge is a permitted matter: what it may be discharged as is a question for the client's EHS adviser and the permit.", question: "The discharge route and the permit it sits under.", strength: "open" },
  "MAT-0060": { name: "Wax and lipid", standard: "Co-extracted, and it is what fouls the filter and the sieve first.", regulation: "The marc and the spent media are the waste streams, and their status follows their composition.", question: "Where the marc goes, and under what permit.", strength: "open" },
  "MAT-0070": { name: "Biomass", standard: "The feed; its moisture and its cannabinoid content are the specification the client buys against.", regulation: "As the marc.", question: "The moisture, the cannabinoid assay and what the residue tests as.", strength: "open" },
  "MAT-0071": { name: "Cellulosic residue", standard: "The bulk of the marc.", regulation: "As the marc.", question: "As the marc.", strength: "open" },
  "MAT-0080": { name: "Nitrogen", standard: "Food-grade or industrial; the blanket grade depends on where the nitrogen touches the product.", regulation: "DOT 49 CFR: UN 1066, compressed gas. Asphyxiation is the hazard the permit has to cover.", question: "The grade, and the oxygen-deficiency procedure for the vessels that are entered.", strength: "specified" },
  "MAT-0061": { name: "Propylene glycol", standard: "Heat-transfer fluid; the grade must be one that will not carry water into the product.", regulation: "A closed loop; the question is whether the discharge is regulated at all.", question: "The glycol concentration and the make-up water chemistry, and whether it is a food-contact loop.", strength: "open" },
};

const EQUIPMENT = {
  drum: {
    standard: "ASME BPVC Section VIII Div 1 (or PED 2014/68/EU in the EU). A vessel that holds a flammable liquid above its flash point in a closed system is a pressure vessel whether or not it is called one.",
    question: "Whether the tanks are certified vessels or standard tanks, and whether the design pressure is above the vapour pressure of the carrier at the warm end.",
  },
  "jacketed vessel": {
    standard: "ASME BPVC Section VIII Div 1 for the shell and the jacket; the jacket is a second pressure boundary and is inspected as one.",
    question: "The jacket's design pressure and its medium's temperature rating against the carrier's vapour pressure at the warm end.",
  },
  "jacketed vessel with a scraper": {
    standard: "ASME BPVC Section VIII Div 1, as the jacketed vessel, with the agitator's torque, the seal arrangement and the drive sized for a cold, dense slurry -- the viscosity of the mother liquor at -40 degC is not the viscosity at 20 degC.",
    question: "The agitator's seal type and whether the drive is certified for the duty at the cold end.",
  },
  "falling film": {
    standard: "ASME BPVC Section VIII Div 1; ASME BPE where the condensate touches the product. The thin film is what makes the heat transfer cheap; it is also what makes fouling expensive.",
    question: "The film's minimum thickness and what happens when the wax arrives.",
  },
  "shell and tube": {
    standard: "ASME BPVC Section VIII Div 1, and ASME BPE where the condensate touches the product.",
    question: "Whether the condensate returns to the product or goes to the tank, and therefore whether the exchanger is a sanitary one.",
  },
  "air cooled chiller": {
    standard: "The chiller itself is a purchased item; what matters is the glycol concentration and the low-temperature rating against the -45 degC duty.",
    question: "The approach temperature at -45 degC, and the glycol concentration that keeps it from freezing.",
  },
  "basket strainer": {
    standard: "ASME BPVC Section VIII Div 1 for the vessel, and ASME BPE if the cover touches the product. The cloth bag is a consumable with its own rating.",
    question: "The bag's rating and the micron specification against the crystal size the crystalliser makes.",
  },
  "drum with media": {
    standard: "The vessel is as above; the media are the consumable and they carry their own specification and their own data sheet.",
    question: "The bed's working capacity and the breakthrough data for the duty.",
  },
  pipe: {
    standard: "ASME BPE for the clamp ferrule fittings and the sanitary tube; the pipe schedule follows the pressure and the temperature.",
    question: "Whether the run is a hard pipe or a flex hose, and the client's preference for tri-clamp on every joint.",
  },
};

const REGULATIONS = [
  {
    name: "Transport",
    rule: "DOT 49 CFR (US) or ADR (EU)",
    note: "The carrier is a Class 3 flammable liquid and the tanker is placarded and labelled accordingly. SCC brokers and arranges carriers; it never takes title.",
    question: "Which mode (tanker, ISO container, drum) and which documentation the carrier needs for this plant's movements.",
  },
  {
    name: "Process safety",
    rule: "OSHA 29 CFR 1910.119 (PSM) and EPA RMP",
    note: "Both bite on threshold quantities of flammable liquid. n-Pentane and ethanol both have threshold quantities well below a plant's inventory.",
    question: "Whether the plant is a covered process under the client's or the operator's PSM programme, and who owns the mechanical integrity programme.",
  },
  {
    name: "Waste",
    rule: "RCRA, 40 CFR 261 (US) or the national equivalents",
    note: "What a spent stream is depends on its composition and the process that made it. It is not settled by the name of the product.",
    question: "The classification of the marc, the spent sieves and the spent carbon, and the disposal route for each.",
  },
  {
    name: "Emissions",
    rule: "Clean Air Act (US) or the national equivalents",
    note: "The vapour from the recovery is a fugitive and a point source. The scrubber is the control, and its performance is what the permit is written against.",
    question: "Whether the plant is a minor or major source, and what the permit says the scrubber must achieve.",
  },
  {
    name: "Food and pharmaceutical contact",
    rule: "FDA cGMP and 21 CFR, or EU 2029/32 and 852/2004 for food contact materials",
    note: "Only if the product is for ingestion. The stainless grade and the gasket materials are then part of the specification.",
    question: "Whether this plant's output is an intermediate, a food ingredient or a pharmaceutical intermediate, and who signs the contact-material statement.",
  },
  {
    name: "Measurement",
    rule: "ISO/IEC 17025 for the calibration laboratory",
    note: "The recovery and the assay are only as good as the calibration behind them, and a client's assay is worth more than ours.",
    question: "Which laboratory does the client's product go to, and whether the plant's own instruments are calibrated in-house or by an accredited lab.",
  },
];

const STRENGTH_RANK = { open: 0, common: 1, specified: 2 };

/**
 * The register for a spec: every component, what it must meet, what applies
 * to it, what is still open, and what evidence stands behind it.
 */
export function legitimacyOf(spec, catalogue = [], evidence = { topics: {} }) {
  const parts = [];

  for (const part of catalogue) {
    const entries = [];

    if (part.kind === "vessel" || part.kind === "connection") {
      const type = part.kind === "connection" ? "pipe" : (spec.vessels.find((v) => v.id === part.id) || {}).type;
      const equipment = EQUIPMENT[type] || EQUIPMENT.pipe;
      entries.push({
        kind: "standard",
        label: "What it is built to",
        text: equipment.standard,
      });
      entries.push({
        kind: "question",
        label: "What is still open",
        text: equipment.question,
      });
    }

    // The materials the part touches, and what each of them must satisfy.
    const touched = new Set();
    for (const stream of part.here.streams || []) {
      const streamRow = (spec.streams || []).find((s) => `${s.name} (${s.id})` === stream);
      for (const piece of (streamRow && streamRow.composition) || []) touched.add(piece.material);
    }
    for (const [id, row] of Object.entries(MATERIALS)) {
      if (!touched.has(id)) continue;
      entries.push({ kind: "material", label: row.name, id, text: row.standard, regulation: row.regulation, question: row.question, strength: row.strength });
    }

    const topics = (spec.evidence && spec.evidence.for && spec.evidence.for[part.id]) || [];
    const found = evidence.topics || {};
    const papers = topics.reduce((sum, topicId) => sum + ((found[topicId] || {}).papers || []).length, 0);
    const patents = topics.reduce((sum, topicId) => sum + ((found[topicId] || {}).patents || []).length, 0);

    const open = entries.filter((e) => e.kind === "question" || e.strength === "open");
    const weakest = entries.filter((e) => e.strength).sort((a, b) => STRENGTH_RANK[a.strength] - STRENGTH_RANK[b.strength])[0];

    parts.push({
      id: part.id,
      name: part.name,
      kind: part.kind,
      function: part.function,
      entries,
      papers,
      patents,
      openQuestions: open.length,
      verdict: open.length === 0 ? "specified" : weakest && weakest.strength === "open" ? "open" : "partly specified",
    });
  }

  return {
    name: spec.meta.name,
    parts,
    regulations: REGULATIONS.map((row) => ({ ...row, applies: "to be confirmed with the client's EHS adviser" })),
    summary: {
      parts: parts.length,
      specified: parts.filter((p) => p.verdict === "specified").length,
      partly: parts.filter((p) => p.verdict === "partly specified").length,
      open: parts.filter((p) => p.verdict === "open").length,
      openQuestions: parts.reduce((sum, p) => sum + p.openQuestions, 0),
    },
  };
}

/** The rules that apply to the whole plant, and the questions behind them. */
export function regulationsOf() {
  return REGULATIONS;
}
