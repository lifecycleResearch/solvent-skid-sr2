// One-off: state which stream runs in which pipe.
//
// The pipes name their stream, because a derived stream's flow is computed
// and the flow is not a reliable key.
import { readFileSync, writeFileSync } from "node:fs";

const path = new URL("../spec/subzero-blend.json", import.meta.url);
const spec = JSON.parse(readFileSync(path, "utf8"));

const link = {
  "P-1001": "S-201",
  "P-1002": "S-202",
  "P-1003": "S-202b",
  "P-1004": "S-203",
  "P-1005": "S-208",
  "P-1006": "S-205",
  "P-1007": "S-206",
  "P-1008": "S-207b",
  "P-1009": "S-209",
  "P-1010": "S-204",
};

for (const connection of spec.connections) {
  if (link[connection.id]) connection.stream = link[connection.id];
}

writeFileSync(path, `${JSON.stringify(spec, null, 2)}\n`);
console.log("the pipes name their streams");
