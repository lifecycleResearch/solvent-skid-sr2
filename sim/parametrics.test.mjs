// The parametric model's tests.
//
//   node --test sim/parametrics.test.mjs
//
// The physics is checked against published values, the balancer against its
// own closure, and the media ranking against the rule it states.

import test from "node:test";
import assert from "node:assert/strict";
import { vapourPressure, boilingPoint, boilingAtTorr, solubilityFactor, extraction, mediaEffect, rankMedia, balance, run, FILTRATION_STAGES, roModel, pressureEnvelope } from "./parametrics.mjs";

test("ethanol boils at 78.4 degC at one atmosphere — the NIST fit says so", () => {
  const bp = boilingPoint("ethanol", 1.01325);
  assert.ok(Math.abs(bp.tC - 78.37) < 0.4, `bp was ${bp.tC}`);
});

test("the vacuum slider moves the boiling point the way a vacuum table does", () => {
  const at100 = boilingAtTorr("ethanol", 100).tC;
  const at20 = boilingAtTorr("ethanol", 20).tC;
  const at760 = boilingAtTorr("ethanol", 760).tC;
  assert.ok(at760 > 77 && at760 < 80, `760 torr gave ${at760}`);
  assert.ok(at100 > 26 && at100 < 40, `100 torr gave ${at100}`);
  assert.ok(at20 > 0 && at20 < 20, `20 torr gave ${at20}`);
  assert.ok(at20 < at100 && at100 < at760, "deeper vacuum must boil colder");
});

test("pentane boils colder than ethanol at the same vacuum", () => {
  const t = 100;
  assert.ok(boilingAtTorr("pentane", t).tC < boilingAtTorr("ethanol", t).tC);
});

test("vapour pressure rises with temperature and is flagged outside its fit", () => {
  const warm = vapourPressure("ethanol", 40);
  const cold = vapourPressure("ethanol", 0);
  assert.ok(warm.bar > cold.bar);
  assert.equal(warm.inRange, true);
  assert.equal(vapourPressure("ethanol", 90).inRange, false);
});

test("the solubility factor rises with temperature and says when it is extrapolating", () => {
  const cold = solubilityFactor(0);
  const warm = solubilityFactor(30);
  assert.ok(warm.factor > cold.factor);
  assert.equal(cold.inRange, true);
  assert.equal(solubilityFactor(-35).inRange, false, "−35 degC is outside the published 253–310 K window");
});

test("hotter extraction is more efficient, colder is cleaner in lipids", () => {
  const hot = extraction({ tC: 40, passes: 1 });
  const cold = extraction({ tC: -20, passes: 1 });
  assert.ok(hot.perPass > cold.perPass);
});

test("media loss scales with dose and stays inside the published band at the standard dose", () => {
  const carbon = (dose) => mediaEffect("MED-0001", dose);
  assert.ok(carbon(10).cannabinoidLossPct >= 8 && carbon(10).cannabinoidLossPct <= 15, `standard dose gave ${carbon(10).cannabinoidLossPct}`);
  assert.ok(carbon(20).cannabinoidLossPct > carbon(10).cannabinoidLossPct, "more dose must take more cannabinoids");
  assert.equal(carbon(0).cannabinoidLossPct, 0);
  const sieve = mediaEffect("MED-0004", 10);
  assert.ok(sieve.cannabinoidLossPct < carbon(10).cannabinoidLossPct, "a drying sieve must not strip cannabinoids like carbon does");
});

test("the shortlist ranks regenerable media ahead of single-use", () => {
  const { ranked, rule } = rankMedia();
  assert.ok(rule.includes("accessible"), "the rule is published with the list");
  const sieve = ranked.find((m) => m.id === "MED-0004");
  const clay = ranked.find((m) => m.id === "MED-0003");
  assert.ok(sieve.score > clay.score, "a 200-cycle sieve outranks single-use clay");
  for (const m of ranked) assert.equal(m.accessible, true, "the list is the accessible list");
});

test("the balancer closes on CBD and answers in every unit the panel needs", () => {
  const out = balance({ biomass: 120, cbd: 8, moisture: 10, ratio: 8, passes: 2, tC: 2, torr: 100, media: "MED-0001", dose: 5 });
  const { feedstock, miscella, media, output, closure } = out;
  assert.equal(closure.cbdIn > 0, true);
  assert.ok(Math.abs(closure.cbdIn - closure.cbdOut) < closure.cbdIn * 0.35, `closure in ${closure.cbdIn} vs out ${closure.cbdOut}`);
  assert.ok(output.crystalMassKg > 0);
  assert.ok(output.carrierRecoveredL > output.carrierLostL, "the plant recovers carrier, that is the point");
  assert.ok(output.boilAtVacuumC > 0 && output.boilAtVacuumC < 50);
  assert.ok(miscella.cbdConcentrationGL > 0);
  assert.ok(media.cannabinoidLossPct > 0);
  assert.ok(out.cites.length >= 5);
  assert.ok(out.openQuestions.length >= 3, "the assumptions stay visible");
});

test("the run gives the panels everything in one deterministic call", () => {
  const a = run({ tC: 2, torr: 100, psi: 15, dose: 5, media: "MED-0001", biomass: 120, cbd: 8, moisture: 10, ratio: 8, passes: 2 });
  const b = run({ tC: 2, torr: 100, psi: 15, dose: 5, media: "MED-0001", biomass: 120, cbd: 8, moisture: 10, ratio: 8, passes: 2 });
  assert.deepEqual(a, b, "the same inputs must give the same outputs");
  assert.equal(a.vacuum.ethanolBoilC, a.balancer.output.boilAtVacuumC, "one source of truth for the boiling point");
  assert.ok(a.filtration.length >= 5, "five stages from 10 µm to 0.01 µm");
  assert.equal(a.filtration[0].cutoff, "10 µm");
  assert.equal(a.filtration[a.filtration.length - 1].cutoff, "0.01 µm (10 nm)");
  assert.ok(a.ro.solventLoop.includes("NOT cleared"), "the RO question is stated, not smoothed over");
});

test("the pressure envelope flags the jacket rating before the PRV does", () => {
  const ok = pressureEnvelope(15);
  const hot = pressureEnvelope(44);
  assert.equal(ok.ok, true);
  assert.ok(hot.marginPct < 2, "44 psi sits on the 43.5 psi jacket rating");
  assert.equal(pressureEnvelope(45).ok, false);
});
