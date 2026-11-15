# The specification layer

A spec is one JSON file that says what an experiment is: the materials and
their identifiers, the vessels and their sizes, the pipe runs and their spool
sizes, the operations and their operating windows, the streams and what is in
them, the targets and their specifications, and the SOP with an acceptance
criterion for every step.

Everything else reads it. The figure is drawn from it, the chatbot answers
from it, the simulation computes from it, and the validator checks it.

## The files

| File | What |
|---|---|
| `subzero-blend.json` | the worked example: a sub-zero ethanol/pentane extraction |
| `units.mjs` | every quantity is a `{value, unit}` pair; this is the only place a conversion happens |
| `validate.mjs` | the checks: identifiers resolve, units are known, compositions add up, every SOP step has an acceptance criterion |
| `../sim/derive-streams.mjs` | computes the streams from the split rules, so the numbers agree by construction |
| `../sim/massbalance.mjs` | closes every operation and reports the drift |

```bash
node spec/validate.mjs spec/subzero-blend.json   # does it hold together?
node sim/derive-streams.mjs spec/subzero-blend.json # recompute the streams
node sim/massbalance.mjs spec/subzero-blend.json    # does the mass close?
```

## Where a real client's spec goes

**Not in this repository.** This repository is public, because private
repositories do not get free CI runners. A client's product code, their
volumes, their yields and their process belong in the client's own account
and in `.private/` here, which is git-ignored:

```bash
mkdir -p .private
cp spec/subzero-blend.json .private/<client>-<experiment>.json
```

The template, the validator, the simulator and the tooling are what we ship.
The client's numbers are not.

## What a spec must carry

* `meta` — the identifier, the revision, the owner, the confidentiality mark
  and the unit system.
* `materials` — every material, with a unique identifier, a name, a CAS where
  it has one, and its role. A blend has no CAS; it has a composition.
* `media` — the adsorbents and filters, with their lots and their
  replacement triggers.
* `vessels` — the volumes, the dimensions, the material of construction, the
  jacket and the isolation.
* `connections` — the pipe runs, with the tri-clamp spool size, the bore, the
  material and the insulation.
* `process` — the operations in order, each with its window, its heat duty
  and its isolation, and the streams that go in and come out.
* `streams` — the flow and the composition, in mass fractions, summing to 1.
* `targets` — what the client sells, the step that isolates it and its
  specification.
* `sop` — the steps, each with an acceptance criterion, and the notes.
* `simulation` — the models and the parameters.
* `sources` — where every number came from.
* `assumptions` — everything we did not know, each with what it affects and
  whether it has been confirmed. These are the client's to close.

## The rules the validator enforces

1. Every identifier is unique, and every reference resolves.
2. Every dimension is a `{value, unit}` pair, and the unit is one the unit
   table knows. A bare number where a dimension belongs is an error.
3. Every composition adds up to 1.
4. Every SOP step has an acceptance criterion.
5. Every assumption is either confirmed or visibly unconfirmed.
