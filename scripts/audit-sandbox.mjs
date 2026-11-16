// The audit, run inside the sandbox.
//
//   node scripts/audit-sandbox.mjs [--gateway <name>]
//
// The geometry audit is the one check that reads the whole drawing, so it is
// the one worth running where nothing can leave: the sandbox has no network
// policy at all, which means no host is reachable from inside it.
//
// The gateway is the one published to the tailnet, so the audit runs on this
// machine's OpenShell install from wherever the work is happening.

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

const gateway = process.argv.find((a) => a.startsWith("--gateway="))?.slice(10) || process.env.OPENSHELL_GATEWAY || "richards-macbook-air-1.tailbe58ee.ts.net";
const sandbox = process.argv.find((a) => a.startsWith("--sandbox="))?.slice(10) || "audit";
const repo = "/sandbox/solvent-skid-sr2";

const COMMAND = `cd ${repo} && node figures/skid/build.mjs --audit 2>&1 | tail -40`;

async function main() {
  // Is the repository in the sandbox? If not, clone it — the audit sandbox
  // has no network, so this has to happen while it still can.
  const check = await run("openshell", ["-g", gateway, "sandbox", "exec", sandbox, "--", "sh", "-lc", `test -d ${repo} && echo yes || echo no`]).catch((err) => ({ stdout: "no", stderr: String(err) }));
  if (!String(check.stdout).includes("yes")) {
    console.log("the repository is not in the sandbox; bring it there first:");
    console.log(`  openshell -g ${gateway} sandbox exec ${sandbox} -- sh -lc 'cd /sandbox && git clone --depth 1 https://github.com/lifecycleResearch/solvent-skid-sr2'`);
    process.exit(2);
  }

  // Prove the isolation while we are here: nothing should be reachable.
  const isolation = await run("openshell", ["-g", gateway, "sandbox", "exec", sandbox, "--", "sh", "-lc", "curl -s -o /dev/null -w '%{http_code}' --max-time 6 https://api.openalex.org/works 2>/dev/null || echo 000"]).catch((err) => ({ stdout: "000" }));
  const reachable = String(isolation.stdout).trim();
  console.log(`isolation: api.openalex.org from inside the sandbox -> ${reachable}${reachable === "000" ? " (no route, as intended)" : " (WARNING: it has a route)"}`);
  if (reachable !== "000") {
    console.log("the audit sandbox should have no network at all; check its policy");
    process.exitCode = 1;
  }

  const audit = await run("openshell", ["-g", gateway, "sandbox", "exec", sandbox, "--", "sh", "-lc", COMMAND]).catch((err) => ({ stdout: String(err.stdout || err), stderr: String(err.stderr || "") }));
  console.log(audit.stdout);
  if (audit.stderr) console.error(audit.stderr);
  // The audit exits non-zero when it finds problems; that is the point.
  process.exit(/audit failed/.test(audit.stdout) ? 1 : 0);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
