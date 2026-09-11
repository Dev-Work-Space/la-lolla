/*
 * Mede a TROCA DE TELA como o usuário sente: clicando na barra, não
 * recarregando a página. É a navegação do cliente que importa.
 *
 *   node scripts/medir-navegacao.mjs [url] [rotulo]
 *
 * Mede DOIS momentos, porque eles são coisas diferentes:
 *
 *   TELA   a tela nova está no ar com o que não depende do banco — título,
 *          abas, busca, filtros, botões. É o que responde ao toque.
 *   DADOS  os números chegaram e não sobrou nenhum bloco pulsando.
 *
 * Antes os dois eram o mesmo instante: a página esperava o banco inteiro
 * para só então existir. O que a pessoa sentia como "travado" era isso.
 *
 * Só leitura.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3100";
const ROTULO = process.argv[3] ?? "";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

/*
 * O terceiro item é um texto que SÓ existe na casca de verdade — nunca no
 * esqueleto. Sem ele a medição mentia: bastava um <main> na tela para contar
 * como "chegou", e o esqueleto também tem um. Procuramos dentro do <main>
 * de propósito, senão o rótulo da barra lateral casaria e daria 0 ms.
 */
const PERCURSO = [
  ["Início", "/", "Montar painel"],
  ["Portal de vendas", "/vendas", "Portal de vendas"],
  ["Portal de compras", "/compras", "Portal de compras"],
  ["Estoque", "/estoque", "Insumos"],
  ["Financeiro", "/financeiro", "Financeiro"],
  ["Cadastros", "/cadastros", "Fornecedores"],
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
    for (const [titulo, rota, marca] of PERCURSO) {
      if (page.url().endsWith(rota)) continue;

      const seletor =
        largura >= 1000
          ? `nav[data-nav="lateral"] a[href="${rota}"]`
          : `nav[data-nav="inferior"] a[href="${rota}"]`;

      const alvo = page.locator(seletor).first();
      if ((await alvo.count()) === 0) continue;

      const t0 = performance.now();
      await alvo.click();

      // 1) a casca DE VERDADE está na tela (não o esqueleto)
      await page
        .waitForFunction(
          ([r, m]) =>
            location.pathname === r &&
            (document.querySelector("main")?.innerText ?? "").includes(m),
          [rota, marca],
          { timeout: 20000 },
        )
        .catch(() => {});
      const tTela = performance.now() - t0;

      // 2) nenhum bloco pulsando: os dados chegaram
      await page
        .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, {
          timeout: 20000,
        })
        .catch(() => {});
      const tDados = performance.now() - t0;

      if (volta > 0) tempos.push([titulo, tTela, tDados]); // a primeira volta aquece
    }
  }

  await ctx.close();

  for (const [titulo, tela, dados] of tempos) {
    console.log(
      `     ${titulo.padEnd(20)} tela ${tela.toFixed(0).padStart(5)} ms   dados ${dados.toFixed(0).padStart(5)} ms`,
    );
  }
  const n = tempos.length || 1;
  const mTela = tempos.reduce((s, [, t]) => s + t, 0) / n;
  const mDados = tempos.reduce((s, [, , d]) => s + d, 0) / n;
  console.log(
    `     ${"MÉDIA".padEnd(20)} tela ${mTela.toFixed(0).padStart(5)} ms   dados ${mDados.toFixed(0).padStart(5)} ms`,
  );
  return { tela: mTela, dados: mDados };
}

console.log(`\n=== TROCA DE TELA ${ROTULO ? `· ${ROTULO}` : ""} ===`);
const pc = await medir(1440, "Monitor (1440px)");
const cel = await medir(390, "Celular (390px)");

console.log(
  `\n  Monitor: tela ${pc.tela.toFixed(0)} ms, dados ${pc.dados.toFixed(0)} ms` +
    `\n  Celular: tela ${cel.tela.toFixed(0)} ms, dados ${cel.dados.toFixed(0)} ms\n`,
);
await navegador.close();
