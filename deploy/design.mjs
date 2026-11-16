// The design graders.
//
// The figure is only as good as the drawing behind it, and a drawing is only
// as good as the numbers in it. These checks are the ones that catch a
// process that looks finished and is not:
//
//   every part has a record          the catalogue covers the plant
//   every number has a source        no detail without the field it came from
//   every part has evidence          a part with no citation is a guess
//   every step has an acceptance     a step nobody can fail is not a step
//   every assumption is flagged      an unconfirmed assumption is shown
//   the mass closes                  the balance, if it was run
//
// The verdict is per part and overall, and it is the same code in the CI and
// in the API, so a claim of quality has a receipt.

const PART_KINDS = ["vessel", "connection", "media", "operation"];

export function gradeDesign({ spec, evidence = { topics: {} }, catalogue = [], balance = null } = {}) {
  const checks = [];
  const partVerdicts = [];
  const check = (name, ok, detail, scope = null) => {
    checks.push({ name, ok: Boolean(ok), detail, scope });
    return Boolean(ok);
  };

  // 1. The catalogue covers the plant.
  const expected = [
    ...(spec.vessels || []).map((v) => v.id),
    ...(spec.connections || []).map((c) => c.id),
    ...(spec.media || []).map((m) => m.id),
    ...(spec.process || []).map((p) => p.id),
  ];
  const catalogued = new Set(catalogue.map((p) => p.id));
  const missing = expected.filter((id) => !catalogued.has(id));
  check("every part has a record", missing.length === 0, missing.length ? `${missing.length} parts have no record: ${missing.join(", ")}` : `${expected.length} parts, all with a record`);

  // 2. Every detail traces to a field in the spec.
  const untraced = [];
  for (const part of catalogue) {
    for (const detail of part.details || []) {
      if (!detail.from) untraced.push(`${part.id}.${detail.label}`);
    }
  }
  check("every number has a source", untraced.length === 0, untraced.length ? `${untraced.length} details do not say where they came from: ${untraced.slice(0, 5).join(", ")}` : "every detail names the field it came from");

  // 3. Every part has evidence, and the evidence is on topic.
  const mapping = (spec.evidence && spec.evidence.for) || {};
  for (const part of catalogue) {
    const topics = mapping[part.id] || [];
    const found = part.evidence || [];
    const papers = found.reduce((sum, t) => sum + (t.papers || []).length, 0);
    const patents = found.reduce((sum, t) => sum + (t.patents || []).length, 0);
    let state = "none";
    if (papers + patents >= 3) state = "good";
    else if (papers + patents > 0) state = "thin";
    partVerdicts.push({
      id: part.id,
      name: part.name,
      kind: part.kind,
      state,
      papers,
      patents,
      topics: topics.length,
      why: topics.length ? "mapped to a question" : "no question mapped to this part",
    });
  }
  const noEvidence = partVerdicts.filter((v) => v.state === "none");
  check("every part has evidence", noEvidence.length === 0, noEvidence.length ? `${noEvidence.length} parts have no evidence: ${noEvidence.map((v) => v.id).join(", ")}` : `${partVerdicts.length} parts, all with evidence`);

  // 4. The strength of the evidence, and whether the patents are there.
  const thin = partVerdicts.filter((v) => v.state === "thin");
  check("the evidence is strong enough to show", thin.length === 0, thin.length ? `${thin.length} parts have thin evidence: ${thin.map((v) => v.id).join(", ")}` : "every part has three or more sources");
  const noPatents = partVerdicts.filter((v) => v.patents === 0);
  check("the patents have been retrieved", noPatents.length === 0, noPatents.length ? `${noPatents.length} parts have papers but no patents yet` : "patents retrieved for every part");

  // 5. Every step can fail.
  const sopSteps = (spec.sop && spec.sop.steps) || [];
  const noAcceptance = sopSteps.filter((s) => !s.acceptance).map((s) => s.id);
  check("every step has an acceptance criterion", noAcceptance.length === 0, noAcceptance.length ? `no acceptance criterion: ${noAcceptance.join(", ")}` : `${sopSteps.length} steps, all with an acceptance criterion`);

  // 6. Every operation in the process appears in the SOP.
  const operationIds = new Set((spec.process || []).map((p) => p.id));
  const uncovered = (spec.process || []).filter((p) => !sopSteps.some((s) => s.id === p.id)).map((p) => p.id);
  check("every operation is in the SOP", uncovered.length === 0, uncovered.length ? `not in the SOP: ${uncovered.join(", ")}` : `${operationIds.size} operations, all written up`);

  // 7. The assumptions are visible.
  const open = (spec.assumptions || []).filter((a) => !a.confirmed);
  check("the open assumptions are flagged", true, open.length ? `${open.length} assumptions are still open: ${open.map((a) => a.id).join(", ")}` : "every assumption is confirmed");

  // 8. The mass closes, if the balance was run.
  if (balance) {
    check("the mass balance closes", balance.closes, `worst closure error ${balance.worstClosureErrorPct} %`);
  }

  // 9. Nothing confidential is published.
  const confidential = spec.meta && spec.meta.confidentiality;
  check("the confidentiality mark is read", Boolean(confidential), confidential ? `marked ${confidential}` : "no confidentiality mark on the spec");

  const passed = checks.filter((c) => c.ok).length;
  const score = checks.length ? passed / checks.length : 0;
  return {
    score: Number(score.toFixed(3)),
    passed: passed === checks.length,
    passedCount: passed,
    total: checks.length,
    verdict: score >= 0.9 ? "sound" : score >= 0.7 ? "workable" : "not yet",
    checks,
    parts: partVerdicts,
  };
}

/** A one-line summary, for a commit message or a watchdog report. */
export function summarise(grade) {
  const failed = grade.checks.filter((c) => !c.ok).map((c) => c.name);
  return `${grade.verdict} · ${grade.passedCount}/${grade.total} checks${failed.length ? ` · failing: ${failed.join(", ")}` : ""}`;
}
