/* O indicador "Rendering..." aparece no build de produção? Só leitura. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const b = await chromium.launch({ executablePath: EDGE, headless: true });
const p = await b.newPage();

await p.goto(`${BASE}/login`, { waitUntil: "networkidle" });
const r = await p.evaluate(() => ({
  portal: !!document.querySelector("nextjs-portal"),
  toast: !!document.querySelector("[data-nextjs-toast], [data-nextjs-dev-tools-button]"),
  overlay: !!document.querySelector("#__next-dev-overlay, nextjs-dev-tools"),
  texto: document.body.innerText.includes("Rendering"),
}));

console.log("\n=== BUILD DE PRODUÇÃO ===");
console.log("  <nextjs-portal> no DOM      :", r.portal ? "SIM" : "não");
console.log("  botão de devtools           :", r.toast ? "SIM" : "não");
console.log("  overlay de desenvolvimento  :", r.overlay ? "SIM" : "não");
console.log("  palavra 'Rendering' na tela :", r.texto ? "SIM" : "não");

const limpo = !r.portal && !r.toast && !r.overlay && !r.texto;
console.log(limpo ? "\n  LIMPO — nenhum usuário vai ver aquilo.\n" : "\n  AINDA APARECE — investigar.\n");

await b.close();
process.exitCode = limpo ? 0 : 1;
