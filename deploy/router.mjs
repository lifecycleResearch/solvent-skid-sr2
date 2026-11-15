// The provider table.
//
// Which model answers a task is a decision, not a habit: it is made from a
// table of what is free, what is fast, what is good at what, and which keys
// are actually present. The decision is returned with its reason, so a run can
// be explained afterwards.
//
// The table lives in agents/providers.json. This file is the logic; the table
// is the data, because free-tier limits move and must not live in prose.

import TABLE from "../agents/providers.json" with { type: "json" };

const DEFAULTS = TABLE.providers;
const TASK_CLASSES = TABLE.taskClasses;

const RANK = { "very fast": 0, fast: 1, medium: 2, slow: 3, instant: 0 };

export function providerTable() {
  return DEFAULTS.map((p) => ({ ...p }));
}

// Which providers can actually be used right now: the ones whose key is
// present, plus the ones that need no key at all.
export function availableProviders(env = {}) {
  const table = providerTable();
  return table
    .filter((p) => !p.env || (env[p.env] && String(env[p.env]).trim()))
    .filter((p) => !p.binding || env[p.binding])
    .map((p) => ({ id: p.id, label: p.label, cost: p.cost, model: p.model }));
}

/**
 * Pick a provider for a task.
 *
 * @param {object} task  {class, confidential, allowPaid, prefer}
 * @param {object} env   the environment, to know which keys are present
 */
export function route(task = {}, env = {}) {
  const cls = TASK_CLASSES.includes(task.class) ? task.class : "summarise";
  const available = availableProviders(env);
  const candidates = available.filter((p) => {
    const full = providerTable().find((f) => f.id === p.id);
    return full.capabilities.includes(cls);
  });

  if (!candidates.length) {
    return { provider: null, model: null, why: `no provider available for the task class "${cls}"`, alternatives: available.map((p) => p.id) };
  }

  // A confidential task may only go to a provider that stays on the machine.
  const pool = task.confidential ? candidates.filter((p) => p.id === "local") : candidates;
  const usable = pool.length ? pool : candidates.filter((p) => p.id !== "local");

  // Free first, then the preferred one, then the quickest.
  const free = usable.filter((p) => p.cost === "free");
  const tier = free.length ? free : task.allowPaid ? usable : [];
  if (!tier.length) {
    return { provider: null, model: null, why: "no free provider for that task class, and paid providers are not allowed", alternatives: usable.map((p) => p.id) };
  }

  const preferred = tier.find((p) => task.prefer && p.id === task.prefer);
  const chosen = preferred || tier.sort((a, b) => RANK[a.latency] - RANK[b.latency])[0];
  const full = providerTable().find((f) => f.id === chosen.id);

  return {
    provider: chosen.id,
    model: chosen.model,
    why: [
      `task class "${cls}"`,
      task.confidential ? "the task is confidential, so it stays on this machine" : "the task may leave the machine",
      `${chosen.label} (${chosen.cost})`,
      preferred ? "asked for by name" : "the quickest free provider that can do it",
    ].join("; "),
    alternatives: tier.map((p) => p.id),
    limit: full.limit || null,
    note: full.note || "",
  };
}
