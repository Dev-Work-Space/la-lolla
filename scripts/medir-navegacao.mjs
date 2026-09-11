/*
 * Mede a TROCA DE TELA como o usuário sente: clicando na barra, não
 * recarregando a página. É a navegação do cliente que importa.
 *
 *   node scripts/medir-navegacao.mjs [url] [rotulo]
 *
 * Só leitura.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const ROTULO = process.argv[3] ?? "";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const PERCURSO = [
  ["Início", "/"],
  ["Portal de vendas", "/vendas"],
  ["Portal de compras", "/compras"],
  ["Estoque", "/estoque"],
  ["Financeiro", "/financeiro"],
  ["Cadastros", "/cadastros"],
];

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });

async function medir(largura, nome) {
  const ctx = await navegador.newContext({ viewport: { width: largura, height: 900 } });
  const page = await ctx.newPage();

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await page.waitForTimeout(1500);

  console.log(`\n  ── ${nome} ──`);
  const tempos = [];

  for (let volta = 0; volta < 2; volta++) {
    for (const [titulo, rota] of PERCURSO) {
      if (page.url().endsWith(rota)) continue;

      const seletor =
        largura >= 1000
          ? `nav[data-nav="lateral"] a[href="${rota}"]`
          : `nav[data-nav="inferior"] a[href="${rota}"]`;

      const alvo = page.locator(seletor).first();
      if ((await alvo.count()) === 0) continue;

      const t0 = performance.now();
      await alvo.click();
      // O que o usuário percebe: o conteúdo da tela nova aparecendo.
      await page
        .waitForFunction(
          (r) => location.pathname === r && document.querySelector("main") !== null,
          rota,
          { timeout: 20000 },
        )
        .catch(() => {});
      const t = performance.now() - t0;

      if (volta > 0) tempos.push([titulo, t]); // a primeira volta aquece
    }
  }

  await ctx.close();

  for (const [titulo, t] of tempos) {
    console.log(`     ${titulo.padEnd(20)} ${t.toFixed(0).padStart(5)} ms`);
  }
  const media = tempos.reduce((s, [, t]) => s + t, 0) / (tempos.length || 1);
  console.log(`     ${"MÉDIA".padEnd(20)} ${media.toFixed(0).padStart(5)} ms`);
  return media;
}

console.log(`\n=== TROCA DE TELA ${ROTULO ? `· ${ROTULO}` : ""} ===`);
const pc = await medir(1440, "Monitor (1440px)");
const cel = await medir(390, "Celular (390px)");

console.log(`\n  Monitor: ${pc.toFixed(0)} ms · Celular: ${cel.toFixed(0)} ms\n`);
await navegador.close();
