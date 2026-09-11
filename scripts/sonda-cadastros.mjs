/*
 * Fase 1 — Cadastros. Confere item por item contra o PARIDADE.md.
 *
 *   node scripts/sonda-cadastros.mjs [url]
 *
 * Cria um cliente e um fornecedor de teste pela interface, confere, e APAGA
 * os dois pela interface no fim — por nome exato, conferido antes de clicar.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";
import { mkdirSync } from "node:fs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const SHOTS = "scripts/shots";
const MARCA = "ZZQA ";

let passou = 0;
let falhou = 0;

function conferir(nome, cond, detalhe = "") {
  if (cond) {
    passou++;
    console.log(`  OK    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

const erros = [];
page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

try {
  // login
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await esperarPronto(page);

  console.log("\n=== ESTRUTURA DA TELA ===");
  await page.goto(`${BASE}/cadastros`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  let txt = await page.textContent("body");

  conferir("aba Clientes existe", /Clientes/.test(txt));
  conferir("aba Fornecedores existe", /Fornecedores/.test(txt));

  console.log("\n=== OS 4 INDICADORES DE CLIENTES ===");
  for (const t of ["Clientes", "Parados", "Aniversariantes", "A receber"]) {
    conferir(`indicador "${t}"`, new RegExp(t, "i").test(txt));
  }
  conferir("texto 'sem comprar há N+ dias'", /sem comprar h[áa] \d+\+ dias/i.test(txt));

  console.log("\n=== OS 6 FILTROS ===");
  for (const c of ["Todos", "Devendo", "Parados", "Aniversariantes", "Pessoa física", "Empresa"]) {
    conferir(`filtro "${c}"`, txt.includes(c));
  }

  console.log("\n=== BUSCA ===");
  conferir(
    "campo de busca com o texto do app antigo",
    (await page.getAttribute('input[name="busca"]', "placeholder"))?.includes("CPF/CNPJ"),
  );

  console.log("\n=== CADASTRAR CLIENTE (assistente de 3 etapas) ===");
  await page.click('button:has-text("Novo cliente")');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  let dlg = await page.textContent('[role="dialog"]');
  conferir("etapa 1 de 3 · Quem é", /Etapa 1 de 3/.test(dlg) && /Quem é/.test(dlg));
  conferir("tem PF e Empresa", /Pessoa física/.test(dlg) && /Empresa/.test(dlg));

  // CPF inválido deve acusar
  await page.fill("#nome", MARCA + "Cliente Teste");
  await page.fill("#doc", "11111111111");
  await page.waitForTimeout(250);
  dlg = await page.textContent('[role="dialog"]');
  conferir("CPF repetido é recusado", /CPF inválido/.test(dlg));

  // CPF válido
  await page.fill("#doc", "52998224725");
  await page.waitForTimeout(250);
  dlg = await page.textContent('[role="dialog"]');
  conferir("CPF válido é aceito", !/CPF inválido/.test(dlg));
  conferir("máscara aplicada", (await page.inputValue("#doc")) === "529.982.247-25");

  await page.click('[role="dialog"] button:has-text("Continuar")');
  await page.waitForTimeout(300);
  dlg = await page.textContent('[role="dialog"]');
  conferir("etapa 2 de 3 · Contato", /Etapa 2 de 3/.test(dlg) && /Contato/.test(dlg));

  await page.fill("#telefone", "44999887766");
  conferir("telefone com máscara", (await page.inputValue("#telefone")) === "(44) 99988-7766");

  await page.click('[role="dialog"] button:has-text("Continuar")');
  await page.waitForTimeout(300);
  dlg = await page.textContent('[role="dialog"]');
  conferir("etapa 3 de 3 · Endereço", /Etapa 3 de 3/.test(dlg) && /Endereço/.test(dlg));

  await page.click('[role="dialog"] button:has-text("Salvar cliente")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 15000 });
  // Espera o NOME aparecer em vez de dormir um tempo fixo: o refresh do
  // servidor leva o tempo que levar, e sono fixo dá falso negativo.
  const apareceu = await page
    .waitForFunction((n) => document.body.innerText.includes(n), MARCA + "Cliente Teste", { timeout: 15000 })
    .then(() => true)
    .catch(() => false);

  txt = await page.textContent("body");
  conferir("cliente aparece na lista", apareceu);
  conferir("mostra 'Pessoa física'", /Pessoa física/.test(txt));
  conferir("mostra 'sem compras'", /sem compras/.test(txt));
  conferir("mostra 'total comprado'", /total comprado/i.test(txt));

  await page.screenshot({ path: `${SHOTS}/cadastros-clientes.png`, fullPage: true });

  console.log("\n=== FORNECEDORES ===");
  await page.goto(`${BASE}/cadastros?aba=fornecedores`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("indicador Fornecedores", /Fornecedores/.test(txt));
  conferir("indicador A pagar", /A pagar/.test(txt));

  await page.click('button:has-text("Novo fornecedor")');
  await page.waitForSelector('[role="dialog"]', { timeout: 5000 });
  dlg = await page.textContent('[role="dialog"]');
  conferir("fornecedor tem 2 etapas", /Etapa 1 de 2/.test(dlg));
  conferir("padrão é Empresa", (await page.getAttribute('[role="dialog"] button:has-text("Empresa")', "aria-pressed")) === "true");

  await page.fill("#f-razão-social", MARCA + "Fornecedor Teste");
  await page.click('[role="dialog"] button:has-text("Continuar")');
  await page.waitForTimeout(300);
  await page.click('[role="dialog"] button:has-text("Salvar fornecedor")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 15000 });
  await page.waitForTimeout(1200);

  txt = await page.textContent("body");
  conferir("fornecedor aparece na lista", txt.includes(MARCA + "Fornecedor Teste"));
  await page.screenshot({ path: `${SHOTS}/cadastros-fornecedores.png`, fullPage: true });

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/cadastros`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: `${SHOTS}/cadastros-390.png`, fullPage: true });

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} finally {
  console.log("\n=== LIMPEZA (pela interface, por nome exato) ===");
  try {
    await page.setViewportSize({ width: 1366, height: 900 });
    await page.goto(`${BASE}/cadastros?busca=${encodeURIComponent(MARCA)}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
    const btn = page.locator(`button[aria-label="Excluir ${MARCA}Cliente Teste"]`);
    if (await btn.count()) {
      await btn.first().click();
      await page.waitForSelector('[role="dialog"]');
      const conf = await page.textContent('[role="dialog"]');
      if (conf.includes(MARCA + "Cliente Teste")) {
        await page.click('[role="dialog"] button:has-text("Excluir")');
        await page.waitForTimeout(1500);
        console.log("  cliente de teste removido");
      } else {
        console.log("  ABORTADO: a confirmação não nomeava o alvo esperado");
      }
    } else {
      console.log("  nenhum cliente de teste para remover");
    }
    await page.goto(`${BASE}/cadastros?aba=fornecedores`, { waitUntil: "networkidle" });
  await esperarPronto(page);
    const bf = page.locator(`button[aria-label="Excluir ${MARCA}Fornecedor Teste"]`);
    if (await bf.count()) {
      await bf.first().click();
      await page.waitForSelector('[role="dialog"]');
      const cf = await page.textContent('[role="dialog"]');
      if (cf.includes(MARCA + "Fornecedor Teste")) {
        await page.click('[role="dialog"] button:has-text("Excluir")');
        await page.waitForTimeout(1500);
        console.log("  fornecedor de teste removido");
      } else {
        console.log("  ABORTADO: a confirmação não nomeava o fornecedor esperado");
      }
    } else {
      console.log("  nenhum fornecedor de teste para remover");
    }
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }

  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
  console.log("(o fornecedor de teste fica no banco — ainda não há botão de excluir fornecedor)\n");
  process.exitCode = falhou === 0 ? 0 : 1;
}
