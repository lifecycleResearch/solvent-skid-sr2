# Solvent recovery skid SR-2

An interactive isometric figure of a solvent-recovery and fractionation skid for
botanical extraction, built with the **anatomy** skill's kit (in `kit/`), with a
chatbot that knows the plant, deployed to Cloudflare.

**Live:** https://solvent-skid-sr2.lifecyclerd.workers.dev
(light theme with a dark switch · `/skid.html` dark · `/skid-light.html` light)

**Where it is deployed**

| | | |
|---|---|---|
| Cloudflare, in use | https://solvent-skid-sr2.lifecyclerd.workers.dev | the Worker with the AI binding: the chat has Workers AI, which needs no key |
| Cloudflare, for review | https://solvent-skid-review.lifecyclerd.workers.dev | the same Worker under a second name, so there is a URL to look at that is not the one in use |
| Vercel, the company account | https://solvent-skid.vercel.app | the same figure and the same API, on `superiorchem-4317` |

The Vercel deployment runs `deploy/worker.js` through `api/worker.js`, which
is the same handler with the request and the response adapted, so the two
deployments cannot drift apart. The one thing that does not travel is Workers
AI: it is a Cloudflare binding, so on Vercel the chat offers the local
describer and your own key, and the chat hides the engine it cannot serve.


## What the skid does

Feed drum → pneumatic diaphragm pump → basket strainer → cross-flow **membrane
module (0.001 µm / 1 nm pore)** → **CRC carbon bed** → a three-valve routing
block → a **molecular sieve stack, 3A → 4A → 5A → 13X**, each bed with its own
media window, isolation valve and collection can → vacuum evaporator → a
four-shell condenser bank → a **1, 2 or 3-stage vacuum set** (two rotary-vane
pumps and a pneumatic booster) → a **gas scrubber** holding CRC carbon,
activated carbon and zeolite 13X → the exhaust stack.

Two setups, chosen by the valves:

* **PURE SOLVENT** — the permeate, stripped of its last cannabinoids by the
  carbon bed, is dried on the sieve stack and returns to the tank; the rich
  retentate goes straight to the product drum.
* **PURE PRODUCT** — the retentate is stripped of its solvent in the vacuum
  evaporator, the vapour is condensed in the four shells and dried on the sieve
  before it returns, and the cannabinoid residue is left in the drum.

Keys: `1`/`2` setup, `3`/`4`/`5` vacuum stage, `B` cuts the highlighted bed into
its can. Clicking a bed or a button does the same thing. The readout's boil
temperature follows ethanol's vapour pressure (`ln P = 21.446 − 5105/T`): 35 mbar
boils at +12 °C, 8 mbar at −10 °C, 1.5 mbar at −31 °C.

## The chatbot

The figure carries a plant engineer in the corner: **Ask the skid**.

* **Local describer** (the default, no key, no network) — answers from the
  plant's own numbers: the two setups, the sieve cuts, the vacuum sets, the
  membrane, the condenser bank, the scrubber, the controls and the audit.
* **Workers AI** (no key) — the model that comes with this site's Cloudflare
  account. Nothing to sign up for.
* **Gemini** or **OpenAI-compatible** — put your own key in the ⚙ panel
  (BYOK). The key is kept in that browser's `localStorage` and is sent only
  with the request that needs it; it is never in the figure or the repository.

The chat knows what the drawing is showing: every turn carries the current
setup, vacuum stage and which beds are cut, so the answers match the picture.
It can also drop the whole conversation as Markdown notes (**download notes**).

## The API

The same description is an API, so anything can ask the plant questions:

| | |
|---|---|
| `GET /api/context` | the plant's description, as JSON (`figures/skid/context.mjs` is the source) |
| `GET /api/describe?q=…` | the same, in prose; `?q=` asks a question |
| `POST /api/chat` | a chat completion, streamed back as SSE |
| `GET /api/search?q=…` | free search, no key: DuckDuckGo, Wikipedia, arXiv, OpenAlex, Crossref |
| `GET /api/papers?q=…` | papers only, with DOI, abstract and authors |
| `GET /api/route?class=…` | which model would answer a task, and why |
| `POST /api/grade` | deterministic graders, then a rubric judge |
| `GET /api/health` | what the Worker can do, and which keys it holds |
| `POST /api/agent` | forwarded to the agent gateway, if one is configured |

```bash
curl https://solvent-skid-sr2.lifecyclerd.workers.dev/api/context | jq .summary
curl -s "https://solvent-skid-sr2.lifecyclerd.workers.dev/api/describe?q=what+does+the+13X+bed+take" | jq -r .answer
curl -s "https://solvent-skid-sr2.lifecyclerd.workers.dev/api/papers?q=supercritical+CO2+extraction+cannabis" | jq '.papers[0]'
curl -s "https://solvent-skid-sr2.lifecyclerd.workers.dev/api/route?class=design-review" | jq .decision
curl -N https://solvent-skid-sr2.lifecyclerd.workers.dev/api/chat \
  -H 'content-type: application/json' \
  -d '{"provider":"workers-ai","messages":[{"role":"user","content":"walk me through the pure product setup"}]}'
```

`/api/chat` relays **your** key. If the Worker holds a key of its own it only
uses it when the request carries the shared secret
(`x-chat-secret`), so a deployed key is never spent by a stranger.

## The template: a spec, drawn

The skid is the first instance of a template. The second instance is the
worked example, and it comes in two forms:

* **`/blend.html`** — the drawn spec: the sub-zero blend extraction, drawn
  from `spec/subzero-blend.json` and nothing else.
* **`/blend3d.html`** — the same plant in three dimensions, by the anatomy
  kit's own 3D engine: every part is re-projected and re-shaded each frame and
  the draw order is solved from separating planes, so the plant is drawn
  correctly from any angle.

```bash
node figures/blend/build.mjs      # the spec -> the drawing
node figures/blend3d/build.mjs     # the spec -> the plant in three dimensions
```

* **Turn it.** Drag the plant: sideways turns it, up and down tips it. A turn
  is a redraw, not a picture turned round.
* **Click it.** Every part opens its record: what it is, what it does, the
  details that make it this part — each with the spec field it came from —
  and its application in this process: the steps, the streams in and out, the
  targets, the notes and the acceptance criterion.
* **Filter it.** By compound (which parts of the plant touch the CBD), by
  function (heat exchange, storage, reaction, separation, pipe runs,
  filtration) or by colour. What is not in the filter is dimmed, not hidden:
  the plant is still there, the reader is looking at one part of it.
* **Name everything.** Every vessel carries its name, its identifier, its
  volume and its material of construction. Every pipe carries the stream and
  the tri-clamp spool size. The SOP panel holds the steps, their acceptance
  criteria, the material register, the vessel register and the assumptions
  that are still open.
* **Check it.** The review panel shows the design grade — every part has a
  record, every number has a source, every part has evidence, every step can
  fail, the mass closes — and the state of the evidence part by part.

The drawing code lives in `figures/lib/scene.mjs` and is used twice: by the
build, to draw the static page, and by the page, to redraw it. One renderer,
so the two can never disagree.

## The evidence

The proof behind each part is retrieved, not asserted.

```bash
node sim/evidence.mjs spec/subzero-blend.json
```

It asks **OpenAlex**, **Crossref** and **Google Patents** (or **PatentsView**,
when `PATENTSVIEW_API_KEY` is set) the questions the spec says each part has
to be able to answer, and filters the hits by the subject: a keyword search
returns the neighbours of the subject as readily as the subject, so each topic
names the subject and the supporting terms, and a hit that misses the subject
is kept as a neighbour and shown as one.

The API serves it: `/api/evidence` (everything), `/api/evidence?topic=…` (one
question), `/api/catalogue` (the parts), `/api/catalogue?id=V-103` (one
part), `/api/design` (the grade).

## The review, and the judge on top of it

The **deterministic checks** are the floor: every part has a record, every
number has a source, every part has evidence, every step can fail, every
operation is written up, the assumptions are flagged, the mass closes. The
review panel shows the verdict and the state of the evidence part by part, and
the same grade is what the CI computes and what `/api/design` serves.

The **rubric judge** is the judgement on top of it. The rubric is in
`evals/rubrics/design.json`: do the flows make chemical sense, is the
operating window defensible, is the separation the hard part and is it
answered, does the evidence support the design, is anything overstated, are
safety and compliance addressed, could it be built. The judge sees the
specification and the record, not the drawing.

It runs on Workers AI where that binding exists — so on Cloudflare it works
with nothing set up — and on the visitor's key elsewhere. Ask for it from the
review panel, or:

```bash
curl "https://solvent-skid-sr2.lifecyclerd.workers.dev/api/design?judge=1" | jq .rubric
```

Its first verdict on our own design was **0.74 against a pass mark of 0.75**,
and the sharpest thing it said was the thing we already knew: safety and
compliance scored 2 of 5, because the specification has no safety section.
That is the next thing to write.

## One app, any spec

The build takes the experiment as an argument:

```bash
node figures/blend/build.mjs --spec ../spec/other.json      # the drawing
node figures/blend3d/build.mjs --spec ../spec/other.json     # the 3D plant
```

Each build writes its artefacts under the spec's own slug — the figure, the
3D plant, the catalogue, the evidence, the grade, the spec — and the
deployment carries a manifest. The API serves any of them:
`/api/specs`, `/api/catalogue?spec=…`, `/api/evidence?spec=…`,
`/api/design?spec=…`.

## The spec and the simulation

The skid is the first instance of a template: an experiment written down as
data, then drawn, described and computed from that data.

```bash
node spec/validate.mjs spec/subzero-blend.json     # does it hold together?
node sim/derive-streams.mjs spec/subzero-blend.json # compute the streams
node sim/massbalance.mjs spec/subzero-blend.json    # does the mass close?
node --test sim/sim.test.mjs                        # the physics
```

The simulation is tier T0: deterministic, free, and checked against published
values. The vapour pressures come from the NIST Chemistry WebBook, each fit
carrying its own reference and its own temperature range
(`sim/fetch-nist.mjs` fetches them; `sim/data/antoine.json` holds them). The
tests check the fits against the published boiling points — ethanol 78.30 °C
against 78.37, n-pentane 36.07 against 36.07, hexane 68.74 against 68.74,
acetone 56.27 against 56.05, toluene 110.62 against 110.6 — and against the
published vapour pressures.

The worked example is a sub-zero ethanol/pentane extraction, and it carries
one finding worth reading before it is shown to anyone: **ethanol and
n-pentane form a minimum-boiling azeotrope at 34.3 °C with 95 % pentane by
mass.** Raoult's law cannot see it — the ideal prediction degenerates to pure
pentane — so the recovery column has to be stopped by assay, not by
temperature. That is now an acceptance criterion in the SOP.

A client's own numbers never come here: this repository is public (private
repositories get no free CI runners), so a client's spec goes in `.private/`,
which is git-ignored, or in the client's own account.

## The agent, on the tailnet

The OpenShell sandbox that builds the figure and talks to Google runs on this
machine and is published to the tailnet by Tailscale, so any device on the
tailnet can drive it — no box on AWS:

```bash
tailscale serve --bg --tcp=17670 tcp://127.0.0.1:17670
openshell gateway add http://richards-macbook-air-1.tailbe58ee.ts.net:17670
openshell -g richards-macbook-air-1.tailbe58ee.ts.net sandbox exec skid -- sh -lc 'node --version'
```

Inside the sandbox the policy allows Google (Gemini's free tier), Colab,
GitHub and the deployed figure API — and nothing else. `openshell/README.md`
has the whole story, including how the Gemini key is injected by an OpenShell
provider instead of being written into a file, and `openshell/skid_colab.ipynb`
is the Colab notebook that clones the repo, builds the figure and asks the
plant questions.

## Layout of the repo

| Path | What |
|---|---|
| `figures/skid/build.mjs` | the build: geometry, layout, the audit hook |
| `figures/skid/model.mjs` | the truth: numbers, vacuum sets, sieve cuts, setups |
| `figures/skid/context.mjs` | the plant written down: the chatbot's ground truth |
| `figures/skid/live.js` | the live behaviour: valve levers, needle, flow, tour |
| `figures/skid/chat.js`, `chat.css` | the chatbot |
| `figures/skid/skid.css` | stream colours, media tints, panel and buttons |
| `figures/skid/build-index.mjs` | writes the deploy index (the figure + theme switch) |
| `deploy/worker.js` | the Worker: chat, context, describe, search, papers, route, grade |
| `deploy/describe.mjs` | the describer, shared by the page and the Worker |
| `deploy/search.mjs` | free search and papers, with no key |
| `deploy/router.mjs`, `agents/providers.json` | the provider router and its table |
| `deploy/grade.mjs` | the deterministic graders and the rubric judge |
| `deploy/` | `wrangler.jsonc` and `public/` |
| `openshell/` | the sandbox policy, image, README and Colab notebook |
| `docs/` | the plan, the SOP, the to-do list, the brand brief |
| `kit/`, `scripts/` | the anatomy kit (vendored so CI can rebuild without npm) |
| `.github/workflows/deploy.yml` | build, check, test, deploy on push |
| `AGENTS.md`, `opencode.jsonc` | the repository's rules and OpenCode wiring |

## Build and deploy

```bash
node figures/skid/build.mjs            # dark theme  -> figures/skid/skid.html
node figures/skid/build.mjs --light    # light theme -> figures/skid/skid-light.html
node figures/skid/build-index.mjs      # -> deploy/public/index.html + skid-context.json
node figures/skid/build.mjs --audit    # the geometry audit
node scripts/lines.mjs deploy/public/skid-light.html   # the line-end check
cd deploy && wrangler deploy
```

No npm and no dependencies: the kit is Node built-ins only.

## State of the checks

* `scripts/lines.mjs` prints **line ends: 0** on both themes.
* `build.mjs --audit` still reports geometry the kit's checks do not accept
  yet: clearance, terminals, sunk pairs, depth order and crowding, mostly in
  the condenser rack where the hangers, the link flanges and the shells
  interlock, and where a few pipe ends land near rather than exactly on their
  bosses. Those are the next things to fix, in the geometry rather than in the
  painter's keys.

## One thing left for you

The CI deploy step needs a Cloudflare API token, which cannot be minted from
the Wrangler OAuth token. Create one at dash.cloudflare.com → Profile → API
Tokens → **Edit Cloudflare Workers**, then:

```bash
gh secret set CLOUDFLARE_API_TOKEN --repo lifecycleResearch/solvent-skid-sr2
```

Until that secret exists the deploy step fails harmlessly, the run stays green,
and the site keeps the version deployed from here. Deploys from your laptop
work today without any secret: `cd deploy && wrangler deploy`.
