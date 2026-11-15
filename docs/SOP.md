# SOP — how the work is done

Every procedure here is written so that another person (or another session of
OpenCode) could run it without asking anything. Where a step needs a decision,
the decision rule is written down instead of the decision.

---

## SOP-0 — the working rules

1. **Ask first.** Any task with more than one reasonable shape gets a
   clarifying question before work starts. Offer a recommended default with
   each question; if there is no answer in one round, take the default and say
   so.
2. **Free tier.** No paid service is introduced without stating its cost, its
   free limit and the free alternative. Limits live in
   `agents/providers.json` — read it, do not remember it.
3. **Privacy.** A client's specification, yields, formulas and volumes stay in
   the client's account and the client's sandbox. The policy file names every
   host that sandbox may reach; adding a host is a decision, not a default.
4. **No npm.** Node built-ins only, in the repo and in the sandboxes.
5. **Traceable numbers.** A number in a figure, an SOP or a simulation result
   cites its source: the spec field, a paper, a datasheet or a measurement.

---

## SOP-1 — design a new experiment

**Input:** a question ("can we do sub-zero precipitation on a CDA-12 stream?"),
plus whatever the client has given.

| Step | Action | Done when |
|---|---|---|
| 1.1 | Write the question and the deliverable in one sentence | the sentence is in `spec/<id>/brief.md` |
| 1.2 | List every stream, every phase, every material, with an ID for each | `materials` and `streams` in the spec |
| 1.3 | List the equipment with its sizes and its material | `vessels`, `connections`, `media` |
| 1.4 | Fix the unit system for the spec, and write the conversions the reader may want | `meta.units`, `sim/units.mjs` |
| 1.5 | Write the operating window per step, with the acceptance criterion | `process[].window`, `sop.steps[].acceptance` |
| 1.6 | Name the target: what the client sells, and the isolation step that makes it | `targets[]` |
| 1.7 | Generate the figure from the spec | `figures/<id>/build.mjs` runs and the audit passes |
| 1.8 | Generate the SOP and the material register | `docs/<id>/sop.md` exists and every material has an ID |
| 1.9 | Run the simulation, and check every number against the sources | `sim/results/<id>.json` cites a source per number |
| 1.10 | Publish, then tell the client | the URL works, and the client can change the spec themselves |

**Rule for 1.2:** if a material has no unique identifier, it does not go in
the spec. "Solvent" is not a material. `MAT-0007` is.

---

## SOP-2 — the spec review gate

A figure ships only when all of these are true:

- [ ] the spec parses and every referenced ID exists
- [ ] every quantity is `{value, unit}`, and the unit is one the renderer knows
- [ ] every material has an ID, a name, and (if it is a chemical) a CAS
- [ ] every stream's composition sums to 1 within 1e-6
- [ ] the mass balance closes: in = out, per operation, within 0.5 %
- [ ] every heat duty has a medium and a ΔT, or is explicitly zero
- [ ] the figure passes `scripts/lines.mjs` with 0 floating ends
- [ ] the figure adds no new audit problems against the baseline
- [ ] every SOP step has an acceptance criterion
- [ ] every number in the description cites the spec
- [ ] nothing in the artefact is marked confidential that the client has not cleared

---

## SOP-3 — publish (the house style)

```bash
node figures/<id>/build.mjs            # dark theme
node figures/<id>/build.mjs --light    # light theme
node figures/<id>/build-index.mjs      # -> deploy/public/index.html + <id>-context.json
node scripts/lines.mjs deploy/public/<id>-light.html
cd deploy && wrangler deploy
```

Rules:

* the page is static: CSS and JS inlined, no framework, no build step in the
  browser;
* the API is a Worker beside it, and every endpoint is documented in the
  README;
* CI builds, checks the lines, runs the API tests, and deploys. If the
  Cloudflare token secret is missing, the deploy step fails harmlessly and the
  site keeps the last good version;
* the repository is public (private repositories do not get free runners), so
  anything confidential is excluded from the repository, not from the
  repository's settings.

---

## SOP-4 — run an agent task

```
task -> router -> provider(s) -> artefacts -> grader(s) -> verdict -> record
```

| Step | Action | Rule |
|---|---|---|
| 4.1 | Write the task as an acceptance test, not a prompt | if you cannot say how it passes, it is not a task |
| 4.2 | The router picks the provider | never pick a provider by hand; the router records why |
| 4.3 | The provider runs with the context of the spec | the model sees the spec, not a summary of it |
| 4.4 | The graders run | deterministic graders first, rubric grader second |
| 4.5 | The verdict is written to `runs/<timestamp>.json` | always, pass or fail |
| 4.6 | A failing task goes back to 4.3 with the grader's output in the context | max 3 attempts, then it is a human problem |

---

## SOP-5 — the self-improvement loop

The loop may change **only** these three things: the prompt, the rubric, and
the router's weights. It may not change the spec, the grader's code, or the
figure.

To accept a change:

1. the change is written down as a diff with a reason;
2. it is run against the **dev** set (`evals/dev.jsonl`) and the score must go
   up;
3. it is run against the **held-out** set (`evals/heldout.jsonl`) and the
   score must go up by less than the dev set — a bigger jump means the change
   overfitted, and it is rejected;
4. the grader's own score is checked: if the grader improved but the outputs
   did not, the grader changed, not the work.

Every accepted change is committed with the two scores in the message. There is
no other way the system gets better.

---

## SOP-6 — research ingestion

A paper becomes a model like this:

1. **Fetch** — the paper's text (arXiv, Crossref, OpenAlex, or a link the
   user pasted). Nothing is fetched without a source line: title, DOI, date.
2. **Extract** — the parameters, their units, the range they were fitted over,
   and the error the authors reported.
3. **Implement** — in `sim/models/<name>.mjs`, pure functions, no I/O, with
   the source in a comment and in the model's metadata.
4. **Validate** — against the paper's own reported values; the test file
   asserts the paper's numbers to the precision it published.
5. **Register** — add it to the spec's `simulation.models` and to
   `sim/models/index.mjs`, with the valid range.
6. **Cite** — the model appears in the output with its source, so a client can
   see what it is based on.

A model without a step 4 does not ship.

---

## SOP-7 — client isolation

1. The client's spec lives in the client's own account (their Cloudflare
   account, their repository) or on their machine. Not in ours.
2. The sandbox policy names exactly the hosts the job needs. Starting from
   three (the model API, the repository, the client's own API) and adding more
   only with a reason.
3. Keys are OpenShell providers, injected per sandbox. A key is never written
   into a policy file, an image, or a repository.
4. The figure for a confidential spec is served from the client's account, with
   `meta.confidentiality` driving the "do not publish" banner.
5. Before anything is shown outside, `meta.confidentiality` is checked. If it
   is `CBI-IP`, the artefact stays where it is.

---

## SOP-8 — the release checklist

```bash
node figures/<id>/build.mjs --audit          # the geometry audit
node scripts/lines.mjs deploy/public/<id>-light.html
node --test deploy/worker.test.mjs            # the API
node evals/run.mjs --set heldout              # the agent's score
cd deploy && wrangler deploy
curl -s https://<host>/api/health | jq
```

Then, by hand:

- [ ] the figure loads with a clean console
- [ ] the chatbot answers, in the local engine and in one model engine
- [ ] the filters work (compound, function, colour)
- [ ] the rotation works (buttons and drag)
- [ ] the SOP reads as an SOP: units, sizes, IDs, acceptance criteria
- [ ] nothing confidential is in the public artefact
- [ ] the README says what changed
