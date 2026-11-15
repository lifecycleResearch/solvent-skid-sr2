// Graders.
//
// Two kinds, and the deterministic one always runs first:
//
//   deterministic  the answer must contain, must not contain, must have a
//                  length, must parse, must match a number. No model involved.
//   rubric         an LLM judge scores the answer against a stored rubric
//                  (evals/rubrics/*.json), criterion by criterion.
//
// A verdict is always a number, a pass mark and the reasons, so it can be
// compared with the last run. "It got better" is a claim with a receipt.

const PASS_MARK = 0.8;

const norm = (text) => String(text || "").toLowerCase();

function deterministic(checks = {}, answer = "") {
  const results = [];
  const body = norm(answer);
  const words = String(answer || "").trim().split(/\s+/).filter(Boolean).length;

  for (const needle of checks.mustInclude || []) {
    const ok = body.includes(norm(needle));
    results.push({ check: "mustInclude", what: needle, ok });
  }
  for (const needle of checks.mustNotInclude || []) {
    const ok = !body.includes(norm(needle));
    results.push({ check: "mustNotInclude", what: needle, ok });
  }
  for (const pattern of checks.mustMatch || []) {
    const ok = new RegExp(pattern, "i").test(String(answer || ""));
    results.push({ check: "mustMatch", what: pattern, ok });
  }
  if (checks.minWords) {
    results.push({ check: "minWords", what: `${checks.minWords}`, ok: words >= checks.minWords, got: words });
  }
  if (checks.maxWords) {
    results.push({ check: "maxWords", what: `${checks.maxWords}`, ok: words <= checks.maxWords, got: words });
  }
  if (checks.minLines) {
    const lines = String(answer || "").split("\n").filter((l) => l.trim()).length;
    results.push({ check: "minLines", what: `${checks.minLines}`, ok: lines >= checks.minLines, got: lines });
  }
  for (const rule of checks.numbers || []) {
    // {label, value, tolerance, unit} — the answer must state this number.
    const ok = new RegExp(`${rule.value}(\\s*${rule.unit || ""})?`, "i").test(String(answer || ""));
    results.push({ check: "numbers", what: `${rule.label} = ${rule.value} ${rule.unit || ""}`, ok });
  }
  if (checks.json) {
    let ok = true;
    let got = null;
    try {
      got = JSON.parse(answer);
    } catch {
      ok = false;
    }
    results.push({ check: "json", what: "the answer parses as JSON", ok });
    if (ok && checks.json.requiredKeys) {
      for (const key of checks.json.requiredKeys) {
        results.push({ check: "json.requiredKeys", what: key, ok: Object.hasOwn(got, key) });
      }
    }
  }
  return results;
}

function score(results) {
  if (!results.length) return { score: 1, passed: results.length };
  const passed = results.filter((r) => r.ok).length;
  return { score: passed / results.length, passed, total: results.length };
}

export function gradeDeterministic(answer, checks = {}) {
  const results = deterministic(checks, answer);
  const { score: value, passed, total } = score(results);
  return {
    kind: "deterministic",
    score: value,
    passed: passed === total,
    results,
  };
}

// The rubric judge. The model is asked for JSON, and the JSON is parsed
// defensively: a judge that returns prose is a failed judge, not a zero.
export function rubricPrompt(rubric, answer, context = "") {
  const criteria = (rubric.criteria || [])
    .map((c, i) => `${i + 1}. ${c.name} (weight ${c.weight || 1}) — ${c.description || ""}`)
    .join("\n");
  return [
    "You are a strict grader. Score each criterion from 0 to 5, where 0 is absent and 5 is perfect.",
    "Answer with JSON only, in this shape:",
    '{"criteria":[{"index":0,"score":0,"why":"one sentence"}],"verdict":"pass|fail"}',
    "",
    `RUBRIC: ${rubric.name || "unnamed"}${rubric.version ? ` (v${rubric.version})` : ""}`,
    "Pass mark: " + (rubric.passMark ?? PASS_MARK),
    criteria,
    rubric.guardrails ? `\nGuardrails that must hold:\n${rubric.guardrails.map((g) => `- ${g}`).join("\n")}` : "",
    context ? `\nCONTEXT THE ANSWER MUST MATCH:\n${context}` : "",
    "",
    "ANSWER TO GRADE:",
    "---",
    String(answer || ""),
    "---",
  ]
    .filter(Boolean)
    .join("\n");
}

export function parseRubricVerdict(raw, rubric = {}) {
  let obj = null;
  try {
    const match = String(raw || "").match(/\{[\s\S]*\}/);
    if (match) obj = JSON.parse(match[0]);
  } catch {
    obj = null;
  }
  if (!obj || !Array.isArray(obj.criteria)) {
    return { kind: "rubric", score: 0, passed: false, error: "the judge did not return JSON", raw: String(raw || "").slice(0, 400) };
  }
  const criteria = rubric.criteria || [];
  let weight = 0;
  let total = 0;
  const details = obj.criteria.map((c) => {
    const w = (criteria[c.index] && criteria[c.index].weight) || 1;
    const score = Math.max(0, Math.min(5, Number(c.score) || 0));
    weight += w;
    total += score / 5 * w;
    return { index: c.index, name: (criteria[c.index] && criteria[c.index].name) || `criterion ${c.index}`, score, why: c.why || "" };
  });
  const value = weight ? total / weight : 0;
  const passMark = rubric.passMark ?? PASS_MARK;
  return { kind: "rubric", score: value, passed: value >= passMark, passMark, details };
}

export { PASS_MARK };
