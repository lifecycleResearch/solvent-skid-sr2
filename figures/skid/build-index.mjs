// Writes deploy/public/index.html: the light-theme figure with a small
// theme switch, so the site root is the figure itself.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const ROOT = join(HERE, "..", "..");
const light = join(ROOT, "figures", "skid", "skid-light.html");
const index = join(ROOT, "deploy", "public", "index.html");
const context = join(ROOT, "deploy", "public", "skid-context.json");

const link = `<a class="sk-alt" href="/blend.html">the sub-zero blend scenario \u2192</a>`;
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
  document.addEventListener("DOMContentLoaded",function(){
    document.body.appendChild(b);
    var a=document.createElement("a");
    a.className="sk-alt";
    a.href="/blend.html";
    a.textContent="the sub-zero blend scenario \u2192";
    a.style.cssText="position:fixed;left:14px;bottom:14px;z-index:9;font:11px/1 var(--anatomy-mono);letter-spacing:.08em;color:var(--anatomy-muted);text-decoration:none;border-bottom:1px solid var(--anatomy-faint);padding-bottom:3px";
    document.body.appendChild(a);
  });
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

// The Worker grounds its answers on this, and so does anything else that
// wants to ask the plant a question.
const contextSource = readFileSync(join(ROOT, "figures", "skid", "skid-context.json"), "utf8");
writeFileSync(context, contextSource);
console.log("wrote", context, `${(contextSource.length / 1024).toFixed(0)} KB`);
