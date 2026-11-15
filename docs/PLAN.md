# The plan: from an experiment's specification to a figure, an SOP and a simulation

**Status:** working draft, 2026-11-15. Every limit in the free-tier table is
marked *verify* where it can change; check it before relying on it.

## 0. What we are building

One system that takes the specification of an experiment and produces, in one
deployment:

1. an **interactive isometric figure** of the plant (the house style: a static
   page with everything inlined, served by a Cloudflare Worker with static
   assets, plus a JSON/SSE API beside it);
2. the **SOP and notes** for it — the specifics a chemist needs: units, vessel
   sizes, tri-clamp spool sizes, every material by name and by unique ID, and
   the operating window for each step;
3. a **simulation** behind it that predicts what you actually get — mass
   balance, vapour pressures, partition behaviour, heat duties — with the
   research trail attached;
4. an **agent** that can design, check, grade and improve all of the above.

The skid SR-2 is the first instance of the template, and the deployed site is
the default deployment style for everything that follows.

### The non-negotiables

* **Free tier first.** A paid service is a decision, not a default.
* **Client data never leaves the client's account.** A client's specification,
  yields and IP live in that client's own Worker account, their own sandbox,
  their own machine. We ship the template, not their data.
* **No npm.** Node built-ins only. The same rule that keeps the anatomy kit
  dependency-free keeps the CI free.
* **Every number is traceable.** A number in the figure comes from the spec, a
  number in the spec comes from a source (a paper, a datasheet, a measurement),
  and the source is cited in the spec.

## 1. The layers

```
  spec/            L0  the experiment, as JSON. The single source of truth.
  figures/         L1  spec -> isometric drawing (the anatomy kit)
  context/         L2  spec -> the description the chatbot and the API answer from
  sim/             L3  spec -> numbers: mass balance, thermodynamics, yields
  agents/          L4  router -> providers -> graders -> self-improvement
  sandboxes/       L5  OpenShell sandboxes, one policy per client/experiment
  deploy/          L6  Worker + static assets (the house style)
```

Each layer only reads the layer below it. The figure never holds a number that
is not in the spec; the chatbot never states a number that is not in the
context; the simulation never reports a result the spec did not ask for.

## 2. L0 — the spec: the template that makes any experiment possible

One schema, used by every experiment. The skid becomes `spec/skid-sr2.json`.

```jsonc
{
  "meta": {
    "id": "EXP-2026-001",
    "name": "Sub-zero CDA-12 extraction",
    "revision": 3,
    "owner": "lifecycleResearch",
    "client": "private",              // never published; see §6
    "units": { "system": "SI", "volume": "L", "pressure": "kPa(abs)", "temperature": "degC" },
    "confidentiality": "CBI-IP"       // controls what may be published
  },

  "materials": [                      // every material, named and identified
    { "id": "MAT-0001", "name": "Ethanol", "cas": "64-17-5", "grade": "SDA 40-B",
      "role": "carrier", "colour": "#74a4ff",
      "hazards": ["flammable"], "source": "supplier quote 2026-03-04" }
  ],

  "media": [                          // adsorbents, sieves, filters — with lots
    { "id": "MED-0001", "name": "Molecular sieve 3A", "lot": "L-2261",
      "function": "water removal", "quantity": { "value": 8, "unit": "kg" },
      "replacement": { "interval": { "value": 6, "unit": "month" },
                       "trigger": "breakthrough 200 ppm water" } }
  ],

  "vessels": [
    { "id": "V-101", "name": "Charge drum", "type": "drum",
      "volume": { "value": 250, "unit": "L" },
      "dimensions": { "diameter": { "value": 572, "unit": "mm" },
                      "height": { "value": 880, "unit": "mm" } },
      "material": "316L", "insulation": "none",
      "jacket": { "medium": "none", "duty": { "value": 0, "unit": "kW" } },
      "isolation": { "kind": "closed", "note": "vented to the scrubber" } }
  ],

  "connections": [                    // pipe runs and spools
    { "id": "P-1001", "from": "V-101", "to": "P-101",
      "line": { "spool": "2\" tri-clamp", "bore": { "value": 50, "unit": "mm" },
                "material": "316L", "insulation": "none" },
      "flow": { "value": 400, "unit": "L/h" }, "medium": "MAT-0001" }
  ],

  "process": [                        // operations, in order, with a window
    { "id": "OP-10", "name": "Cryo precipitation", "kind": "cooling",
      "window": { "T": { "value": -40, "unit": "degC" },
                  "hold": { "value": 12, "unit": "h" } },
      "heat": { "duty": { "value": 18, "unit": "kW" }, "medium": "glycol -45", "dT": 8 },
      "isolation": { "kind": "inert", "note": "nitrogen blanket, O2 below 2 %" } }
  ],

  "streams": [                        // what flows, and what colour it is
    { "id": "S-201", "name": "Mother liquor", "phase": "liquid",
      "composition": [ { "material": "MAT-0001", "fraction": 0.92 },
                       { "material": "MAT-0042", "fraction": 0.08 } ],
      "colour": "#9a9a9a", "flow": { "value": 380, "unit": "L/h" } }
  ],

  "targets": [                        // what the client is actually selling
    { "id": "T-1", "name": "CDA-12", "material": "MAT-0042",
      "isolationStep": "OP-10", "spec": { "purity": { "value": 60, "unit": "%" },
                                          "recovery": { "value": 92, "unit": "%" } },
      "colour": "#6fe0a4" }
  ],

  "sop": {
    "title": "Sub-zero CDA-12 extraction — standard operating procedure",
    "preconditions": [ "..." ],
    "steps": [ { "id": "OP-10", "text": "...", "acceptance": "..." } ],
    "notes": [ { "id": "N-1", "text": "...", "refersTo": "V-101" } ]
  },

  "simulation": {
    "models": [ { "id": "vapour-pressure-antoine", "ref": "sim/thermo.mjs" },
                { "id": "lel-solvent", "ref": "sim/solubility.mjs" } ],
    "parameters": { "...": "..." }
  },

  "sources": [ { "id": "S1", "kind": "paper", "doi": "...", "url": "..." } ]
}
```

### Why the spec has to carry units

Units are not decoration: "the tank" is 250 L or 60 gal, and the whole
simulation changes with it. Every quantity in the spec is a `{value, unit}`
pair, and the renderer converts to whatever unit system the reader is in
(SI / US). `sim/units.mjs` is the only place a conversion happens.

### Why materials get IDs

`MAT-0042` is a molecule in a table; "CDA-12" is a trade name that may mean
five different things to five different people; "hexanes (technical grade)" is
a mixture. The ID is the join key across the spec, the figure, the simulation,
the papers and the purchase order. The figure's material register, the SOP's
materials list and the simulation's composition table all key on it.

### Filters the figure must support

* **by compound** — highlight every part of the plant that touches a chosen
  target (`T-1`), and nothing else;
* **by function** — heat exchange, isolation, separation, storage, transport;
* **by colour** — the stream colours, which are already the drawing's grammar;
* **by material** — every line that carries a given solvent or oil.

These are *views*, not separate drawings: one figure, four filters, and the
readout always says which view is on.

### Rotation

The drawing is isometric and the kit already supports turn groups. The
template adds three rotations — the whole plant about its vertical axis, the
process rack about its long axis, and a cutaway that lifts the shell off a
vessel — exposed as buttons and a drag on the stage. A figure you cannot
rotate hides half of the plant; a figure you can rotate reads like a drawing.

## 3. L1 — the figure generator

Today `figures/skid/build.mjs` draws one specific skid in 849 lines. That
becomes:

* `figures/lib/` — the kit-facing helpers (vessel, pump, exchanger, pipe run,
  instrument, label) that take spec objects;
* `figures/skid/build.mjs` — the skid, now *a spec plus a layout*, not a
  drawing;
* `figures/<experiment>/build.mjs` — any other experiment.

The anatomy kit's audit (`kit/audit.mjs`) is the gate: a generated figure must
pass the line-end check and must not add new clearance, terminal or depth
problems. That is why the generator, not the hand, is where the geometry
improves.

## 4. L2 — the context and the chatbot

`figures/skid/context.mjs` already turns the model into the text the chatbot
answers from. In the template it becomes `context/from-spec.mjs`: spec →
description, so the chatbot describes *any* experiment, with the same
guarantee (every number traceable to the spec).

The chatbot keeps three engines: the local describer (no key, no network), and
Gemini or any OpenAI-compatible endpoint with the visitor's own key.

## 5. L3 — the simulation

Three tiers, chosen by how much they cost:

| Tier | Where | What | Cost |
|---|---|---|---|
| T0 | in the page / Worker | closed-form: Antoine vapour pressure, ideal balances, heat duty from ΔT and mass flow | free, deterministic |
| T1 | sandbox (OpenShell) | numerical integration of the unit operations, Monte Carlo over the spec's uncertainties | free, local CPU |
| T2 | Modal / a rented GPU | literature-parameterised models, CFD-lite, ML surrogates trained on the papers | paid credits, only when T0/T1 are not enough |

T0 is what "as Aspen Plus or better with AI byOK" actually means in practice:
the numbers are right, they are traceable, and they are instant. T2 is for the
cases where a client asks for something the closed form cannot do.

The model registry is the honest part: every model names its source, the range
it is valid over, and its error. A model without a source does not ship.

## 6. L4 — the agents: router, graders, self-improvement

```
    spec  ──▶  router  ──▶  provider A (free tier)  ──┐
                 │                                     ├─▶  grader  ──▶  verdict
                 └──▶  provider B (free tier)  ──┘        │
                                                          └─▶  what changed → prompt/eval update
```

* **Router** — picks a provider from the spec's task class and the keys that
  are present: cheap free model for extraction and formatting, stronger model
  for design review, a local model when nothing may leave the machine. It
  records why it chose.
* **Graders** — two kinds: *deterministic* (does the spec parse, do the
  numbers balance, does the figure pass the audit, does the SOP cover every
  step with an acceptance criterion) and *rubric* (an LLM judge against a
  stored rubric, with the rubric versioned in `evals/rubrics/`).
* **Self-improvement** — the loop is only allowed to change things the graders
  can measure: the prompt, the rubric, the router's weights. A change that
  improves the eval set but not the held-out set is reverted. Every run is
  recorded, so "it got better" is a claim with a receipt.

## 7. L5 — the sandboxes, and the tailnet

One sandbox per client/experiment, each with a policy that names the hosts it
may reach. Today: `skid` reaches Google, Colab, GitHub and the deployed API,
and nothing else. The gateway is published to the tailnet by Tailscale, so the
sandbox is driven from any machine on the tailnet — no box on AWS.

Firecracker is not available on macOS/OrbStack (it needs KVM on Linux). The
equivalent isolation ladder we actually have:

1. **OpenShell sandbox + Landlock + network policy** (in use) — per-process
   filesystem and network confinement;
2. **a separate container per job** inside it;
3. **a Lima/OrbStack VM** for a job that must not share a kernel with the
   others;
4. **a remote Linux host with Firecracker** — only if a client demands a
   hardware-isolated VM, and then it is a day of work and a few dollars.

## 8. L6 — the deployment, and the free-tier budget

| Service | What we use it for | Free allowance |
|---|---|---|
| Cloudflare Workers | the API in front of every figure | 100 000 requests/day, 10 ms CPU/request |
| Cloudflare Workers AI | a model on the same account, no key of our own | 10 000 neurons/day (*verify*) |
| Cloudflare D1 | specs, runs, grader verdicts | 5 M rows read/day, 100 000 writes/day (*verify*) |
| Cloudflare R2 | figures, papers, large artefacts | 10 GB-month free |
| Cloudflare KV | cache and rate limits | 100 000 reads/day (*verify*) |
| Gemini API | the main free model | free tier, rate limited per project (*verify*) |
| Groq | a second opinion, fast | free tier |
| OpenRouter free models | the long tail of models | free models, rate limited |
| GitHub Models | a second free model set | free with a GitHub token |
| DuckDuckGo (instant answer), Wikipedia, arXiv, OpenAlex, Crossref | search and papers, no key, no quota | no key |
| GitHub Actions | CI and the deploy | free for public repositories |
| OrbStack (local) | Docker for the sandboxes | free for personal use |
| OpenShell | the policy-isolated sandboxes | free (Apache-2.0) |
| Tailscale | the private network the sandboxes hang on | free for personal use (100 devices) |
| Modal (optional) | heavy compute when T0/T1 are not enough | free credits, then pay as you go |

Nothing in the default path needs a paid plan. The only paid things in this
plan are a Modal job for a heavy simulation and a domain name.

## 9. The milestones

| # | Milestone | Done when |
|---|---|---|
| M1 | the spec schema and one real spec (the skid) | `spec/skid-sr2.json` validates, and the figure is generated from it |
| M2 | the spec-driven generator | a new experiment is drawn from a spec with no code change |
| M3 | rotation, filters, and the material register | the figure rotates, filters by compound/function/colour, and lists every material by ID |
| M4 | the SOP/notes generator | every experiment ships an SOP with units, sizes and acceptance criteria |
| M5 | T0 simulation | mass balance and heat duty for every step, with sources cited |
| M6 | the API: search, papers, route, grade | `/api/search`, `/api/papers`, `/api/route`, `/api/grade` |
| M7 | the agent loop | a task runs through router → provider → grader, and the verdict is stored |
| M8 | the client-isolation deployment | a client's spec runs in the client's account with a policy that names three hosts |
| M9 | the first preloaded MVP | the sub-zero CDA-12 scenario, simulated, with its SOP |

## 10. The risks

* **Scope.** A spec-driven generator that draws *any* experiment is a year of
  work done badly; a generator that draws the equipment we actually sell
  (drums, membrane modules, sieve stacks, condensers, vacuum sets, heat
  exchangers, piping) is weeks. Recommend the second, and extend it when a
  client pays for an extension.
* **Simulator credibility.** A simulation nobody trusts is worse than none.
  Every model needs a source and a range; T0 must be checked against a real
  plant's numbers before it is shown to a client.
* **Free tiers change.** Quotas move. The router must read the limits from a
  file in the repo, not from memory.
* **The audit.** The geometry audit still reports 49 clearance, 53 terminal,
  225 sunk, 187 depth and 15 crowding problems in the skid. A template that
  reproduces those is a template that ships bad drawings; the generator has to
  start from a clean audit.
