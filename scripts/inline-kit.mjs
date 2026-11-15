import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KIT = join(dirname(fileURLToPath(import.meta.url)), "..", "kit");
const strip = (file) => readFileSync(join(KIT, file), "utf8").replace(/^export /gm, "");

export function kitScript() {
  return strip("iso-kit.mjs");
}

export function glScript() {
  return strip("gl.mjs");
}

export function turnScript() {
  return strip("turn.mjs");
}

export function fixedScript() {
  return strip("turn-fixed.mjs") + "\n" + strip("canvas-painter.mjs");
}

export function glSharedScript() {
  return strip("gl-shared.mjs");
}

// The drawing kit as one bundle, for a page that draws.
//
// The three modules are plain JavaScript with no imports between the reader
// and the page, so they can be concatenated into a closure: iso-kit first
// (the others use its camera and path helpers), then lathe, then tube. The
// result is one object, KIT, with every drawing function on it -- the same
// names the build uses, so the page redraws a figure exactly the way the
// build drew it.
export function kitBundle() {
  const read = (file) => {
    const source = readFileSync(join(KIT, file), "utf8");
    const exported = [...source.matchAll(/^export (?:async )?function ([A-Za-z0-9_]+)|^export const ([A-Za-z0-9_]+)/gm)].map((m) => m[1] || m[2]);
    const body = source.replace(/^import .*$/gm, "").replace(/^export /gm, "");
    return { body, exported };
  };

  const iso = read("iso-kit.mjs");
  const lathe = read("lathe.mjs");
  const tube = read("tube.mjs");

  // Each module goes in its own closure: the modules have internal names
  // that would collide when they are concatenated, and lathe and tube need
  // iso-kit's camera helpers. So iso-kit is built first, and the other two
  // are given what they import.
  return [
    `const KITISO = (function(){`,
    iso.body,
    `return { ${iso.exported.join(", ")} };`,
    `})();`,
    `const KITLATHE = (function(ISO){`,
    `const { cameraOf, iso, pathOf } = ISO;`,
    lathe.body,
    `return { ${lathe.exported.join(", ")} };`,
    `})(KITISO);`,
    `const KITTUBE = (function(ISO, G){`,
    `const { iso, pathOf } = ISO;`,
    tube.body,
    `return { ${tube.exported.join(", ")} };`,
    `})(KITISO, KITLATHE);`,
    `const KIT = { ...KITISO, ...KITLATHE, ...KITTUBE };`,
  ].join("\n");
}
