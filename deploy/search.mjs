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

// --------------------------------------------------------------- Europe PMC ---

async function europepmc(query, limit) {
  const data = await grab(`https://www.ebi.ac.uk/europepmc/webservices/rest/search?query=${encodeURIComponent(query)}&format=json&pageSize=${limit}&resultType=core`);
  const results = (data.resultList && data.resultList.result) || [];
  if (!results.length) return null;
  return {
    hits: results.map((w) => ({
      title: w.title || "",
      year: w.pubYear || null,
      doi: w.doi || "",
      authors: (w.authorString || "").split(",").map((a) => a.trim()).slice(0, 8),
      url: w.pmid ? `https://europepmc.org/article/MED/${w.pmid}` : "",
      journal: w.journalTitle || "",
      abstract: clip(text(w.abstractText || ""), 400),
    })),
  };
}

// ------------------------------------------------------------------ PubMed ---

async function pubmed(query, limit) {
  const data = await grab(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi?db=pubmed&retmode=json&retmax=${limit}&term=${encodeURIComponent(query)}`);
  const ids = (data.esearchresult && data.esearchresult.idlist) || [];
  if (!ids.length) return null;
  const summary = await grab(`https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esummary.fcgi?db=pubmed&retmode=json&id=${ids.join(",")}`);
  const hits = ids.map((id) => {
    const item = (summary.result && summary.result[id]) || {};
    return {
      title: item.title || "",
      year: (item.pubdate || "").slice(0, 4) || null,
      doi: (item.articleids || []).find((a) => a.idtype === "doi") ? (item.articleids.find((a) => a.idtype === "doi")).value : "",
      authors: (item.authors || []).slice(0, 8).map((a) => a.name),
      url: `https://pubmed.ncbi.nlm.nih.gov/${id}/`,
      journal: item.fulljournalname || "",
    };
  });
  return { hits };
}

// ------------------------------------------------------------ Stack Exchange ---

async function stackexchange(query, limit) {
  const data = await grab(`https://api.stackexchange.com/2.3/search/advanced?order=desc&sort=relevance&q=${encodeURIComponent(query)}&site=chemistry&pagesize=${limit}&filter=default`);
  const items = data.items || [];
  if (!items.length) return null;
  return {
    hits: items.map((w) => ({
      title: w.title,
      score: w.score,
      answers: w.answer_count,
      url: w.link,
      tags: (w.tags || []).slice(0, 5),
      excerpt: clip(text((w.body || "").replace(/<[^>]+>/g, " ")), 240),
    })),
  };
}

// ------------------------------------------------------------ Hacker News ---

async function hackernews(query, limit) {
  const data = await grab(`https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&hitsPerPage=${limit}`);
  const hits = data.hits || [];
  if (!hits.length) return null;
  return {
    hits: hits.map((h) => ({
      title: h.title || h.story_title || "",
      points: h.points,
      comments: h.num_comments,
      url: h.url || `https://news.ycombinator.com/item?id=${h.objectID}`,
      discussion: `https://news.ycombinator.com/item?id=${h.objectID}`,
      when: h.created_at,
    })),
  };
}

// --------------------------------------------------------- Semantic Scholar ---

async function semanticscholar(query, limit) {
  const data = await grab(`https://api.semanticscholar.org/graph/v1/paper/search?query=${encodeURIComponent(query)}&limit=${limit}&fields=title,year,abstract,externalIds,url,authors,citationCount`);
  const data2 = data.data || [];
  if (!data2.length) return null;
  return {
    hits: data2.map((w) => ({
      title: w.title,
      year: w.year,
      doi: (w.externalIds && w.externalIds.DOI) || "",
      citations: w.citationCount,
      authors: (w.authors || []).slice(0, 8).map((a) => a.name),
      url: w.url,
      abstract: clip(text(w.abstract || ""), 400),
    })),
  };
}

// ------------------------------------------------------------- Google Books ---

async function googlebooks(query, limit) {
  const data = await grab(`https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=${limit}`);
  const items = data.items || [];
  if (!items.length) return null;
  return {
    hits: items.map((w) => ({
      title: (w.volumeInfo && w.volumeInfo.title) || "",
      authors: ((w.volumeInfo && w.volumeInfo.authors) || []).slice(0, 6),
      year: (w.volumeInfo && w.volumeInfo.publishedDate || "").slice(0, 4) || null,
      publisher: (w.volumeInfo && w.volumeInfo.publisher) || "",
      isbn: ((w.volumeInfo && w.volumeInfo.industryIdentifiers) || []).map((i) => i.identifier).slice(0, 3),
      url: (w.volumeInfo && w.volumeInfo.infoLink) || "",
    })),
  };
}

// ------------------------------------------------------------------- public ---

// The sources that answer anonymously and have no quota to burn. Everything
// here is reachable without a key: encyclopaedia, preprints, scholarly
// metadata, technical Q&A, and the discussion forums where plant engineers
// actually compare notes.
export const SOURCES = [
  { id: "ddg", label: "DuckDuckGo instant answer", kind: "web" },
  { id: "wikipedia", label: "Wikipedia", kind: "encyclopaedia" },
  { id: "arxiv", label: "arXiv", kind: "papers" },
  { id: "openalex", label: "OpenAlex", kind: "papers" },
  { id: "crossref", label: "Crossref", kind: "papers" },
  { id: "europepmc", label: "Europe PMC", kind: "papers" },
  { id: "pubmed", label: "PubMed", kind: "papers" },
  { id: "stackexchange", label: "Stack Exchange", kind: "technical Q&A" },
  { id: "hn", label: "Hacker News", kind: "discussion" },
  { id: "semanticscholar", label: "Semantic Scholar", kind: "papers" },
  { id: "googlebooks", label: "Google Books", kind: "books" },
];

export async function search(query, { limit = 5 } = {}) {
  const q = String(query || "").trim();
  if (!q) return { query: "", sources: {} };
  const [ddg, wiki, ax, oa, cr, epmc, pm, se, hn, ss, gb] = await Promise.all([
    duckduckgo(q).catch(() => null),
    wikipedia(q).catch(() => null),
    arxiv(q, limit).catch(() => []),
    openalex(q, limit).catch(() => null),
    crossref(q, limit).catch(() => null),
    europepmc(q, limit).catch(() => null),
    pubmed(q, limit).catch(() => null),
    stackexchange(q, limit).catch(() => null),
    hackernews(q, limit).catch(() => null),
    semanticscholar(q, limit).catch(() => null),
    googlebooks(q, limit).catch(() => null),
  ]);
  const sources = {};
  if (ddg) sources.ddg = ddg;
  if (wiki) sources.wikipedia = wiki;
  if (ax && ax.length) sources.arxiv = { hits: ax };
  if (oa) sources.openalex = oa;
  if (cr) sources.crossref = cr;
  if (epmc) sources.europepmc = epmc;
  if (pm) sources.pubmed = pm;
  if (se) sources.stackexchange = se;
  if (hn) sources.hackernews = hn;
  if (ss) sources.semanticscholar = ss;
  if (gb) sources.googlebooks = gb;
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
