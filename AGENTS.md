# Solvent recovery skid SR-2 — how to work in this repository

The figure, the chatbot, the API and the agent loop that will grow out of them.
Read `docs/PLAN.md` for the architecture, `docs/SOP.md` for the procedures and
`docs/TODO.md` for what is next.

## The rules that do not bend

1. **Ask first.** Any task with more than one reasonable shape gets a
   clarifying question before the work starts, with a recommended default
   attached. Then proceed on the default if the answer is slow.
2. **Free tier.** No paid service without stating its cost, its free limit and
   the free alternative. The provider limits live in `agents/providers.json`,
   not in anyone's head.
3. **Nothing confidential in this repository.** Client specifications, yields,
   formulas and volumes stay in the client's account, the client's sandbox or
   the client's machine. This repository is public, on purpose: private
   repositories do not get free CI runners.
4. **No npm.** Node built-ins only. The anatomy kit is Node built-ins only; the
   CI installs nothing.
5. **Every number is traceable.** A number in a figure comes from the spec, a
   number in the spec comes from a source, and the source is cited in the
   spec. The chatbot's ground truth is `figures/skid/context.mjs`, generated
   from `figures/skid/model.mjs` — never typed by hand.
6. **The deployment style is a Cloudflare Worker with static assets** at a
   `*.workers.dev` host: a static page with its CSS and JS inlined, plus a
   JSON/SSE API beside it. No framework, no build step in the browser.

## The commands

```bash
node figures/skid/build.mjs            # dark theme
node figures/skid/build.mjs --light    # light theme
node figures/skid/build-index.mjs      # -> deploy/public/index.html + skid-context.json
node figures/skid/build.mjs --audit    # the geometry audit
node scripts/lines.mjs deploy/public/skid-light.html
node --test deploy/worker.test.mjs      # the API
node scripts/serve.mjs deploy/public 8791   # a local server, for the browser
cd deploy && wrangler deploy
```

## The layout

| Path | What |
|---|---|
| `figures/skid/` | the build, the model (the truth), the context, the live script, the chatbot |
| `kit/`, `scripts/` | the anatomy kit, vendored so CI can rebuild without npm |
| `deploy/` | the Worker, the describer, the search, the router, the grader, the assets |
| `agents/providers.json` | the provider table: cost, limits, capabilities |
| `openshell/` | the sandbox policy, image, README and Colab notebook |
| `docs/` | the plan, the SOP, the to-do list, the brand brief |
| `spec/` | (to come) the experiment specification — the single source of truth |

## The house rules for the drawing

* The audit is the gate. `scripts/lines.mjs` must print `line ends: 0`, and the
  figure must not add problems to the audit baseline. The baseline is in
  `figures/skid/skid-audit.json`.
* One number, one place: `figures/skid/model.mjs`. The drawing, the readout,
  the chatbot and the API all read it.
* The stream colours are the grammar: amber crude, blue solvent, violet
  vapour, green cannabinoid, grey waste. Do not introduce a colour that does
  not mean a material.
