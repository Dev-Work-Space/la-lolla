/*
 * Sonda de navegador: percorre o app como uma pessoa percorreria.
 *
 *   node scripts/sonda.mjs [url]        (padrão: http://127.0.0.1:3000)
 *
 * Usa o Edge já instalado na máquina — não baixa navegador.
 * Só LÊ e navega; a única escrita é o login, que é o que queremos testar.
 */
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://127.0.0.1:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SHOTS = "scripts/shots";

let passou = 0;
let falhou = 0;
const erros = [];

function conferir(nome, cond, detalhe = "") {
  if (cond) {
    passou++;
    console.log(`  OK    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

async function entrar(page, usuario, senha) {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#usuario", usuario);
  await page.fill("#senha", senha);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 }).catch(() => {}),
    page.click('button[type="submit"]'),
  ]);
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function main() {
  mkdirSync(SHOTS, { recursive: true });

  const navegador = await chromium.launch({ executablePath: EDGE, headless: true });

  // Dois contextos: um admin e um vendedor, para comparar o que cada um vê.
  for (const [rotulo, usuario, senha, veCusto] of [
    ["ADMIN (teste)", "teste", "Teste@2026!", true],
    ["VENDEDOR (vendedora)", "vendedora", "Vende@2026!", false],
  ]) {
    console.log(`\n=== ${rotulo} ===`);

    const ctx = await navegador.newContext({ viewport: { width: 390, height: 844 } });
    const page = await ctx.newPage();

    const consoleErros = [];
    page.on("console", (m) => m.type() === "error" && consoleErros.push(m.text()));
    page.on("pageerror", (e) => consoleErros.push("pageerror: " + e.message));

    await entrar(page, usuario, senha);

    conferir("login levou para fora de /login", !new URL(page.url()).pathname.startsWith("/login"), page.url());

    const corpo = await page.textContent("body");
    conferir("a home mostra a saudação", /Bom dia|Boa tarde|Boa noite/.test(corpo ?? ""));

    // ── Estoque ──────────────────────────────────────────────
    await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
    const html = (await page.content()).toLowerCase();
    const texto = (await page.textContent("body")) ?? "";

    conferir("a lista de estoque carregou", /anel|brinco|colar/i.test(texto), texto.slice(0, 80));

    const temColunaCusto = /<th[^>]*>\s*custo\s*<\/th>/.test(html);
    const temColunaMargem = /<th[^>]*>\s*margem\s*<\/th>/.test(html);

    if (veCusto) {
      conferir("admin VÊ a coluna Custo", temColunaCusto);
      conferir("admin VÊ a coluna Margem", temColunaMargem);
    } else {
      conferir("vendedor NÃO vê a coluna Custo", !temColunaCusto);
      conferir("vendedor NÃO vê a coluna Margem", !temColunaMargem);
      // A prova dura: o número do custo (112,50) não pode estar no HTML.
      conferir("nenhum valor de custo no HTML", !html.includes("112,50"));
    }

    // ── Layout de celular ────────────────────────────────────
    const larguras = await page.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    conferir(
      "sem rolagem horizontal no celular",
      larguras.documento <= larguras.janela + 1,
      `documento ${larguras.documento}px vs janela ${larguras.janela}px`,
    );

    const barra = await page.$('nav a[href="/estoque"]');
    conferir("barra de navegação presente", barra !== null);

    await page.screenshot({ path: `${SHOTS}/${usuario}-estoque-390.png`, fullPage: true });

    // ── Desktop ──────────────────────────────────────────────
    await page.setViewportSize({ width: 1366, height: 768 });
    await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
    await page.screenshot({ path: `${SHOTS}/${usuario}-estoque-1366.png`, fullPage: true });

    const larguraPc = await page.evaluate(() => ({
      documento: document.documentElement.scrollWidth,
      janela: window.innerWidth,
    }));
    conferir(
      "sem rolagem horizontal no PC",
      larguraPc.documento <= larguraPc.janela + 1,
      `${larguraPc.documento} vs ${larguraPc.janela}`,
    );

    conferir("nenhum erro no console", consoleErros.length === 0, consoleErros.slice(0, 2).join(" | "));
    if (consoleErros.length) erros.push(...consoleErros);

    await ctx.close();
  }

  // ── Sem sessão ─────────────────────────────────────────────
  console.log("\n=== SEM LOGIN ===");
  const ctx = await navegador.newContext();
  const page = await ctx.newPage();
  await page.goto(`${BASE}/estoque`, { waitUntil: "domcontentloaded" });
  conferir("estoque redireciona para o login", new URL(page.url()).pathname === "/login", page.url());
  await ctx.close();

  await navegador.close();
}

main()
  .catch((e) => {
    falhou++;
    console.error("\nERRO NA SONDA:", e.message);
  })
  .finally(() => {
    console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
    if (erros.length) console.log("erros de console:", [...new Set(erros)].slice(0, 5));
    console.log(`prints em ${SHOTS}/\n`);
    process.exitCode = falhou === 0 ? 0 : 1;
  });
