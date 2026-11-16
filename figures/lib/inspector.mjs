// The inspector, shared by every figure.
//
// Click a part and the page tells the reader what it is, what it does, the
// details that make it this part, and what it is doing in this process --
// with the papers and the patents that support it.
//
// It is the same code in the 2D figure and in the 3D one, so the two cannot
// describe the plant differently.

export function installInspector({ catalogue, stage, svg, onChange }) {
  const inspector = document.querySelector("[data-inspector]");
  const inspTitle = document.querySelector("[data-insp-title]");
  const inspKind = document.querySelector("[data-insp-kind]");
  const inspBody = document.querySelector("[data-insp-body]");
  if (!inspector) return null;

  const escapeHtml = (value) =>
    String(value === undefined || value === null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const link = (url, label) => (url ? `<a href="${escapeHtml(url)}" target="_blank" rel="noopener">${escapeHtml(label)}</a>` : escapeHtml(label));

  function partHtml(part) {
    const rows = (part.details || [])
      .map((d) => `<div class="sk-insp-row"><span>${escapeHtml(d.label)}</span><b>${escapeHtml(d.value)}</b><i title="the field it came from">${escapeHtml(d.from || "")}</i></div>`)
      .join("");

    const here = [];
    if (part.here.steps && part.here.steps.length) here.push(["Steps", part.here.steps.join(" · ")]);
    if (part.here.streams && part.here.streams.length) here.push(["Carries", part.here.streams.join(" · ")]);
    if (part.here.targets && part.here.targets.length) here.push(["Targets", part.here.targets.join(" · ")]);
    if (part.here.acceptance) here.push(["Acceptance", part.here.acceptance]);
    const hereRows = here.map(([label, value]) => `<div class="sk-insp-row"><span>${escapeHtml(label)}</span><b>${escapeHtml(value)}</b></div>`).join("");

    const notes = (part.here.notes || []).map((n) => `<li>${escapeHtml(n)}</li>`).join("");

    const evidence = (part.evidence || [])
      .map((topic) => {
        const papers = (topic.papers || []).slice(0, 4).map((p) => `<li>${link(p.url, p.title || p.doi)}${p.year ? ` <span class="sk-insp-year">${p.year}</span>` : ""}</li>`).join("");
        const patents = (topic.patents || []).slice(0, 3).map((p) => `<li>${link(p.url, p.number || p.title)}${p.year ? ` <span class="sk-insp-year">${p.year}</span>` : ""}</li>`).join("");
        return `<div class="sk-insp-evidence">
          <h4>${escapeHtml(topic.question || topic.topic)}</h4>
          <p class="sk-insp-query">${escapeHtml(topic.query)}</p>
          ${papers ? `<h5>Papers</h5><ul>${papers}</ul>` : ""}
          ${patents ? `<h5>Patents</h5><ul>${patents}</ul>` : ""}
          ${!papers && !patents ? `<p class="sk-insp-none">nothing retrieved for this one yet</p>` : ""}
        </div>`;
      })
      .join("");

    return `
      <section>
        <h4>What it is</h4>
        <p>${escapeHtml(part.what.text)}</p>
        ${rows ? `<div class="sk-insp-rows">${rows}</div>` : ""}
      </section>
      <section>
        <h4>What it does</h4>
        <p>${escapeHtml(part.does.text)}</p>
        ${part.does.isolation ? `<p class="sk-insp-note">${escapeHtml(part.does.isolation)}</p>` : ""}
      </section>
      <section>
        <h4>In this process</h4>
        ${hereRows ? `<div class="sk-insp-rows">${hereRows}</div>` : `<p class="sk-insp-none">the spec does not say</p>`}
        ${notes ? `<ul class="sk-insp-notes">${notes}</ul>` : ""}
      </section>
      ${evidence ? `<section><h4>The evidence</h4>${evidence}</section>` : ""}`;
  }

  function showPart(id) {
    const part = (catalogue || []).find((p) => p.id === id);
    if (!part) return;
    inspTitle.textContent = part.name;
    inspKind.textContent = `${part.id} · ${part.type || part.kind} · ${part.function}`;
    inspBody.innerHTML = partHtml(part);
    inspector.hidden = false;
    if (onChange) onChange(part);
  }

  document.querySelector("[data-insp-close]").addEventListener("click", () => {
    inspector.hidden = true;
  });

  // A photograph of the actual vessel, or of the plant, beside its record.
  // It is read in the browser and never uploaded: the image stays with the
  // reader, which is the only place a client picture can safely be.
  const upload = document.querySelector("[data-insp-upload]");
  if (upload) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "image/*";
    input.hidden = true;
    document.body.appendChild(input);
    upload.addEventListener("click", () => input.click());
    input.addEventListener("change", () => {
      const file = input.files && input.files[0];
      if (!file) return;
      const reader = new FileReader();
      reader.onload = () => {
        const box = document.querySelector("[data-insp-image]");
        if (!box) return;
        box.hidden = false;
        box.innerHTML = `<img src="${reader.result}" alt="a photograph of ${escapeHtml(part.name || "the part")}" />`;
      };
      reader.readAsDataURL(file);
    });
  }

  // Clicking a part opens it. In the 2D figure the parts are the drawing's
  // groups; in the 3D one they are the live layers' groups. Both carry the
  // part's name, so one handler serves both.
  const pick = (event) => {
    const group = event.target.closest("[data-name]");
    if (!group) return;
    const name = group.getAttribute("data-name");
    const part = (catalogue || []).find((p) => name === p.id || name.endsWith(`.${p.id}`) || name.startsWith(`${p.id}.`) || name === `vessel.${p.id}` || name === `pipe.${p.id}`);
    if (part) showPart(part.id);
  };
  if (stage) stage.addEventListener("click", pick);
  if (svg) svg.addEventListener("click", pick);

  return { showPart, partHtml, escapeHtml };
}
