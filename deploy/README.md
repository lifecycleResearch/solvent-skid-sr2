# Solvent recovery skid SR-2 — anatomy figure

An interactive isometric figure of a solvent-recovery and fractionation skid for
botanical extraction (hemp), built with the `anatomy` skill's kit.

## Files

| File | What it is |
|---|---|
| `skid.html` | the figure, dark theme |
| `skid-light.html` | the figure, light theme (the shipping theme) |
| `build.mjs` | the build script — geometry, layout, the audit hook |
| `model.mjs` | the truth: the numbers, the vacuum sets, the sieve cuts, the two setups |
| `live.js` | the live behaviour: the valve levers, the needle, the flow highlight, the tour |
| `skid.css` | the stream colours, the media tints, the panel and the buttons |
| `shots/` | the captures (desktop, phone, product mode, line-check rings) |

Build with `node build.mjs` and `node build.mjs --light`; `node build.mjs --audit`
runs the geometry audit.

## The machine

A 380 × 180 aluminium-extrusion frame on casters carries, from the feed end to
the exhaust:

* a **pneumatic diaphragm pump** and a **basket strainer** (a differential
  pressure gauge on top);
* a **cross-flow membrane module**, 0.001 µm (1 nm) pore, 12 m², tie-rod
  construction, with feed, retentate, permeate and CIP ports;
* a **CRC carbon bed** cartridge with a sight window, upstream of the routing
  block — the media that takes the last cannabinoids out of the permeate;
* a **routing block** with two four-way ball valves and a third valve at the
  sieve inlet; each lever turns to the port it is set to;
* a **molecular sieve stack**, four beds (3A K-form 3 Å → 4A Na → 5A Ca →
  13X NaX 8 Å), each with a media window, an isolation valve and its own
  collection can;
* a **vacuum evaporator** with a jacket, manway, agitator and sight glass;
* a **condenser bank** of four shells on a hanging beam, serpentined so each
  stage takes a different fraction;
* a **solvent tank**, a **product drum**, a **feed drum**;
* a **vacuum set**: a manifold, two rotary-vane pumps and a pneumatic booster,
  selectable as one, two or three stages;
* a **gas scrubber** on the pump exhaust, holding CRC carbon, activated carbon
  and zeolite 13X, with an exhaust stack.

## The two setups

| | SOLVENT | PRODUCT |
|---|---|---|
| permeate (permeate valve V1) | to the sieve stack, then the tank | straight to the tank as wash |
| retentate (V2) | straight to the product drum | to the vacuum evaporator, stripped of its solvent |
| sieve inlet (V3) | from the permeate | from the condenser |

SOLVENT returns solvent that is fit for reuse; PRODUCT leaves the cannabinoid
residue in the drum. The idle tour cycles the setups, the vacuum stage and a bed
cut; the buttons, the keys (1/2 for the setup, 3/4/5 for the stage, B to cut a
bed) and clicking a bed all drive the same model.

## The numbers behind it

* Ethanol vapour pressure fitted to its anchors (15.7 mbar at 0 °C, 1013 mbar
  at 78.4 °C): `ln P = 21.446 − 5105/T`. The boil temperature in the readout
  follows the vacuum set: 1 stage (35 mbar) boils at +12 °C, 2 stages (8 mbar)
  at −10 °C, 3 stages (1.5 mbar) at −31 °C, and the condenser needs about 12 K
  below that.
* Membrane: 100 L/h feed, 96 L/h permeate, 4 L/h retentate at 18 bar, cannabinoids
  in the permeate below 5 ppm.
* Sieve cuts: 3A takes the water, 4A the CO₂ and methanol, 5A the n-paraffins,
  13X the C₂–C₃ and the heavy ends — 0.9, 0.4, 0.6 and 1.2 kg on the beds.
* Condenser stages at +45, +20, −5 and −25 °C take toluene, heptane, ethanol and
  acetone in turn.

## Verification

* `scripts/lines.mjs` prints **line ends: 0** on both themes (317 ends on 144
  lines).
* `node build.mjs --audit` still reports geometry the kit's checks do not
  accept yet: 49 clearance, 53 terminals, 225 sunk pairs and 187 depth-order
  items — mostly in the condenser rack, where the hangers, the link flanges and
  the shells interlock, and where a few pipe ends land near rather than exactly
  on their bosses. These are the next things to fix; the drawing itself is
  legible and the interlocked parts are the ones that physically overlap.
