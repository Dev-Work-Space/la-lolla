/* Confere qual fonte o navegador REALMENTE aplicou, em vez de supor. */
import { chromium } from "playwright-core";

const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const BASE = process.argv[2] ?? "http://127.0.0.1:3000";

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const page = await navegador.newPage();
await page.goto(`${BASE}/login`, { waitUntil: "networkidle" });

const info = await page.evaluate(() => {
  const raiz = getComputedStyle(document.documentElement);
  const corpo = getComputedStyle(document.body);
  const h1 = document.querySelector("h1,[class*=text-lg]");
  return {
    varFontSans: raiz.getPropertyValue("--font-sans").trim() || "(vazia)",
    bodyFontFamily: corpo.fontFamily,
    tituloFontFamily: h1 ? getComputedStyle(h1).fontFamily : "(sem titulo)",
  };
});

console.log("--font-sans  :", info.varFontSans);
console.log("body         :", info.bodyFontFamily);
console.log("titulo       :", info.tituloFontFamily);

const usaInter = /inter/i.test(info.bodyFontFamily) || /inter/i.test(info.varFontSans);
console.log(usaInter ? "\nOK — Inter aplicada" : "\nFALHA — ainda não é Inter");

await navegador.close();
process.exitCode = usaInter ? 0 : 1;
