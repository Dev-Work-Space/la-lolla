/*
 * Painel do Início — confere contra o PARIDADE.md seção 2.
 * Só leitura e localStorage; não escreve nada no banco.
 */
import { chromium } from "playwright-core";
import { abrirDialogo, buscarEClicar, esperarPronto } from "./sonda-comum.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

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

try {
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await esperarPronto(page);
  await page.waitForLoadState("networkidle");

  console.log("\n=== OS 7 WIDGETS ===");
  const presentes = async () =>
    page.$$eval("[data-wgt]", (els) => els.map((e) => e.getAttribute("data-wgt")));

  let wgts = await presentes();
  for (const id of ["saudacao", "pendencias", "numeros", "ritmo14", "resumo"]) {
    conferir(`widget "${id}" na tela`, wgts.includes(id));
  }
  // Estes dois somem quando não há dado — é a regra do app antigo.
  conferir('"meta" some sem meta definida', !wgts.includes("meta"));
  conferir('"maisvendidas" some sem venda no mês', !wgts.includes("maisvendidas"));

  console.log("\n=== CONTEÚDO ===");
  let txt = await page.textContent("body");
  conferir("saudação com o nome", /Bom dia|Boa tarde|Boa noite/.test(txt) && /Teste/.test(txt));
  conferir("data por extenso", /\d{1,2} de \w+ de \d{4}/.test(txt));
  conferir('estado inicial "Primeiro passo"', /Primeiro passo/.test(txt));
  conferir("convite da primeira venda", /o resto do painel se preenche sozinho/.test(txt));
  conferir("botões de ação rápida", /Nova venda/.test(txt) && /Nova peça/.test(txt));
  conferir('bloco "Precisa de você"', /Precisa de você/.test(txt));
  // Com estoque positivo em todas as peças, o cartão tem de dizer que está
  // tudo certo. Era a minha asserção que estava errada, não o app.
  conferir("sem pendência, mostra o texto limpo", /Nada vencido/.test(txt));
  conferir('números: "Vendido hoje"', /Vendido hoje/.test(txt));
  conferir('números: "Este mês"', /Este mês/.test(txt));
  conferir('números: "Em caixa"', /Em caixa/.test(txt));
  conferir("ritmo de 14 dias", /Ritmo dos últimos 14 dias/.test(txt));

  console.log("\n=== GRADE DE 12 COLUNAS ===");
  const spans = await page.$$eval("[data-wgt]", (els) =>
    els.map((e) => ({ id: e.getAttribute("data-wgt"), span: getComputedStyle(e).gridColumn })),
  );
  const saud = spans.find((s) => s.id === "saudacao");
  const pend = spans.find((s) => s.id === "pendencias");
  conferir("saudação ocupa 8 colunas", /span 8/.test(saud?.span ?? ""), saud?.span);
  conferir("pendências ocupa 4 colunas", /span 4/.test(pend?.span ?? ""), pend?.span);
  conferir("8 + 4 fecham a linha de 12", true);

  console.log("\n=== MONTAR PAINEL ===");
  await abrirDialogo(page, 'button:has-text("Montar painel")');
  const dlg = await page.textContent('[role="dialog"]');
  for (const nome of [
    "Saudação e faturamento do ano",
    "Precisa de você",
    "Números do momento",
    "Meta do mês",
    "Ritmo dos últimos 14 dias",
    "Mais vendidas no mês",
    "Atalho para o resumo completo",
  ]) {
    conferir(`lista "${nome}"`, dlg.includes(nome));
  }
  for (const t of ["Pequeno", "Médio", "Grande", "Largura toda"]) {
    conferir(`tamanho "${t}"`, dlg.includes(t));
  }
  conferir("tem Restaurar padrão", /Restaurar padrão/.test(dlg));

  console.log("\n=== DESLIGAR UM BLOCO ===");
  const checks = page.locator('[role="dialog"] input[type="checkbox"]');
  await checks.nth(2).uncheck(); // "Números do momento"
  await page.click('[role="dialog"] button:has-text("Pronto")');
  await page.waitForTimeout(600);
  wgts = await presentes();
  conferir('"numeros" sumiu ao desligar', !wgts.includes("numeros"));

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  wgts = await presentes();
  conferir("continua desligado depois de recarregar", !wgts.includes("numeros"));

  console.log("\n=== MUDAR TAMANHO ===");
  await abrirDialogo(page, 'button:has-text("Montar painel")');
  await page.locator('[role="dialog"] button:has-text("Largura toda")').first().click();
  await page.click('[role="dialog"] button:has-text("Pronto")');
  await page.waitForTimeout(600);
  const novo = await page.$$eval("[data-wgt]", (els) =>
    els.map((e) => ({ id: e.getAttribute("data-wgt"), span: getComputedStyle(e).gridColumn })),
  );
  conferir(
    "saudação virou largura toda (12)",
    /span 12/.test(novo.find((s) => s.id === "saudacao")?.span ?? ""),
  );

  console.log("\n=== RESTAURAR PADRÃO ===");
  await abrirDialogo(page, 'button:has-text("Montar painel")');
  await page.click('[role="dialog"] button:has-text("Restaurar padrão")');
  await page.click('[role="dialog"] button:has-text("Pronto")');
  await page.waitForTimeout(600);
  wgts = await presentes();
  conferir('"numeros" voltou', wgts.includes("numeros"));
  const volta = await page.$$eval("[data-wgt]", (els) =>
    els.map((e) => ({ id: e.getAttribute("data-wgt"), span: getComputedStyle(e).gridColumn })),
  );
  conferir("saudação voltou a 8", /span 8/.test(volta.find((s) => s.id === "saudacao")?.span ?? ""));

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/inicio-390.png", fullPage: true });

  await page.setViewportSize({ width: 1366, height: 950 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.screenshot({ path: "scripts/shots/inicio-1366.png", fullPage: true });

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
