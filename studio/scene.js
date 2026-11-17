// The live plant: a procedural Three.js scene with orbit controls, selectable
// vessels, and the process flow animated over real pipe routes.
//
// The page talks to this file through window.studioScene, and no further:
// setStep, setPlaying, setLabels, setFlow, setView, setSelected, steps.
// Selection comes back as a "studio-select" event carrying the part record.
//
// The palette follows the anatomy kit: greys with a tone hierarchy, one lit
// accent, and colour only where colour is the subject — the streams.

import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const sceneWrap = document.getElementById("scene-wrap");
const sceneFallback = document.getElementById("scene-fallback");

function startScene() {
  makeMaterials();

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  sceneWrap.appendChild(renderer.domElement);
  sceneWrap.addEventListener("contextmenu", (e) => e.preventDefault());

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x0b0b0b);
  scene.fog = new THREE.Fog(0x0b0b0b, 26, 60);
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;

  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  camera.position.set(13, 10, 16);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.target.set(0, 2, 0);
  controls.enableDamping = true;
  controls.dampingFactor = 0.07;
  controls.maxPolarAngle = Math.PI * 0.49;
  controls.minDistance = 3;
  controls.maxDistance = 45;

  // ---------------------------------------------------------------- light
  // Greys carry the scene; the light is neutral, so the streams' colours stay
  // the only colour. The anatomy tone hierarchy: base lo, structure mid, the
  // working fluid hi, the selection lit.
  scene.add(new THREE.HemisphereLight(0xd8d8d8, 0x0e0e0e, 0.5));
  const key = new THREE.DirectionalLight(0xffffff, 2.1);
  key.position.set(9, 15, 7);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  key.shadow.camera.left = -16;
  key.shadow.camera.right = 16;
  key.shadow.camera.top = 12;
  key.shadow.camera.bottom = -12;
  key.shadow.camera.far = 45;
  key.shadow.bias = -0.0004;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xa8b4c4, 0.6);
  rim.position.set(-8, 6, -8);
  scene.add(rim);

  // ---------------------------------------------------------------- floor
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(120, 120), new THREE.MeshStandardMaterial({ color: 0x0d0d0e, roughness: 0.96, metalness: 0.04 }));
  floor.rotation.x = -Math.PI / 2;
  floor.receiveShadow = true;
  scene.add(floor);
  const platform = new THREE.Mesh(new THREE.BoxGeometry(24, 0.16, 9.4), new THREE.MeshStandardMaterial({ color: 0x161617, roughness: 0.8, metalness: 0.3 }));
  platform.position.y = -0.08;
  platform.receiveShadow = true;
  scene.add(platform);
  const edge = new THREE.LineSegments(new THREE.EdgesGeometry(platform.geometry), new THREE.LineBasicMaterial({ color: 0x3a3a3c }));
  edge.position.copy(platform.position);
  scene.add(edge);
  const grid = new THREE.GridHelper(24, 24, 0x242426, 0x1a1a1c);
  grid.position.y = 0.005;
  scene.add(grid);

  // -------------------------------------------------------------- equipment
  // Dimensions are the brewery kit's: US barrel 117.35 L, so 10 bbl is
  // 1,173.5 L working, 20 bbl 2,347 L. Jacket rating 3 bar (43.5 psi).
  const UNITS = [
    { id: "BT-103", name: "Carrier day tank (20 bbl brite)", type: "brite tank", d: 1.52, h: 2.3, cone: 0.5, x: -8.6, z: -2.2 },
    { id: "BT-101", name: "Extraction vessel (10 bbl mash tun)", type: "jacketed mash tun, false bottom and rake", d: 1.22, h: 1.7, cone: 0.45, x: -4.6, z: -2.2 },
    { id: "SK-102", name: "Membrane skid", type: "staged housings 10 µm to 0.01 µm", d: 0.9, h: 1.9, x: -2.7, z: -2.2 },
    { id: "SK-101", name: "Media column (CRC)", type: "10 inch tri-clamp column, media selectable", d: 0.34, h: 2.1, x: -1.7, z: -2.2 },
    { id: "BT-102", name: "Crystalliser (10 bbl unitank)", type: "jacketed unitank with scraper", d: 1.22, h: 1.6, cone: 0.6, x: 1.2, z: -2.2 },
    { id: "BT-104", name: "Mother liquor tank (10 bbl brite)", type: "jacketed brite tank", d: 1.22, h: 1.7, cone: 0.4, x: 4.2, z: -2.2 },
    { id: "EV-101", name: "Vacuum evaporator (falling film)", type: "falling film", d: 1.2, h: 3.5, x: 6.8, z: -2.2 },
    { id: "SC-101", name: "Gas scrubber", type: "drum with media bed", d: 0.8, h: 1.3, x: 9.3, z: -2.2 },
    { id: "CN-101", name: "Condenser bank", type: "shell and tube, four shells", d: 0.44, h: 1.6, x: 1.6, z: 2.6 },
    { id: "BT-105", name: "Recovered carrier tank (20 bbl brite)", type: "brite tank", d: 1.52, h: 2.3, cone: 0.5, x: 5.4, z: 2.6 },
    { id: "SK-103", name: "Low-energy RO skid (4040)", type: "40 inch elements, water service", d: 0.9, h: 1.4, x: -1.4, z: 2.6 },
    { id: "CH-101", name: "Glycol chiller", type: "air cooled chiller", d: 0.4, h: 0.9, x: -6.0, z: 2.6 },
    { id: "PD-101", name: "Product drum", type: "drum", d: 0.9, h: 1.2, x: 3.0, z: 2.6 },
  ];

  const units = new Map();
  const labels = [];
  for (const unit of UNITS) {
    const group = buildEquipment(unit);
    group.position.set(unit.x, 0, unit.z);
    group.userData.partId = unit.id;
    group.userData.name = unit.name;
    scene.add(group);
    // The activation ring: the lit accent, white like the anatomy kit's.
    const ring = new THREE.Mesh(new THREE.TorusGeometry(unit.d / 2 + 0.35, 0.025, 8, 60), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.85 }));
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(unit.x, 0.03, unit.z);
    ring.visible = false;
    scene.add(ring);
    const label = labelSprite(`${unit.id}  ${unit.name}`);
    label.position.set(unit.x, unit.h + 1.5, unit.z);
    scene.add(label);
    labels.push(label);
    units.set(unit.id, { unit, group, ring, label });
  }

  // -------------------------------------------------------------- pipework
  const pipeMaterial = new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: 0.9, roughness: 0.3 });
  const glycolMaterial = new THREE.MeshStandardMaterial({ color: 0x4a7a9a, metalness: 0.6, roughness: 0.4 });
  const productMaterial = new THREE.MeshStandardMaterial({ color: 0xc9ccc9, metalness: 0.4, roughness: 0.5 });

  function makeRoute(id, points, { radius = 0.055, material = pipeMaterial, stream = null } = {}) {
    const curve = new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), false, "catmullrom", 0.08);
    const tube = new THREE.Mesh(new THREE.TubeGeometry(curve, Math.max(40, points.length * 14), radius, 12, false), material);
    tube.castShadow = true;
    tube.receiveShadow = true;
    scene.add(tube);
    for (const end of [0, 1]) {
      const at = curve.getPointAt(end);
      const ferrule = new THREE.Mesh(new THREE.SphereGeometry(radius * 1.5, 12, 10), pipeMaterial);
      ferrule.position.copy(at);
      scene.add(ferrule);
    }
    const route = { id, curve, tube, particles: [], stream, active: false };
    if (stream) {
      const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(stream.colour) });
      const geom = new THREE.SphereGeometry(radius * 1.35, 10, 8);
      for (let i = 0; i < 12; i += 1) {
        const p = new THREE.Mesh(geom, mat);
        p.visible = false;
        scene.add(p);
        route.particles.push(p);
      }
    }
    return route;
  }

  // Colour is the subject here, so the streams carry it — tuned to the
  // anatomy accents: blue carrier, green extract, pale blue mother liquor,
  // red hot vapour, white isolate.
  const STREAMS = {
    carrier: { name: "cold carrier", colour: "#6b9bff" },
    miscella: { name: "extract / miscella", colour: "#6be0a0" },
    mother: { name: "mother liquor", colour: "#9ad1ff" },
    vapour: { name: "recovered carrier vapour", colour: "#ff6b6b" },
    product: { name: "CBD crystal / isolate", colour: "#e6e6e6" },
    glycol: { name: "glycol utility loop", colour: "#4a7a9a" },
  };

  const routes = {
    charge: makeRoute("charge", [[-7.2, 2.9, -2.2], [-6.4, 3.25, -2.2], [-4.6, 2.85, -2.2]], { stream: STREAMS.carrier }),
    extract: makeRoute("extract", [[-3.9, 1.35, -2.2], [-3.35, 1.4, -2.2], [-2.7, 1.3, -2.2]], { stream: STREAMS.miscella }),
    membrane: makeRoute("membrane", [[-2.25, 1.3, -2.2], [-2.0, 1.55, -2.2], [-1.75, 1.75, -2.2]], { stream: STREAMS.miscella }),
    media: makeRoute("media", [[-1.65, 2.15, -2.2], [-0.2, 1.75, -2.2], [0.2, 1.5, -2.2]], { stream: STREAMS.miscella }),
    crystal: makeRoute("crystal", [[2.1, 0.9, -2.2], [2.9, 1.4, -2.2], [3.55, 1.25, -2.2]], { stream: STREAMS.mother }),
    evap: makeRoute("evap", [[5.2, 1.25, -2.2], [6.0, 2.2, -2.2], [6.35, 2.65, -2.2]], { stream: STREAMS.mother }),
    vapour: makeRoute(
      "vapour",
      [[7.4, 3.4, -2.2], [7.4, 4.7, -2.2], [6.6, 4.95, -2.2], [1.6, 4.95, -2.2], [1.6, 3.4, -2.2], [1.6, 2.9, 0.4], [1.6, 2.45, 2.2]],
      { stream: STREAMS.vapour, radius: 0.075 },
    ),
    condense: makeRoute("condense", [[2.8, 1.4, 2.6], [3.6, 1.85, 2.6], [4.3, 1.6, 2.6]], { stream: STREAMS.vapour }),
    returned: makeRoute(
      "returned",
      [[5.4, 3.85, 2.6], [5.4, 5.35, 2.6], [4.4, 5.5, 2.6], [-8.6, 5.5, 2.6], [-8.6, 5.5, -2.2]],
      { stream: STREAMS.carrier, radius: 0.065 },
    ),
    product: makeRoute("product", [[1.2, 0.5, -2.2], [1.2, 0.4, 0], [2.2, 0.7, 2.0], [3.0, 0.85, 2.6]], { stream: STREAMS.product, material: productMaterial }),
    vent: makeRoute("vent", [[1.6, 2.7, 2.6], [1.6, 3.05, 4.4], [9.3, 3.05, 4.4], [9.3, 2.0, -2.2]], { radius: 0.045 }),
    glycolIn: makeRoute("glycolIn", [[-5.4, 0.6, 2.6], [-5.4, 0.5, 0.2], [-0.4, 0.75, -1.2], [0.55, 0.9, -2.2]], { radius: 0.045, material: glycolMaterial, stream: STREAMS.glycol }),
    glycolOut: makeRoute("glycolOut", [[0.55, 1.75, -2.2], [-1.6, 1.4, -0.6], [-5.4, 0.9, 1.8], [-5.4, 0.85, 2.6]], { radius: 0.045, material: glycolMaterial, stream: STREAMS.glycol }),
  };

  // The pipe racks: posts, beams, hairline in the anatomy way.
  for (const x of [6.9, 3.6, 0.4]) {
    mesh(scene, new THREE.BoxGeometry(0.08, 4.9, 0.08), MATERIALS.frame, x, 2.45, -2.5);
    mesh(scene, new THREE.BoxGeometry(0.3, 0.06, 0.34), MATERIALS.frame, x, 4.87, -2.42);
  }
  mesh(scene, new THREE.BoxGeometry(7.4, 0.07, 0.1), MATERIALS.frame, 3.8, 4.9, -2.5);
  for (const x of [4.2, -1.4, -6.4]) {
    mesh(scene, new THREE.BoxGeometry(0.08, 5.45, 0.08), MATERIALS.frame, x, 2.72, 2.9);
    mesh(scene, new THREE.BoxGeometry(0.3, 0.06, 0.34), MATERIALS.frame, x, 5.42, 2.8);
  }
  mesh(scene, new THREE.BoxGeometry(13.4, 0.07, 0.1), MATERIALS.frame, -1.2, 5.45, 2.9);

  // ---------------------------------------------------------------- steps
  const STEPS = [
    { name: "Carrier charge", flow: "cold carrier from the 20 bbl brite tank into the mash tun", stream: "cold carrier", colour: "#6b9bff", routes: ["charge"], parts: ["BT-103", "BT-101"], view: "extraction" },
    { name: "Extraction", flow: "biomass contacted at 4 turnovers per hour; miscella leaves for the skid", stream: "extract / miscella", colour: "#6be0a0", routes: ["extract"], parts: ["BT-101", "SK-102"], view: "extraction" },
    { name: "Membrane pass", flow: "10 µm to 0.01 µm by stage, before and/or after the media", stream: "extract / miscella", colour: "#6be0a0", routes: ["membrane"], parts: ["SK-102", "SK-101"], view: "polish" },
    { name: "Media pass", flow: "the selectable bed takes colour; its published loss is on the record", stream: "extract / miscella", colour: "#6be0a0", routes: ["media"], parts: ["SK-101", "BT-102"], view: "polish" },
    { name: "Sub-zero crystallisation", flow: "CBD crystallises at −40 °C in the unitank; mother liquor drawn off", stream: "mother liquor", colour: "#9ad1ff", routes: ["crystal", "glycolIn", "glycolOut"], parts: ["BT-102", "BT-104"], view: "cold" },
    { name: "Mother liquor separation", flow: "mother liquor to the falling-film evaporator", stream: "mother liquor", colour: "#9ad1ff", routes: ["evap"], parts: ["BT-104", "EV-101"], view: "recovery" },
    { name: "Recovery & condensation", flow: "vapour over the rack, condensed to the recovered carrier tank", stream: "recovered carrier vapour", colour: "#ff6b6b", routes: ["vapour", "condense"], parts: ["EV-101", "CN-101", "BT-105"], view: "recovery" },
    { name: "Sieve dry & carrier return", flow: "3A/13X stack dries to 200 ppm; carrier back to the day tank", stream: "cold carrier", colour: "#6b9bff", routes: ["returned"], parts: ["BT-105", "BT-103"], view: "overview" },
    { name: "Isolation & product", flow: "crystal fraction to the product drum", stream: "CBD crystal / isolate", colour: "#e6e6e6", routes: ["product"], parts: ["BT-102", "PD-101"], view: "cold" },
  ];

  const VIEWS = {
    overview: { camera: [13, 10, 16], target: [0, 2, 0] },
    extraction: { camera: [-7.5, 4.4, 6], target: [-4.6, 1.6, -2.2] },
    polish: { camera: [0.8, 3.6, 5.8], target: [-2.2, 1.4, -2.2] },
    cold: { camera: [4.6, 4.2, 5.4], target: [1.2, 1.6, -2.2] },
    recovery: { camera: [9.5, 5.6, 7.5], target: [5.8, 2.4, 0.2] },
  };
  let cameraGoal = null;
  let targetGoal = null;
  let currentStep = 0;
  let playing = true;
  let flowOn = true;
  let selected = null;
  let catalogue = new Map();

  fetch("/catalogue-brewkit.json")
    .then((r) => (r.ok ? r.json() : fetch("/catalogue-blend.json").then((x) => (x.ok ? x.json() : null)).catch(() => null)))
    .then((data) => {
      if (data && data.parts) catalogue = new Map(data.parts.map((p) => [p.id, p]));
    })
    .catch(() => {});

  function setStep(index) {
    currentStep = ((index % STEPS.length) + STEPS.length) % STEPS.length;
    const step = STEPS[currentStep];
    for (const [id, route] of Object.entries(routes)) route.active = step.routes.includes(id);
    for (const [id, entry] of units) entry.ring.visible = step.parts.includes(id) || selected === id;
    const focus = units.get(step.parts[0]);
    if (focus) targetGoal = new THREE.Vector3(focus.unit.x, Math.min(2.4, focus.unit.h * 0.6 + 0.6), focus.unit.z);
  }

  function setSelected(id) {
    selected = id;
    for (const [uid, entry] of units) {
      entry.ring.visible = STEPS[currentStep].parts.includes(uid) || selected === uid;
      entry.ring.material.color.set(selected === uid ? 0xe6e6e6 : 0xffffff);
    }
  }

  const raycaster = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let downAt = null;
  renderer.domElement.addEventListener("pointerdown", (event) => {
    downAt = { x: event.clientX, y: event.clientY };
  });
  renderer.domElement.addEventListener("pointerup", (event) => {
    if (!downAt || Math.hypot(event.clientX - downAt.x, event.clientY - downAt.y) > 5) return;
    const rect = renderer.domElement.getBoundingClientRect();
    pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(pointer, camera);
    const hits = raycaster.intersectObjects([...units.values()].map((u) => u.group), true);
    if (!hits.length) return;
    let node = hits[0].object;
    while (node && !node.userData.partId) node = node.parent;
    if (!node) return;
    const id = node.userData.partId;
    setSelected(id);
    const part = catalogue.get(id) || { id, name: node.userData.name, what: { text: "loading the part record…" }, does: { text: "" }, details: [], here: {}, evidence: [] };
    window.dispatchEvent(new CustomEvent("studio-select", { detail: { part } }));
  });

  const REDUCED = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const clock = new THREE.Clock();
  let phase = 0;

  function resize() {
    const w = sceneWrap.clientWidth || 800;
    const h = sceneWrap.clientHeight || 400;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  function animate() {
    requestAnimationFrame(animate);
    const dt = Math.min(clock.getDelta(), 0.05);
    if (flowOn && playing && !REDUCED) phase += dt * 0.12;
    for (const route of Object.values(routes)) {
      const visible = flowOn && route.active;
      route.particles.forEach((p, i) => {
        p.visible = visible;
        if (visible) {
          const t = (phase + i / route.particles.length) % 1;
          p.position.copy(route.curve.getPointAt(t));
        }
      });
    }
    if (cameraGoal) {
      camera.position.lerp(cameraGoal, 0.045);
      if (camera.position.distanceTo(cameraGoal) < 0.05) cameraGoal = null;
    }
    if (targetGoal) {
      controls.target.lerp(targetGoal, 0.06);
      if (controls.target.distanceTo(targetGoal) < 0.02) targetGoal = null;
    }
    controls.update();
    renderer.render(scene, camera);
  }
  animate();
  sceneFallback.hidden = true;

  window.studioScene = {
    steps: () => STEPS.map((s) => ({ name: s.name, flow: s.flow, stream: s.stream, colour: s.colour })),
    setStep,
    setPlaying: (value) => { playing = value; },
    setLabels: (value) => { for (const label of labels) label.visible = value; },
    setFlow: (value) => { flowOn = value; },
    setSelected,
    setView: (name) => {
      const view = VIEWS[name] || VIEWS.overview;
      cameraGoal = new THREE.Vector3(...view.camera);
      targetGoal = new THREE.Vector3(...view.target);
    },
  };
  window.dispatchEvent(new Event("studio-scene-ready"));
}

try {
  startScene();
} catch (err) {
  console.error("the 3D scene could not start", err);
  sceneFallback.textContent = `The 3D view could not start (${String(err.message || err)}). The chat, sliders, balancer and deliverables still work.`;
}
