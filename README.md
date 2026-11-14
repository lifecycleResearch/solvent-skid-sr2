# Solvent recovery skid SR-2

An interactive isometric figure of a solvent-recovery and fractionation skid for
botanical extraction, built with the **anatomy** skill's kit (in `kit/`) and
deployed to Cloudflare as a static-asset Worker.

**Live:** https://solvent-skid-sr2.lifecyclerd.workers.dev
(light theme with a dark switch · `/skid.html` dark · `/skid-light.html` light)

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

## Layout of the repo

| Path | What |
|---|---|
| `figures/skid/build.mjs` | the build: geometry, layout, the audit hook |
| `figures/skid/model.mjs` | the truth: numbers, vacuum sets, sieve cuts, setups |
| `figures/skid/live.js` | the live behaviour: valve levers, needle, flow, tour |
| `figures/skid/skid.css` | stream colours, media tints, panel and buttons |
| `figures/skid/build-index.mjs` | writes the deploy index (the figure + theme switch) |
| `deploy/` | the Worker: `wrangler.jsonc` and `public/` |
| `kit/`, `scripts/` | the anatomy kit (vendored so CI can rebuild without npm) |
| `.github/workflows/deploy.yml` | build, check, deploy on push |

## Build and deploy

```bash
node figures/skid/build.mjs            # dark theme  -> figures/skid/skid.html
node figures/skid/build.mjs --light    # light theme -> figures/skid/skid-light.html
node figures/skid/build-index.mjs      # -> deploy/public/index.html
node figures/skid/build.mjs --audit    # the geometry audit
node scripts/lines.mjs deploy/public/skid-light.html   # the line-end check
cd deploy && wrangler deploy
```

No npm and no dependencies: the kit is Node built-ins only.

## State of the checks

* `scripts/lines.mjs` prints **line ends: 0** on both themes.
* `build.mjs --audit` still reports geometry the kit's checks do not accept yet:
  49 clearance, 53 terminals, 225 sunk pairs and 187 depth-order items, mostly
  in the condenser rack where the hangers, the link flanges and the shells
  interlock, and where a few pipe ends land near rather than exactly on their
  bosses. Those are the next things to fix, in the geometry rather than in the
  painter's keys.
