// Mermaid, one diagram per process.
//
// A process diagram is the thing an engineer asks for first and the thing
// nobody draws twice. So it is generated: from the same specification the
// figure is drawn from, in Mermaid, which any tool can read and every
// Markdown renderer can show.
//
// The per-step diagram is the step in context: what enters it, what leaves
// it, and what it is doing. The whole-process diagram is the chain, with the
// operations in order and the streams between them.

const id = (text) => String(text).replace(/[^A-Za-z0-9]/g, "_");

function node(label) {
  return `["${String(label).replace(/"/g, "'")}"]`;
}

function streamLabel(stream) {
  const parts = [`${stream.name}`];
  if (stream.flow) parts.push(`${stream.flow.value} ${stream.flow.unit}`);
  const carrier = (stream.composition || [])[0];
  if (carrier) parts.push(carrier.fraction >= 0.05 ? `${Math.round(carrier.fraction * 100)}% ${carrier.material}` : null);
  return parts.filter(Boolean).join("<br/>");
}

/** The diagram of one operation, in context. */
export function mermaidForStep(spec, step) {
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));
  const lines = [];
  lines.push("flowchart LR");
  const ins = (step.in || []).map((sid) => streams.get(sid)).filter(Boolean);
  const outs = (step.out || []).map((sid) => streams.get(sid)).filter(Boolean);

  for (const stream of ins) lines.push(`  ${id(stream.id)} ${node(streamLabel(stream))}`);
  const window = step.window || {};
  const bits = Object.entries(window)
    .filter(([, v]) => v && typeof v === "object" && "value" in v)
    .map(([k, v]) => `${k} ${v.value} ${v.unit}`);
  lines.push(`  ${id(step.id)} ${node(`${step.id} ${step.name}<br/>${bits.join(", ")}`)}`);
  for (const stream of outs) lines.push(`  ${id(stream.id)} ${node(streamLabel(stream))}`);
  for (const stream of ins) lines.push(`  ${id(stream.id)} --> ${id(step.id)}`);
  for (const stream of outs) lines.push(`  ${id(step.id)} --> ${id(stream.id)}`);

  const targets = (spec.targets || []).filter((t) => t.isolationStep === step.id);
  for (const target of targets) {
    lines.push(`  ${id(target.id)} ${node(`${target.name}<br/>${target.spec.purity.value} ${target.spec.purity.unit} purity`)}`);
    lines.push(`  ${id(step.id)} -. makes .-> ${id(target.id)}`);
  }
  if (step.isolation && step.isolation.note) {
    lines.push(`  %% isolation: ${String(step.isolation.note).replace(/\n/g, " ")}`);
  }
  return lines.join("\n");
}

/** The diagram of the whole process. */
export function mermaidForProcess(spec) {
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));
  const lines = [];
  lines.push("flowchart LR");
  const drawn = new Set();
  for (const step of spec.process || []) {
    lines.push(`  ${id(step.id)} ${node(`${step.id} ${step.name}`)}`);
    for (const streamId of step.in || []) {
      const stream = streams.get(streamId);
      if (!stream) continue;
      const key = id(stream.id);
      if (!drawn.has(key)) {
        lines.push(`  ${key} ${node(streamLabel(stream))}`);
        drawn.add(key);
      }
      lines.push(`  ${key} --> ${id(step.id)}`);
    }
    for (const streamId of step.out || []) {
      const stream = streams.get(streamId);
      if (!stream) continue;
      const key = id(stream.id);
      if (!drawn.has(key)) {
        lines.push(`  ${key} ${node(streamLabel(stream))}`);
        drawn.add(key);
      }
      lines.push(`  ${id(step.id)} --> ${key}`);
    }
  }
  for (const target of spec.targets || []) {
    lines.push(`  ${id(target.id)} ${node(`${target.name}<br/>target`)}`);
    const step = (spec.process || []).find((s) => s.id === target.isolationStep);
    if (step) lines.push(`  ${id(step.id)} -. makes .-> ${id(target.id)}`);
  }
  return lines.join("\n");
}

/** Every diagram a spec needs: the chain, and one per operation. */
export function mermaidSet(spec) {
  const out = { process: mermaidForProcess(spec), steps: {} };
  for (const step of spec.process || []) out.steps[step.id] = mermaidForStep(spec, step);
  return out;
}
