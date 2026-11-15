// A spec, laid out as a scene.
//
// The layout is derived from the process chain, not typed: the vessels are
// placed in the order the process visits them, the pipe runs are routed from
// one to the next, and every item carries the tags the filters use.
//
// The tags are the point of the exercise:
//
//   data-compound   the target compounds this item touches
//   data-function   heat exchange, storage, separation, reaction, transport
//   data-material   the materials this item holds or carries
//   data-colour     the colour of the stream, so the colour filter is the
//                   same filter
//
// A reader can therefore ask "show me everything that touches the CBD" or
// "show me the heat exchange" and the drawing answers without a second
// drawing being made.

const MM = 0.25; // world units per millimetre, before the scene is scaled

const FUNCTION = {
  drum: "storage",
  tank: "storage",
  "jacketed vessel": "reaction",
  "jacketed vessel with a scraper": "reaction",
  "falling film": "separation",
  "shell and tube": "heat-exchange",
  "air cooled chiller": "heat-exchange",
  "basket strainer": "filtration",
  "drum with media": "separation",
};

const ROW = { storage: 120, reaction: 0, separation: 0, "heat-exchange": -110, filtration: 60 };

function volumeLitres(vessel) {
  if (!vessel.volume) return null;
  const value = vessel.volume.value;
  const unit = vessel.volume.unit;
  if (unit === "L") return value;
  if (unit === "m3") return value * 1000;
  if (unit === "gal" || unit === "gal(US)") return value * 3.785411784;
  if (unit === "mL") return value / 1000;
  return null;
}

/** The radius and height of a vessel, from its dimensions or its volume. */
export function sizeOf(vessel) {
  const litres = volumeLitres(vessel);
  const dims = vessel.dimensions || {};
  let r = null;
  let h = null;
  if (dims.diameter) r = (dims.diameter.value * MM) / 2;
  if (dims.height) h = dims.height.value * MM;
  if (!r && litres) {
    // A drum: assume a height equal to the diameter.
    const volume = litres * 1000; // mm^3
    r = Math.cbrt((volume * 3) / (4 * Math.PI));
    h = 2 * r;
  }
  if (!r) r = 60;
  if (!h) h = 120;
  return { r, h, litres };
}

/** The vessels in the order the process visits them. */
export function chainOf(spec) {
  const produced = new Set();
  for (const step of spec.process || []) for (const id of step.out || []) produced.add(id);
  const feeds = (spec.streams || []).filter((s) => !produced.has(s.id));

  const order = [];
  const seen = new Set();
  const byId = new Map((spec.streams || []).map((s) => [s.id, s]));
  const walk = (streamId) => {
    if (seen.has(streamId)) return;
    seen.add(streamId);
    for (const step of spec.process || []) {
      if (!(step.in || []).includes(streamId)) continue;
      for (const out of step.out || []) {
        if (byId.get(out)) walk(out);
      }
    }
  };
  for (const feed of feeds) walk(feed.id);
  for (const stream of spec.streams || []) walk(stream.id);
  return order;
}

/** Which streams touch which vessel, through the connections. */
function vesselStreams(spec) {
  const streams = new Map((spec.streams || []).map((s) => [s.id, s]));
  const byFlow = new Map();
  for (const stream of spec.streams || []) {
    if (stream.flow) byFlow.set(`${stream.flow.value}${stream.flow.unit}`, stream);
  }
  const touches = new Map();
  for (const connection of spec.connections || []) {
    const stream = (connection.stream && streams.get(connection.stream)) || byFlow.get(`${connection.flow.value}${connection.flow.unit}`);
    for (const vesselId of [connection.from, connection.to]) {
      if (!touches.has(vesselId)) touches.set(vesselId, []);
      if (stream) touches.get(vesselId).push(stream);
    }
  }
  return { touches, streamOf: (connection) => (connection.stream && streams.get(connection.stream)) || byFlow.get(`${connection.flow.value}${connection.flow.unit}`) };
}

/**
 * Build the scene from a spec.
 */
export function sceneOf(spec, { gap = null } = {}) {
  const items = [];
  const vessels = new Map((spec.vessels || []).map((v) => [v.id, v]));
  const { touches, streamOf } = vesselStreams(spec);

  // The scale. A drawing holds the biggest vessel at a fixed size, so the
  // rest is drawn to it: a 30 000 L drum next to a 200 L scrubber has to
  // look like it, and the layout has to fit on the page.
  const sizes = new Map();
  let widest = 0;
  for (const vessel of spec.vessels || []) {
    const size = sizeOf(vessel);
    sizes.set(vessel.id, size);
    widest = Math.max(widest, size.r * 2);
  }
  const SCALE = widest > 0 ? 150 / widest : 1;
  const spacing = gap ?? 150 * 2.3;

  // The order of the vessels: by the first operation that uses them, then by
  // the order they appear in the spec.
  const order = [];
  const seen = new Set();
  for (const step of spec.process || []) {
    for (const id of step.in || []) {
      const stream = (spec.streams || []).find((s) => s.id === id);
      if (!stream) continue;
      for (const connection of spec.connections || []) {
        if (streamOf(connection) !== stream) continue;
        for (const vesselId of [connection.from, connection.to]) {
          if (vessels.has(vesselId) && !seen.has(vesselId)) {
            seen.add(vesselId);
            order.push(vesselId);
          }
        }
      }
    }
  }
  for (const vessel of spec.vessels || []) {
    if (!seen.has(vessel.id)) {
      seen.add(vessel.id);
      order.push(vessel.id);
    }
  }

  // The places. The chain is laid out as a serpentine: four columns, then
  // back along the next row, the way a plant is drawn and the way a P&ID
  // reads. A single row of eleven vessels is a ribbon, not a drawing.
  const places = new Map();
  const columns = Math.min(4, Math.max(2, Math.ceil(order.length / 3)));
  const rowGap = 300;
  order.forEach((id, index) => {
    const vessel = vessels.get(id);
    const fn = FUNCTION[vessel.type] || "storage";
    const size = sizes.get(id);
    const row = Math.floor(index / columns);
    const column = index % columns;
    const serpent = row % 2 === 1 ? columns - 1 - column : column;
    const x = serpent * spacing;
    const y = row * rowGap + (ROW[fn] ?? 0) * 0.25;
    places.set(id, { ...size, x, y, fn, z: 0, r: size.r * SCALE, h: size.h * SCALE, row, column: serpent });
  });

  const compounds = (spec.targets || []).map((t) => t.material);
  const tagsFor = (id) => {
    const vessel = vessels.get(id);
    const streams = touches.get(id) || [];
    const materials = new Set();
    const colours = new Set();
    const compoundsHere = new Set();
    for (const stream of streams) {
      for (const part of stream.composition || []) {
        materials.add(part.material);
        if (compounds.includes(part.material)) compoundsHere.add(part.material);
      }
      if (stream.colour) colours.add(stream.colour);
    }
    const own = (vessel.materials || []).concat(vessel.contains || []);
    for (const material of own) materials.add(material);
    return {
      compound: [...compoundsHere].join(" "),
      function: FUNCTION[vessel.type] || "storage",
      material: [...materials].join(" "),
      colour: [...colours].join(" "),
    };
  };

  // The deck the plant stands on.
  const xs = [...places.values()].map((p) => p.x);
  const minX = Math.min(...xs) - 160;
  const maxX = Math.max(...xs) + 160;
  const deck = {
    kind: "deck",
    id: "deck",
    plan: { x: minX, y: -150, w: maxX - minX, d: 780, r: 12 },
    z: -8,
    h: 6,
    tone: "hi",
    tags: { function: "structure" },
  };
  items.push(deck);

  // The vessels.
  for (const id of order) {
    const vessel = vessels.get(id);
    const place = places.get(id);
    const tags = tagsFor(id);
    const item = {
      kind: "vessel",
      id: vessel.id,
      name: vessel.name,
      at: [place.x, place.y, place.z],
      r: place.r,
      h: place.h,
      tone: "hi",
      type: vessel.type,
      litres: place.litres,
      construction: vessel.material,
      tags,
    };
    if (vessel.jacket && vessel.jacket.duty) {
      item.jacket = { r: place.r * 1.08, h: place.h * 0.7 };
      item.jacketMedium = vessel.jacket.medium;
      item.jacketDuty = vessel.jacket.duty.value;
    }
    if (vessel.type === "drum with media") {
      item.media = { kind: "carbon", fill: 0.8 };
    }
    items.push(item);

    // The nameplate: name, identifier, size, material of construction.
    items.push({
      kind: "label",
      id: `${vessel.id}.name`,
      at: [place.x, place.y, place.z + place.h * 0.5],
      text: `${vessel.name} · ${vessel.id}\n${place.litres ? `${Math.round(place.litres)} L · ` : ""}${vessel.material || ""}`,
      size: Math.max(6, place.r * 0.19),
      emphasis: true,
      tone: "mid",
      tags,
    });

    // A vessel that holds a target says so, in the drawing.
    const target = (spec.targets || []).find((t) => compoundsHereHas(tags, t.material));
    if (target) {
      items.push({
        kind: "label",
        id: `${vessel.id}.target`,
        at: [place.x, place.y, place.z + place.h * 0.24],
        text: `→ ${target.name}`,
        size: Math.max(5, place.r * 0.15),
        tone: "lo",
        tags: { ...tags, compound: target.material },
      });
    }
  }

  // The pipe runs.
  for (const connection of spec.connections || []) {
    const from = places.get(connection.from);
    const to = places.get(connection.to);
    if (!from || !to) continue;
    const stream = streamOf(connection);
    const tags = {
      compound: stream && compounds.filter((c) => (stream.composition || []).some((p) => p.material === c)).join(" "),
      function: "transport",
      material: stream ? (stream.composition || []).map((p) => p.material).join(" ") : "",
      colour: stream && stream.colour ? stream.colour : "",
    };
    const header = Math.max(from.h, to.h) + 45;
    const yRun = from.y + (to.y > from.y ? -from.r - 18 : from.r + 18);
    const points = [
      [from.x, from.y - from.r * 0.2, from.h * 0.8],
      [from.x, from.y - from.r * 0.2, header],
      [from.x, yRun, header],
      [to.x, yRun, header],
      [to.x, to.y - to.r * 0.2, header],
      [to.x, to.y - to.r * 0.2, to.h * 0.8],
    ];
    items.push({
      kind: "pipe",
      id: connection.id,
      points,
      r: 2.2,
      tone: "hi",
      flow: true,
      spool: connection.line && connection.line.spool,
      bore: connection.line && connection.line.bore,
      medium: connection.medium,
      tags,
    });
    items.push({
      kind: "stream-label",
      id: `${connection.id}.label`,
      at: [(from.x + to.x) / 2, yRun, header + 6],
      text: `${stream ? stream.name : connection.id}${connection.line && connection.line.spool ? ` · ${connection.line.spool}` : ""}`,
      size: 9,
      tags,
    });
  }

  // The bounds: everything, so the projection fits.
  const bounds = [];
  for (const place of places.values()) {
    bounds.push([place.x - place.r, place.y - place.r, place.z]);
    bounds.push([place.x + place.r, place.y + place.r, place.z + place.h]);
  }
  bounds.push([deck.plan.x, deck.plan.y, deck.z]);
  bounds.push([deck.plan.x + deck.plan.w, deck.plan.y + deck.plan.d, 0]);

  return {
    version: 1,
    name: spec.meta && spec.meta.name,
    items,
    bounds,
    places: Object.fromEntries([...places].map(([id, place]) => [id, { x: place.x, y: place.y, r: place.r, h: place.h, fn: place.fn }])),
  };
}

function compoundsHereHas(tags, material) {
  return String(tags.compound || "").split(" ").includes(material);
}
