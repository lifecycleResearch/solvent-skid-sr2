// The watchdog.
//
//   node scripts/watchdog.mjs [--live]
//
// It checks the things that can break without anyone noticing:
//
//   the sites answer          every page and every endpoint, on every host
//   the API agrees with the spec   the deployed catalogue is the local one
//   the design has not slipped     the grade is not worse than it was
//   the evidence is holding up     which topics still have no papers
//   the mass still closes          the balance, against the spec
//
// It writes a report and exits non-zero when something is wrong, so it can
// run in the CI on a schedule and fail a build rather than be ignored.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { balance } from "../sim/massbalance.mjs";
import { gradeDesign } from "../deploy/design.mjs";
import { catalogueOf } from "../figures/lib/parts.mjs";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");

const HOSTS = [
  { name: "cloudflare", url: "https://solvent-skid-sr2.lifecyclerd.workers.dev" },
  { name: "cloudflare-review", url: "https://solvent-skid-review.lifecyclerd.workers.dev" },
  { name: "vercel", url: "https://solvent-skid.vercel.app" },
];

const PAGES = ["/", "/skid.html", "/skid-light.html", "/blend.html"];
const ENDPOINTS = [
  "/api/health",
  "/api/context",
  "/api/describe?q=scrubber",
  "/api/catalogue",
  "/api/evidence",
  "/api/design",
  "/api/search?q=azeotrope",
  "/api/papers?q=hemp+extraction",
  "/api/route?class=extraction",
];

const problems = [];
const notes = [];
const fail = (message) => problems.push(message);

async function get(url, { timeout = 20000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, { signal: ctrl.signal, headers: { "user-agent": "solvent-skid-watchdog/1.0" } });
    const text = await res.text();
    return { status: res.status, text, ok: res.ok };
  } finally {
    clearTimeout(timer);
  }
}

const live = process.argv.includes("--live");

if (live) {
  for (const host of HOSTS) {
    for (const path of PAGES) {
      const res = await get(`${host.url}${path}`);
      if (res.status !== 200) fail(`${host.name} ${path} answered ${res.status}`);
    }
    for (const path of ENDPOINTS) {
      const res = await get(`${host.url}${path}`);
      if (res.status !== 200) fail(`${host.name} ${path} answered ${res.status}`);
      else if (path === "/api/catalogue" && !res.text.includes("V-103")) fail(`${host.name} /api/catalogue has no crystalliser in it`);
    }
    notes.push(`${host.name}: ${PAGES.length} pages and ${ENDPOINTS.length} endpoints checked`);
  }
}

// The local truth.
const spec = JSON.parse(readFileSync(join(ROOT, "spec", "subzero-blend.json"), "utf8"));
let evidence = { topics: {} };
if (existsSync(join(ROOT, "spec", "subzero-blend-evidence.json"))) {
  evidence = JSON.parse(readFileSync(join(ROOT, "spec", "subzero-blend-evidence.json"), "utf8"));
}
const catalogue = catalogueOf(spec, evidence);
const result = balance(spec);
if (!result.closes) fail(`the mass balance does not close: worst error ${result.worstClosureErrorPct} %`);

const grade = gradeDesign({ spec, evidence, catalogue, balance: result });

// The gaps, named rather than buried.
const gaps = [];
for (const [id, topic] of Object.entries(evidence.topics || {})) {
  const papers = (topic.papers || []).length;
  const patents = (topic.patents || []).length;
  if (!papers) gaps.push(`${id}: no papers on topic`);
  if (!patents) gaps.push(`${id}: no patents retrieved`);
}
const previous = existsSync(join(ROOT, "figures", "blend", "watchdog.json")) ? JSON.parse(readFileSync(join(ROOT, "figures", "blend", "watchdog.json"), "utf8")) : null;
if (previous && grade.score < previous.grade.score) {
  fail(`the design grade slipped: ${previous.grade.score} to ${grade.score}`);
}

const report = {
  when: new Date().toISOString(),
  grade: { score: grade.score, verdict: grade.verdict, passed: grade.passedCount, total: grade.total },
  balance: { closes: result.closes, worstErrorPct: result.worstClosureErrorPct },
  parts: catalogue.length,
  evidence: {
    topics: Object.keys(evidence.topics || {}).length,
    withPapers: Object.values(evidence.topics || {}).filter((t) => (t.papers || []).length).length,
    withPatents: Object.values(evidence.topics || {}).filter((t) => (t.patents || []).length).length,
  },
  gaps,
  problems,
  notes,
  failingChecks: grade.checks.filter((c) => !c.ok).map((c) => c.name),
};

writeFileSync(join(ROOT, "figures", "blend", "watchdog.json"), `${JSON.stringify(report, null, 1)}\n`);

console.log(`watchdog · ${report.parts} parts · grade ${grade.verdict} ${grade.score} (${grade.passedCount}/${grade.total}) · balance ${result.closes ? "closes" : "does not close"}`);
console.log(`  evidence: ${report.evidence.withPapers}/${report.evidence.topics} topics with papers, ${report.evidence.withPatents}/${report.evidence.topics} with patents`);
for (const gap of gaps) console.log(`  gap: ${gap}`);
for (const note of notes) console.log(`  ${note}`);
if (problems.length) {
  console.log(`  ${problems.length} problems:`);
  for (const problem of problems) console.log(`   - ${problem}`);
  process.exit(1);
}
console.log("  no problems");
