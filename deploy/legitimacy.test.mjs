import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { legitimacyOf } from "../figures/lib/legitimacy.mjs";
import { mermaidSet } from "../figures/lib/mermaid.mjs";
import { systemPrompt, relevantParts, estimateTokens } from "./prompt.mjs";
import { catalogueOf } from "../figures/lib/parts.mjs";

const spec = JSON.parse(readFileSync(new URL("../spec/subzero-blend.json", import.meta.url), "utf8"));
let evidence = { topics: {} };
try { evidence = JSON.parse(readFileSync(new URL("../spec/subzero-blend-evidence.json", import.meta.url), "utf8")); } catch {}
const catalogue = catalogueOf(spec, evidence);

test("the legitimacy register covers every part and names the open questions", () => {
  const register = legitimacyOf(spec, catalogue, evidence);
  assert.equal(register.parts.length, catalogue.length);
  assert.ok(register.summary.openQuestions > 0, "there must be open questions, or the register is a brochure");
  const crystalliser = register.parts.find((p) => p.id === "V-103");
  assert.ok(crystalliser.entries.some((e) => /Section VIII/i.test(e.text)), "the vessel must cite the code it is built to");
  assert.ok(register.regulations.some((r) => /49 CFR/.test(r.rule)));
});

test("there is a mermaid diagram for the process and for every step", () => {
  const set = mermaidSet(spec);
  assert.match(set.process, /^flowchart LR/);
  assert.ok(set.process.includes("OP-30"));
  for (const step of spec.process) {
    assert.match(set.steps[step.id], /^flowchart LR/);
    assert.ok(set.steps[step.id].includes(step.id));
  }
});

test("the prompt is trimmed to the question and keeps the rules", () => {
  const selection = relevantParts(catalogue, "what does the crystalliser do with the CBD?", { limit: 4 });
  assert.ok(selection.kept <= 4);
  assert.ok(selection.parts.some((p) => p.id === "V-103"));
  const prompt = systemPrompt({ context: { modes: spec.modes, vacuum: [], prompt: "" }, catalogue, question: "what does the crystalliser do?" });
  assert.match(prompt, /RULES/);
  assert.match(prompt, /say when something is an assumption/i);
  assert.ok(estimateTokens(prompt) < estimateTokens(JSON.stringify(catalogue)));
});
