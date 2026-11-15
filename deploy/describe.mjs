// The deterministic describer.
//
// Some questions do not need a language model: what the skid is, what each bed
// takes, what the vacuum sets hold. This answers them straight from the
// context document, so the chatbot is useful before anyone has put a key in.
//
// It is the same code on both sides of the wire: the Worker calls it for
// ?provider=local, and the page calls the Worker for it.

const has = (text, ...words) => words.some((w) => text.includes(w));

function table(head, rows) {
  const lines = [`| ${head.join(" | ")} |`, `| ${head.map(() => "---").join(" | ")} |`];
  for (const row of rows) lines.push(`| ${row.join(" | ")} |`);
  return lines.join("\n");
}

function vacuumTable(context) {
  return table(
    ["Set", "Pressure", "Boils at", "Coolant", "Power", "Pumps"],
    context.vacuum.map((v) => [
      `${v.stages} stage (${v.name})`,
      `${v.mbar} mbar`,
      `${v.boilC} °C`,
      `${v.coolantC} °C`,
      `${v.kw} kW`,
      String(v.pumps),
    ]),
  );
}

function bedTable(context) {
  return table(
    ["Bed", "Pore", "Cation", "Takes", "Load", "Density"],
    context.beds.map((b) => [
      b.grade,
      `${b.poreAngstrom} Å`,
      b.cation,
      b.cut,
      `${b.loadKg} kg`,
      String(b.density),
    ]),
  );
}

function equipmentList(context) {
  return context.equipment
    .map((e) => {
      const numbers = Object.entries(e.numbers || {});
      const tail = numbers.length ? ` (${numbers.map(([k, v]) => `${k} ${v}`).join(", ")})` : "";
      return `- **${e.name}** — ${e.where}. ${e.what}${tail}`;
    })
    .join("\n");
}

function modeBlock(context, key) {
  const m = context.modes[key];
  const steps = m.steps.map((s, i) => `${i + 1}. ${s}`).join("\n");
  const valves = Object.entries(m.valves)
    .map(([v, p]) => `- ${v} → ${p}`)
    .join("\n");
  return `**${m.title.toUpperCase()}** — ${m.goal}\n\n${steps}\n\nValve positions:\n${valves}\n\nResult: ${m.result}.`;
}

function stateLine(context, state) {
  if (!state) return "";
  const mode = context.modes[state.mode];
  const vac = context.vacuum.find((v) => v.stages === state.stages);
  const bits = [];
  if (mode) bits.push(`the drawing is on the **${mode.title}** setup`);
  if (vac) bits.push(`the vacuum set is **${vac.stages} stage** (${vac.mbar} mbar, boils at ${vac.boilC} °C)`);
  if (state.cuts && state.cuts.length) {
    const grades = state.cuts.map((i) => context.beds[i] && context.beds[i].grade).filter(Boolean);
    if (grades.length) bits.push(`the ${grades.join(", ")} bed${grades.length > 1 ? "s are" : " is"} cut into ${grades.length > 1 ? "their" : "its"} can`);
  }
  return bits.length ? `Right now ${bits.join(", ")}.` : "";
}

export function describe(context, question = "", state = null) {
  const q = String(question || "").trim().toLowerCase();
  const head = stateLine(context, state);
  const lead = (body) => (head ? `${head}\n\n${body}` : body);

  if (!q) {
    return lead(
      [
        context.description,
        "",
        "**On the drawing**",
        "",
        equipmentList(context),
        "",
        "**The two setups**",
        "",
        modeBlock(context, "solvent"),
        "",
        modeBlock(context, "product"),
        "",
        "**Vacuum sets**",
        "",
        vacuumTable(context),
        "",
        "**The sieve stack**",
        "",
        bedTable(context),
        "",
        "**Condensers, warm end first**",
        "",
        context.condensers.map((c) => `- ${c.temp} °C — ${c.takes}`).join("\n"),
        "",
        "**The gas scrubber**",
        "",
        context.scrubber.media.map((m) => `- ${m.name}, ${m.litres} L: ${m.note}`).join("\n"),
        `- Pressure drop ${context.scrubber.dp} bar, removal ${context.scrubber.efficiency} %.`,
        "",
        "**Controls**",
        "",
        context.controls.keys.map((k) => `- \`${k.key}\` — ${k.action}`).join("\n"),
      ].join("\n"),
    );
  }

  if (has(q, "difference", "versus", " vs ", "compare", "both setup", "two setup")) {
    return lead(
      [
        "**Pure solvent** — cannabinoids out of the solvent, solvent back in the tank.",
        "",
        context.modes.solvent.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        "",
        "**Pure product** — everything but the cannabinoids out of the crude.",
        "",
        context.modes.product.steps.map((s, i) => `${i + 1}. ${s}`).join("\n"),
        "",
        "The hardware is the same; the three ball valves on the routing block are what change.",
      ].join("\n"),
    );
  }

  if (has(q, "pure solvent", "solvent setup", "mode 1", "setup one")) {
    return lead(modeBlock(context, "solvent"));
  }

  if (has(q, "pure product", "product setup", "mode 2", "setup two")) {
    return lead(modeBlock(context, "product"));
  }

  if (has(q, "bed", "sieve", "3a", "4a", "5a", "13x", "molecular sieve", "zeolite", "molecule")) {
    return lead(
      [
        "**The sieve stack, top bed first**",
        "",
        bedTable(context),
        "",
        "Each bed has its own isolation valve and its own collection can, and each can be cut out on its own while the rest of the stack keeps running.",
        "",
        "The scrubber uses zeolite 13X as well, but for water and CO₂ in the exhaust rather than in the solvent.",
      ].join("\n"),
    );
  }

  if (has(q, "vacuum", "mbar", "stage", "pump", "boil", "condenser")) {
    return lead(
      [
        "**Vacuum sets**",
        "",
        vacuumTable(context),
        "",
        "The deeper the vacuum, the lower the solvent boils and the colder the condenser has to be, which is what the coolant number in the readout is telling you.",
        "",
        "**Condensers, warm end first**",
        "",
        context.condensers.map((c) => `- ${c.temp} °C — ${c.takes}`).join("\n"),
        "",
        `Coolant: glycol ${context.chiller.glycol} °C, cascade ${context.chiller.cascade} °C.`,
      ].join("\n"),
    );
  }

  if (has(q, "scrubber", "exhaust", "carbon", "stack", "outlet")) {
    return lead(
      [
        "**The gas scrubber** sits on the pump exhaust, the last thing before the stack.",
        "",
        context.scrubber.media.map((m) => `- **${m.name}**, ${m.litres} L — ${m.note}`).join("\n"),
        "",
        `Pressure drop ${context.scrubber.dp} bar, removal ${context.scrubber.efficiency} %.`,
        "",
        "The CRC carbon in the scrubber is the same media as the carbon bed on the permeate line.",
      ].join("\n"),
    );
  }

  if (has(q, "membrane", "filtration", "0.001", "pore", "nm", "permeate", "retentate")) {
    const m = context.membrane;
    return lead(
      [
        `**Cross-flow membrane module** — solvent nanofiltration, ${m.poreUm} µm (${m.poreNm} nm) pore, ${m.area} m² of membrane.`,
        "",
        table(
          ["", "Value"],
          [
            ["Feed", `${m.feed} L/h`],
            ["Permeate", `${m.permeate} L/h`],
            ["Retentate", `${m.retentate} L/h`],
            ["Transmembrane pressure", `${m.bar} bar`],
            ["Solvent in the permeate", `${m.ppm} ppm`],
            ["Cannabinoids held back", `${m.cbdRecovered} %`],
          ],
        ),
        "",
        m.note,
      ].join("\n"),
    );
  }

  if (has(q, "evaporator", "evap", "boil", "strip", "distil")) {
    return lead(
      [
        "**The vacuum evaporator** boils the solvent out of the retentate. It works under whatever the vacuum set holds, so with one stage the solvent boils at about 12 °C, with two at about −10 °C and with three at about −31 °C.",
        "",
        "In the pure product setup the residue left in the evaporator is the cannabinoid fraction, and that is what the product drum collects.",
      ].join("\n"),
    );
  }

  if (has(q, "audit", "check", "quality", "line end", "problem", "issue", "state of the drawing")) {
    const a = context.audit || {};
    if (!a.measured) {
      return lead(
        [
          `The geometry audit has not been measured in this build. ${a.note || ""}`.trim(),
          "",
          "What is checked: whether every line in the drawing ends on a fitting, whether tubes keep their clearance from each other, whether the solids are supported, whether the depth order of the pieces is right and whether the pipes crowd on screen.",
        ].join("\n"),
      );
    }
    return lead(
      [
        "**Geometry audit**",
        "",
        table(
          ["Check", "Problems"],
          [
            ["Clearance", String(a.clearance ?? 0)],
            ["Terminals not on a mount", String(a.terminals ?? 0)],
            ["Sunk solid pairs", String(a.sunk ?? 0)],
            ["Depth order", String(a.depth ?? 0)],
            ["Crowding", String(a.crowding ?? 0)],
          ],
        ),
        "",
        a.note || "",
      ].join("\n"),
    );
  }

  if (has(q, "key", "keyboard", "control", "button", "click", "how do i")) {
    return lead(
      [
        "**Controls**",
        "",
        context.controls.keys.map((k) => `- \`${k.key}\` — ${k.action}`).join("\n"),
        "",
        "**Pointers**",
        "",
        context.controls.pointers.map((p) => `- ${p}`).join("\n"),
      ].join("\n"),
    );
  }

  if (has(q, "api", "endpoint", "worker", "cloudflare", "curl", "fetch")) {
    return lead(
      [
        "**The API**",
        "",
        context.api.endpoints.map((e) => `- \`${e.method} ${e.path}\` — ${e.what}`).join("\n"),
        "",
        "```bash",
        "curl https://solvent-skid-sr2.lifecyclerd.workers.dev/api/context | jq .summary",
        "curl -N https://solvent-skid-sr2.lifecyclerd.workers.dev/api/chat \\",
        "  -H 'content-type: application/json' \\",
        "  -d '{\"provider\":\"gemini\",\"model\":\"gemini-2.5-flash\",\"key\":\"YOUR-KEY\",\"messages\":[{\"role\":\"user\",\"content\":\"what does the 13X bed take?\"}]}'",
        "```",
        "",
        context.api.note,
      ].join("\n"),
    );
  }

  if (has(q, "agent", "sandbox", "openshell", "colab", "github", "clone")) {
    return lead(
      [
        "**Driving the skid from an agent**",
        "",
        "```bash",
        ...context.agent.commands,
        "```",
        "",
        context.agent.note,
        "",
        context.agent.sandbox,
      ].join("\n"),
    );
  }

  if (has(q, "what is", "describe", "what are", "tell me about", "overview", "explain the skid", "who")) {
    return lead([context.description, "", "**On the drawing**", "", equipmentList(context)].join("\n"));
  }

  // Nothing matched: give the summary and the menu of what can be answered.
  return lead(
    [
      context.summary,
      "",
      "I can answer without a model about:",
      "",
      "- what the two setups do differently",
      "- what each sieve bed takes, and the collection cans",
      "- the vacuum sets, their pressures and the boiling points",
      "- the membrane numbers",
      "- the condenser bank and the gas scrubber",
      "- the controls and keyboard shortcuts",
      "- the geometry audit",
      "- the API and how to drive the build from an agent",
      "",
      "Ask one of those, or put a key in the settings and ask me anything.",
    ].join("\n"),
  );
}
