# The to-do list

Ordered by dependency. Every item names what "done" means, so it can be
checked rather than argued about. Estimates are in hours of focused work for
one person (or one agent session).

Legend: **P0** blocks the MVP · **P1** needed for the first client ·
**P2** nice to have · ⛔ blocked on an answer from the client.

---

## A. Answers we need before the rest

**Asked on 2026-11-15; the answers so far.** CDA-12 is an ethanol and
n-pentane blend (the client names it; the ratio is still open). The template
goes library first, then generator. Client data stays entirely in the client's
account. The isolation is OpenShell with a policy. The router may use Workers
AI, Gemini, Groq and OpenRouter.

| # | Question | Why it blocks | Default if unanswered |
|---|---|---|---|
| A1 | The **ratio** in the CDA-12 blend, and the assay of the material it carries | every number in the scenario scales with it | 70 % ethanol / 30 % n-pentane by mass (assumption A-01) |
| A2 | The plant's real numbers: carrier volume per week, batch size, throughput, shifts | the mass balance is meaningless without them | one 30 000 L tanker a week in 4 000 L extractions (A-03) |
| A3 | Which solvent and which carrier (ethanol, hexanes, acetone, CO₂)? | changes the whole property model set | ethanol/pentane, as named |
| A4 | What does "sub-zero" mean operationally: −20 °C, −40 °C, or −80 °C, and for how long | sets the heat duty and the energy case | −40 °C, 12 h hold (A-02, A-05) |
| A5 | Is the client's data allowed to sit in our account at all? | **answered: entirely in the client's account** | — |
| A6 | Which model providers may the router use? | **answered: Workers AI, Gemini, Groq, OpenRouter** | — |
| A7 | Browser only, or also a PDF/drawing pack for the plant floor? | decides whether the spec needs a second renderer | browser only |

## B. The spec (L0)

**Done:** `spec/schema.json` is written as the shape in `docs/PLAN.md` §2 and
the validator enforces it; `spec/units.mjs` converts and refuses to invent a
unit; `spec/cda12-subzero.json` is the first real spec and it validates; the
streams are derived from split rules by `sim/derive-streams.mjs`, so the
numbers in it are consistent by construction and the balance closes to 0 %.

| # | Task | Done when | Est |
|---|---|---|---|
| B1 | `spec/schema.json` — the schema above, with types and required fields | a spec that fails the schema is rejected with a useful message | 3 h |
| B2 | `spec/validate.mjs` — the validator: IDs resolve, units known, compositions sum to 1 | **done** — `node spec/validate.mjs spec/cda12-subzero.json` exits 0 | 4 h |
| B3 | `sim/units.mjs` — value/unit pairs, SI ↔ US, mass/flow/pressure/temperature/energy | **done** — round trips exactly; every unit in the spec resolves | 3 h |
| B4 | `spec/skid-sr2.json` — the skid as a spec | it validates, and the numbers match `figures/skid/model.mjs` | 4 h |
| B5 | `spec/cda12-subzero.json` — the MVP preload, from A1–A4 | **done** — it validates, and the five assumptions are marked as assumptions | 3 h |
| B6 | `spec/schema.json` as a real JSON Schema (draft 2020-12) for editor validation | the editor flags a bad spec while it is typed | 3 h |

## C. The generator (L1)

**Done:** `figures/lib/scene.mjs` (one renderer, used by the build and by the
page), `figures/lib/spec-scene.mjs` (the layout: the chain is laid out as a
serpentine, the vessels are sized from the spec, the pipes are routed and
tagged), `figures/blend/build.mjs` (the spec -> the page) and
`figures/blend/live.js` (turning and filtering). The nameplates are placed in
screen space, because text on an isometric face reads the wrong way round at
half the angles.

| # | Task | Done when | Est |
|---|---|---|---|
| C1 | `figures/lib/vessel.mjs` — drum, column, shell-and-tube, vessel with jacket | **done** (in `scene.mjs`): the vessel kinds the spec uses are drawn, with their jacket and their media | 6 h |
| C2 | `figures/lib/piping.mjs` — runs, spools, tri-clamp flanges, insulation | **done**: the runs are routed, flanged and labelled with the spool size | 5 h |
| C3 | `figures/lib/instrument.mjs` — gauges, valves, pumps, heat exchangers | the instruments in the spec are drawn; the gauge and the valve are not yet | 5 h |
| C4 | `figures/lib/label.mjs` — the nameplate: name, ID, size, material | **done**: the nameplate, the stream label and the target call-out | 3 h |
| C5 | The **material register** — a table of every material, ID, CAS, grade, lot, function | **done** in the SOP panel | 3 h |
| C6 | The **filters** — by compound, by function, by colour, by material | **done** for compound, function and colour; the material filter is the same code with one more tag | 5 h |
| C7 | The **rotation** — turn groups, buttons and drag | **done**: the buttons and the arrow keys turn the plant; a drag is still to come | 6 h |
| C8 | The **SOP panel** — the steps, the units, the acceptance criteria, beside the figure | **done**: the steps, the acceptance criteria, the registers and the open assumptions | 4 h |
| C9 | Re-point `figures/skid/build.mjs` at the generator | **not done**: the skid is still hand-drawn geometry. The generator proves itself on the second figure first | 8 h |
| C10 | Make the audit baseline clean | the generator adds 0 new problems; the existing 49/53/225/187/15 either fixed or explicitly waived | 20 h |

## D. The context and the chatbot (L2)

| # | Task | Done when | Est |
|---|---|---|---|
| D1 | `context/from-spec.mjs` — spec → description (the generalisation of `context.mjs`) | any spec produces a description with every number cited | 5 h |
| D2 | The chatbot reads the spec, so it can answer "what is the 13X bed" for *any* experiment | it answers questions about a spec it has never seen | 3 h |
| D3 | The chat panel shows the material register and the SOP | the panel is the front door to the spec | 4 h |
| D4 | The chat exports the spec + the conversation as a handover pack | one download gives the client everything | 2 h |

## E. The simulation (L3)

**Done:** `sim/thermo.mjs` with the NIST Antoine fits
(`sim/data/antoine.json`, fetched by `sim/fetch-nist.mjs`, each row with its
own reference and range), `sim/massbalance.mjs`, `sim/derive-streams.mjs` and
`sim/sim.test.mjs` (11 tests: the boiling points to 0.35 °C, the vapour
pressures to 1 %, the azeotrope comparison, the balance, the units).

| # | Task | Done when | Est |
|---|---|---|---|
| E1 | `sim/thermo.mjs` — vapour pressure (Antoine, with a fitted curve), density, heat capacity, enthalpy of vaporisation | **partly done**: vapour pressure, density, boiling point and the Raoult behaviour; enthalpy of vaporisation and heat capacity still to come | 6 h |
| E2 | `sim/massbalance.mjs` — per-operation balances, with the stream graph | **done** for the mass; the stream graph is not drawn yet | 6 h |
| E3 | `sim/heat.mjs` — duty from mass flow, ΔT and latent heat; the condenser and evaporator | the skid's numbers match the figure's readout | 5 h |
| E4 | `sim/solubility.mjs` — partition of a target between carrier and mother liquor | the CRD split matches the client's plant within their stated tolerance | 6 h |
| E5 | `sim/uncertainty.mjs` — Monte Carlo over the spec's tolerances | the result is a distribution, not a point | 4 h |
| E6 | T1: a numerical integration runner in the sandbox | the sandbox reproduces the T0 numbers for the cases T0 can do | 8 h |
| E7 | T2 (optional): a Modal job for what T0/T1 cannot do | only if a client needs it; the job is scripted and reproducible | 8 h |

## F. The API (L6)

| # | Task | Done when | Est |
|---|---|---|---|
| F1 | `GET /api/search` — free, no key: DuckDuckGo instant answer, Wikipedia, arXiv, OpenAlex, Crossref | one call, several sources, each cited | 4 h |
| F2 | `GET /api/papers` — papers for a topic, with abstract, DOI, and the parameters they report | a paper becomes a model in 20 minutes, not a day | 4 h |
| F3 | `GET /api/route` — the provider router's decision, with its reason | the same task routes the same way every time | 4 h |
| F4 | `POST /api/grade` — deterministic graders, and the rubric grader | a verdict with a reason, stored with the run | 6 h |
| F5 | `POST /api/agent` — run a task through router → provider → grader | one HTTP call runs a task and returns the verdict | 6 h |
| F6 | `GET /api/spec` — the spec, as JSON, with everything derived from it | the page and the API read the same spec | 2 h |
| F7 | Rate limits and the shared-secret guard on the expensive endpoints | a stranger cannot spend the account's quota | 3 h |

## G. The agents (L4)

| # | Task | Done when | Est |
|---|---|---|---|
| G1 | `agents/providers.json` — the provider table: cost, free limit, latency, capabilities, the key env var | the router reads limits from here, not from memory | 2 h |
| G2 | `agents/router.mjs` — the routing rules (task class → provider) | the decision is explainable in one line | 4 h |
| G3 | `evals/rubrics/*.json` — the rubrics, versioned | each rubric has criteria, weights and a pass mark | 4 h |
| G4 | `evals/dev.jsonl`, `evals/heldout.jsonl` — the eval sets | 30 cases each, from the specs we have | 5 h |
| G5 | `evals/run.mjs` — the runner: score, compare, report | `node evals/run.mjs --set heldout` prints a score and a diff | 5 h |
| G6 | The self-improvement loop: accept a change only on dev *and* held-out | the acceptance rule in SOP-5 is enforced by the runner | 5 h |
| G7 | `runs/` — every run recorded | a claim of improvement has a receipt | 2 h |
| G8 | OpenCode wiring: `opencode.jsonc` commands and agents, `AGENTS.md` | `/experiment`, `/grade`, `/search`, `/publish` work in the repo | 3 h |

## H. The sandboxes (L5)

| # | Task | Done when | Est |
|---|---|---|---|
| H1 | The policy per client, generated from the spec's needs | a policy names exactly the hosts a job needs | 3 h |
| H2 | A provider per key, attached per sandbox | no key is ever in a file that is committed | 3 h |
| H3 | The sandbox fan-out: one sandbox per job, namespaced | two jobs cannot see each other's filesystem | 6 h |
| H4 | The tailnet publish of the gateway, documented | any tailnet machine drives the sandbox | 2 h (done) |
| H5 | The isolation ladder option: a Lima/OrbStack VM for the jobs that need it | the option exists and is documented | 6 h |
| H6 | Firecracker on a Linux host | only if a client demands hardware isolation | 12 h + $5 |

## I. The MVP

| # | Task | Done when | Est |
|---|---|---|---|
| I1 | The CDA-12 scenario, modelled, with the placeholders marked | the spec, the figure, the SOP and the numbers agree | 8 h |
| I2 | The client's view: they change a parameter and see the effect | changing the hold time changes the recovery, on screen, in their own account | 8 h |
| I3 | The handover pack: figure, SOP, material register, simulation results, sources | one download; nothing confidential in it | 4 h |
| I4 | A walkthrough with the client | the client can find the number they care about in under a minute | 2 h |

## J. Housekeeping

| # | Task | Done when | Est |
|---|---|---|---|
| J1 | The repo's `AGENTS.md` and `opencode.jsonc` | a new session starts knowing the rules | 1 h |
| J2 | The brand brief in memory and in `docs/brand/` | done | 0.5 h (done) |
| J3 | The CI: build, lines, API tests, evals, deploy | one push tells you if anything broke | 2 h |
| J4 | The cost dashboard: what the free tiers have left this month | a page or a script that prints the remaining allowances | 3 h |
| J5 | The quarterly review: which free tier limits moved, which rubric changed | the plan is updated | 2 h/quarter |

## The critical path

`A1–A4` → `B1–B5` → `C1–C4` → `I1` → `F1–F2` → `I2`.

Everything else can be done in parallel by anyone (or any agent) with the spec
in hand. The critical path is short because the preload is a *design* problem:
once the spec drives the figure, a new experiment is a spec, not a drawing.

---

## Landed on 2026-11-16

- The **legitimacy register** (`figures/lib/legitimacy.mjs`, `/api/legitimacy`):
  the standard, the rule, the evidence and the open question for each part.
- The **safety question list** (`spec.subzero-blend.json`, S-01…S-12), with a
  rule and an owner per question. The judge's safety score moved 2/5 → 3/5.
- **Mermaid**, one diagram per process and one per operation (`/api/mermaid`).
- **References**: PubChem structures and GHS statements (`/api/compound`), and
  the evidence as BibTeX (`/api/references`).
- **Guardrails and trimming** (`deploy/prompt.mjs`): the prompt is the parts
  the question touches, with the rules in front of it.
- **Email and password accounts** (`deploy/auth.mjs`, KV `ACCOUNTS`): signed
  sessions, sealed BYOK keys, and an agent that acts under the person's
  identity. PBKDF2 at 100 000 rounds, because Workers refuses more.
- The **private photograph** in both inspectors: read in the browser, never
  uploaded.
- **n8n self-hosted** on port 5679, workflow imported and executed end to end.
- The **isolated audit**: an OpenShell policy with no network at all.

## Still open

1. A free `PATENTSVIEW_API_KEY` — 0 of 9 topics have patents; Google Patents
   returns 503 from this IP. This is the only thing blocking the patent claim.
2. The client's CDA-12 ratio, assay, plant volumes and sub-zero duty (A1–A4).
3. Thin CBD-crystallisation literature (4 papers, fit 0.33): state it as a
   finding or lean on patents once (1) is done.
4. `CLOUDFLARE_API_TOKEN` in CI, so deploys stop depending on the laptop.
5. The geometry audit baseline in `figures/skid/build.mjs --audit`
   (810 problems: clearance, terminals, sunk pairs, depth order, crowding).
6. A `GITHUB_TOKEN` in the n8n container if the last two workflow nodes
   should open issues and publish reviews.
