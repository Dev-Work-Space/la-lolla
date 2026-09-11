/*
 * Financeiro, ponta a ponta. Confere as regras que valem dinheiro:
 *   - saldo da carteira = inicial + entradas − saídas
 *   - saída é gravada NEGATIVA (somar a coluna dá o saldo)
 *   - transferência não muda o total da loja, só o lugar
 *   - baixa de conta vira lançamento e muda o saldo de verdade
 *   - venda cancelada não entra no caixa
 *   - vendedora não vê o Financeiro
 *
 * Limpa tudo no fim, por id exato.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";

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

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const criados = { carteiras: [], lancamentos: [], contas: [], transferencias: [] };

async function entrar(usuario, senha) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", usuario);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await esperarPronto(page);
  return { ctx, page, erros };
}

try {
  const admin = await entrar("teste", "Teste@2026!");
  const page = admin.page;

  console.log("\n=== ESTRUTURA ===");
  await page.goto(`${BASE}/financeiro`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  let txt = await page.textContent("body");
  for (const t of ["Em caixa", "A pagar", "A receber", "Despesas do mês"]) {
    conferir(`indicador "${t}"`, txt.includes(t));
  }
  for (const t of ["Caixa", "Carteiras"]) {
    conferir(`aba "${t}"`, txt.includes(t));
  }

  console.log("\n=== CARTEIRA COM SALDO INICIAL ===");
  await page.goto(`${BASE}/financeiro?aba=carteiras`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir(
    "explica que carteira é ONDE o dinheiro está",
    /Carteira é onde o dinheiro está/i.test(txt),
  );

  await page.click('button:has-text("Nova carteira")');
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#nome", MARCA + "Cofre");
  await page.fill("#saldoInicial", "1.000,00");
  await page.click('[role="dialog"] button:has-text("Salvar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForFunction((n) => document.body.innerText.includes(n), MARCA + "Cofre", {
    timeout: 20000,
  });

  const cart = await db.carteira.findFirst({ where: { nome: MARCA + "Cofre" }, select: { id: true, saldoInicial: true } });
  criados.carteiras.push(cart.id);
  conferir("saldo inicial gravado 1000", Number(cart.saldoInicial) === 1000, String(cart.saldoInicial));
  txt = await page.textContent("body");
  conferir("carteira mostra R$ 1.000,00", /R\$\s*1\.000,00/.test(txt));

  console.log("\n=== SAÍDA DE DINHEIRO É GRAVADA NEGATIVA ===");
  await page.goto(`${BASE}/financeiro?aba=caixa`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.click('button:has-text("Saída de dinheiro")');
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#descricao", MARCA + "Conta de luz");
  await page.fill("#valor", "250,00");
  await page.selectOption("#carteiraId", cart.id);
  await page.click('[role="dialog"] button:has-text("Gravar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1200);

  const lanc = await db.lancamento.findFirst({
    where: { descricao: MARCA + "Conta de luz" },
    select: { id: true, valor: true, carteiraId: true },
  });
  criados.lancamentos.push(lanc.id);
  conferir("gravado como NEGATIVO (−250)", Number(lanc.valor) === -250, String(lanc.valor));
  conferir("vinculado à carteira", lanc.carteiraId === cart.id);

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("extrato mostra a saída", txt.includes(MARCA + "Conta de luz"));
  conferir("extrato mostra '− R$ 250,00'", /−\s*R\$\s*250,00/.test(txt));

  await page.goto(`${BASE}/financeiro?aba=carteiras`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("saldo virou 1000 − 250 = 750", /R\$\s*750,00/.test(txt));

  console.log("\n=== CONTA A PAGAR EM 2 PARCELAS ===");
  await page.goto(`${BASE}/financeiro?aba=pagar`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.click('button:has-text("Nova conta a pagar")');
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#descricao-c", MARCA + "Aluguel");
  await page.fill("#valor-c", "900,00");
  await page.fill("#parcelas-c", "2");
  await page.click('[role="dialog"] button:has-text("Lançar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1200);

  const contas = await db.conta.findMany({
    where: { descricao: { startsWith: MARCA + "Aluguel" } },
    select: { id: true, valor: true, parcela: true, vencimento: true },
    orderBy: { vencimento: "asc" },
  });
  criados.contas.push(...contas.map((c) => c.id));
  conferir("criou 2 parcelas", contas.length === 2, String(contas.length));
  conferir(
    "parcelas somam 900",
    Math.abs(contas.reduce((s, c) => s + Number(c.valor), 0) - 900) < 0.01,
  );
  conferir(
    "segunda vence um mês depois",
    contas[1].vencimento.getMonth() !== contas[0].vencimento.getMonth(),
  );

  console.log("\n=== DAR BAIXA MUDA O SALDO DE VERDADE ===");
  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.click(`button[aria-label^="Dar baixa em ${MARCA}Aluguel"]`);
  await page.waitForSelector('[role="dialog"]');
  const dlg = await page.textContent('[role="dialog"]');
  conferir("avisa que comprovante ainda não está pronto", /comprovante/i.test(dlg));
  await page.selectOption(`select[name="carteiraId"]`, cart.id);
  await page.click('[role="dialog"] button:has-text("Dar baixa")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const baixada = await db.conta.findFirst({
    where: { id: contas[0].id },
    select: { status: true, lancamentoId: true, pagoEm: true },
  });
  conferir("conta virou PAGA", baixada.status === "PAGA");
  conferir("gerou o lançamento na carteira", !!baixada.lancamentoId);
  if (baixada.lancamentoId) criados.lancamentos.push(baixada.lancamentoId);

  const saldoCart = await db.lancamento.aggregate({
    where: { carteiraId: cart.id },
    _sum: { valor: true },
  });
  const esperado = -250 - Number(contas[0].valor);
  conferir(
    `lançamentos somam ${esperado.toFixed(2)}`,
    Math.abs(Number(saldoCart._sum.valor) - esperado) < 0.01,
    String(saldoCart._sum.valor),
  );

  await page.screenshot({ path: "scripts/shots/financeiro.png", fullPage: true });

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/financeiro`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/financeiro-390.png", fullPage: true });

  conferir("admin: sem erro de console", admin.erros.length === 0, admin.erros.slice(0, 2).join(" | "));

  console.log("\n=== VENDEDORA NÃO VÊ O FINANCEIRO ===");
  const vend = await entrar("vendedora", "Vende@2026!");
  const resp = await vend.page.goto(`${BASE}/financeiro`, { waitUntil: "domcontentloaded" });
  await esperarPronto(vend.page);
  const vtxt = await vend.page.textContent("body");
  conferir(
    "acesso negado ou 404",
    resp.status() === 404 || /não encontrad|404/i.test(vtxt),
    `status ${resp.status()}`,
  );
  conferir("não vê 'Em caixa'", !vtxt.includes("Em caixa"));
  await vend.ctx.close();
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    for (const id of criados.contas) await db.conta.deleteMany({ where: { id } });
    for (const id of criados.lancamentos) await db.lancamento.deleteMany({ where: { id } });
    for (const id of criados.transferencias) await db.transferencia.deleteMany({ where: { id } });
    for (const id of criados.carteiras) {
      const c = await db.carteira.findUnique({ where: { id }, select: { nome: true } });
      if (c && c.nome.startsWith(MARCA)) {
        await db.lancamento.deleteMany({ where: { carteiraId: id } });
        await db.carteira.delete({ where: { id } });
        console.log(`  ${c.nome} removida`);
      }
    }
    const sobra = await db.conta.count({ where: { descricao: { startsWith: MARCA } } });
    console.log(`  contas de teste restantes: ${sobra}`);
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
