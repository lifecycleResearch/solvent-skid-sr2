// The 3D figure's live behaviour: turning the plant, and picking a part.
//
// The kit's engine owns the frame: it re-projects and re-shadows every part
// and solves the draw order. This script only says where the plant is
// looking from -- the yaw and the tilt -- and handles the pointer.

const stage = document.querySelector(".iso-stage") || document.querySelector(".sk-stage");
const liveEl = document.querySelector("[data-sk-live]");
const state = { yaw: 0, tilt: 0 };

const controller = TURN.mount(stage, SCENE_DATA, {
  onHold: () => {},
  onFrame: (turned) => {
    const values = turned.values || {};
    if (typeof values.yaw === "number") state.yaw = values.yaw;
    if (typeof values.tilt === "number") state.tilt = values.tilt;
    say();
  },
});

function say() {
  if (!liveEl) return;
  liveEl.textContent = `yaw ${Math.round(((state.yaw % 360) + 360) % 360)}° · tilt ${Math.round(state.tilt)}°`;
}

function setPose({ yaw, tilt }) {
  if (typeof yaw === "number") state.yaw = yaw;
  if (typeof tilt === "number") state.tilt = Math.max(-32, Math.min(32, tilt));
  controller.set({ yaw: state.yaw, tilt: state.tilt });
  say();
}

// Drag: sideways turns the plant, up and down tips it.
let drag = null;
stage.addEventListener("pointerdown", (event) => {
  drag = { x: event.clientX, y: event.clientY, yaw: state.yaw, tilt: state.tilt, id: event.pointerId, captured: false };
});
stage.addEventListener("pointermove", (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  const dx = event.clientX - drag.x;
  const dy = event.clientY - drag.y;
  if (!drag.captured && Math.hypot(dx, dy) > 3) {
    drag.captured = true;
    try {
      stage.setPointerCapture(event.pointerId);
    } catch {
      /* the pointer may already be gone */
    }
    stage.setAttribute("data-drag", "");
  }
  if (!drag.captured) return;
  setPose({ yaw: drag.yaw + dx * 0.45, tilt: drag.tilt + dy * 0.25 });
});
const release = (event) => {
  if (!drag || event.pointerId !== drag.id) return;
  drag = null;
  stage.removeAttribute("data-drag");
  try {
    stage.releasePointerCapture(event.pointerId);
  } catch {
    /* already released */
  }
};
stage.addEventListener("pointerup", release);
stage.addEventListener("pointercancel", release);

stage.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft") {
    setPose({ yaw: state.yaw - 15 });
    event.preventDefault();
  }
  if (event.key === "ArrowRight") {
    setPose({ yaw: state.yaw + 15 });
    event.preventDefault();
  }
  if (event.key === "ArrowUp") {
    setPose({ tilt: state.tilt - 5 });
    event.preventDefault();
  }
  if (event.key === "ArrowDown") {
    setPose({ tilt: state.tilt + 5 });
    event.preventDefault();
  }
});

for (const button of document.querySelectorAll("[data-turn]")) {
  button.addEventListener("click", () => setPose({ yaw: state.yaw + Number(button.getAttribute("data-turn")) }));
}
for (const button of document.querySelectorAll("[data-tilt]")) {
  button.addEventListener("click", () => setPose({ tilt: state.tilt + (button.getAttribute("data-tilt") === "up" ? -5 : 5) }));
}
const reset = document.querySelector("[data-reset]");
if (reset) reset.addEventListener("click", () => setPose({ yaw: 0, tilt: 0 }));

// The inspector: click a part, read it.
const inspector = installInspector({ catalogue: CATALOGUE, stage, svg: null, onChange: () => {} });

say();
