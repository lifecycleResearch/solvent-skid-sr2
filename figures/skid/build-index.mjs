// Writes deploy/public/index.html: the light-theme figure with a small
// theme switch, so the site root is the figure itself.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const light = join(ROOT, "figures", "skid", "skid-light.html");
const index = join(ROOT, "deploy", "public", "index.html");

const toggle = `<script>
(function(){
  var b=document.createElement("button");
  b.id="theme-toggle";
  b.textContent="dark";
  b.setAttribute("aria-label","switch to the dark theme");
  b.style.cssText="position:fixed;right:14px;bottom:14px;z-index:9;border:1px solid var(--anatomy-mid);background:var(--anatomy-card);color:var(--anatomy-text);font:11px/1 var(--anatomy-mono);letter-spacing:.08em;padding:9px 12px;cursor:pointer";
  b.onclick=function(){
    var dark=document.body.dataset.theme!=="dark";
    document.body.dataset.theme=dark?"dark":"light";
    b.textContent=dark?"light":"dark";
  };
  document.addEventListener("DOMContentLoaded",function(){document.body.appendChild(b);});
})();
</script>`;

// The last </body> is the document's: the first ones belong to the inlined kit
// source, and a toggle spliced into one of those would break the page script.
const source = readFileSync(light, "utf8");
const at = source.lastIndexOf("</body>");
if (at < 0) throw new Error("no </body> in the built page");
const page = source.slice(0, at) + toggle + source.slice(at);
writeFileSync(index, page);
console.log("wrote", index, `${(page.length / 1024).toFixed(0)} KB`);
