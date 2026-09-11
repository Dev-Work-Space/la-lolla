/*
 * Ficha da peça e movimento de estoque.
 *
 * Cria uma peça de teste, mexe no estoque dela (entrada, saída e inventário),
 * confere os números e APAGA a peça no fim — por id exato, capturado da URL.
 */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MARCA = "ZZQA ";

let passou = 0;
let falhou = 0;
const conferir = (n, c, d = "") => {
  if (c) {
    passou++;
    console.log(`  OK    ${n}`);
  } else {
    falhou++;
    console.log(`  FALHA ${n}${d ? " — " + d : ""}`);
  }
};

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1366, height: 950 } });
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

let pecaId = null;
let saldoAntes = 0;

async function mexer(modo, quantidade, saldoEsperado) {
  await page.click('button:has-text("Mexer no estoque")');
  await page.waitForSelector('[role="dialog"]');
  const rotulo = { entrada: "Entrada", saida: "Saída", inventario: "Inventário" }[modo];
  await page.click(`[role="dialog"] button:has-text("${rotulo}")`);
  // O diálogo busca o saldo de agora ao abrir; espera ele chegar antes de
  // ler a prévia, senão a diferença sai calculada sobre o número da prop.
  await page.waitForFunction(
    (s) => document.querySelector('[role="dialog"]')?.textContent?.includes(`saldo atual ${s} `),
    saldoAntes,
    { timeout: 10000 },
  );
  await page.fill("#quantidade", String(quantidade));
  await page.waitForTimeout(150);
  const previa = await page.textContent('[role="dialog"]');
  await page.click('[role="dialog"] button:has-text("Gravar movimento")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 15000 });
  // Espera o NÚMERO aparecer na tela, em vez de dormir um tempo fixo.
  await page.waitForFunction(
    (s) => new RegExp(`EM ESTOQUE\s*${s}\s*un`, "i").test(document.body.innerText.replace(/\s+/g, " ")),
    String(saldoEsperado),
    { timeout: 15000 },
  ).catch(() => {});
  saldoAntes = saldoEsperado;
  return previa;
}

async function saldoNaTela() {
  const t = await page.textContent("body");
  const m = /EM ESTOQUE\s*(-?\d+)\s*un/i.exec(t.replace(/\s+/g, " "));
  return m ? Number(m[1]) : null;
}

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  console.log("\n=== CRIAR A PEÇA DE TESTE ===");
  await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await page.click('button:has-text("Nova peça")');
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#nome", MARCA + "Peça de Teste");
  await page.fill("#categoria", "Anéis");
  await page.fill("#precoTabela", "200,00");
  await page.fill("#codigoFornecedor", "20");
  await page.fill("#fator", "5");
  await page.click('[role="dialog"] button:has-text("Salvar peça")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 15000 });
  await page.waitForFunction((n) => document.body.innerText.includes(n), MARCA + "Peça de Teste", {
    timeout: 15000,
  });
  conferir("peça criada", true);

  console.log("\n=== ABRIR A FICHA ===");
  await page.click(`a:has-text("${MARCA}Peça de Teste")`);
  await page.waitForURL(/\/estoque\/[^/]+$/, { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  pecaId = page.url().split("/").pop();

  let txt = await page.textContent("body");
  conferir("abriu a ficha da peça certa", txt.includes(MARCA + "Peça de Teste"));
  conferir("mostra o SKU", /LL-\d{4}/.test(txt));
  conferir('indicador "Em estoque"', /Em estoque/i.test(txt));
  conferir('indicador "Reservadas"', /Reservadas/i.test(txt));
  conferir('indicador "Já vendidas"', /Já vendidas/i.test(txt));
  conferir("custo calculado (20 × 5 = 100)", /R\$\s*100,00/.test(txt));
  conferir("margem calculada (100/200 = 50%)", /margem de 50,0%/.test(txt), txt.match(/margem de [^ ]+/)?.[0]);
  conferir("nasce sem movimento", /Nenhum movimento ainda/.test(txt));
  conferir("saldo começa em 0", (await saldoNaTela()) === 0, String(await saldoNaTela()));

  console.log("\n=== ENTRADA DE 10 ===");
  const previaEntrada = await mexer("entrada", 10, 10);
  conferir("prévia mostrou o saldo futuro", /Saldo depois:\s*10/.test(previaEntrada.replace(/\s+/g, " ")));
  conferir("saldo virou 10", (await saldoNaTela()) === 10, String(await saldoNaTela()));
  txt = await page.textContent("body");
  conferir("histórico registrou +10", /\+10/.test(txt));
  conferir("histórico diz Compra", /Compra/.test(txt));
  conferir("mostra o saldo acumulado", /ficou 10/.test(txt));

  console.log("\n=== SAÍDA DE 3 ===");
  await mexer("saida", 3, 7);
  conferir("saldo virou 7", (await saldoNaTela()) === 7, String(await saldoNaTela()));
  txt = await page.textContent("body");
  conferir("histórico registrou -3", /-3/.test(txt));
  conferir("acumulado depois da saída", /ficou 7/.test(txt));

  console.log("\n=== INVENTÁRIO: CONTEI 5 ===");
  const previaInv = await mexer("inventario", 5, 5);
  conferir(
    "prévia mostrou a diferença",
    /-2 de diferença/.test(previaInv.replace(/\s+/g, " ")),
    previaInv.replace(/\s+/g, " ").slice(0, 200),
  );
  conferir("saldo virou 5", (await saldoNaTela()) === 5, String(await saldoNaTela()));
  txt = await page.textContent("body");
  conferir("gravou a DIFERENÇA, não o total", /-2/.test(txt));
  conferir("motivo Inventário", /Inventário/.test(txt));

  console.log("\n=== O CATÁLOGO REFLETE O MOVIMENTO ===");
  await page.goto(`${BASE}/estoque?busca=${encodeURIComponent(MARCA)}`, {
    waitUntil: "networkidle",
  });
  txt = await page.textContent("body");
  conferir("catálogo mostra 5 un.", /5 un\./.test(txt), txt.slice(0, 160));
  conferir("saiu de 'nunca comprada'", !/nunca comprada/.test(txt));

  await page.goto(`${BASE}/estoque/${pecaId}`, { waitUntil: "networkidle" });
  await page.screenshot({ path: "scripts/shots/ficha-peca.png", fullPage: true });

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/estoque/${pecaId}`, { waitUntil: "networkidle" });
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/ficha-390.png", fullPage: true });

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  if (pecaId) {
    // Apaga por ID exato, capturado da URL da própria ficha.
    const { PrismaClient } = await import("@prisma/client");
    const { PrismaPg } = await import("@prisma/adapter-pg");
    const prisma = new PrismaClient({
      adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
    });
    try {
      const alvo = await prisma.peca.findUnique({
        where: { id: pecaId },
        select: { id: true, nome: true },
      });
      if (alvo && alvo.nome.startsWith(MARCA)) {
        await prisma.movimentoEstoque.deleteMany({ where: { pecaId } });
        await prisma.peca.delete({ where: { id: pecaId } });
        console.log(`  removida ${alvo.nome}`);
      } else {
        console.log("  ABORTADO: o id não corresponde a uma peça de teste");
      }
    } finally {
      await prisma.$disconnect();
    }
  }
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
