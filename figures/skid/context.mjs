// The skid, written down.
//
// The figure shows the plant; this file says what it is, in words, with every
// number taken from model.mjs so the text can never drift from the drawing.
// It is used three ways:
//
//   1. build.mjs embeds it in the page, so the chatbot can answer with no
//      network at all ("local" provider).
//   2. build-index.mjs writes it next to the deployed figure, so the Worker
//      can ground a language model on it (/api/context, /api/chat).
//   3. deploy/describe.mjs turns it into answers for questions that do not
//      need a model.

import * as M from "./model.mjs";

const num = (v, digits = 0) => (typeof v === "number" ? v.toFixed(digits) : String(v));

export function vacuumRows() {
  return M.VACUUM.map((v) => ({
    stages: v.stages,
    mbar: v.mbar,
    name: v.name,
    pumps: v.pumps,
    kw: v.kw,
    m3h: v.m3h,
    boilC: Number(M.satTempC(v.mbar).toFixed(1)),
    coolantC: M.coolantNeeded(v.mbar),
  }));
}

export function bedRows() {
  return M.BEDS.map((b, index) => ({
    index,
    grade: b.grade,
    poreAngstrom: b.pore,
    cation: b.cation,
    cut: b.cut,
    loadKg: b.load,
    density: b.density,
    can: `collection can ${index + 1}`,
  }));
}

export function equipment() {
  return [
    {
      id: "feed.drum",
      name: "Feed drum",
      where: "near left corner, on the deck",
      what:
        "Holds the crude extract. Its level is drawn as a granular surface; the lid takes the return line from the solvent tank.",
      numbers: { volume: "250 L", level: "drawn to two thirds" },
    },
    {
      id: "pump",
      name: "Pneumatic diaphragm pump",
      where: "next to the feed drum, on its own base plate",
      what:
        "Drives the extract round the skid. Air motor, tie rods, a muffler and an inlet boss; the compressed-air hose is drawn looping back over the drum.",
      numbers: { drive: "compressed air, 6 bar", duty: "up to 400 L/h" },
    },
    {
      id: "feed.strainer",
      name: "Basket strainer",
      where: "between the pump and the membrane",
      what:
        "A coarse basket with a bolted lid and a drain, so plant and bag fibre stay out of the membrane. A small gauge on its side reads the pressure drop across it.",
      numbers: { mesh: "100 µm", dpAlarm: "0.4 bar" },
    },
    {
      id: "membrane",
      name: "Cross-flow membrane module",
      where: "the long horizontal shell in the near row, left of centre",
      what:
        "Solvent nanofiltration. The shell is horizontal with bolted end flanges and tie rods; crude runs along it and the permeate comes off the shell side. It keeps the cannabinoids and the heavy oil in the retentate and lets the clean solvent through.",
      numbers: {
        poreUm: M.MEMBRANE.poreUm,
        poreNm: M.MEMBRANE.poreUm * 1000,
        areaM2: M.MEMBRANE.area,
        feedLh: M.MEMBRANE.feed,
        permeateLh: M.MEMBRANE.permeate,
        retentateLh: M.MEMBRANE.retentate,
        pressureBar: M.MEMBRANE.bar,
        solventPpm: M.MEMBRANE.ppm,
        cbdRecoveryPct: M.MEMBRANE.cbdRecovered,
      },
    },
    {
      id: "carbon",
      name: "CRC carbon bed",
      where: "on the permeate line, before the routing block",
      what:
        "A vessel of spent or virgin CRC carbon. It is the last cannabinoid barrier before the solvent goes back to the tank, and the bed the exhaust scrubber also uses.",
      numbers: { media: "CRC carbon", role: "cannabinoid retention", dpDropBar: 1.05 },
    },
    {
      id: "block",
      name: "Three-valve routing block",
      where: "centre of the deck, between the membrane and the sieve stack",
      what:
        "The block that decides the setup. Three ball valves, each with a lever that turns between two ports, route the permeate and the retentate to the sieve, the tank, the evaporator or the product drum.",
      numbers: { valves: 3, positions: "2 per valve, 6 combinations, 2 of them used" },
    },
    {
      id: "sieve.bed0",
      name: "Molecular sieve stack, 3A to 13X",
      where: "the tall column in the far row, centre",
      what:
        "Four beds in one stack, 3A on top down to 13X, each with its own isolation valve, its own media window in the drawing and its own collection can underneath. A cut valve on each bed can drop that bed's fraction into its can while the others keep running.",
      numbers: {
        beds: M.BEDS.length,
        order: M.BEDS.map((b) => b.grade).join(" → "),
        cans: M.BEDS.length,
        note: "each bed can be cut out on its own",
      },
    },
    {
      id: "product.drum",
      name: "Product drum",
      where: "the drum at the far left of the back row",
      what:
        "Where the cannabinoid fraction ends up. In the pure solvent setup the rich retentate goes straight here; in the pure product setup this is where the stripped residue is left.",
      numbers: { volume: "200 L", contents: "cannabinoid-rich fraction" },
    },
    {
      id: "evap",
      name: "Vacuum evaporator",
      where: "the vessel in the back row, left of the sieve",
      what:
        "Boils the solvent out of the retentate under vacuum. The deeper the vacuum set, the lower the solvent boils, and the less heat the jacket needs.",
      numbers: { heatedAreaM2: 2.4, working: "under 35 / 8 / 1.5 mbar by stage count" },
    },
    {
      id: "cond",
      name: "Condenser bank",
      where: "the four horizontal shells above the back row",
      what:
        "Four shells in series, warm end first. Each takes the fraction above its own surface temperature: toluene on the warm shell, then heptane, then ethanol, then acetone on the cold one. The shells hang from the frame and are linked by flanged pipes.",
      numbers: {
        shells: M.CONDENSERS.length,
        temperaturesC: M.CONDENSERS.map((c) => c.temp).join(", "),
        coolant: `glycol ${M.CHILLER.glycol} °C, cascade ${M.CHILLER.cascade} °C`,
      },
    },
    {
      id: "vacuum",
      name: "Vacuum set, 1 to 3 stages",
      where: "the row of pump sets on the right of the deck",
      what:
        "Two rotary-vane pumps and a pneumatic booster, used one, two or three at a time. The deeper the set, the lower the pressure it holds, and the colder the condenser has to run.",
      numbers: { sets: M.VACUUM.map((v) => `${v.stages} stage → ${v.mbar} mbar`).join(", ") },
    },
    {
      id: "scrub",
      name: "Gas scrubber",
      where: "the drum at the back right, on the pump exhaust",
      what:
        "The last thing the exhaust meets before the stack. Three media layers in series take the cannabinoids, the solvent vapour and the water and CO₂ out of the air.",
      numbers: {
        media: M.SCRUBBER.media.map((m) => `${m.name} (${m.litres} L)`).join(", "),
        dpDropBar: M.SCRUBBER.dp,
        efficiencyPct: M.SCRUBBER.efficiency,
      },
    },
    {
      id: "tank",
      name: "Solvent tank",
      where: "the large drum in the back row, right of the sieve",
      what:
        "Holds the clean solvent. It is fed by the sieve stack in the pure solvent setup and by the condensed vapour in the pure product setup, and it returns to the feed drum.",
      numbers: { volume: "400 L" },
    },
    {
      id: "stand",
      name: "Aluminium frame",
      where: "the whole skid",
      what:
        "An extruded aluminium frame on four casters: a deck plate, four posts and a top rail. Everything above is bolted to it, so the skid can be wheeled into a room and set up there.",
      numbers: { casters: 4, deckMm: "1200 × 600", frame: "40 × 40 extrusion" },
    },
    {
      id: "panel",
      name: "Control panel",
      where: "the small box on the near left post",
      what:
        "The local panel: it selects the setup and shows the vacuum. Clicking it switches the whole drawing between the two setups.",
      numbers: { indicator: "vacuum gauge on the panel face" },
    },
  ];
}

export function modeRows() {
  return {
    solvent: {
      key: "solvent",
      title: M.MODES.solvent.title,
      goal: M.MODES.solvent.goal,
      valves: M.MODES.solvent.valves,
      product: M.MODES.solvent.product,
      lit: M.MODES.solvent.lines,
      steps: [
        "The diaphragm pump draws the crude extract out of the feed drum and pushes it through the basket strainer.",
        "The extract crosses the 0.001 µm membrane at 18 bar: solvent and the trace cannabinoids pass, the oil and the bulk cannabinoids stay behind.",
        "The permeate meets the CRC carbon bed, which takes the last of the cannabinoids out of the solvent.",
        "V1 sends the permeate to the sieve stack; V3 keeps the stack fed from the permeate rather than from the condenser.",
        "The sieve stack dries the solvent: 3A takes the water, 4A the CO₂ and methanol, 5A the n-paraffins, 13X the C₂–C₃ and the heavy ends.",
        "The dried solvent goes back to the solvent tank and from there to the feed drum, ready to be used again.",
        "The rich retentate never goes near the sieve: V2 sends it straight to the product drum.",
      ],
      result: "solvent back in the tank, cannabinoids in the drum",
    },
    product: {
      key: "product",
      title: M.MODES.product.title,
      goal: M.MODES.product.goal,
      valves: M.MODES.product.valves,
      product: M.MODES.product.product,
      lit: M.MODES.product.lines,
      steps: [
        "The pump and strainer do the same work as in the solvent setup: the crude goes onto the membrane.",
        "This time V2 sends the rich retentate to the vacuum evaporator instead of to the drum.",
        "The evaporator boils the solvent out of the retentate under the vacuum the pump set holds.",
        "The vapour climbs to the condenser bank and is taken back to liquid shell by shell: toluene, heptane, ethanol, acetone.",
        "V3 feeds the condensed liquid into the sieve stack, where 3A to 13X take the water, the CO₂, the paraffins and the heavy ends out of it.",
        "The dried condensate goes back to the solvent tank and then to the feed drum as wash.",
        "The permeate is the clean side: V1 sends it to the tank rather than through the carbon bed again.",
        "What stays in the evaporator is the cannabinoid residue, and that is what the product drum collects.",
      ],
      result: "cannabinoids in the drum, solvent back in the tank",
    },
  };
}

export function mediaRows() {
  return {
    sieve: M.BEDS.map((b) => ({
      name: `${b.grade} molecular sieve`,
      poreAngstrom: b.pore,
      cation: b.cation,
      takes: b.cut,
      loadKg: b.load,
      bulkDensity: b.density,
      role: "drying and fractioning the solvent",
    })),
    scrubber: M.SCRUBBER.media.map((m) => ({
      name: m.name,
      litres: m.litres,
      takes: m.note,
      role: "cleaning the pump exhaust",
    })),
    carbon: [
      { name: "CRC carbon", role: "cannabinoid retention", where: "permeate bed and scrubber" },
      { name: "activated carbon", role: "solvent vapour", where: "scrubber" },
    ],
  };
}

export function contextOf(audit = null) {
  const vac = vacuumRows();
  const beds = bedRows();
  const modes = modeRows();

  const description = [
    `SR-2 is a solvent recovery and fractionation skid for botanical extraction. It stands on a wheeled aluminium frame and carries the whole plant: a feed drum and a pneumatic diaphragm pump, a basket strainer, a cross-flow membrane module with a ${M.MEMBRANE.poreUm} µm pore, a CRC carbon bed, a three-valve routing block, a molecular sieve stack of ${M.BEDS.map((b) => b.grade).join(", ")}, a vacuum evaporator, a bank of ${M.CONDENSERS.length} condenser shells, a one, two or three stage vacuum set and a gas scrubber on the exhaust.`,
    `It runs in one of two setups, chosen by three ball valves on the routing block. In PURE SOLVENT the membrane permeate, stripped of its last cannabinoids by the carbon bed, is dried on the sieve stack and goes back to the tank, while the rich retentate goes straight to the product drum. In PURE PRODUCT the routing is reversed: the rich retentate is stripped of its solvent in the vacuum evaporator, the vapour is condensed in the four shells and dried on the sieve before it returns, and the cannabinoid residue is left in the drum.`,
    `The vacuum set decides how cold the plant runs: ${vac.map((v) => `${v.stages} stage holds ${v.mbar} mbar and boils the solvent at ${v.boilC} °C`).join(", ")}.`,
  ].join("\n\n");

  const context = {
    schema: 1,
    name: "Solvent recovery skid SR-2",
    subtitle: "solvent recovery and fractionation for botanical extraction",
    description,
    summary: description.split("\n\n")[0],
    purpose: [
      "recover the solvent so a crop can be extracted again and again without buying more",
      "strip the cannabinoids out of the solvent (pure solvent setup)",
      "strip the solvent out of the extract (pure product setup)",
      "cut the fractions apart on the sieve stack and collect them one by one",
    ],
    layout:
      "Near row, left to right: feed drum, pneumatic diaphragm pump, basket strainer, membrane module, routing block, the four collection cans, product drum. Far row, left to right: product drum, vacuum evaporator, sieve stack, solvent tank, gas scrubber. Above the back row: the four condenser shells. On the frame: the control panel on the near left post and the vacuum pumps on the right of the deck.",
    equipment: equipment(),
    modes,
    media: mediaRows(),
    membrane: {
      ...M.MEMBRANE,
      note:
        "Solvent nanofiltration: the permeate is the solvent with a trace of cannabinoids in it, the retentate is the oil and the cannabinoid bulk. A 1 nm pore holds back cannabinoids but lets the solvent through.",
    },
    chiller: M.CHILLER,
    vacuum: vac,
    beds,
    condensers: M.CONDENSERS.map((c) => ({ ...c, note: `${c.takes} condenses on this shell` })),
    scrubber: M.SCRUBBER,
    streams: Object.entries(M.STREAMS).map(([id, s]) => ({ id, label: s.label, colour: s.tone })),
    controls: {
      keys: [
        { key: "1", action: "pure solvent setup" },
        { key: "2", action: "pure product setup" },
        { key: "3", action: "one stage vacuum set, 35 mbar" },
        { key: "4", action: "two stage vacuum set, 8 mbar" },
        { key: "5", action: "three stage vacuum set, 1.5 mbar" },
        { key: "B", action: "cut the highlighted sieve bed into its can" },
      ],
      pointers: [
        "click the control panel to switch setup",
        "click a ball valve lever to turn it to its other port",
        "click a sieve bed to highlight it",
        "click a bed's cut valve to drop that fraction into its can",
      ],
    },
    chemistry: {
      solvent: "ethanol, the usual carrier for botanical extraction",
      vapour: "ln P = 21.446 − 5105/T, P in mbar and T in kelvin, fitted to 15.7 mbar at 0 °C and 1013 mbar at 78.4 °C",
      note: `The readout's boil temperature follows that curve: ${vac.map((v) => `${v.mbar} mbar boils at ${v.boilC} °C`).join(", ")}.`,
    },
    audit: audit || {
      measured: false,
      note: "Run `node figures/skid/build.mjs --audit` for the geometry counts.",
    },
    api: {
      note: "This description is also an API. The deployed Worker serves it as JSON and accepts chat requests with the visitor's own key.",
      endpoints: [
        { path: "/api/context", method: "GET", what: "this document, as JSON" },
        { path: "/api/describe", method: "GET", what: "a prose description; ?q= asks a question and gets the matching part back" },
        { path: "/api/chat", method: "POST", what: "a chat completion, streaming; send {provider, model, key, messages}" },
        { path: "/api/health", method: "GET", what: "what the Worker can do, and which keys it holds" },
      ],
    },
    agent: {
      note: "The same repository can be driven from an agent: clone it, run the build, read the audit.",
      commands: [
        "git clone https://github.com/lifecycleResearch/solvent-skid-sr2",
        "node figures/skid/build.mjs && node figures/skid/build.mjs --light",
        "node figures/skid/build.mjs --audit",
        "node scripts/lines.mjs deploy/public/skid-light.html",
      ],
      sandbox: "OpenShell sandbox `skid`, reachable over the tailnet; its policy allows Google, Colab, GitHub and this Worker.",
    },
  };

  context.prompt = systemPrompt(context);
  return context;
}

export function systemPrompt(context) {
  const lines = [
    "You are the plant engineer for SR-2, a solvent recovery and fractionation skid for botanical extraction.",
    "You are talking to someone looking at an isometric drawing of the skid, which they can switch between two setups and three vacuum stages.",
    "",
    "Rules:",
    "- Use only the numbers in the specification below. If a number is not there, say it is not in the drawing rather than inventing one.",
    "- Be descriptive: name the vessel, the media, the stream colour and the direction of travel.",
    "- Say which setup and which vacuum stage the drawing is on when it matters, and how the answer would change with the other setting.",
    "- The drawing's colours: amber is the crude extract, blue is the recovered solvent, violet is solvent vapour, green is the cannabinoid stream, grey is spent media and exhaust.",
    "- Answer in the language of the question. Keep it to a few paragraphs unless asked for a table.",
    "",
    "SPECIFICATION",
    "",
    "Name: " + context.name,
    "",
    context.description,
    "",
    "Layout",
    "",
    context.layout,
    "",
    "Equipment",
    "",
  ];
  for (const e of context.equipment) {
    lines.push(`- ${e.name} (${e.where}): ${e.what}`);
    const n = Object.entries(e.numbers || {});
    if (n.length) lines.push(`  ${n.map(([k, v]) => `${k}: ${v}`).join("; ")}`);
  }
  lines.push("", "The two setups", "");
  for (const key of M.MODES_ORDER) {
    const m = context.modes[key];
    lines.push(`${m.title.toUpperCase()} — ${m.goal}.`);
    m.steps.forEach((s, i) => lines.push(`  ${i + 1}. ${s}`));
    lines.push(`  Valve positions: ${Object.entries(m.valves).map(([v, p]) => `${v} → ${p}`).join(", ")}.`);
    lines.push(`  Result: ${m.result}.`);
    lines.push("");
  }
  lines.push(
    "Vacuum sets",
    "",
    context.vacuum
      .map(
        (v) =>
          `- ${v.stages} stage (${v.name}): ${v.mbar} mbar, ${v.kw} kW, ${v.m3h} m³/h, ${v.pumps} pump(s). The solvent boils at ${v.boilC} °C and the condenser needs ${v.coolantC} °C of coolant.`,
      )
      .join("\n"),
    "",
    "The sieve stack",
    "",
    context.beds
      .map(
        (b) =>
          `- ${b.grade} (${b.poreAngstrom} Å, ${b.cation}): takes ${b.cut}; ${b.loadKg} kg on the bed; density ${b.density}; drains into ${b.can}.`,
      )
      .join("\n"),
    "",
    "Condensers, warm end first",
    "",
    context.condensers.map((c) => `- ${c.temp} °C: ${c.takes}`).join("\n"),
    "",
    "Gas scrubber",
    "",
    context.scrubber.media.map((m) => `- ${m.name}: ${m.litres} L, ${m.note}`).join("\n"),
    `- Pressure drop ${context.scrubber.dp} bar, removal ${context.scrubber.efficiency} %.`,
    "",
    "Membrane",
    "",
    `Pore ${context.membrane.poreUm} µm (${context.membrane.poreNm} nm), area ${context.membrane.area} m², feed ${context.membrane.feed} L/h, permeate ${context.membrane.permeate} L/h, retentate ${context.membrane.retentate} L/h at ${context.membrane.bar} bar; ${context.membrane.ppm} ppm solvent in the permeate; ${context.membrane.cbdRecovered} % of the cannabinoids held back.`,
    "",
    "Controls",
    "",
    context.controls.keys.map((k) => `- ${k.key}: ${k.action}`).join("\n"),
    "",
  );
  return lines.join("\n");
}
