// The project-management requirements pack: what prudent science project
// management demands of this work, as questions with owners and gates.
//
//   import { pack } from "./pm.mjs";
//
// The rule it follows is the house rule: compliance and quality are written
// as question lists with a rule and an owner, never as conclusions. A
// requirement is "met" only when the owner's evidence exists in the record.

export function pack() {
  return {
    title: "Prudent science project management — requirements",
    note: "Each requirement is a question to close, with a rule, an owner and the evidence that closes it. Nothing is met until the evidence exists in the record. This pack is versioned and checksummed like any deliverable, and a person approves it.",
    groups: [
      {
        id: "PM-1",
        name: "Governance and verification",
        requirements: [
          { id: "R-01", rule: "Every deliverable carries a version, a checksum and its sources, and no deliverable is complete until a named person approves it.", evidence: "the studio's verification record: status, approver, version, date per deliverable", owner: "the project lead", gate: "all deliverables show approved" },
          { id: "R-02", rule: "Changes to the goal, the plan or the operating envelope are proposed, reviewed and recorded — never silently edited.", evidence: "the change log in the batch record, with before/after values", owner: "the project lead", gate: "no unlogged change in the last batch" },
          { id: "R-03", rule: "Open assumptions and open safety questions are visible wherever their numbers are used, not buried in an appendix.", evidence: "A-01…A-06 and S-01…S-14 render beside the balancer and the sliders", owner: "the QA lead", gate: "no computed panel without its open-question note" },
        ],
      },
      {
        id: "PM-2",
        name: "Records and data",
        requirements: [
          { id: "R-04", rule: "The batch record captures the operating point as set — slider values, media bed, membrane position — not as intended.", evidence: "the batch record page per charge, exportable from the studio", owner: "the operations lead", gate: "every batch has a record matching the run" },
          { id: "R-05", rule: "Raw data (weights, assays, chromatograms, temperatures, pressures) is retained for the retention period with its instrument ID and operator.", evidence: "the data register: file, instrument, operator, date", owner: "the QA lead", gate: "spot-check of three batches passes" },
          { id: "R-06", rule: "Client-confidential numbers stay out of public surfaces; they live in the client's own store or a private spec directory.", evidence: "the confidentiality note in the spec and the repo hygiene check", owner: "the project lead", gate: "no CBI in a public commit" },
        ],
      },
      {
        id: "PM-3",
        name: "Calibration and metrology",
        requirements: [
          { id: "R-07", rule: "Every instrument that reports a number a decision rests on — temperature, vacuum, pressure, scale, assay — has a calibration in date with a certificate.", evidence: "the instrument register: ID, range, certificate, due date", owner: "the metrology owner", gate: "zero out-of-date instruments in the register" },
          { id: "R-08", rule: "The sensors the operating point drives (jacket RTDs, vacuum gauge, jacket pressure) are calibrated against the range they actually run at, not a nominal range.", evidence: "certificate ranges cover the operating window", owner: "the metrology owner", gate: "ranges match the envelope" },
        ],
      },
      {
        id: "PM-4",
        name: "Quality assurance and sampling",
        requirements: [
          { id: "R-09", rule: "Each charge is sampled at the points where the model claims an effect: after extraction, after media, after polish, crystal, mother liquor, recovered carrier.", evidence: "the sampling plan with the QC methods per point", owner: "the QA lead", gate: "samples logged per batch" },
          { id: "R-10", rule: "The model's predictions (colour removal, cannabinoid loss, boiling point) are checked against measured values every batch, and the difference is recorded.", evidence: "the prediction-vs-measured column in the batch record", owner: "the QA lead", gate: "variance inside the published band, or an investigation" },
          { id: "R-11", rule: "Media beds are lot-tracked; carbon and clay are single use; sieves and packing have a regeneration log.", evidence: "the media register per bed: lot, charge count, regeneration dates", owner: "the operations lead", gate: "no bed over its cycle count" },
        ],
      },
      {
        id: "PM-5",
        name: "Risk and change control",
        requirements: [
          { id: "R-12", rule: "The risk register carries the safety questions (S-01…S-14) with their owners and review dates; a closed question cites its evidence.", evidence: "the safety panel's question list with status", owner: "the client's EHS adviser", gate: "no overdue review" },
          { id: "R-13", rule: "Second-hand brewery kit has a documented change-of-service record: what it held, how it was cleaned, what it may hold now.", evidence: "per-vessel service history sheet", owner: "the QA lead", gate: "every vessel has one before carrier service" },
          { id: "R-14", rule: "A deviation (a value outside its window, a failed check) triggers a written deviation record before the next charge.", evidence: "the deviation log", owner: "the operations lead", gate: "no charge after an unlogged deviation" },
        ],
      },
      {
        id: "PM-6",
        name: "Training and competence",
        requirements: [
          { id: "R-15", rule: "Everyone who charges media, sets the operating point or draws samples is trained on the SOP and on the why behind each safety question.", evidence: "the training matrix with dates", owner: "the operations lead", gate: "no untrained operator in the batch record" },
          { id: "R-16", rule: "The SOP steps and their acceptance criteria are what the training teaches — the same document, not a friendlier paraphrase.", evidence: "the SOP version in the training record matches the spec", owner: "the QA lead", gate: "versions match" },
        ],
      },
      {
        id: "PM-7",
        name: "Vendors and consumables",
        requirements: [
          { id: "R-17", rule: "Membrane and media purchases carry their datasheets into the register; the RO's maker clearance (S-13) is a document, not a memory.", evidence: "the vendor register with datasheets and clearance letters", owner: "the project lead", gate: "S-13 evidence on file" },
          { id: "R-18", rule: "Waste streams (spent beds, RO concentrate, deviations) have a determination and a brokered carrier with DOT labelling — we never take title.", evidence: "the waste register: stream, determination, carrier, manifest", owner: "the waste broker", gate: "no undetermined stream at the door" },
        ],
      },
    ],
    sources: ["the spec's safety questions (S-01…S-14)", "the studio's verification gates", "the batch record template"],
  };
}
