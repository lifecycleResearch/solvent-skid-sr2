// Procedural equipment, built from the specification's dimensions.
//
// These are not labelled boxes. Each vessel gets the parts a real one has:
// elliptical heads and weld rings, bolted flanges and tri-clamp ferrules,
// legs, a manway, a sight glass, nozzles, a nameplate; the jacketed vessels
// get their jacket and drive, the condenser bank its shells and tube sheets.
//
// Everything here is geometry, so the scene can swap in glTF assets later
// without changing the workflow above it.

const GEO = {
  bolt: new THREE.CylinderGeometry(0.016, 0.016, 0.045, 6),
  ferrule: new THREE.CylinderGeometry(1, 1, 0.035, 24),
  rod: new THREE.CylinderGeometry(1, 1, 1, 12),
};

function mesh(parent, geometry, material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  parent.add(m);
  return m;
}

function cyl(rt, rb, h, segments = 32) {
  return new THREE.CylinderGeometry(rt, rb, h, segments);
}

function torus(r, tube, segments = 40) {
  return new THREE.TorusGeometry(r, tube, 10, segments);
}

function headGeometry(r) {
  // The top half of a sphere, squashed into an elliptical head.
  const g = new THREE.SphereGeometry(r, 36, 16, 0, Math.PI * 2, 0, Math.PI / 2);
  g.scale(1, 0.45, 1);
  return g;
}

function rodBetween(parent, a, b, radius, material) {
  const start = new THREE.Vector3(...a);
  const end = new THREE.Vector3(...b);
  const dir = new THREE.Vector3().subVectors(end, start);
  const m = mesh(parent, GEO.rod, material);
  m.scale.set(radius, dir.length(), radius);
  m.position.copy(start.clone().add(end).multiplyScalar(0.5));
  m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.normalize());
  return m;
}

function boltCircle(parent, radius, y, count = 12, axis = "y") {
  const group = new THREE.Group();
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2;
    const b = mesh(group, GEO.bolt, MATERIALS.bolt, Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
    b.castShadow = false;
  }
  group.position.y = y;
  if (axis === "x") group.rotation.z = Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  parent.add(group);
  return group;
}

function flange(parent, radius, y, axis = "y") {
  const group = new THREE.Group();
  mesh(group, cyl(radius, radius, 0.055, 28), MATERIALS.steelDark, 0, 0, 0);
  mesh(group, torus(radius * 0.82, 0.008, 28), MATERIALS.gasket, 0, 0.03, 0).rotation.x = Math.PI / 2;
  boltCircle(group, radius * 0.78, 0.035, 10, axis);
  group.position.y = y;
  if (axis === "x") group.rotation.z = Math.PI / 2;
  if (axis === "z") group.rotation.x = Math.PI / 2;
  parent.add(group);
  return group;
}

/** A nozzle: a stub, its clamp ferrule, and the flange at the free end. */
function nozzle(parent, x, y, z, dir = [0, 1, 0], len = 0.28, r = 0.07) {
  const group = new THREE.Group();
  group.position.set(x, y, z);
  mesh(group, cyl(r, r, len, 18), MATERIALS.steel, 0, len / 2, 0);
  mesh(group, cyl(r * 1.45, r * 1.45, 0.04, 20), MATERIALS.steelDark, 0, len * 0.7, 0);
  flange(group, r * 1.7, len);
  group.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...dir).normalize());
  parent.add(group);
  return group;
}

function legs(parent, radius, height, count = 4) {
  for (let i = 0; i < count; i += 1) {
    const angle = (i / count) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * radius;
    mesh(parent, new THREE.BoxGeometry(0.09, height, 0.09), MATERIALS.frame, x, height / 2, z);
    mesh(parent, new THREE.BoxGeometry(0.18, 0.035, 0.18), MATERIALS.frame, x, 0.02, z);
  }
}

function sightGlass(parent, radius, y, h = 0.75) {
  const group = new THREE.Group();
  group.position.set(radius + 0.09, y, 0);
  mesh(group, cyl(0.035, 0.035, h, 16), MATERIALS.glass, 0, h / 2, 0);
  for (const dx of [-0.055, 0.055]) {
    mesh(group, cyl(0.008, 0.008, h, 8), MATERIALS.steelDark, dx, h / 2, 0.03);
  }
  mesh(group, cyl(0.05, 0.05, 0.04, 14), MATERIALS.steelDark, 0, 0, 0);
  mesh(group, cyl(0.05, 0.05, 0.04, 14), MATERIALS.steelDark, 0, h, 0);
  // The liquid in the glass. A quiet reminder that this is a working vessel.
  mesh(group, cyl(0.028, 0.028, h * 0.55, 14), MATERIALS.liquid, 0, h * 0.28, 0);
  parent.add(group);
  return group;
}

function manway(parent, r, y) {
  mesh(parent, cyl(r, r, 0.16, 28), MATERIALS.steel, 0, y + 0.08, 0);
  flange(parent, r * 1.3, y + 0.16);
  mesh(parent, cyl(r * 1.05, r * 1.05, 0.035, 28), MATERIALS.steelDark, 0, y + 0.22, 0);
  const handle = mesh(parent, torus(r * 0.45, 0.015, 20), MATERIALS.steelDark, 0, y + 0.25, 0);
  handle.rotation.x = Math.PI / 2;
}

function motor(parent, y, scale = 1) {
  const group = new THREE.Group();
  group.position.set(0, y, 0);
  group.scale.setScalar(scale);
  mesh(group, cyl(0.12, 0.12, 0.18, 20), MATERIALS.steelDark, 0, 0.09, 0);
  mesh(group, new THREE.BoxGeometry(0.34, 0.36, 0.3), MATERIALS.motor, 0, 0.36, 0);
  for (let i = 0; i < 5; i += 1) {
    mesh(group, new THREE.BoxGeometry(0.37, 0.018, 0.32), MATERIALS.frame, 0, 0.22 + i * 0.06, 0);
  }
  mesh(group, cyl(0.1, 0.1, 0.14, 18), MATERIALS.motor, 0, 0.6, 0);
  mesh(group, new THREE.BoxGeometry(0.16, 0.12, 0.12), MATERIALS.frame, 0.2, 0.4, 0);
  parent.add(group);
  return group;
}

function textPlane(text, width = 0.8, height = 0.24, colour = "#d4d4d4") {
  const canvas = document.createElement("canvas");
  canvas.width = 512;
  canvas.height = 160;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#161616";
  ctx.fillRect(0, 0, 512, 160);
  ctx.strokeStyle = "#3a3a3a";
  ctx.lineWidth = 4;
  ctx.strokeRect(6, 6, 500, 148);
  ctx.fillStyle = colour;
  ctx.font = "400 64px Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 256, 84, 470);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const material = new THREE.MeshStandardMaterial({ map: texture, roughness: 0.6, metalness: 0.2 });
  return new THREE.Mesh(new THREE.PlaneGeometry(width, height), material);
}

function nameplate(parent, text, radius, y) {
  const plate = textPlane(text, Math.min(0.9, radius * 0.9), 0.22);
  plate.position.set(0, y, radius + 0.02);
  parent.add(plate);
}

function labelSprite(text) {
  const canvas = document.createElement("canvas");
  canvas.width = 640;
  canvas.height = 128;
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "rgba(11,11,11,0.72)";
  ctx.beginPath();
  ctx.roundRect(0, 0, 640, 128, 18);
  ctx.fill();
  ctx.fillStyle = "#e6e6e6";
  ctx.font = "400 42px Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(text, 320, 64, 600);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: texture, transparent: true, depthWrite: false }));
  sprite.scale.set(2.0, 0.4, 1);
  return sprite;
}

/** The vertical-vessel skeleton every drum, jacket and column builds on. */
function verticalShell(group, r, h, legH = 0.45) {
  legs(group, r * 0.86, legH);
  mesh(group, cyl(r, r, h, 44), MATERIALS.steel, 0, legH + h / 2, 0);
  mesh(group, headGeometry(r), MATERIALS.steel, 0, legH + h, 0);
  const bottom = mesh(group, headGeometry(r), MATERIALS.steel, 0, legH, 0);
  bottom.rotation.z = Math.PI;
  for (const y of [legH + 0.02, legH + h - 0.02]) {
    const ring = mesh(group, torus(r, 0.012, 44), MATERIALS.steelDark, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  return { top: legH + h, legH };
}

function buildDrum(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  const { top } = verticalShell(group, r, h);
  manway(group, r * 0.32, top);
  nozzle(group, r * 0.55, top + r * 0.16, 0, [0, 1, 0], 0.24, 0.07);
  nozzle(group, r, top - h * 0.25, 0, [1, 0.25, 0], 0.3, 0.06);
  nozzle(group, r, top - h * 0.85, 0, [1, -0.1, 0], 0.3, 0.06);
  sightGlass(group, r, top - h * 0.8, Math.min(0.9, h * 0.45));
  nameplate(group, unit.id, r, top - h * 0.5);
  return group;
}

function buildJacketed(unit) {
  const group = buildDrum(unit);
  const r = unit.d / 2;
  const h = unit.h;
  const legH = 0.45;
  const jacketH = h * 0.72;
  mesh(group, cyl(r + 0.09, r + 0.09, jacketH, 44), MATERIALS.jacket, 0, legH + jacketH / 2 + 0.06, 0);
  for (const y of [legH + 0.06, legH + jacketH + 0.06]) {
    const ring = mesh(group, torus(r + 0.09, 0.016, 44), MATERIALS.steelDark, 0, y, 0);
    ring.rotation.x = Math.PI / 2;
  }
  nozzle(group, -(r + 0.09), legH + 0.2, 0, [-1, 0, 0], 0.3, 0.06);
  nozzle(group, -(r + 0.09), legH + jacketH, 0, [-1, 0.2, 0], 0.3, 0.06);
  if (unit.type.includes("scraper") || unit.id === "V-102") motor(group, legH + h + r * 0.32 + 0.12, unit.type.includes("scraper") ? 1.35 : 1);
  if (unit.type.includes("scraper")) {
    // Insulation bands and the scraper drive's torque housing.
    for (const y of [legH + h * 0.35, legH + h * 0.6]) {
      const band = mesh(group, torus(r + 0.11, 0.02, 44), MATERIALS.gasket, 0, y, 0);
      band.rotation.x = Math.PI / 2;
    }
  }
  return group;
}

function buildStrainer(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  const { top } = verticalShell(group, r, h, 0.3);
  const clamp = mesh(group, torus(r * 1.08, 0.03, 32), MATERIALS.steelDark, 0, top - 0.05, 0);
  clamp.rotation.x = Math.PI / 2;
  mesh(group, cyl(r * 0.6, r * 0.6, 0.1, 24), MATERIALS.steelDark, 0, top + r * 0.2, 0);
  const handle = mesh(group, torus(0.12, 0.014, 20), MATERIALS.steelDark, 0, top + r * 0.2 + 0.1, 0);
  handle.rotation.x = Math.PI / 2;
  nozzle(group, r, top - 0.15, 0, [1, 0.2, 0], 0.25, 0.05);
  nozzle(group, -r, top - h * 0.7, 0, [-1, 0, 0], 0.25, 0.05);
  // A pressure gauge on the outlet side: the instrument that tells you the
  // bag is blinding, which is what this part is for.
  const gauge = new THREE.Group();
  gauge.position.set(r + 0.08, top + 0.1, 0.15);
  mesh(gauge, cyl(0.07, 0.07, 0.04, 20), MATERIALS.steelDark, 0, 0, 0).rotation.x = Math.PI / 2;
  mesh(gauge, cyl(0.055, 0.055, 0.045, 20), MATERIALS.dial, 0, 0, 0.01).rotation.x = Math.PI / 2;
  group.add(gauge);
  nameplate(group, unit.id, r, top - h * 0.45);
  return group;
}

function buildFallingFilm(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  const { top } = verticalShell(group, r, h, 0.75);
  // A conical bottom instead of an elliptical head, as a falling-film has.
  mesh(group, cyl(r, 0.14, 0.7, 36), MATERIALS.steel, 0, 0.4, 0);
  nozzle(group, 0, 0.06, 0, [0, -1, 0], 0.24, 0.06);
  manway(group, r * 0.3, top);
  // The distribution head: the reason the film is thin and the duty is cheap.
  for (let i = 0; i < 6; i += 1) {
    const a = (i / 6) * Math.PI * 2;
    nozzle(group, Math.cos(a) * r * 0.7, top + 0.05, Math.sin(a) * r * 0.7, [0, 1, 0], 0.18, 0.035);
  }
  nozzle(group, r, top - 0.35, 0, [1, 0.55, 0], 0.45, 0.1);
  sightGlass(group, r, top - h * 0.7, 0.8);
  for (const y of [0.9, top - 0.5]) {
    const band = mesh(group, torus(r + 0.02, 0.02, 40), MATERIALS.steelDark, 0, y, 0);
    band.rotation.x = Math.PI / 2;
  }
  nameplate(group, unit.id, r, top - h * 0.45);
  return group;
}

function buildCondenserBank(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const len = unit.h; // the shell's length, laid horizontally
  const frameW = len + 0.6;
  const frameD = 1.15;
  const frameH = 2.0;
  for (const x of [-frameW / 2, frameW / 2]) {
    for (const z of [-frameD / 2, frameD / 2]) {
      mesh(group, new THREE.BoxGeometry(0.07, frameH, 0.07), MATERIALS.frame, x, frameH / 2, z);
    }
  }
  for (const y of [0.25, 1.0, 1.75]) {
    for (const z of [-frameD / 2, frameD / 2]) {
      mesh(group, new THREE.BoxGeometry(frameW + 0.07, 0.06, 0.06), MATERIALS.frame, 0, y, z);
    }
  }
  // Four shells, two rows of two, each with tube sheets, bolt circles, saddles
  // and its own coolant nozzles. Warm end first, as the spec says.
  for (let row = 0; row < 2; row += 1) {
    for (let col = 0; col < 2; col += 1) {
      const shell = new THREE.Group();
      shell.position.set(0, 0.55 + row * 0.8, -0.28 + col * 0.56);
      const body = mesh(shell, cyl(r, r, len, 32), MATERIALS.steel, 0, 0, 0);
      body.rotation.z = Math.PI / 2;
      for (const side of [-1, 1]) {
        const cap = mesh(shell, headGeometry(r), MATERIALS.steel, side * len * 0.5, 0, 0);
        cap.rotation.z = side > 0 ? -Math.PI / 2 : Math.PI / 2;
        const end = new THREE.Group();
        end.position.set(side * (len * 0.5 - 0.05), 0, 0);
        flange(end, r * 1.12, 0, "x");
        shell.add(end);
        nozzle(shell, side * len * 0.42, r, 0, [0, 1, 0], 0.16, 0.035);
      }
      for (const x of [-len * 0.3, len * 0.3]) {
        mesh(shell, new THREE.BoxGeometry(0.08, 0.1, r * 2.2), MATERIALS.frame, x, -r - 0.04, 0);
      }
      group.add(shell);
    }
  }
  const plate = textPlane(unit.id, 0.7, 0.2);
  plate.position.set(0, frameH + 0.1, frameD / 2 + 0.02);
  group.add(plate);
  return group;
}

function buildChiller(unit) {
  const group = new THREE.Group();
  const w = 1.15;
  const h = 0.85;
  const d = 0.9;
  mesh(group, new THREE.BoxGeometry(w, h, d), MATERIALS.painted, 0, h / 2 + 0.15, 0);
  for (const x of [-0.45, 0.45]) {
    for (const z of [-0.35, 0.35]) mesh(group, new THREE.BoxGeometry(0.08, 0.16, 0.08), MATERIALS.frame, x, 0.08, z);
  }
  // The fan and the coil fins: this is a purchased chiller, not a vessel.
  mesh(group, cyl(0.32, 0.32, 0.1, 28), MATERIALS.frame, 0, h + 0.2, 0);
  mesh(group, torus(0.3, 0.015, 28), MATERIALS.steelDark, 0, h + 0.26, 0).rotation.x = Math.PI / 2;
  for (let i = 0; i < 4; i += 1) {
    const blade = mesh(group, new THREE.BoxGeometry(0.5, 0.015, 0.08), MATERIALS.steelDark, 0, h + 0.25, 0);
    blade.rotation.y = (i / 4) * Math.PI;
  }
  for (let i = 0; i < 10; i += 1) {
    mesh(group, new THREE.BoxGeometry(w * 0.92, 0.015, 0.02), MATERIALS.steelDark, 0, 0.28 + i * 0.06, d / 2 + 0.01);
  }
  nozzle(group, w / 2, 0.45, 0.2, [1, 0, 0], 0.22, 0.05);
  nozzle(group, w / 2, 0.65, -0.2, [1, 0, 0], 0.22, 0.05);
  const plate = textPlane(unit.id, 0.6, 0.18);
  plate.position.set(0, h * 0.75, d / 2 + 0.02);
  group.add(plate);
  return group;
}

function buildScrubber(unit) {
  const group = buildDrum(unit);
  const r = unit.d / 2;
  // The media bed window: carbon and zeolite are what the permit is written
  // against, so they are visible rather than implied.
  const window_ = mesh(group, new THREE.BoxGeometry(0.12, unit.h * 0.4, 0.06), MATERIALS.media, 0, 0.45 + unit.h * 0.4, r + 0.02);
  window_.castShadow = false;
  return group;
}

function buildProductDrum(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  mesh(group, cyl(r, r, h, 36), MATERIALS.amber, 0, h / 2 + 0.12, 0);
  mesh(group, headGeometry(r), MATERIALS.steel, 0, h + 0.12, 0);
  mesh(group, cyl(r * 0.4, r * 0.4, 0.14, 24), MATERIALS.steelDark, 0, h + 0.2, 0);
  mesh(group, torus(r, 0.015, 36), MATERIALS.steelDark, 0, 0.12, 0).rotation.x = Math.PI / 2;
  nameplate(group, unit.id, r, h * 0.6);
  return group;
}

/** A brewery tank on legs with a cone: unitank or brite tank. */
function buildBreweryTank(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  const cone = unit.cone || 0.45;
  const legH = 1.05;
  // Four legs from the cone ring to the floor, the way brewery tanks stand.
  for (let i = 0; i < 4; i += 1) {
    const angle = (i / 4) * Math.PI * 2 + Math.PI / 4;
    const x = Math.cos(angle) * r * 1.05;
    const z = Math.sin(angle) * r * 1.05;
    rodBetween(group, [x * 0.55, legH, z * 0.55], [x, 0, z], 0.045, MATERIALS.frame);
    mesh(group, new THREE.BoxGeometry(0.2, 0.04, 0.2), MATERIALS.frame, x, 0.02, z);
  }
  // The shell, its cone, and the heads.
  mesh(group, cyl(r, r, h, 44), MATERIALS.steel, 0, legH + cone + h / 2, 0);
  mesh(group, cyl(0.12, r, cone, 40), MATERIALS.steel, 0, legH + cone / 2, 0);
  mesh(group, headGeometry(r), MATERIALS.steel, 0, legH + cone + h, 0);
  for (const y of [legH + cone + 0.02, legH + cone + h - 0.02]) {
    mesh(group, torus(r, 0.012, 44), MATERIALS.steelDark, 0, y, 0).rotation.x = Math.PI / 2;
  }
  const jacketed = (unit.type || "").includes("jacketed");
  if (jacketed) {
    const jacketH = h * 0.68;
    mesh(group, cyl(r + 0.08, r + 0.08, jacketH, 44), MATERIALS.jacket, 0, legH + cone + jacketH / 2 + 0.05, 0);
    for (const y of [legH + cone + 0.05, legH + cone + jacketH + 0.05]) {
      mesh(group, torus(r + 0.08, 0.015, 44), MATERIALS.steelDark, 0, y, 0).rotation.x = Math.PI / 2;
    }
    nozzle(group, -(r + 0.08), legH + cone + 0.2, 0, [-1, 0, 0], 0.28, 0.055);
    nozzle(group, -(r + 0.08), legH + cone + jacketH, 0, [-1, 0.15, 0], 0.28, 0.055);
  }
  // Manway, charge nozzle, drain with its valve, PRV on a brite, sight glass.
  manway(group, r * 0.28, legH + cone + h);
  nozzle(group, r * 0.5, legH + cone + h + r * 0.1, 0, [0, 1, 0], 0.22, 0.06);
  nozzle(group, 0, legH - 0.04, r * 0.9, [0, -1, 0], 0.3, 0.05);
  const valve = mesh(group, torus(0.09, 0.02, 18), MATERIALS.steelDark, 0, legH - 0.42, r * 0.9);
  valve.rotation.x = Math.PI / 2;
  sightGlass(group, r, legH + cone + h * 0.25, Math.min(0.9, h * 0.4));
  if ((unit.type || "").includes("brite")) {
    // The PRV, the fitting a brite tank exists for.
    mesh(group, cyl(0.07, 0.07, 0.16, 16), MATERIALS.steelDark, 0, legH + cone + h + r * 0.18, 0);
    mesh(group, cyl(0.1, 0.1, 0.06, 20), MATERIALS.bolt, 0, legH + cone + h + r * 0.18 + 0.11, 0);
  }
  if ((unit.type || "").includes("scraper")) {
    motor(group, legH + cone + h + r * 0.3, 1.3);
  }
  nameplate(group, unit.id, r, legH + cone + h * 0.55);
  return group;
}

/** The media (CRC) column: a slim tri-clamp column with sight glasses. */
function buildMediaColumn(unit) {
  const group = new THREE.Group();
  const r = unit.d / 2;
  const h = unit.h;
  mesh(group, cyl(r, r, h, 28), MATERIALS.glassColumn, 0, 0.35 + h / 2, 0);
  mesh(group, cyl(0.1, 0.1, 0.35, 20), MATERIALS.steel, 0, 0.18, 0);
  mesh(group, new THREE.BoxGeometry(0.5, 0.05, 0.5), MATERIALS.frame, 0, 0.02, 0);
  // Tri-clamp ferrules top and bottom, and the media bed seen through the glass.
  for (const y of [0.35, 0.35 + h]) {
    const clamp = mesh(group, cyl(r * 1.35, r * 1.35, 0.05, 28), MATERIALS.steelDark, 0, y, 0);
    clamp.castShadow = false;
  }
  mesh(group, cyl(r * 0.92, r * 0.92, h * 0.55, 24), MATERIALS.media, 0, 0.35 + h * 0.28, 0);
  mesh(group, cyl(r * 0.92, r * 0.92, h * 0.1, 24), MATERIALS.liquid, 0, 0.35 + h * 0.78, 0);
  nozzle(group, 0, 0.35 + h, 0, [0, 1, 0], 0.24, 0.05);
  nozzle(group, 0, 0.02, 0, [0, -1, 0], 0.2, 0.05);
  const plate = textPlane(unit.id, 0.3, 0.09);
  plate.position.set(0, 0.35 + h * 0.55, r + 0.02);
  group.add(plate);
  return group;
}

/** The membrane skid: three vertical cartridge housings on a frame. */
function buildMembraneSkid(unit) {
  const group = new THREE.Group();
  const h = unit.h;
  for (const x of [-0.4, 0.4]) {
    for (const z of [-0.3, 0.3]) mesh(group, new THREE.BoxGeometry(0.06, h * 0.55, 0.06), MATERIALS.frame, x, h * 0.28, z);
  }
  mesh(group, new THREE.BoxGeometry(1.0, 0.06, 0.8), MATERIALS.frame, 0, h * 0.56, 0);
  for (const x of [-0.28, 0, 0.28]) {
    const housing = new THREE.Group();
    housing.position.set(x, h * 0.6, 0);
    mesh(housing, cyl(0.11, 0.11, h * 0.36, 22), MATERIALS.steel, 0, 0, 0);
    mesh(housing, headGeometry(0.11), MATERIALS.steel, 0, h * 0.18, 0);
    const cap = mesh(housing, headGeometry(0.11), MATERIALS.steel, 0, -h * 0.18, 0);
    cap.rotation.z = Math.PI;
    mesh(housing, cyl(0.045, 0.045, 0.18, 14), MATERIALS.steelDark, 0, h * 0.18 + 0.12, 0);
    nozzle(housing, 0, -h * 0.19, 0, [0, -1, 0], 0.14, 0.035);
    group.add(housing);
  }
  mesh(group, new THREE.BoxGeometry(1.0, 0.04, 0.8), MATERIALS.frame, 0, 0.12, 0);
  const plate = textPlane(unit.id, 0.6, 0.17);
  plate.position.set(0, h * 0.72, 0.42);
  group.add(plate);
  return group;
}

/** The RO skid: horizontal 40 inch elements, labelled for water service. */
function buildROSkid(unit) {
  const group = new THREE.Group();
  const len = 1.0; // a 4040 element is 40 inches; scaled to the scene
  mesh(group, new THREE.BoxGeometry(1.2, 0.06, 0.7), MATERIALS.frame, 0, 0.16, 0);
  for (const z of [-0.25, 0.25]) {
    mesh(group, new THREE.BoxGeometry(0.06, 0.5, 0.06), MATERIALS.frame, -0.5, 0.4, z);
    mesh(group, new THREE.BoxGeometry(0.06, 0.5, 0.06), MATERIALS.frame, 0.5, 0.4, z);
  }
  mesh(group, new THREE.BoxGeometry(1.1, 0.05, 0.06), MATERIALS.frame, 0, 0.66, 0);
  for (const z of [-0.2, 0.2]) {
    const element = new THREE.Group();
    element.position.set(0, 0.45, z);
    const body = mesh(element, cyl(0.09, 0.09, len, 22), MATERIALS.steel, 0, 0, 0);
    body.rotation.z = Math.PI / 2;
    for (const side of [-1, 1]) {
      const end = mesh(element, cyl(0.11, 0.11, 0.05, 20), MATERIALS.steelDark, side * (len / 2 + 0.02), 0, 0);
      end.rotation.z = Math.PI / 2;
      mesh(element, cyl(0.04, 0.04, 0.14, 12), MATERIALS.steelDark, side * (len / 2 + 0.11), 0, 0).rotation.z = Math.PI / 2;
    }
    group.add(element);
  }
  const plate = textPlane("SK-103 RO", 0.5, 0.14, "#a3a3a3");
  plate.position.set(0, 0.72, 0.36);
  group.add(plate);
  return group;
}

function buildEquipment(unit) {
  if (unit.id === "F-101") return buildStrainer(unit);
  if (unit.id === "EV-101") return buildFallingFilm(unit);
  if (unit.id === "CN-101") return buildCondenserBank(unit);
  if (unit.id === "CH-101") return buildChiller(unit);
  if (unit.id === "SC-101") return buildScrubber(unit);
  if (unit.id === "PD-101") return buildProductDrum(unit);
  if (unit.id === "SK-101") return buildMediaColumn(unit);
  if (unit.id === "SK-102") return buildMembraneSkid(unit);
  if (unit.id === "SK-103") return buildROSkid(unit);
  if (unit.type.includes("brite") || unit.type.includes("unitank") || unit.type.includes("mash tun")) return buildBreweryTank(unit);
  if (unit.type.includes("jacketed")) return buildJacketed(unit);
  return buildDrum(unit);
}

const MATERIALS = {};
function makeMaterials() {
  MATERIALS.steel = new THREE.MeshStandardMaterial({ color: 0xb4b8bc, metalness: 0.95, roughness: 0.26 });
  MATERIALS.steelDark = new THREE.MeshStandardMaterial({ color: 0x74787c, metalness: 0.92, roughness: 0.34 });
  MATERIALS.jacket = new THREE.MeshStandardMaterial({ color: 0x8c9095, metalness: 0.9, roughness: 0.4 });
  MATERIALS.frame = new THREE.MeshStandardMaterial({ color: 0x383a3c, metalness: 0.7, roughness: 0.5 });
  MATERIALS.motor = new THREE.MeshStandardMaterial({ color: 0x2c3a44, metalness: 0.65, roughness: 0.45 });
  MATERIALS.painted = new THREE.MeshStandardMaterial({ color: 0x363c40, metalness: 0.6, roughness: 0.5 });
  MATERIALS.bolt = new THREE.MeshStandardMaterial({ color: 0xd0d3d6, metalness: 0.95, roughness: 0.3 });
  MATERIALS.gasket = new THREE.MeshStandardMaterial({ color: 0x202224, metalness: 0.1, roughness: 0.9 });
  MATERIALS.glass = new THREE.MeshPhysicalMaterial({ color: 0xb8c4cc, metalness: 0, roughness: 0.06, transparent: true, opacity: 0.35, transmission: 0.6, thickness: 0.2 });
  MATERIALS.glassColumn = new THREE.MeshPhysicalMaterial({ color: 0xb0bcc4, metalness: 0, roughness: 0.05, transparent: true, opacity: 0.3, transmission: 0.65, thickness: 0.15 });
  MATERIALS.liquid = new THREE.MeshStandardMaterial({ color: 0x6b9bff, metalness: 0.1, roughness: 0.2, emissive: 0x14304f, emissiveIntensity: 0.4 });
  MATERIALS.dial = new THREE.MeshStandardMaterial({ color: 0xe4e2dc, roughness: 0.4, metalness: 0.1 });
  MATERIALS.media = new THREE.MeshStandardMaterial({ color: 0x242220, roughness: 0.95, metalness: 0.05 });
  MATERIALS.amber = new THREE.MeshPhysicalMaterial({ color: 0x8a5a22, metalness: 0.1, roughness: 0.15, transparent: true, opacity: 0.75, transmission: 0.35 });
}
