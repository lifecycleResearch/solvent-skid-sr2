// The part catalogue.
//
// Every part of the plant gets four answers, and the page shows them when the
// reader clicks the part:
//
//   what     what it is: the name, the identifier, what it is made of, how big
//   does     what it does: its function, in one paragraph
//   details  the system details: the numbers that make it this part and not
//            another, each with the field it came from
//   here     its application in this process: the step it belongs to, the
//            streams in and out, the notes that mention it, the targets it
//            touches
//
// and the evidence: the papers and the patents that support it.
//
// The catalogue is built from the spec, so it cannot say anything the spec
// does not say. Where the spec has nothing, the catalogue says so rather
// than inventing it -- that is the whole point of a catalogue that a client
// can check.

const FUNCTION = {
  drum: "storage",
  tank: "storage",
  "jacketed vessel": "reaction",
  "jacketed vessel with a scraper": "reaction",
  "falling film": "separation",
  "shell and tube": "heat-exchange",
  "air cooled chiller": "heat-exchange",
  "basket strainer": "filtration",
  "drum with media": "separation",
};

const FUNCTION_TEXT = {
  storage: "Holds a material between two steps, so the plant runs at its own pace rather than the batch's.",
  reaction: "Where the material is held while something happens to it: here, a temperature and a time.",
  separation: "Where one phase is taken away from another.",
  "heat-exchange": "Moves heat from the process to a utility, or the other way round.",
  filtration: "Takes the solids out of the liquid before anything else sees them.",
  transport: "Carries a stream from one vessel to the next.",
};

const litres = (vessel) => {
  if (!vessel.volume) return null;
  const { value, unit } = vessel.volume;
  if (unit === "L") return value;
  if (unit === "m3") return value * 1000;
  if (unit === "gal" || unit === "gal(US)") return value * 3.785411784;
  if (unit === "mL") return value / 1000;
  return null;
};

const dimension = (vessel, key, fallbackUnit = "mm") => {
  const dims = vessel.dimensions || {};
  if (!dims[key]) return null;
  return `${dims[key].value} ${dims[key].unit || fallbackUnit}`;
};

function streamById(spec, id) {
  return (spec.streams || []).find((s) => s.id === id) || null;
}

/** The steps a vessel belongs to, through the streams that touch it. */
function stepsFor(spec, vesselId) {
  const streams = new Set();
  for (const connection of spec.connections || []) {
    if (connection.from === vesselId || connection.to === vesselId) {
      if (connection.stream) streams.add(connection.stream);
      else {
        const stream = (spec.streams || []).find((s) => s.flow && connection.flow && s.flow.value === connection.flow.value && s.flow.unit === connection.flow.unit);
        if (stream) streams.add(stream.id);
      }
    }
  }
  const steps = [];
  for (const step of spec.process || []) {
    const touches = (step.in || []).some((id) => streams.has(id)) || (step.out || []).some((id) => streams.has(id));
    if (touches) steps.push({ id: step.id, name: step.name, kind: step.kind, in: step.in || [], out: step.out || [] });
  }
  return { steps, streams: [...streams] };
}

function mediaIn(spec, vesselId) {
  return (spec.media || []).filter((m) => (m.in || []).includes(vesselId) || m.vessel === vesselId);
}

/** The catalogue. One entry per part of the plant. */
export function catalogueOf(spec, evidence = { topics: {} }) {
  const parts = [];
  const targets = spec.targets || [];
  const notes = (spec.sop && spec.sop.notes) || [];

  for (const vessel of spec.vessels || []) {
    const { steps, streams } = stepsFor(spec, vessel.id);
    const fn = FUNCTION[vessel.type] || "storage";
    const targetsHere = targets.filter((t) =>
      streams.some((id) => {
        const stream = streamById(spec, id);
        return stream && (stream.composition || []).some((p) => p.material === t.material);
      }),
    );
    const details = [];
    const litresValue = litres(vessel);
    if (litresValue) details.push({ label: "Volume", value: `${Math.round(litresValue)} L`, from: "vessel.volume" });
    const diameter = dimension(vessel, "diameter");
    if (diameter) details.push({ label: "Diameter", value: diameter, from: "vessel.dimensions.diameter" });
    const height = dimension(vessel, "height");
    if (height) details.push({ label: "Height", value: height, from: "vessel.dimensions.height" });
    if (vessel.material) details.push({ label: "Material of construction", value: vessel.material, from: "vessel.material" });
    if (vessel.jacket && vessel.jacket.duty) {
      details.push({ label: "Heat duty", value: `${vessel.jacket.duty.value} ${vessel.jacket.duty.unit}`, from: "vessel.jacket.duty" });
      if (vessel.jacket.medium) details.push({ label: "Jacket medium", value: vessel.jacket.medium, from: "vessel.jacket.medium" });
    }
    if (vessel.insulation) details.push({ label: "Insulation", value: vessel.insulation, from: "vessel.insulation" });
    if (vessel.isolation && vessel.isolation.kind) {
      details.push({ label: "Isolation", value: vessel.isolation.note ? `${vessel.isolation.kind} — ${vessel.isolation.note}` : vessel.isolation.kind, from: "vessel.isolation" });
    }
    for (const media of mediaIn(spec, vessel.id)) {
      details.push({ label: `Media: ${media.name}`, value: media.quantity ? `${media.quantity.value} ${media.quantity.unit}` : "", from: `media ${media.id}` });
    }

    parts.push({
      id: vessel.id,
      kind: "vessel",
      name: vessel.name,
      type: vessel.type,
      function: fn,
      what: {
        text: `${vessel.name} (${vessel.id}) is a ${vessel.type}${vessel.material ? ` in ${vessel.material}` : ""}${litresValue ? `, holding ${Math.round(litresValue)} L` : ""}.`,
        material: vessel.material || null,
        size: litresValue ? `${Math.round(litresValue)} L` : null,
      },
      does: {
        text: FUNCTION_TEXT[fn] || "A piece of the plant.",
        isolation: vessel.isolation ? vessel.isolation.note || vessel.isolation.kind : null,
      },
      details,
      here: {
        steps: steps.map((s) => `${s.id} ${s.name}`),
        streams: streams.map((id) => {
          const stream = streamById(spec, id);
          return stream ? `${stream.name} (${id})` : id;
        }),
        targets: targetsHere.map((t) => `${t.name} (${t.id})`),
        notes: notes.filter((n) => n.refersTo === vessel.id).map((n) => n.text),
      },
      evidence: evidenceFor(spec, vessel.id, evidence),
    });
  }

  for (const connection of spec.connections || []) {
    const stream = connection.stream ? streamById(spec, connection.stream) : null;
    const from = (spec.vessels || []).find((v) => v.id === connection.from);
    const to = (spec.vessels || []).find((v) => v.id === connection.to);
    const details = [];
    if (connection.line) {
      if (connection.line.spool) details.push({ label: "Spool", value: connection.line.spool, from: "connection.line.spool" });
      if (connection.line.bore) details.push({ label: "Bore", value: `${connection.line.bore.value} ${connection.line.bore.unit}`, from: "connection.line.bore" });
      if (connection.line.material) details.push({ label: "Line material", value: connection.line.material, from: "connection.line.material" });
      if (connection.line.insulation) details.push({ label: "Insulation", value: connection.line.insulation, from: "connection.line.insulation" });
    }
    if (connection.flow) details.push({ label: "Flow", value: `${connection.flow.value} ${connection.flow.unit}`, from: "connection.flow" });
    if (stream && stream.massKgPerHour) details.push({ label: "Mass flow", value: `${stream.massKgPerHour} kg/h`, from: `stream ${stream.id}` });

    const steps = [];
    for (const step of spec.process || []) {
      if ((step.out || []).includes(stream?.id) || (step.in || []).includes(stream?.id)) steps.push(`${step.id} ${step.name}`);
    }

    parts.push({
      id: connection.id,
      kind: "connection",
      name: `${from ? from.name : connection.from} → ${to ? to.name : connection.to}`,
      type: "pipe run",
      function: "transport",
      what: {
        text: `A ${connection.line && connection.line.spool ? connection.line.spool : "pipe"} run (${connection.id}) from ${from ? from.name : connection.from} to ${to ? to.name : connection.to}${connection.line && connection.line.material ? `, in ${connection.line.material}` : ""}.`,
        material: connection.line && connection.line.material,
        size: connection.line && connection.line.spool,
      },
      does: {
        text: stream ? `Carries the ${stream.name.toLowerCase()}.` : "Carries a stream between two vessels.",
        isolation: connection.line && connection.line.insulation && connection.line.insulation !== "none" ? `insulated: ${connection.line.insulation}` : null,
      },
      details,
      here: {
        steps,
        streams: stream ? [`${stream.name} (${stream.id})`] : [],
        targets: [],
        notes: notes.filter((n) => n.refersTo === connection.id).map((n) => n.text),
      },
      evidence: evidenceFor(spec, connection.id, evidence),
    });
  }

  for (const media of spec.media || []) {
    parts.push({
      id: media.id,
      kind: "media",
      name: media.name,
      type: "media",
      function: "media",
      what: {
        text: `${media.name} (${media.id}), a lot of ${media.lot || "unrecorded"}: ${media.function}.`,
        material: media.name,
        size: media.quantity ? `${media.quantity.value} ${media.quantity.unit}` : null,
      },
      does: {
        text: `Its job in this plant is ${media.function}.`,
        isolation: media.replacement ? `replaced every ${media.replacement.interval ? `${media.replacement.interval.value} ${media.replacement.interval.unit}` : "?"}, or on ${media.replacement.trigger}` : null,
      },
      details: [
        media.quantity ? { label: "Quantity", value: `${media.quantity.value} ${media.quantity.unit}`, from: "media.quantity" } : null,
        media.lot ? { label: "Lot", value: media.lot, from: "media.lot" } : null,
        media.replacement ? { label: "Replacement trigger", value: media.replacement.trigger, from: "media.replacement" } : null,
      ].filter(Boolean),
      here: { steps: [], streams: [], targets: [], notes: [] },
      evidence: evidenceFor(spec, media.id, evidence),
    });
  }

  for (const step of spec.process || []) {
    const details = [];
    if (step.window) {
      for (const [key, value] of Object.entries(step.window)) {
        if (value && typeof value === "object" && "value" in value) details.push({ label: key, value: `${value.value} ${value.unit}`, from: `process.${step.id}.window.${key}` });
      }
    }
    if (step.heat) {
      if (step.heat.duty) details.push({ label: "Heat duty", value: `${step.heat.duty.value} ${step.heat.duty.unit}`, from: `process.${step.id}.heat.duty` });
      if (step.heat.medium && step.heat.medium !== "none") details.push({ label: "Heat medium", value: step.heat.medium, from: `process.${step.id}.heat.medium` });
    }
    if (step.isolation) details.push({ label: "Isolation", value: step.isolation.note || step.isolation.kind, from: `process.${step.id}.isolation` });

    const sopStep = ((spec.sop && spec.sop.steps) || []).find((s) => s.id === step.id);
    parts.push({
      id: step.id,
      kind: "operation",
      name: step.name,
      type: step.kind,
      function: "operation",
      what: { text: `${step.name} (${step.id}): a ${step.kind} step.`, material: null, size: null },
      does: {
        text: sopStep ? sopStep.text : "An operation in the process.",
        isolation: step.isolation ? step.isolation.note || step.isolation.kind : null,
      },
      details,
      here: {
        steps: [`${step.id} ${step.name}`],
        streams: [...(step.in || []), ...(step.out || [])].map((id) => {
          const stream = streamById(spec, id);
          return stream ? `${stream.name} (${id})` : id;
        }),
        targets: targets.filter((t) => t.isolationStep === step.id).map((t) => `${t.name} (${t.id})`),
        notes: notes.filter((n) => n.refersTo === step.id).map((n) => n.text),
        acceptance: sopStep ? sopStep.acceptance : null,
      },
      evidence: evidenceFor(spec, step.id, evidence),
    });
  }

  return parts;
}

/** The evidence for a part: the topics it is mapped to, with what was found. */
function evidenceFor(spec, id, evidence) {
  const mapping = (spec.evidence && spec.evidence.for) || {};
  const topics = mapping[id] || [];
  const out = [];
  for (const topicId of topics) {
    const topic = evidence.topics && evidence.topics[topicId];
    if (!topic) continue;
    out.push({
      topic: topicId,
      question: topic.why || "",
      query: topic.query,
      retrieved: topic.retrieved,
      papers: (topic.papers || []).slice(0, 5),
      patents: (topic.patents || []).slice(0, 4),
    });
  }
  return out;
}
