/*
 * Portal de compras. A regra 2.12 diz que dar entrada em peça É saída de
 * caixa — este teste existe para provar que as duas coisas acontecem juntas.
 *
 * Faz uma compra à vista e outra a prazo, e confere:
 *   - estoque entra por movimento, com origem na compra
 *   - o custo da peça é atualizado
 *   - à vista: sai lançamento negativo da carteira
 *   - a prazo: cria conta a pagar ligada ao fornecedor E à compra
 *   - vendedora não consegue comprar
 *
 * Limpa tudo no fim, por id exato.
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

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const criados = { compras: [], pecas: [], fornecedores: [], carteiras: [] };

async function entrar(usuario, senha) {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await page.fill("#usuario", usuario);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  return { ctx, page, erros };
}

try {
  const admin = await entrar("teste", "Teste@2026!");
  const page = admin.page;

  console.log("\n=== PREPARAR ===");
  const forn = await db.fornecedor.create({
    data: { nome: MARCA + "Fornecedor Compras" },
    select: { id: true, nome: true },
  });
  criados.fornecedores.push(forn.id);

  const cart = await db.carteira.create({
    data: { nome: MARCA + "Caixa Compras", saldoInicial: 5000 },
    select: { id: true, nome: true },
  });
  criados.carteiras.push(cart.id);

  const peca = await db.peca.create({
    data: {
      sku: `ZC-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Brinco de Compra",
      categoria: "Brincos",
      custo: 10,
    },
    select: { id: true, sku: true, nome: true },
  });
  criados.pecas.push(peca.id);
  conferir("preparo pronto (fornecedor, carteira, peça)", true);

  console.log("\n=== COMPRA À VISTA ===");
  await page.goto(`${BASE}/compras/nova`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#fornecedor", { timeout: 30000 });
  await page.selectOption("#fornecedor", forn.id);
  await page.fill("#busca-item", peca.sku);
  await page.waitForSelector(`button:has-text("${peca.sku}")`, { timeout: 20000 });
  await page.click(`button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);

  // 5 unidades a R$ 25 cada = R$ 125
  for (let i = 0; i < 4; i++) {
    await page.click(`button[aria-label="Mais um ${MARCA}Brinco de Compra"]`);
  }
  await page.fill(`input[aria-label="Custo de ${MARCA}Brinco de Compra"]`, "25,00");
  await page.waitForTimeout(300);

  let txt = await page.textContent("body");
  conferir("total 5 × 25 = 125", /R\$\s*125,00/.test(txt));

  await page.click('button:has-text("À vista")');
  await page.selectOption("#carteira-compra", cart.id);
  await page.click('button:has-text("Registrar compra")');
  await page.waitForURL(
    (u) => /\/compras\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/nova"),
    { timeout: 30000 },
  );
  const compraId = page.url().split("/").pop();
  criados.compras.push(compraId);
  await page.waitForTimeout(1000);
  conferir("abriu a ficha da compra", !!compraId);

  console.log("\n=== O ESTOQUE ENTROU ===");
  const movs = await db.movimentoEstoque.findMany({
    where: { pecaId: peca.id },
    select: { delta: true, motivo: true, origem: true },
  });
  conferir("movimento de compra (+5)", movs.some((m) => m.motivo === "COMPRA" && m.delta === 5));
  conferir("movimento aponta para a compra", movs.some((m) => m.origem === compraId));
  conferir("saldo da peça virou 5", movs.reduce((s, m) => s + m.delta, 0) === 5);

  console.log("\n=== O CUSTO DA PEÇA FOI ATUALIZADO ===");
  const p2 = await db.peca.findUnique({
    where: { id: peca.id },
    select: { custo: true, fornecedorId: true, pagoFornecedor: true },
  });
  conferir("custo virou 25 (era 10)", Number(p2.custo) === 25, String(p2.custo));
  conferir("fornecedor vinculado", p2.fornecedorId === forn.id);
  conferir("marcada como paga (à vista)", p2.pagoFornecedor === true);

  console.log("\n=== SAIU DO CAIXA (regra 2.12) ===");
  const lancs = await db.lancamento.findMany({
    where: { carteiraId: cart.id },
    select: { valor: true, descricao: true, categoria: true },
  });
  conferir("gerou lançamento na carteira", lancs.length === 1, String(lancs.length));
  conferir("valor NEGATIVO de −125", Number(lancs[0]?.valor) === -125, String(lancs[0]?.valor));
  conferir("categoria Mercadoria", lancs[0]?.categoria === "Mercadoria");
  conferir("descrição cita a compra", /Compra #\d+/.test(lancs[0]?.descricao ?? ""));

  const semConta = await db.conta.count({ where: { compraId } });
  conferir("à vista NÃO cria conta a pagar", semConta === 0, String(semConta));

  await page.screenshot({ path: "scripts/shots/compra-ficha.png", fullPage: true });

  console.log("\n=== COMPRA A PRAZO (3 parcelas) ===");
  await page.goto(`${BASE}/compras/nova`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("#fornecedor", { timeout: 30000 });
  await page.selectOption("#fornecedor", forn.id);
  await page.fill("#busca-item", peca.sku);
  await page.waitForSelector(`button:has-text("${peca.sku}")`, { timeout: 20000 });
  await page.click(`button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);
  await page.click(`button[aria-label="Mais um ${MARCA}Brinco de Compra"]`);
  await page.fill(`input[aria-label="Custo de ${MARCA}Brinco de Compra"]`, "30,00");
  await page.click('button:has-text("A prazo")');
  await page.fill("#parcelas-compra", "3");
  await page.waitForTimeout(300);
  txt = await page.textContent("body");
  conferir("3× de R$ 20,00", /3×\s*de\s*R\$\s*20,00/.test(txt.replace(/\s+/g, " ")));

  await page.click('button:has-text("Registrar compra")');
  await page.waitForURL(
    (u) => /\/compras\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/nova"),
    { timeout: 30000 },
  );
  const compra2 = page.url().split("/").pop();
  criados.compras.push(compra2);
  await page.waitForTimeout(1000);

  const contas = await db.conta.findMany({
    where: { compraId: compra2 },
    select: { valor: true, tipo: true, status: true, fornecedorId: true, parcela: true },
    orderBy: { vencimento: "asc" },
  });
  conferir("criou 3 parcelas", contas.length === 3, String(contas.length));
  conferir("são contas a PAGAR", contas.every((c) => c.tipo === "PAGAR"));
  conferir("ligadas ao fornecedor", contas.every((c) => c.fornecedorId === forn.id));
  conferir(
    "somam 60 (2 × 30)",
    Math.abs(contas.reduce((s, c) => s + Number(c.valor), 0) - 60) < 0.01,
  );

  const lancs2 = await db.lancamento.count({ where: { carteiraId: cart.id } });
  conferir("a prazo NÃO tira do caixa agora", lancs2 === 1, String(lancs2));

  const p3 = await db.peca.findUnique({
    where: { id: peca.id },
    select: { custo: true, pagoFornecedor: true },
  });
  conferir("custo atualizado para 30", Number(p3.custo) === 30, String(p3.custo));
  conferir("marcada como A PAGAR", p3.pagoFornecedor === false);

  console.log("\n=== APARECE NO FINANCEIRO ===");
  await page.goto(`${BASE}/financeiro?aba=pagar`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  txt = await page.textContent("body");
  conferir("parcelas da compra em contas a pagar", /Compra #\d+/.test(txt));

  await page.goto(`${BASE}/financeiro?aba=caixa`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  txt = await page.textContent("body");
  conferir("compra à vista no extrato", /Compra #\d+/.test(txt));

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/compras`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(800);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/compras-390.png", fullPage: true });

  conferir("admin: sem erro de console", admin.erros.length === 0, admin.erros.slice(0, 2).join(" | "));

  console.log("\n=== VENDEDORA NÃO COMPRA ===");
  const vend = await entrar("vendedora", "Vende@2026!");
  const resp = await vend.page.goto(`${BASE}/compras/nova`, { waitUntil: "domcontentloaded" });
  const vtxt = await vend.page.textContent("body");
  conferir(
    "acesso negado (mexe em dinheiro)",
    resp.status() === 404 || /não encontrad|404/i.test(vtxt),
    `status ${resp.status()}`,
  );
  await vend.ctx.close();
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    for (const id of criados.compras) {
      await db.conta.deleteMany({ where: { compraId: id } });
      await db.itemCompra.deleteMany({ where: { compraId: id } });
      await db.compra.deleteMany({ where: { id } });
    }
    for (const id of criados.pecas) {
      const p = await db.peca.findUnique({ where: { id }, select: { nome: true } });
      if (p && p.nome.startsWith(MARCA)) {
        await db.movimentoEstoque.deleteMany({ where: { pecaId: id } });
        await db.peca.delete({ where: { id } });
      }
    }
    for (const id of criados.carteiras) {
      await db.lancamento.deleteMany({ where: { carteiraId: id } });
      await db.carteira.deleteMany({ where: { id } });
    }
    for (const id of criados.fornecedores) await db.fornecedor.deleteMany({ where: { id } });
    console.log("  registros de teste removidos");
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
