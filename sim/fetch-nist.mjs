// Fetch the Antoine parameters from the NIST Chemistry WebBook.
//
//   node sim/fetch-nist.mjs > sim/data/antoine.json
//
// The WebBook is free, needs no key, and states its own reference for every
// row. The output keeps that reference and the temperature range, because a
// vapour pressure outside the range it was fitted over is a guess, not a
// number, and the simulation has to be able to say so.

const CASES = [
  { id: "MAT-0001", name: "Ethanol", cas: "64-17-5", nist: "C64175" },
  { id: "MAT-0002", name: "n-Pentane", cas: "109-66-0", nist: "C109-66-0" },
  { id: "MAT-0003", name: "n-Hexane", cas: "110-54-3", nist: "C110-54-3" },
  { id: "MAT-0004", name: "Acetone", cas: "67-64-1", nist: "C67641" },
  { id: "MAT-0005", name: "Toluene", cas: "108-88-3", nist: "C108-88-3" },
  { id: "MAT-0006", name: "Water", cas: "7732-18-5", nist: "C7732-18-5" },
  { id: "MAT-0007", name: "Methanol", cas: "67-56-1", nist: "C67561" },
];

async function antoineRows(nistId) {
  const url = `https://webbook.nist.gov/cgi/cbook.cgi?ID=${encodeURIComponent(nistId)}&Mask=4`;
  const res = await fetch(url, { headers: { "user-agent": "solvent-skid-sr2/1.0" } });
  if (!res.ok) throw new Error(`${nistId}: ${res.status}`);
  const html = await res.text();
  const at = html.indexOf("Antoine Equation Parameters");
  if (at < 0) return [];
  const table = html.slice(at, at + 20000);
  const rows = [];
  const rowRe = /<tr class="exp"><td class="right-nowrap">([\d.]+) to ([\d.]+)<\/td><td class="right-nowrap">(-?[\d.]+)<\/td><td class="right-nowrap">(-?[\d.]+)<\/td><td class="right-nowrap">(-?[\d.]+)<\/td><td[^>]*><a[^>]*>([^<]*)<\/a><\/td>/g;
  let m;
  while ((m = rowRe.exec(table))) {
    rows.push({
      tLowK: Number(m[1]),
      tHighK: Number(m[2]),
      A: Number(m[3]),
      B: Number(m[4]),
      C: Number(m[5]),
      reference: m[6].trim(),
      units: { P: "bar", T: "K" },
    });
  }
  return rows;
}

const out = {
  source: {
    name: "NIST Chemistry WebBook",
    url: "https://webbook.nist.gov/cgi/fluid.cgi",
    note: "Antoine equation parameters, log10(P/bar) = A - B/(T/K + C). Fetched with sim/fetch-nist.mjs.",
  },
  materials: {},
};

for (const entry of CASES) {
  try {
    const rows = await antoineRows(entry.nist);
    if (!rows.length) {
      console.error(`  ! no Antoine rows for ${entry.name} (${entry.nist})`);
      continue;
    }
    // The row that covers the working range — ambient to the boiling point —
    // is the useful one. The WebBook lists several fits per substance, each
    // with its own range and reference; picking the wrong one gives a
    // vapour pressure that is right on paper and wrong in the plant.
    const WORK_LOW = 273.15;
    const WORK_HIGH = 400;
    const overlap = (r) => Math.max(0, Math.min(r.tHighK, WORK_HIGH) - Math.max(r.tLowK, WORK_LOW));
    const best = rows
      .map((r) => ({ r, score: overlap(r) }))
      .sort((a, b) => b.score - a.score || a.r.tLowK - b.r.tLowK)[0].r;
    out.materials[entry.id] = {
      name: entry.name,
      cas: entry.cas,
      nistId: entry.nist,
      nistUrl: `https://webbook.nist.gov/cgi/cbook.cgi?ID=${encodeURIComponent(entry.nist)}&Mask=4`,
      antoine: best,
      allRanges: rows.map((r) => ({ tLowK: r.tLowK, tHighK: r.tHighK, reference: r.reference })),
    };
    console.error(`  ${entry.id} ${entry.name}: ${best.tLowK}-${best.tHighK} K, A=${best.A} B=${best.B} C=${best.C} (${best.reference})`);
  } catch (err) {
    console.error(`  ! ${entry.name}: ${err.message}`);
  }
}

process.stdout.write(`${JSON.stringify(out, null, 2)}\n`);
