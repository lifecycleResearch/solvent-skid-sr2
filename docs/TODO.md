# The to-do list

Ordered by dependency. Every item names what "done" means, so it can be
checked rather than argued about. Estimates are in hours of focused work for
one person (or one agent session).

Legend: **P0** blocks the MVP · **P1** needed for the first client ·
**P2** nice to have · ⛔ blocked on an answer from the client.

---

## A. Answers we need before the rest

| # | Question | Why it blocks | Default if unanswered |
|---|---|---|---|
| A1 | What exactly is **CDA-12**? Trade name, composition (% CBD, THC, CBN), the grade, and who the buyer is | the whole preload scenario is a guess without it | treat it as a generic cannabinoid-rich distillate (CRD) and label it clearly as a placeholder |
| A2 | The plant's real numbers: solvent and carrier volumes per week, batch size, throughput, number of shifts | the mass balance is meaningless without them | use the skid's numbers and mark them as synthetic |
| A3 | Which solvent and which carrier (ethanol, hexanes, acetone, CO₂)? | changes the whole property model set | ethanol, as in the skid |
| A4 | What does "sub-zero" mean operationally: −20 °C, −40 °C, or −80 °C, and for how long | sets the heat duty and the energy case | −40 °C, 12 h hold |
| A5 | Is the client's data allowed to sit in our account at all, or must it be entirely in theirs? | decides the deployment shape | entirely in theirs |
| A6 | Which model providers should the router be allowed to use (a BYOK list is fine) | decides the free-tier budget | Gemini + Groq + OpenRouter free + Workers AI |
| A7 | Does the client want the figure interactive in the browser only, or also as a PDF/drawing pack for the plant floor? | decides whether the spec needs a second renderer | browser only |

## B. The spec (L0)

| # | Task | Done when | Est |
|---|---|---|---|
| B1 | `spec/schema.json` — the schema above, with types and required fields | a spec that fails the schema is rejected with a useful message | 3 h |
| B2 | `spec/validate.mjs` — the validator: IDs resolve, units known, compositions sum to 1 | `node spec/validate.mjs spec/skid-sr2.json` exits 0 on the skid, non-zero with a line number on a broken spec | 4 h |
| B3 | `sim/units.mjs` — value/unit pairs, SI ↔ US, mass/flow/pressure/temperature/energy | round trips exactly; every unit in the spec resolves | 3 h |
| B4 | `spec/skid-sr2.json` — the skid as a spec | it validates, and the numbers match `figures/skid/model.mjs` | 4 h |
| B5 | `spec/cda12-subzero.json` — the MVP preload, from A1–A4 | it validates; the placeholders are marked as placeholders | 3 h |

## C. The generator (L1)

| # | Task | Done when | Est |
|---|---|---|---|
| C1 | `figures/lib/vessel.mjs` — drum, column, shell-and-tube, vessel with jacket | a spec vessel draws itself, with a label and a size | 6 h |
| C2 | `figures/lib/piping.mjs` — runs, spools, tri-clamp flanges, insulation | runs connect two vessels, with the spool size on the label | 5 h |
| C3 | `figures/lib/instrument.mjs` — gauges, valves, pumps, heat exchangers | the instruments in the skid come from the spec | 5 h |
| C4 | `figures/lib/label.mjs` — the nameplate: name, ID, size, material | every item carries its name and its unique ID | 3 h |
| C5 | The **material register** — a table of every material, ID, CAS, grade, lot, function | it is in the page and in `/api/context` | 3 h |
| C6 | The **filters** — by compound, by function, by colour, by material | one click dims everything not in the filter, and the readout says what is on | 5 h |
| C7 | The **rotation** — turn groups, buttons and drag | the plant turns; the audit still passes | 6 h |
| C8 | The **SOP panel** — the steps, the units, the acceptance criteria, beside the figure | the SOP is readable without leaving the page | 4 h |
| C9 | Re-point `figures/skid/build.mjs` at the generator | the skid's drawing is unchanged, byte for byte where it matters | 8 h |
| C10 | Make the audit baseline clean | the generator adds 0 new problems; the existing 49/53/225/187/15 either fixed or explicitly waived | 20 h |

## D. The context and the chatbot (L2)

| # | Task | Done when | Est |
|---|---|---|---|
| D1 | `context/from-spec.mjs` — spec → description (the generalisation of `context.mjs`) | any spec produces a description with every number cited | 5 h |
| D2 | The chatbot reads the spec, so it can answer "what is the 13X bed" for *any* experiment | it answers questions about a spec it has never seen | 3 h |
| D3 | The chat panel shows the material register and the SOP | the panel is the front door to the spec | 4 h |
| D4 | The chat exports the spec + the conversation as a handover pack | one download gives the client everything | 2 h |

## E. The simulation (L3)

| # | Task | Done when | Est |
|---|---|---|---|
| E1 | `sim/thermo.mjs` — vapour pressure (Antoine, with a fitted curve), density, heat capacity, enthalpy of vaporisation | ethanol, acetone, hexanes, toluene within 1 % of the datasheets over the valid range | 6 h |
| E2 | `sim/massbalance.mjs` — per-operation balances, with the stream graph | in = out within 0.5 % for every spec | 6 h |
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
