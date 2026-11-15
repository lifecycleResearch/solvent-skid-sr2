// The chatbot on the figure.
//
// Three ways to answer, chosen in the settings:
//
//   local    the describer in the page, straight from the model file: no key,
//            no network, and it knows the plant because the plant's numbers
//            are the page's numbers
//   gemini   a Google AI Studio key you paste in (BYOK)
//   openai   any OpenAI-compatible key and base URL you paste in (BYOK)
//
// The key is kept in this browser's localStorage and is sent with the request
// that needs it. It is never written into the figure or into the repository.

const CHAT_DEPLOYED = "https://solvent-skid-sr2.lifecyclerd.workers.dev";
const CHAT_STORE = "sr2.chat.settings";

const CHAT_MODELS = {
  local: [["local", "Local describer — no key"]],
  "workers-ai": [["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "Workers AI — Llama 3.3 70B — no key"]],
  gemini: [
    ["gemini-2.5-flash", "Gemini 2.5 Flash"],
    ["gemini-2.5-pro", "Gemini 2.5 Pro"],
    ["gemini-2.0-flash", "Gemini 2.0 Flash"],
  ],
  openai: [
    ["gpt-4o-mini", "GPT-4o mini"],
    ["gpt-4.1-mini", "GPT-4.1 mini"],
    ["gpt-4o", "GPT-4o"],
  ],
};

const CHAT_CHIPS = [
  "Describe the skid",
  "Pure solvent vs pure product",
  "What does each sieve bed take?",
  "Vacuum sets and boiling points",
  "The membrane numbers",
  "The condenser bank",
  "The gas scrubber and exhaust",
  "Controls and shortcuts",
  "The geometry audit",
  "The API and the agent",
];

const CHAT_PROVIDERS = [
  ["local", "Local describer — no key"],
  ["workers-ai", "Workers AI — no key"],
  ["gemini", "Gemini — your key"],
  ["openai", "OpenAI-compatible — your key"],
];

function chatSettings() {
  let saved = {};
  try {
    saved = JSON.parse(localStorage.getItem(CHAT_STORE) || "{}");
  } catch {
    saved = {};
  }
  return {
    provider: CHAT_MODELS[saved.provider] ? saved.provider : "local",
    model: saved.model || "",
    key: saved.key || "",
    baseUrl: saved.baseUrl || "https://api.openai.com/v1",
  };
}

function chatSave(settings) {
  try {
    localStorage.setItem(CHAT_STORE, JSON.stringify(settings));
  } catch {
    /* private mode: the key just does not persist */
  }
}

// ------------------------------------------------------------- markdown ----

function chatEscape(text) {
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function chatInline(text) {
  return chatEscape(text)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/(^|[\s(])\*([^*\n]+)\*/g, "$1<em>$2</em>");
}

function chatRender(text) {
  const lines = String(text).split("\n");
  const out = [];
  let list = null;
  let table = null;
  let code = null;

  const closeList = () => {
    if (list) {
      out.push(`</${list}>`);
      list = null;
    }
  };
  const closeTable = () => {
    if (table) {
      out.push("</tbody></table>");
      table = null;
    }
  };

  for (const line of lines) {
    if (line.trim().startsWith("```")) {
      if (code === null) {
        closeList();
        closeTable();
        code = [];
        out.push("<pre><code>");
      } else {
        out.push(chatEscape(code.join("\n")));
        out.push("</code></pre>");
        code = null;
      }
      continue;
    }
    if (code !== null) {
      code.push(line);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      const cells = line.trim().replace(/^\||\|$/g, "").split("|").map((c) => c.trim());
      if (!table) {
        closeList();
        out.push("<table><thead><tr>" + cells.map((c) => `<th>${chatInline(c)}</th>`).join("") + "</tr></thead><tbody>");
        table = true;
      } else if (cells.every((c) => /^:?-{2,}:?$/.test(c))) {
        continue;
      } else {
        out.push("<tr>" + cells.map((c) => `<td>${chatInline(c)}</td>`).join("") + "</tr>");
      }
      continue;
    }
    closeTable();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(line);
    const numbered = /^\s*\d+\.\s+(.*)$/.exec(line);
    if (bullet || numbered) {
      const kind = bullet ? "ul" : "ol";
      if (list !== kind) {
        closeList();
        out.push(`<${kind}>`);
        list = kind;
      }
      out.push(`<li>${chatInline((bullet || numbered)[1])}</li>`);
      continue;
    }
    closeList();
    if (!line.trim()) {
      if (out.length && !out[out.length - 1].endsWith("</p>")) out.push("</p>");
      continue;
    }
    if (out.length && out[out.length - 1].endsWith("</p>")) {
      out[out.length - 1] = out[out.length - 1].slice(0, -4) + " " + chatInline(line) + "</p>";
    } else {
      out.push(`<p>${chatInline(line)}</p>`);
    }
  }
  if (code !== null) {
    out.push(chatEscape(code.join("\n")));
    out.push("</code></pre>");
  }
  closeList();
  closeTable();
  return out.join("");
}

// ------------------------------------------------------------ the widget ---

function chatBuild() {
  const settings = chatSettings();
  const context = DATA.skidContext;

  const fab = document.createElement("button");
  fab.type = "button";
  fab.className = "sk-chat-fab";
  fab.id = "chat-fab";
  fab.setAttribute("aria-expanded", "false");
  fab.innerHTML = "<i>?</i><b>Ask the skid</b>";

  const panel = document.createElement("section");
  panel.className = "sk-chat";
  panel.id = "sk-chat";
  panel.hidden = true;
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-label", "Ask about the solvent recovery skid");
  panel.innerHTML = `
    <header class="sk-chat-head">
      <h2>SR-2 · plant engineer</h2>
      <span class="sk-chat-state" data-chat-state></span>
      <button type="button" data-chat-gear title="settings">⚙</button>
      <button type="button" data-chat-close title="close">✕</button>
    </header>
    <div class="sk-chat-settings" data-chat-settings hidden>
      <div class="sk-chat-row">
        <label for="chat-provider">engine</label>
        <select id="chat-provider" data-chat-provider></select>
      </div>
      <div class="sk-chat-row" data-chat-model-row>
        <label for="chat-model">model</label>
        <select id="chat-model" data-chat-model></select>
      </div>
      <div class="sk-chat-row" data-chat-key-row>
        <label for="chat-key">key</label>
        <input id="chat-key" data-chat-key type="password" placeholder="paste your own key" autocomplete="off" spellcheck="false" />
      </div>
      <div class="sk-chat-row" data-chat-base-row hidden>
        <label for="chat-base">base</label>
        <input id="chat-base" data-chat-base type="text" placeholder="https://api.openai.com/v1" spellcheck="false" />
      </div>
      <p class="sk-chat-note" data-chat-note></p>
    </div>
    <div class="sk-chat-log" data-chat-log role="log" aria-live="polite"></div>
    <div class="sk-chat-chips" data-chat-chips></div>
    <div class="sk-chat-tools">
      <button type="button" data-chat-copy>copy transcript</button>
      <button type="button" data-chat-md>download notes</button>
      <button type="button" data-chat-forget>forget key</button>
    </div>
    <form class="sk-chat-foot" data-chat-form>
      <textarea data-chat-input placeholder="Ask about the plant…" aria-label="Ask about the plant" rows="2"></textarea>
      <button type="submit" data-chat-send>send</button>
    </form>`;

  document.body.appendChild(fab);
  document.body.appendChild(panel);

  const el = (name) => panel.querySelector(`[data-chat-${name}]`);
  const log = el("log");
  const input = el("input");
  const providerSel = el("provider");
  const modelSel = el("model");
  const keyInput = el("key");
  const baseInput = el("base");
  const note = el("note");
  const chips = el("chips");
  const stateEl = el("state");
  const settingsBox = el("settings");

  const transcript = [];

  const fillModels = () => {
    const list = CHAT_MODELS[settings.provider] || CHAT_MODELS.local;
    modelSel.innerHTML = list.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    if (list.some(([value]) => value === settings.model)) modelSel.value = settings.model;
  };

  const refresh = () => {
    providerSel.innerHTML = CHAT_PROVIDERS.map(([value, label]) => `<option value="${value}">${label}</option>`).join("");
    providerSel.value = settings.provider;
    fillModels();
    keyInput.value = settings.key;
    baseInput.value = settings.baseUrl;
    el("key-row").hidden = settings.provider === "local" || settings.provider === "workers-ai";
    el("base-row").hidden = settings.provider !== "openai";
    el("model-row").hidden = settings.provider === "local";
    note.innerHTML =
      settings.provider === "local"
        ? "The local describer answers from the plant's own numbers: no key, no network."
        : settings.provider === "workers-ai"
          ? "Workers AI runs on the same Cloudflare account as this page: no key, no account of its own."
          : "Your key stays in this browser and is sent only with the request that needs it.";
    const fabVisible = panel.hidden;
    fab.hidden = !fabVisible;
  };

  const currentState = () => ({
    mode: state.mode,
    stages: state.stages,
    cuts: [...state.cuts].map((key) => Number(key.slice(3))),
  });

  const say = (who, text, cls = "") => {
    const bubble = document.createElement("div");
    bubble.className = `sk-msg ${who} ${cls}`.trim();
    bubble.innerHTML = who === "user" ? chatInline(text) : chatRender(text);
    log.appendChild(bubble);
    log.scrollTop = log.scrollHeight;
    return bubble;
  };

  const stateText = () => {
    const mode = context.modes[state.mode];
    const vac = context.vacuum.find((v) => v.stages === state.stages);
    const cuts = [...state.cuts].map((key) => context.beds[Number(key.slice(3))].grade);
    return `${mode.title} · ${vac.stages} stage · ${vac.mbar} mbar${cuts.length ? ` · ${cuts.join(", ")} cut` : ""}`;
  };

  const setState = () => {
    stateEl.textContent = stateText();
  };

  const open = () => {
    panel.hidden = false;
    fab.hidden = true;
    fab.setAttribute("aria-expanded", "true");
    setState();
    if (!log.childElementCount) {
      say(
        "bot",
        [
          `**${context.name}** — ${context.subtitle}.`,
          "",
          "Ask me about the plant. I know the numbers: the sieve cuts, the vacuum sets, the membrane, the condenser bank, the scrubber, the two setups and the audit.",
          "",
          "Three engines: the local describer (no key, no network), Workers AI (the model that comes with this site's Cloudflare account, no key), or Gemini or any OpenAI-compatible endpoint with a key of your own in the ⚙.",
        ].join("\n"),
      );
    }
    input.focus();
  };

  const close = () => {
    panel.hidden = true;
    fab.hidden = false;
    fab.setAttribute("aria-expanded", "false");
  };

  fab.addEventListener("click", open);
  el("close").addEventListener("click", close);
  el("gear").addEventListener("click", () => {
    settingsBox.hidden = !settingsBox.hidden;
    if (!settingsBox.hidden) keyInput.focus();
  });

  providerSel.addEventListener("change", () => {
    settings.provider = providerSel.value;
    settings.model = "";
    chatSave(settings);
    refresh();
  });
  modelSel.addEventListener("change", () => {
    settings.model = modelSel.value;
    chatSave(settings);
  });
  keyInput.addEventListener("change", () => {
    settings.key = keyInput.value.trim();
    chatSave(settings);
  });
  baseInput.addEventListener("change", () => {
    settings.baseUrl = baseInput.value.trim();
    chatSave(settings);
  });
  el("forget").addEventListener("click", () => {
    settings.key = "";
    keyInput.value = "";
    chatSave(settings);
    say("bot", "The key is forgotten. This browser will not remember it.");
  });

  for (const label of CHAT_CHIPS) {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.textContent = label;
    chip.addEventListener("click", () => {
      input.value = label;
      form.requestSubmit();
    });
    chips.appendChild(chip);
  }

  const localAnswer = (question) => describe(context, question, currentState());

  const remoteAnswer = async (question, bubble) => {
    const base = location.protocol === "file:" || location.port === "" ? CHAT_DEPLOYED : "";
    const targets = base ? [base, CHAT_DEPLOYED] : [""];
    let lastError = null;
    for (const target of targets) {
      try {
        const res = await fetch(`${target}/api/chat`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            provider: settings.provider,
            model: settings.model,
            key: settings.key,
            baseUrl: settings.baseUrl,
            state: currentState(),
            messages: transcript.map((m) => ({ role: m.role, content: m.content })),
          }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error || `${res.status} ${res.statusText}`);
        }
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let text = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const frames = buffer.split("\n\n");
          buffer = frames.pop() || "";
          for (const frame of frames) {
            const line = frame.trim();
            if (!line.startsWith("data:")) continue;
            const payload = line.slice(5).trim();
            if (!payload) continue;
            let obj;
            try {
              obj = JSON.parse(payload);
            } catch {
              continue;
            }
            if (obj.error) throw new Error(obj.error);
            if (obj.text) {
              text += obj.text;
              bubble.innerHTML = chatRender(text);
              log.scrollTop = log.scrollHeight;
            }
          }
        }
        return text;
      } catch (err) {
        lastError = err;
      }
    }
    throw lastError || new Error("no answer");
  };

  const form = el("form");
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    const question = input.value.trim();
    if (!question) return;
    input.value = "";
    transcript.push({ role: "user", content: question });
    say("user", question);
    const bubble = say("bot", "…", "pending");
    el("send").disabled = true;
    let answer = "";
    try {
      if (settings.provider === "local") {
        answer = localAnswer(question);
        bubble.innerHTML = chatRender(answer);
      } else {
        answer = await remoteAnswer(question, bubble);
        if (!answer) answer = "The model returned nothing. Try again, or switch the engine in the settings.";
      }
    } catch (err) {
      bubble.classList.add("err");
      bubble.innerHTML = chatRender(`**${settings.provider} failed:** ${err.message}`);
      answer = "";
    } finally {
      el("send").disabled = false;
      log.scrollTop = log.scrollHeight;
    }
    transcript.push({ role: "assistant", content: answer });
  });

  input.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      form.requestSubmit();
    }
  });

  el("copy").addEventListener("click", async () => {
    const text = transcript.map((m) => `${m.role === "user" ? "You" : "SR-2"}: ${m.content}`).join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      say("bot", "Copied to the clipboard.");
    } catch {
      say("bot", "The clipboard is not available here; use the download instead.");
    }
  });

  el("md").addEventListener("click", () => {
    const body = transcript.map((m) => `**${m.role === "user" ? "You" : "SR-2"}:** ${m.content}`).join("\n\n");
    const notes = [
      `# ${context.name} — notes`,
      "",
      `Drawing state: ${stateText()}.`,
      "",
      "## The plant",
      "",
      context.description,
      "",
      "## Conversation",
      "",
      body || "_No questions yet._",
      "",
    ].join("\n");
    const blob = new Blob([notes], { type: "text/markdown" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "sr2-notes.md";
    link.click();
    URL.revokeObjectURL(url);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && !panel.hidden) close();
  });

  refresh();
  setState();
  setInterval(setState, 1000);
}

if (typeof document !== "undefined" && DATA.skidContext) {
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", chatBuild);
  else chatBuild();
}
