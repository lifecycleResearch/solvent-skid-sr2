// Build the studio: one static page, CSS and JS inlined, no build step in the
// browser and nothing to npm install. Three.js comes from a CDN as an ES
// module; everything else is ours.
//
//   node studio/build.mjs
//
// The scene and the application are separate modules on purpose: the 3D view
// can be replaced by glTF assets later without touching the workflow.
//
// The theme is the anatomy kit's: its tokens, its mono discipline, its card
// framing — Fig tag top-left, title top-right, hint bottom-left, live
// readout bottom-right.

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..");
const OUT = join(ROOT, "deploy", "public");

const css = readFileSync(join(HERE, "studio.css"), "utf8");
const app = readFileSync(join(HERE, "app.js"), "utf8");
const scene = [readFileSync(join(HERE, "equipment.js"), "utf8"), readFileSync(join(HERE, "scene.js"), "utf8")].join("\n\n");

const body = `
<header class="topbar">
  <div class="brand"><b>GREA Technologies</b><span>process studio · idea to verified design</span></div>
  <input id="project-name" type="text" value="Brewery-kit CBD extraction" aria-label="project name" />
  <span class="spacer"></span>
  <span class="pill" id="verified-pill">0 of 6 verified</span>
  <span class="pill" id="save-pill">saved in this browser</span>
  <button class="ghost" id="btn-export">export</button>
  <button class="ghost" id="btn-new">new project</button>
  <button class="primary" id="btn-account">sign in</button>
</header>

<main class="workspace">
  <section class="pane left">
    <div class="pane-head"><h2>1 · Idea &amp; conversation</h2><span class="pill lit" id="provider-pill">Workers AI</span></div>
    <div class="chat-log" id="chat-log" aria-live="polite"></div>
    <div class="attach-list" id="attach-list"></div>
    <div class="composer">
      <textarea id="chat-input" placeholder="Describe the process you want to engineer, or ask about this one. Ctrl/Cmd+Enter to send."></textarea>
      <div class="composer-actions">
        <label class="attach-btn">attach file or image<input id="file-input" type="file" hidden multiple accept="image/*,.pdf,.txt,.md,.csv,.json" /></label>
        <label class="attach-btn" style="border:none;padding-left:0"><input id="upload-context" type="checkbox" style="width:auto;margin-right:5px" />use uploads as context</label>
        <span class="spacer"></span>
        <button class="primary" id="chat-send">send</button>
      </div>
    </div>
    <details class="settings">
      <summary>model, key and agent</summary>
      <div class="grid">
        <div class="full"><label for="provider">provider</label>
          <select id="provider">
            <option value="workers-ai">Workers AI — no key</option>
            <option value="kimi">Kimi K3.1 — your key (OpenAI-compatible)</option>
            <option value="gemini">Gemini — your key</option>
            <option value="openai">OpenAI-compatible — your key</option>
          </select>
        </div>
        <div><label for="model">model</label><input id="model" type="text" /></div>
        <div><label for="base-url">base URL</label><input id="base-url" type="url" /></div>
        <div class="full"><label for="api-key">your key (kept out of the project record)</label><input id="api-key" type="password" autocomplete="off" placeholder="paste a key, or save one under your account" /></div>
        <div class="full"><button class="small" id="save-key-account">save key under my account</button></div>
      </div>
      <p class="note">A signed-in agent uses the key stored under your name, never the project file. The key is sealed before it is stored.</p>
    </details>
    <div class="memory">
      <h2>Project memory</h2>
      <div class="memory-list" id="memory-list"></div>
      <div class="memory-add"><input id="memory-input" type="text" placeholder="a fact to keep for this project" /><button id="memory-add">save note</button></div>
      <p class="note">Nothing is remembered unless you save it. Notes sync with the project when you are signed in.</p>
    </div>
  </section>

  <section class="pane center">
    <div class="pane-head">
      <h2>Process view · brewery-kit extraction, 10 bbl</h2>
      <div class="view-actions">
        <button class="small" data-view="overview">overview</button>
        <button class="small" data-view="extraction">extraction</button>
        <button class="small" data-view="polish">polish skid</button>
        <button class="small" data-view="cold">crystalliser</button>
        <button class="small" data-view="recovery">recovery</button>
        <button class="small" id="toggle-labels" aria-pressed="true">labels</button>
        <button class="small" id="toggle-flow" aria-pressed="true">flow</button>
      </div>
    </div>
    <div class="scene-card">
      <div class="scene-tag"><b>FIG. 01</b> brewery-kit extraction · 10 bbl jacketed · sub-zero crystallisation</div>
      <div class="scene-wrap" id="scene-wrap">
        <div class="scene-fallback" id="scene-fallback">Loading the 3D plant…</div>
        <div class="scene-readout" id="scene-readout">reading…</div>
        <aside class="inspector" id="inspector" hidden></aside>
      </div>
      <div class="step-bar">
        <button id="step-prev">◀</button>
        <button class="primary" id="step-play">pause flow</button>
        <button id="step-next">▶</button>
        <span id="step-label"></span>
      </div>
      <div class="legend" id="stream-legend"></div>
    </div>

    <div class="center-below">
    <div class="tab-bar" role="tablist">
      <button role="tab" aria-selected="true" data-tab="operating">operating point</button>
      <button role="tab" aria-selected="false" data-tab="balancer">balancer</button>
      <button role="tab" aria-selected="false" data-tab="media">media &amp; consumables</button>
      <button role="tab" aria-selected="false" data-tab="filtration">filtration train</button>
    </div>

    <div class="tab-panel" id="tab-operating" role="tabpanel">
      <div class="param-block">
        <div class="param-row" data-param="tC">
          <div class="row-head"><label for="p-tc">extraction temperature</label><span class="param-value" id="v-tc"></span></div>
          <input id="p-tc" type="range" min="-40" max="60" step="1" value="2" />
          <dl class="param-impact" id="i-tc"></dl>
        </div>
        <div class="param-row" data-param="torr">
          <div class="row-head"><label for="p-vac">evaporator vacuum</label><span class="param-value" id="v-vac"></span></div>
          <input id="p-vac" type="range" min="20" max="760" step="5" value="100" />
          <dl class="param-impact" id="i-vac"></dl>
        </div>
        <div class="param-row" data-param="psi">
          <div class="row-head"><label for="p-psi">jacket / vessel pressure</label><span class="param-value" id="v-psi"></span></div>
          <input id="p-psi" type="range" min="0" max="45" step="0.5" value="15" />
          <dl class="param-impact" id="i-psi"></dl>
        </div>
        <div class="param-row" data-param="dose">
          <div class="row-head"><label for="p-dose">sorbent dose</label><span class="param-value" id="v-dose"></span></div>
          <input id="p-dose" type="range" min="0" max="20" step="0.5" value="5" />
          <dl class="param-impact" id="i-dose"></dl>
        </div>
        <p class="param-note" id="param-cite">computed on the server from NIST Antoine fits and cited correlations — <a href="/api/parametrics?spec=brewkit" target="_blank" rel="noopener">the raw model</a></p>
      </div>
    </div>

    <div class="tab-panel" id="tab-balancer" role="tabpanel" hidden>
      <div class="balancer-grid">
        <div>
          <div class="param-row" data-param="biomass"><div class="row-head"><label for="b-biomass">biomass charge</label><span class="param-value" id="v-biomass"></span></div><input id="b-biomass" type="range" min="40" max="300" step="5" value="120" /></div>
          <div class="param-row" data-param="cbd"><div class="row-head"><label for="b-cbd">CBD in biomass</label><span class="param-value" id="v-cbd"></span></div><input id="b-cbd" type="range" min="3" max="20" step="0.5" value="8" /></div>
          <div class="param-row" data-param="moisture"><div class="row-head"><label for="b-moisture">moisture</label><span class="param-value" id="v-moisture"></span></div><input id="b-moisture" type="range" min="4" max="16" step="0.5" value="10" /></div>
          <div class="param-row" data-param="ratio"><div class="row-head"><label for="b-ratio">carrier : biomass</label><span class="param-value" id="v-ratio"></span></div><input id="b-ratio" type="range" min="4" max="16" step="0.5" value="8" /></div>
          <div class="param-row" data-param="passes"><div class="row-head"><label for="b-passes">extraction passes</label><span class="param-value" id="v-passes"></span></div><input id="b-passes" type="range" min="1" max="3" step="1" value="2" /></div>
        </div>
        <div class="bal-out">
          <h4>Expected output</h4>
          <table class="bal-table" id="bal-table"><tbody></tbody></table>
          <p class="cite" id="bal-cite"></p>
        </div>
      </div>
    </div>

    <div class="tab-panel" id="tab-media" role="tabpanel" hidden>
      <div class="param-block">
        <p class="note" id="media-note">Ranked by what a working plant can actually buy, regenerate cheaply and reuse. The rank is computed from accessibility, regeneration cost and reuse cycles; the loss column is the cannabinoid the media takes with it at the dose set on the operating point.</p>
        <table class="media-table" id="media-table"><thead><tr><th>media</th><th>removes</th><th>loss</th><th>regeneration</th><th>cost</th><th>cycles</th><th></th></tr></thead><tbody></tbody></table>
        <p class="param-note" id="media-cite"></p>
      </div>
    </div>

    <div class="tab-panel" id="tab-filtration" role="tabpanel" hidden>
      <div class="param-block">
        <div class="param-row"><div class="row-head"><label for="f-position">membrane skid position</label><span class="param-value" id="v-fpos"></span></div>
          <select id="f-position">
            <option value="before">before the media column (protect the media)</option>
            <option value="after">after the media column (polish)</option>
            <option value="both">both (coarse before, polish after)</option>
          </select>
        </div>
        <table class="media-table" id="filter-table" style="margin-top:10px"><thead><tr><th>stage</th><th>cutoff</th><th>purpose</th><th>note</th></tr></thead><tbody></tbody></table>
        <p class="param-note" id="filter-cite"></p>
      </div>
    </div>
    </div>
  </section>

  <section class="pane right">
    <div class="pane-head"><h2>2 · Goal</h2><span class="pill" id="goal-pill">not saved</span></div>
    <div class="goal-block">
      <label for="goal-objective">objective</label>
      <textarea id="goal-objective"></textarea>
      <label for="goal-constraints">constraints</label>
      <textarea id="goal-constraints"></textarea>
      <label for="goal-acceptance">acceptance criteria</label>
      <textarea id="goal-acceptance"></textarea>
      <div class="goal-actions">
        <button id="goal-distill">distill from conversation</button>
        <button class="primary" id="goal-save">save goal</button>
      </div>
    </div>

    <div class="pane-head"><h2>3 · Plan</h2><button class="small" id="plan-generate">generate from spec</button></div>
    <div class="goal-block">
      <ul class="plan-list" id="plan-list"></ul>
      <div class="plan-add"><input id="plan-input" type="text" placeholder="add a step" /><button id="plan-add">add</button></div>
    </div>

    <div class="pane-head"><h2>4 · Deliverables &amp; human verification</h2></div>
    <div class="goal-block" style="border-bottom:none">
      <div class="deliverables" id="deliv-list" style="display:flex;flex-direction:column;gap:8px"></div>
      <div class="progress"><i id="verified-bar" style="width:0%"></i></div>
      <p class="note">Every deliverable is versioned, checksummed and traceable to its sources. Nothing is complete until a person approves it.</p>
    </div>
  </section>
</main>

<dialog id="account-dialog">
  <div class="dialog-head"><h3>Account &amp; agent access</h3><button class="ghost" data-close>✕</button></div>
  <div class="dialog-body">
    <p class="note" id="account-status">Checking…</p>
    <div class="oauth-row">
      <a class="button" id="oauth-github" href="/api/auth/github/start?returnTo=/studio.html"><button style="width:100%">continue with GitHub</button></a>
      <a id="oauth-google" href="/api/auth/google/start?returnTo=/studio.html"><button style="width:100%">continue with Google</button></a>
    </div>
    <p class="note" id="oauth-note"></p>
    <div class="divider">or email and password</div>
    <div class="grid2">
      <div><label for="auth-email">email</label><input id="auth-email" type="email" autocomplete="username" /></div>
      <div><label for="auth-password">password (10+ characters)</label><input id="auth-password" type="password" /></div>
    </div>
    <div class="goal-actions">
      <button id="auth-register">create account</button>
      <button class="primary" id="auth-login">sign in</button>
      <button id="auth-logout" hidden>sign out</button>
    </div>
    <p class="note">Signing in lets an agent act under your name, use your stored model key, and sync this project. Anonymous work stays in this browser.</p>
  </div>
</dialog>

<dialog id="artifact-dialog">
  <div class="dialog-head"><h3 id="artifact-title"></h3><button class="ghost" data-close>✕</button></div>
  <div class="dialog-body">
    <div class="artifact-meta" id="artifact-meta"></div>
    <div class="artifact-body" id="artifact-body"></div>
    <div class="sources" id="artifact-sources"></div>
    <label for="artifact-note">reviewer note</label>
    <textarea id="artifact-note" placeholder="what must change, or what you checked"></textarea>
  </div>
  <div class="dialog-foot">
    <select id="artifact-version" style="width:auto"></select>
    <span class="spacer"></span>
    <button class="warn" id="artifact-changes">request changes</button>
    <button class="good" id="artifact-approve">approve this version</button>
  </div>
</dialog>
`;

const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>GREA Process Studio — idea to verified process design</title>
<meta name="description" content="A process-engineering workbench: idea and uploads to conversation, goal, plan and versioned deliverables with human verification, over a live 3D plant." />
<style>${css}</style>
<script type="importmap">
{"imports":{"three":"https://unpkg.com/three@0.160.0/build/three.module.js","three/addons/":"https://unpkg.com/three@0.160.0/examples/jsm/"}}
</script>
</head>
<body data-theme="dark">${body}
<script type="module">${scene}</script>
<script type="module">${app}</script>
</body>
</html>
`;

mkdirSync(OUT, { recursive: true });
writeFileSync(join(OUT, "studio.html"), html);
console.log(`wrote studio.html ${(html.length / 1024).toFixed(0)} KB`);
