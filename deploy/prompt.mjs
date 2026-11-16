// The guardrails, and a context that is as small as the question allows.
//
// Two problems with sending a whole plant to a model every time: it costs
// tokens, and it drowns the answer in parts nobody asked about. So the
// context is trimmed to the parts the question touches, and the rules that
// keep the answer honest are in front of it every time.
//
// The guardrails are the house rules, in the form the model can follow:
// no number without a source, no claim without evidence, no regulatory
// conclusion the client has to make, and no confidence the design has not
// earned.

export const GUARDRAILS = [
  "Answer only from the specification and the evidence given below. If a number is not there, say it is not there.",
  "Give the source of every number: the field it came from, or the paper or patent.",
  "Say when something is an assumption, and name the assumption. The open ones are listed; do not quietly treat them as facts.",
  "If the evidence does not support a claim, say the evidence is thin. A neighbour of a subject is not a subject.",
  "Do not give a regulatory, safety or legal conclusion. Name the rule, name the question, and say who has to close it.",
  "Answer in the language of the question, in a few paragraphs, for an engineer who knows the plant.",
];

const STOP = new Set([
  "the", "a", "an", "of", "and", "or", "to", "in", "on", "for", "is", "are", "what", "which", "how", "does", "do", "it", "this", "that", "with", "by", "from", "at", "as", "be", "can", "we", "i", "you", "me", "my", "our",
]);

function words(text) {
  return String(text || "")
    .toLowerCase()
    .split(/[^a-z0-9-]+/)
    .filter((w) => w.length > 2 && !STOP.has(w));
}

/**
 * The parts of the plant a question touches, and how far the context can be
 * cut down.
 */
export function relevantParts(catalogue, question, { limit = 8 } = {}) {
  const asked = new Set(words(question));
  if (!asked.size) return { parts: catalogue.slice(0, limit), kept: limit, total: catalogue.length, terms: [] };

  const scored = catalogue.map((part) => {
    const haystack = words([
      part.name,
      part.type,
      part.function,
      part.what && part.what.text,
      part.does && part.does.text,
      ...(part.details || []).map((d) => `${d.label} ${d.value}`),
      ...(part.here && part.here.steps ? part.here.steps : []),
      ...(part.here && part.here.streams ? part.here.streams : []),
      ...(part.evidence || []).map((e) => e.question),
    ].join(" "));
    const hits = new Set(haystack.filter((w) => asked.has(w)));
    let score = hits.size;
    // The materials and the compounds are how a reader asks.
    for (const id of (part.tags && part.tags.material ? part.tags.material.split(" ") : [])) {
      if (asked.has(id.toLowerCase())) score += 2;
    }
    for (const id of (part.tags && part.tags.compound ? part.tags.compound.split(" ") : [])) {
      if (asked.has(id.toLowerCase())) score += 3;
    }
    return { part, score, hits: [...hits] };
  });

  scored.sort((a, b) => b.score - a.score);
  const kept = scored.filter((s) => s.score > 0).slice(0, limit);
  const rest = scored.filter((s) => s.score === 0);
  return {
    parts: kept.map((s) => s.part),
    kept: kept.length,
    total: catalogue.length,
    omitted: rest.length,
    terms: [...new Set(scored.flatMap((s) => s.hits))].slice(0, 12),
  };
}

export function estimateTokens(text) {
  return Math.ceil(String(text || "").length / 4);
}

/**
 * The system prompt for a question: the rules, the state, and the parts that
 * the question touches.
 */
export function systemPrompt({ context, catalogue = [], question = "", state = null, full = false }) {
  const parts = [];
  parts.push("You are the plant engineer for this process. You know the specification and the evidence, and you are careful about the difference between them.");

  parts.push("RULES");
  for (const rule of GUARDRAILS) parts.push(`- ${rule}`);

  const stateBits = [];
  if (state && state.mode) {
    const mode = context.modes && context.modes[state.mode];
    if (mode) stateBits.push(`the drawing is on the ${mode.title} setup`);
  }
  if (state && state.stages) {
    const vac = (context.vacuum || []).find((v) => v.stages === state.stages);
    if (vac) stateBits.push(`the vacuum set is ${vac.stages} stage (${vac.mbar} mbar, boils at ${vac.boilC} °C)`);
  }
  if (stateBits.length) parts.push(`NOW: ${stateBits.join(", ")}.`);

  if (full || !catalogue.length) {
    parts.push("THE SPECIFICATION", context.prompt || "");
    return parts.join("\n\n");
  }

  const selection = relevantParts(catalogue, question);
  parts.push(
    `THE PLANT (the ${selection.kept} parts your question touches, of ${selection.total}; the rest are not shown)`,
  );
  for (const part of selection.parts) {
    const lines = [`- ${part.id} ${part.name} (${part.type}, ${part.function}): ${part.what.text}`];
    const details = (part.details || []).slice(0, 6).map((d) => `${d.label} ${d.value}`).join("; ");
    if (details) lines.push(`  ${details}`);
    if (part.here && part.here.steps && part.here.steps.length) lines.push(`  steps: ${part.here.steps.join(", ")}`);
    if (part.here && part.here.streams && part.here.streams.length) lines.push(`  carries: ${part.here.streams.join(", ")}`);
    if (part.here && part.here.acceptance) lines.push(`  accept: ${part.here.acceptance}`);
    const topics = (part.evidence || []).filter((e) => (e.papers || []).length || (e.patents || []).length);
    for (const topic of topics) {
      const papers = (topic.papers || []).slice(0, 2).map((p) => p.title).join("; ");
      if (papers) lines.push(`  evidence (${topic.topic}): ${papers}`);
    }
    parts.push(lines.join("\n"));
  }

  const assumptions = (context.assumptions || []).slice(0, 8).map((a) => `${a.id} (${a.confirmed ? "confirmed" : "open"}): ${a.text}`);
  if (assumptions.length) parts.push("THE OPEN ASSUMPTIONS", assumptions.join("\n"));

  return parts.join("\n\n");
}
