// Add the evidence section to the spec: the questions that each part of the
// plant has to be able to answer with a citation.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../spec/subzero-blend.json", import.meta.url);
const spec = JSON.parse(readFileSync(path, "utf8"));

spec.evidence = {
  note: "The questions this plant has to be able to answer with a citation. sim/evidence.mjs retrieves the papers and the patents for each one; the part catalogue links the answers to the parts.",
  topics: {
    "solvent-extraction": {
      must: ["cannabis","cannabinoid","ethanol"],
      query: "ethanol extraction cannabis sativa cannabinoids yield recovery",
      why: "that ethanol is a workable carrier, and what it takes out of the biomass",
    },
    "membrane-nf": {
      must: ["cannabinoid","nanofiltration"],
      query: "solvent nanofiltration cannabinoid purification ethanol permeate retentate",
      why: "that a 1 nm pore holds the cannabinoids back and lets the solvent through",
    },
    "cbd-crystallisation": {
      must: ["cannabidiol","crystalli","ethanol"],
      query: "cannabidiol crystallization ethanol antisolvent cooling solubility",
      why: "that CBD comes out of solution when the carrier is chilled",
    },
    "molecular-sieve": {
      must: ["molecular sieve","ethanol"],
      query: "3A molecular sieve ethanol dehydration water adsorption",
      why: "that the sieve takes the water out of the recovered carrier",
    },
    "azeotrope": {
      must: ["azeotrope","ethanol"],
      query: "ethanol pentane minimum boiling azeotrope vapor liquid equilibrium",
      why: "that the blend cannot be separated by distillation alone",
    },
    "vacuum-evaporation": {
      must: ["ethanol","evaporat"],
      query: "vacuum evaporation ethanol recovery single effect boiling point",
      why: "that the solvent boils at the temperature the vacuum set gives",
    },
    "condensation": {
      must: ["condens","solvent"],
      query: "shell and tube condenser mixed solvent condensation fouling",
      why: "that the vapour comes back as liquid on the cold shells",
    },
    "vapour-scrubbing": {
      must: ["adsorption","solvent","carbon"],
      query: "activated carbon adsorption solvent vapour scrubbing emissions",
      why: "that the exhaust can be cleaned before it leaves the plant",
    },
    "marc-disposal": {
      must: ["cannabis","residual","solvent"],
      query: "cannabis biomass marc residual solvent disposal",
      why: "what happens to the biomass that leaves the extractor",
    },
  },
  for: {
    "V-101": ["solvent-extraction", "azeotrope"],
    "V-102": ["solvent-extraction", "marc-disposal"],
    "F-101": ["marc-disposal"],
    "V-103": ["cbd-crystallisation"],
    "V-104": ["cbd-crystallisation", "azeotrope"],
    "EV-101": ["vacuum-evaporation", "azeotrope"],
    "CN-101": ["condensation"],
    "V-105": ["azeotrope", "molecular-sieve"],
    "V-106": ["cbd-crystallisation"],
    "SC-101": ["vapour-scrubbing"],
    "CH-101": ["vacuum-evaporation"],
    "MED-0001": ["molecular-sieve"],
    "MED-0002": ["vapour-scrubbing"],
    "MED-0003": ["marc-disposal"],
  },
};

// The pipe runs and the operations are mapped by what they do, so that every
// part of the plant can answer the question "what supports this?" -- the
// pipes inherit the evidence of the stream they carry, and an operation
// inherits the evidence of its kind.
const KIND_TOPIC = {
  mixing: "solvent-extraction",
  filtration: "marc-disposal",
  cooling: "cbd-crystallisation",
  separation: "cbd-crystallisation",
  evaporation: "vacuum-evaporation",
  condensation: "condensation",
  transfer: "azeotrope",
};
// What a stream carries decides what supports it: the carrier is supported
// by the extraction and the azeotrope literature, the cannabinoids by the
// crystallisation literature, the vapour by the evaporation literature.
const MATERIAL_TOPIC = {
  "MAT-0001": "azeotrope",
  "MAT-0002": "azeotrope",
  "MAT-0100": "solvent-extraction",
  "MAT-0042": "cbd-crystallisation",
  "MAT-0043": "cbd-crystallisation",
  "MAT-0044": "cbd-crystallisation",
  "MAT-0060": "marc-disposal",
  "MAT-0070": "marc-disposal",
  "MAT-0071": "marc-disposal",
  "MAT-0006": "molecular-sieve",
};
const streamTopic = new Map();
for (const stream of spec.streams || []) {
  const topics = new Set();
  for (const part of stream.composition || []) {
    const topic = MATERIAL_TOPIC[part.material];
    if (topic) topics.add(topic);
  }
  if (stream.phase === "vapour") topics.add("vacuum-evaporation");
  if (topics.size) streamTopic.set(stream.id, [...topics]);
}
for (const connection of spec.connections || []) {
  if (connection.stream && streamTopic.has(connection.stream)) spec.evidence.for[connection.id] = streamTopic.get(connection.stream);
}
for (const step of spec.process || []) {
  const topic = KIND_TOPIC[step.kind];
  if (topic) spec.evidence.for[step.id] = [topic];
}
for (const media of spec.media || []) {
  if (!spec.evidence.for[media.id]) spec.evidence.for[media.id] = media.function.includes("water") ? ["molecular-sieve"] : ["vapour-scrubbing"];
}

writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);
console.log("the spec now carries its evidence questions");
