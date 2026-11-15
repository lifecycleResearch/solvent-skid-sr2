// Search and papers, with no key and no account.
//
// Every source here answers anonymously and has no quota to burn:
//
//   DuckDuckGo  api.duckduckgo.com      instant answers and abstracts
//   Wikipedia   en.wikipedia.org        the encyclopaedia summary
//   arXiv       export.arxiv.org        preprints
//   OpenAlex    api.openalex.org        scholarly metadata and citations
//   Crossref    api.crossref.org        DOIs and publisher metadata
//
// The Worker calls this; the same functions work in a sandbox or on a laptop,
// which matters because a client's research may never leave their machine.

const UA = "solvent-skid-sr2/1.0 (research assistant; +https://solvent-skid-sr2.lifecyclerd.workers.dev)";

async function grab(url, { timeout = 8000, type = "json" } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": UA, accept: type === "json" ? "application/json" : "*/*" },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return type === "json" ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

const text = (value) => String(value || "").replace(/\s+/g, " ").trim();
const clip = (value, n) => (value && value.length > n ? `${value.slice(0, n - 1)}…` : value || "");

// --------------------------------------------------------------- DuckDuckGo ---

async function duckduckgo(query) {
  const data = await grab(`https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`);
  const out = {
    abstract: text(data.AbstractText),
    abstractSource: text(data.AbstractSource),
    answer: text(data.Answer),
    definition: text(data.Definition),
    related: (data.RelatedTopics || []).slice(0, 5).map((r) => text(r.Text)).filter(Boolean),
    url: data.AbstractURL || "",
  };
  return out.abstract || out.answer || out.definition ? out : null;
}

// ---------------------------------------------------------------- Wikipedia ---

async function wikipedia(query) {
  const data = await grab(`https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&list=search&srsearch=${encodeURIComponent(query)}&srlimit=4`);
  const hits = (data.query && data.query.search) || [];
  if (!hits.length) return null;
  return {
    hits: hits.map((h) => ({
      title: h.title,
      snippet: clip(text(h.snippet.replace(/<[^>]+>/g, "")), 220),
      pageid: h.pageid,
    })),
  };
}

// -------------------------------------------------------------------- arXiv ---

const tag = (xml, name) => {
  const m = xml.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? text(m[1].replace(/<[^>]+>/g, "")) : "";
};

async function arxiv(query, limit) {
  const xml = await grab(`http://export.arxiv.org/api/query?search_query=all:${encodeURIComponent(query)}&start=0&max_results=${limit}`, { type: "text" });
  const entries = xml.split("<entry>").slice(1);
  return entries.map((entry) => {
    const id = tag(entry, "id");
    return {
      title: tag(entry, "title"),
      authors: (entry.match(/<name>([\s\S]*?)<\/name>/g) || []).map((n) => text(n.replace(/<\/?name>/g, ""))).slice(0, 8),
      published: tag(entry, "published").slice(0, 10),
      summary: clip(tag(entry, "summary"), 400),
      url: id,
      doi: (entry.match(/<arxiv:doi[^>]*>([\s\S]*?)<\/arxiv:doi>/i) || [])[1] || "",
      categories: (entry.match(/<category[^>]*term="([^"]+)"/g) || []).map((c) => (c.match(/term="([^"]+)"/) || [])[1]).slice(0, 4),
    };
  });
}

// ----------------------------------------------------------------- OpenAlex ---

async function openalex(query, limit) {
  const data = await grab(`https://api.openalex.org/works?search=${encodeURIComponent(query)}&per-page=${limit}&select=id,doi,title,publication_year,authorships,primary_location,cited_by_count,abstract_inverted_index`);
  const works = data.results || [];
  if (!works.length) return null;
  return {
    hits: works.map((w) => ({
      title: w.title,
      year: w.publication_year,
      doi: (w.doi || "").replace("https://doi.org/", ""),
      authors: (w.authorships || []).slice(0, 8).map((a) => (a.author && a.author.display_name) || ""),
      citations: w.cited_by_count,
      url: (w.primary_location && w.primary_location.landing_page_url) || w.id,
      abstract: w.abstract_inverted_index ? invert(w.abstract_inverted_index) : "",
    })),
  };
}

function invert(index) {
  const words = [];
  for (const [word, positions] of Object.entries(index || {})) {
    for (const p of positions) words[p] = word;
  }
  return clip(words.filter(Boolean).join(" "), 400);
}

// ----------------------------------------------------------------- Crossref ---

async function crossref(query, limit) {
  const data = await grab(`https://api.crossref.org/works?query=${encodeURIComponent(query)}&rows=${limit}&select=DOI,title,author,issued,container-title,URL,abstract`);
  const items = (data.message && data.message.items) || [];
  if (!items.length) return null;
  return {
    hits: items.map((w) => ({
      title: (w.title || [])[0] || "",
      doi: w.DOI || "",
      container: (w["container-title"] || [])[0] || "",
      year: (w.issued && w.issued["date-parts"] && w.issued["date-parts"][0] && w.issued["date-parts"][0][0]) || null,
      authors: (w.author || []).slice(0, 8).map((a) => `${a.given || ""} ${a.family || ""}`.trim()),
      url: w.URL || "",
      abstract: clip(text((w.abstract || "").replace(/<[^>]+>/g, "")), 400),
    })),
  };
}

// ------------------------------------------------------------------- public ---

export async function search(query, { limit = 5 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { query: "", sources: {} };
  const [ddg, wiki, ax, oa, cr] = await Promise.all([
    duckduckgo(q).catch(() => null),
    wikipedia(q).catch(() => null),
    arxiv(q, limit).catch(() => []),
    openalex(q, limit).catch(() => null),
    crossref(q, limit).catch(() => null),
  ]);
  const sources = {};
  if (ddg) sources.ddg = ddg;
  if (wiki) sources.wikipedia = wiki;
  if (ax && ax.length) sources.arxiv = { hits: ax };
  if (oa) sources.openalex = oa;
  if (cr) sources.crossref = cr;
  return { query: q, sources };
}

export async function papers(query, { limit = 8 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { query: "", papers: [] };
  const [ax, oa, cr] = await Promise.all([
    arxiv(q, limit).catch(() => []),
    openalex(q, limit).catch(() => null),
    crossref(q, limit).catch(() => null),
  ]);
  const merged = [];
  const seen = new Set();
  const push = (paper, source) => {
    const key = (paper.doi || paper.url || paper.title || "").toLowerCase();
    if (!key || seen.has(key)) return;
    seen.add(key);
    merged.push({ source, ...paper });
  };
  for (const paper of ax) push(paper, "arxiv");
  for (const paper of (oa && oa.hits) || []) push(paper, "openalex");
  for (const paper of (cr && cr.hits) || []) push(paper, "crossref");
  return { query: q, papers: merged.slice(0, limit * 2) };
}
