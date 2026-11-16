// The evidence: what the literature and the patents say about each part.
//
//   node sim/evidence.mjs [spec.json]
//
// Three sources, none of which needs a key:
//
//   OpenAlex        api.openalex.org      scholarly metadata, abstracts, citations
//   Crossref        api.crossref.org      DOIs and publisher metadata
//   Google Patents  patents.google.com     patents, with the publication number
//
// The retrieval is the point. A claim in a drawing that carries no citation
// is a claim nobody checked, and the whole apparatus here is built so that
// every part of the plant can point at the work that supports it -- and so
// that a part with no support is visible rather than quietly plausible.
//
// The result is written to spec/evidence.json, so the page is built from a
// file, not from a live search, and the same evidence is there next time.

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const UA = "solvent-skid-sr2/1.0 (process design evidence; +https://solvent-skid-sr2.lifecyclerd.workers.dev)";

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
const clip = (value, n) => (value && value.length > n ? `${value.slice(0, n - 1)}…` : value || "");

async function grab(url, { json = true, headers = {}, tries = 5 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    for (let attempt = 1; ; attempt++) {
      const res = await fetch(url, {
        signal: ctrl.signal,
        headers: { "user-agent": UA, accept: json ? "application/json" : "text/html", ...headers },
      });
      if (res.ok) return json ? await res.json() : await res.text();
      // The patent search answers 503 and the scholarly APIs answer 429 when
      // they are asked too often. Both clear if the request waits.
      if (![429, 503].includes(res.status) || attempt >= tries) throw new Error(`${res.status}`);
      await new Promise((resolve) => setTimeout(resolve, 2000 * attempt));
    }
  } finally {
    clearTimeout(timer);
  }
}

async function openAlex(query, limit) {
  const data = await grab(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,doi,title,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index,type`);
  return (data.results || []).map((w) => ({
    kind: "paper",
    source: "openalex",
    title: w.title,
    year: w.publication_year,
    doi: (w.doi || "").replace("https://doi.org/", ""),
    authors: (w.authorships || []).slice(0, 6).map((a) => (a.author && a.author.display_name) || ""),
    citations: w.cited_by_count,
    url: (w.primary_location && w.primary_location.landing_page_url) || w.id,
    abstract: w.abstract_inverted_index ? invert(w.abstract_inverted_index) : "",
  }));
}

function invert(index) {
  const words = [];
  for (const [word, positions] of Object.entries(index || {})) for (const p of positions) words[p] = word;
  return clip(words.filter(Boolean).join(" "), 420);
}

async function crossref(query, limit) {
  const data = await grab(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,issued,container-title,URL,type,publisher`);
  return ((data.message && data.message.items) || []).map((w) => ({
    kind: "paper",
    source: "crossref",
    title: (w.title || [])[0] || "",
    doi: w.DOI || "",
    year: w.issued && w.issued["date-parts"] ? w.issued["date-parts"][0][0] : null,
    authors: (w.author || []).slice(0, 6).map((a) => `${a.given || ""} ${a.family || ""}`.trim()),
    container: (w["container-title"] || [])[0] || "",
    url: w.URL || "",
    type: w.type || "",
  }));
}

async function patents(query, limit) {
  // Two routes. The Google Patents XHR endpoint needs no key but rate-limits
  // hard, and answers 503 once it has been asked a few times in a row. The
  // PatentsView search API has no such limit and needs a free key.
  const withKey = await patentsView(query, limit);
  if (withKey.length) return withKey;
  return googlePatents(query, limit);
}

async function patentsView(query, limit) {
  const key = process.env.PATENTSVIEW_API_KEY;
  if (!key) return [];
  const body = {
    q: { _text_any: { patent_title: query } },
    f: ["patent_id", "patent_title", "patent_date", "patent_abstract"],
    o: { size: limit },
  };
  try {
    const res = await fetch("https://search.patentsview.org/api/v1/patent/", {
      headers: { "X-Api-Key": key, "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(12000),
    });
    if (!res.ok) throw new Error(`${res.status}`);
    const data = await res.json();
    return (data.patents || []).map((p) => ({
      kind: "patent",
      source: "patentsview",
      number: p.patent_id,
      title: text(p.patent_title),
      year: p.patent_date ? String(p.patent_date).slice(0, 4) : null,
      abstract: text(p.patent_abstract),
      url: `https://patents.justia.com/patent/${p.patent_id}`,
    }));
  } catch {
    return [];
  }
}

async function googlePatents(query, limit) {
  const url = `https://patents.google.com/xhr/query?url=${encodeURIComponent(`q=${query}`)}&exp=`;
  try {
    const data = await grab(url, { headers: { accept: "application/json", "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36" }, tries: 4 });
    const results = ((data.results || {}).cluster || []).flatMap((cluster) => cluster.result || []);
    const seen = new Set();
    const out = [];
    for (const item of results) {
      const p = item.patent || {};
      const number = p.publication_number;
      if (!number || seen.has(number)) continue;
      seen.add(number);
      out.push({
        kind: "patent",
        source: "google-patents",
        number,
        title: text(p.title),
        year: p.publication_date ? String(p.publication_date).slice(0, 4) : null,
        assignee: text(p.assignee),
        inventors: (p.inventor || []).slice(0, 5).map((i) => text(i)),
        url: `https://patents.google.com/patent/${number}`,
        abstract: text(p.abstract),
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch {
    return [];
  }
}

/**
 * Relevance.
 *
 * A keyword search returns the neighbours of the subject as readily as the
 * subject: ask about cannabinoid crystallisation and get papers about
 * cannabinoid nanoparticles. So each topic says what a hit has to mention --
 * the first term is the subject, the rest support it. A hit that mentions
 * the subject is on topic; how many of the supporting terms it also hits
 * says how well it fits, and the list is ranked by that.
 */
function relevant(item, must) {
  if (!must || !must.length) return { ok: true, hits: 0, score: 1 };
  const haystack = `${item.title || ""} ${item.abstract || ""} ${item.container || ""}`.toLowerCase();
  const hits = must.filter((term) => haystack.includes(term.toLowerCase()));
  const anchor = must[0].toLowerCase();
  const onSubject = haystack.includes(anchor);
  return { ok: onSubject, hits: hits.length, score: hits.length / must.length };
}

export async function retrieve(topic, { papers = 8, patentCount = 4 } = {}) {
  const query = topic.query;
  const quietly = (label) => (err) => {
    console.error(`  ! ${label} failed: ${err.name} ${err.message}`);
    return [];
  };
  const [oa, cr, pat] = await Promise.all([
    openAlex(query, papers).catch(quietly("openalex")),
    crossref(query, papers).catch(quietly("crossref")),
    patents(query, patentCount).catch(quietly("patents")),
  ]);

  // One list, no duplicates: OpenAlex first, then Crossref, then the patents.
  const seen = new Set();
  const all = [];
  for (const item of [...oa, ...cr, ...pat]) {
    const key = (item.doi || item.number || item.title || "").toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    all.push(item);
  }

  const must = topic.must || [];
  const scored = all.map((item) => ({ item, fit: relevant(item, must) }));
  // The on-topic hits, the best fit first.
  const onTopic = scored
    .filter((s) => s.fit.ok)
    .sort((a, b) => b.fit.hits - a.fit.hits)
    .map((s) => ({ ...s.item, fit: Number(s.fit.score.toFixed(2)) }));
  const neighbours = scored.filter((s) => !s.fit.ok).map((s) => s.item);

  return {
    query,
    why: topic.why || "",
    must,
    papers: onTopic.filter((i) => i.kind === "paper"),
    patents: onTopic.filter((i) => i.kind === "patent"),
    // The neighbours are kept, and shown as such: they are what the search
    // returned, and hiding them would hide how thin the search was.
    neighbours: neighbours.slice(0, 5),
    strength: onTopic.filter((i) => i.kind === "paper").length >= 3 ? "good" : onTopic.length ? "thin" : "none",
    retrieved: new Date().toISOString().slice(0, 10),
  };
}

if (process.argv[1] && process.argv[1].endsWith("evidence.mjs")) {
  const file = process.argv[2] || join(HERE, "..", "spec", "subzero-blend.json");
  const spec = JSON.parse(readFileSync(file, "utf8"));
  const topics = (spec.evidence && spec.evidence.topics) || {};
  const target = file.replace(/\.json$/, "-evidence.json");
  // Whatever has already been retrieved is kept: the patent search rate-limits,
  // so the work is done a topic at a time across runs rather than all at once.
  let out = { source: {}, topics: {} };
  try {
    out = JSON.parse(readFileSync(target, "utf8"));
  } catch {
    out = { source: {}, topics: {} };
  }
  out.source = {
    papers: "OpenAlex (api.openalex.org) and Crossref (api.crossref.org)",
    patents: "Google Patents (patents.google.com), or PatentsView when PATENTSVIEW_API_KEY is set",
    note: "retrieved with sim/evidence.mjs; no key, no account; the patent search is paced and cached because it rate-limits",
  };

  const only = process.argv.find((a) => a.startsWith("--only="))?.slice(7).split(",") ?? null;
  for (const [id, topic] of Object.entries(topics)) {
    if (only && !only.includes(id)) continue;
    const previous = out.topics[id];
    // A topic is kept only when it has both papers and patents: the patent
    // search is the part that fails, so it is the part that is retried.
    if (previous && previous.papers?.length && previous.patents?.length && !only) {
      console.error(`  ${id}: kept (${previous.papers.length} papers, ${previous.patents.length} patents)`);
      continue;
    }
    const result = await retrieve(topic);
    const before = out.topics[id];
    if (before) {
      if (!result.papers.length && before.papers?.length) result.papers = before.papers;
      if (!result.patents.length && before.patents?.length) result.patents = before.patents;
      if (!result.neighbours?.length && before.neighbours?.length) result.neighbours = before.neighbours;
      if (before.strength === "good" && result.strength !== "good") result.strength = before.strength;
    }
    out.topics[id] = result;
    console.error(`  ${id}: ${result.papers.length} papers, ${result.patents.length} patents — ${topic.query}`);
    // The patent search rate-limits, so the topics are asked for one at a time.
    await new Promise((resolve) => setTimeout(resolve, Number(process.env.EVIDENCE_PACE || 9000)));
  }
  writeFileSync(target, `${JSON.stringify(out, null, 1)}\n`);
  console.log(`wrote ${target}`);
}
