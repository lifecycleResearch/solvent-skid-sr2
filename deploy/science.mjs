// Scientific integrations, and the references.
//
// Three free services, no key:
//
//   PubChem   pubchem.ncbi.nlm.nih.gov   a CAS number becomes a structure:
//                                           a formula, a weight, an InChIKey,
//                                           a SMILES, and the GHS hazard
//                                           statements the label must carry
//   NIST      webbook.nist.gov           the property data the simulation uses
//   Crossref  api.crossref.org            the DOI of every paper
//
// And the export: the evidence a part rests on, as a BibTeX file, so a review
// can cite it and a client can read it.

const CACHE = new Map();

async function grab(url, { json = true, timeout = 12000 } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeout);
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      headers: { "user-agent": "solvent-skid-sr2/1.0 (process design)", accept: json ? "application/json" : "*/*" },
    });
    if (!res.ok) throw new Error(`${res.status}`);
    return json ? await res.json() : await res.text();
  } finally {
    clearTimeout(timer);
  }
}

/**
 * A compound, from its CAS number.
 *
 * The structure is what the label, the hazard statement and the residue
 * specification all hang off, so it is worth resolving once and keeping.
 */
export async function compound(cas) {
  const key = String(cas || "").trim();
  if (!key) return null;
  if (CACHE.has(key)) return CACHE.get(key);
  try {
    const data = await grab(
      `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(key)}/property/MolecularFormula,MolecularWeight,CanonicalSMILES,InChIKey,IUPACName,IsomericSMILES/JSON`,
    );
    const row = (data.PropertyTable && data.PropertyTable.Properties && data.PropertyTable.Properties[0]) || null;
    if (!row) {
      const empty = { cas: key, found: false };
      CACHE.set(key, empty);
      return empty;
    }
    const cid = row.CID;
    let hazards = [];
    try {
      const view = await grab(`https://pubchem.ncbi.nlm.nih.gov/rest/pug_view/data/compound/${cid}/JSON?heading=Safety+and+Hazards`);
      const section = ((view.Record && view.Record.Section) || []).find((s) => s.TOCHeading === "Safety and Hazards");
      const statements = [];
      const walk = (node) => {
        if (!node) return;
        if (Array.isArray(node)) return node.forEach(walk);
        if (node.TOCHeading && node.Information && node.Information.length) {
          const value = String(node.Information[0].Value || "").replace(/<[^>]+>/g, "").trim();
          if (value) statements.push(`${node.TOCHeading}: ${value}`);
        }
        if (node.Section) node.Section.forEach(walk);
      };
      if (section) walk(section);
      hazards = statements.slice(0, 12);
    } catch {
      hazards = [];
    }
    const out = {
      cas: key,
      found: true,
      cid,
      name: row.IUPACName || row.Title || null,
      formula: row.MolecularFormula || null,
      molecularWeight: row.MolecularWeight || null,
      smiles: row.CanonicalSMILES || row.IsomericSMILES || null,
      inchiKey: row.InChIKey || null,
      pubchem: `https://pubchem.ncbi.nlm.nih.gov/compound/${cid}`,
      hazards,
      source: "PubChem (NIH)",
    };
    CACHE.set(key, out);
    return out;
  } catch (err) {
    const empty = { cas: key, found: false, error: String(err.message || err) };
    CACHE.set(key, empty);
    return empty;
  }
}

/** A BibTeX entry for a paper or a patent. */
export function bibtex(item, key) {
  const authors = (item.authors || []).filter(Boolean);
  const author = authors.length ? authors.join(" and ") : item.assignee || "Anonymous";
  if (item.kind === "patent") {
    const key2 = key || `pat${item.number}`;
    return [
      `@patent{${key2}`,
      `  title = {${item.title || item.number}}`,
      `  number = {${item.number || ""}}`,
      `  year = {${item.year || ""}}`,
      `  author = {${author}}`,
      `  url = {${item.url || ""}}`,
      `  note = {Retrieved from Google Patents}`,
      `}`,
    ].join(",\n");
  }
  const key2 = key || `doi${(item.doi || "").replace(/[^A-Za-z0-9]/g, "")}`;
  return [
    `@article{${key2}`,
    `  title = {${item.title || ""}}`,
    `  author = {${author}}`,
    `  year = {${item.year || ""}}`,
    item.container ? `  journal = {${item.container}}` : null,
    item.doi ? `  doi = {${item.doi}}` : null,
    item.url ? `  url = {${item.url}}` : null,
    pages ? `  pages = {${item.pages}}` : null,
    `  note = {Retrieved from ${item.source || "OpenAlex"}}`,
    `}`,
  ]
    .filter(Boolean)
    .join(",\n");
}

/** The evidence of a whole spec, as a BibTeX file. */
export function bibliography(spec, evidence = { topics: {} }) {
  const entries = [];
  const seen = new Set();
  for (const [topicId, topic] of Object.entries(evidence.topics || {})) {
    for (const item of [...(topic.papers || []), ...(topic.patents || [])]) {
      const key = (item.doi || item.number || item.title || "").toLowerCase();
      if (!key || seen.has(key)) continue;
      seen.add(key);
      entries.push(bibtex(item, `${topicId}_${(item.doi || item.number || "x").replace(/[^A-Za-z0-9]/g, "")}`));
    }
  }
  const header = [
    `% ${spec.meta.name} — the references the design rests on`,
    `% ${spec.meta.id} revision ${spec.meta.revision}`,
    `% Generated from the retrieved evidence; see sim/evidence.mjs`,
    "",
  ].join("\n");
  return `${header}${entries.join("\n\n")}\n`;
}
