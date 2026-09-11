/*
 * Portal de vendas, ponta a ponta.
 *
 * Faz uma venda de verdade e confere as REGRAS que valem dinheiro:
 *   - total = subtotal − desconto
 *   - o estoque baixa por movimento
 *   - o saldo vira parcelas em contas a receber
 *   - devolução abate do total e devolve ao estoque
 *   - cancelamento não apaga: some do cálculo e o estoque volta
 *   - vendedora não vê custo nem margem
 *
 * Limpa tudo no fim, por id exato.
 */
import { chromium } from "playwright-core";
import { abrirDialogo, buscarEClicar, esperarPronto } from "./sonda-comum.mjs";

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

let pecaId = null;
let vendaId = null;

try {
  const admin = await entrar("teste", "Teste@2026!");
  const page = admin.page;

  console.log("\n=== PREPARAR: peça com 10 em estoque ===");
  const peca = await db.peca.create({
    data: {
      sku: `ZZ-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Anel de Venda",
      categoria: "Anéis",
      custo: 40,
      precoTabela: 100,
      codigoFornecedor: 10,
      fator: 4,
    },
    select: { id: true, nome: true, sku: true },
  });
  pecaId = peca.id;
  // Entrada de fornecedor mexe em DUAS coisas: o movimento (que dá o saldo) e
  // o total recebido (que tira a peça de "nunca comprada"). Injetar só o
  // movimento deixaria a peça com estoque e etiqueta de nunca comprada.
  await db.movimentoEstoque.create({
    data: { pecaId, delta: 10, motivo: "COMPRA", observacao: "preparo do teste" },
  });
  await db.peca.update({ where: { id: pecaId }, data: { totalRecebido: { increment: 10 } } });
  conferir("peça criada com 10 unidades", true);

  /*
   * Guarda o "vendido hoje" DE PARTIDA.
   *
   * No fim a sonda cancela a venda e confere que o número voltou ao que era.
   * Antes ela exigia R$ 0,00, o que só valia num banco sem nenhuma venda do
   * dia — bastava sobrar uma venda de outro teste para acusar falha num app
   * certo. Comparar com o valor de partida vale em qualquer banco.
   */
  const vendidoHoje = async () => {
    await page.goto(`${BASE}/vendas`, { waitUntil: "networkidle" });
    await esperarPronto(page);
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    const m = t.match(/VENDIDO HOJE\s*R\$\s*([\d.]+,\d{2})/i);
    return m ? Number(m[1].replace(/\./g, "").replace(",", ".")) : null;
  };
  const hojeAntes = await vendidoHoje();
  conferir("leu o 'vendido hoje' de partida", hojeAntes !== null, String(hojeAntes));

  console.log("\n=== FAZER A VENDA (2 peças, R$ 10 de desconto) ===");
  await page.goto(`${BASE}/vendas/nova`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.fill("#busca-peca", peca.sku);
  // Busca pelo SKU, que e unico: com o nome, uma peca de rodada anterior
  // poderia entrar na lista e a venda sairia com o id errado.
  await page.waitForSelector(`button:has-text("${peca.sku}")`, { timeout: 20000 });
  await page.click(`button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);
  await page.click(`button[aria-label="Mais um ${MARCA}Anel de Venda"]`);
  // Desconto é PERCENTUAL sobre o subtotal (documentação, seção 15):
  // 5% de R$ 200 = R$ 10 de desconto, total R$ 190.
  await page.fill("#desconto", "5");
  await page.waitForTimeout(400);

  let txt = await page.textContent("body");
  conferir("subtotal 2 × 100 = 200", /R\$\s*200,00/.test(txt));
  conferir("5% de desconto = total 190", /R\$\s*190,00/.test(txt));

  // paga 150 em dinheiro; sobram 40 a prazo
  await page.click('button:has-text("Dinheiro")');
  await page.fill('input[aria-label="Valor pago"]', "150,00");
  await page.click('button:has-text("Adicionar")');
  await page.waitForTimeout(300);
  txt = await page.textContent("body");
  conferir("falta R$ 40,00", /R\$\s*40,00/.test(txt));
  conferir("aparece o parcelamento", /Sobrou/.test(txt));

  await page.fill("#parcelas", "2");
  await page.waitForTimeout(200);
  txt = await page.textContent("body");
  conferir("2× de R$ 20,00", /2×\s*de\s*R\$\s*20,00/.test(txt.replace(/\s+/g, " ")));

  /*
   * Sobra a prazo EXIGE cliente (documentação, seção 15: venda avulsa sai
   * quitada). Esta sonda fechava sem escolher ninguém e passava; hoje o app
   * recusa, com razão — não dá para cobrar quem não tem nome.
   */
  const semCliente = await page.$eval("#cliente", (s) => s.value === "");
  conferir("a venda começa sem cliente", semCliente);
  await page.click('button:has-text("Fechar venda")');
  await page.waitForTimeout(2000);
  txt = await page.textContent("body");
  conferir("recusa fiar sem cliente", /Selecione o cliente/i.test(txt), txt.slice(0, 120));
  conferir("e continua na tela da venda", page.url().endsWith("/vendas/nova"), page.url());

  // Agora com cliente: o primeiro da lista depois de "Sem cliente".
  const opcao = await page.$eval("#cliente", (s) => s.options[1]?.value ?? "");
  conferir("existe cliente para escolher", Boolean(opcao));
  await page.selectOption("#cliente", opcao);
  await page.waitForTimeout(300);

  await page.click('button:has-text("Fechar venda")');
  await page.waitForURL((u) => /\/vendas\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/nova"), { timeout: 30000 });
  await esperarPronto(page);
  vendaId = page.url().split("/").pop();
  await page.waitForLoadState("networkidle");
  conferir("abriu a ficha da venda", vendaId !== null);

  console.log("\n=== OS NÚMEROS NO BANCO ===");
  const v = await db.venda.findUnique({
    where: { id: vendaId },
    select: {
      total: true,
      desconto: true,
      itens: { select: { quantidade: true, precoUnit: true, custoUnit: true } },
      pagamentos: { select: { valor: true, forma: true } },
      parcelas: { select: { valor: true, parcela: true, deParcelas: true, tipo: true, status: true } },
    },
  });
  conferir("total gravado 190", Number(v.total) === 190, String(v.total));
  conferir("desconto gravado 10", Number(v.desconto) === 10, String(v.desconto));
  conferir("CUSTO congelado no item (40)", Number(v.itens[0].custoUnit) === 40, String(v.itens[0].custoUnit));
  conferir("1 pagamento de 150", v.pagamentos.length === 1 && Number(v.pagamentos[0].valor) === 150);
  conferir("2 parcelas criadas", v.parcelas.length === 2, String(v.parcelas.length));
  conferir(
    "parcelas somam 40",
    Math.abs(v.parcelas.reduce((s, p) => s + Number(p.valor), 0) - 40) < 0.01,
  );
  conferir("parcelas são a RECEBER", v.parcelas.every((p) => p.tipo === "RECEBER"));

  console.log("\n=== O ESTOQUE BAIXOU POR MOVIMENTO ===");
  let movs = await db.movimentoEstoque.findMany({
    where: { pecaId },
    select: { delta: true, motivo: true, origem: true },
    orderBy: { criadoEm: "asc" },
  });
  conferir("movimento de venda existe", movs.some((m) => m.motivo === "VENDA" && m.delta === -2));
  conferir("movimento aponta para a venda", movs.some((m) => m.origem === vendaId));
  conferir("saldo 10 − 2 = 8", movs.reduce((s, m) => s + m.delta, 0) === 8);

  console.log("\n=== DEVOLVER 1 PEÇA ===");
  await abrirDialogo(page, 'button:has-text("Devolver")');
  await page.fill(`input[aria-label="Devolver de ${MARCA}Anel de Venda"]`, "1");
  await page.click('[role="dialog"] button:has-text("Confirmar devolução")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const v2 = await db.venda.findUnique({
    where: { id: vendaId },
    select: { itens: { select: { devolvido: true } } },
  });
  conferir("item marcado como devolvido", v2.itens[0].devolvido === 1);
  movs = await db.movimentoEstoque.findMany({ where: { pecaId }, select: { delta: true } });
  conferir("peça voltou ao estoque (saldo 9)", movs.reduce((s, m) => s + m.delta, 0) === 9);

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("total caiu para R$ 90,00 (190 − 100)", /R\$\s*90,00/.test(txt), txt.match(/Total[^R]*R\$[^ ]+/)?.[0]);

  await page.screenshot({ path: "scripts/shots/venda-ficha.png", fullPage: true });

  console.log("\n=== CANCELAR ===");
  await abrirDialogo(page, 'button:has-text("Cancelar venda")');
  await page.fill("#motivo", "teste automatizado");
  await page.click('[role="dialog"] button:has-text("Cancelar venda")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const v3 = await db.venda.findUnique({
    where: { id: vendaId },
    select: { status: true, motivoCancelada: true, parcelas: { select: { status: true } } },
  });
  conferir("venda NÃO foi apagada", v3 !== null);
  conferir("status CANCELADA", v3.status === "CANCELADA");
  conferir("motivo gravado", v3.motivoCancelada === "teste automatizado");
  conferir("parcelas canceladas", v3.parcelas.every((p) => p.status === "CANCELADA"));

  movs = await db.movimentoEstoque.findMany({ where: { pecaId }, select: { delta: true } });
  conferir("estoque voltou ao original (10)", movs.reduce((s, m) => s + m.delta, 0) === 10);

  console.log("\n=== CANCELADA SOME DO CÁLCULO ===");
  await page.goto(`${BASE}/vendas`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("some da lista padrão", !txt.includes(MARCA + "Anel de Venda"));
  const hojeDepois = await vendidoHoje();
  conferir(
    "'vendido hoje' voltou ao que era antes da venda",
    hojeDepois !== null && Math.abs(hojeDepois - hojeAntes) < 0.005,
    `antes ${hojeAntes}, depois ${hojeDepois}`,
  );

  await page.goto(`${BASE}/vendas?filtro=canceladas`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("aparece no filtro 'Canceladas'", /cancelada/i.test(txt));

  console.log("\n=== VENDEDORA NÃO VÊ CUSTO ===");
  const vend = await entrar("vendedora", "Vende@2026!");
  await vend.page.goto(`${BASE}/vendas`, { waitUntil: "networkidle" });
  await esperarPronto(vend.page);
  const vtxt = await vend.page.textContent("body");
  const vhtml = (await vend.page.content()).toLowerCase();
  conferir("vê o portal", /Portal de vendas/.test(vtxt));
  conferir("NÃO vê margem nos indicadores", !/margem de/i.test(vtxt));
  conferir("nenhum custo (40,00) no HTML", !vhtml.includes(">r$ 40,00<"));
  conferir("vendedora: sem erro de console", vend.erros.length === 0, vend.erros.slice(0, 2).join(" | "));
  await vend.ctx.close();

  conferir("admin: sem erro de console", admin.erros.length === 0, admin.erros.slice(0, 2).join(" | "));
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (vendaId) {
      const alvo = await db.venda.findUnique({ where: { id: vendaId }, select: { numero: true } });
      if (alvo) {
        await db.conta.deleteMany({ where: { vendaId } });
        await db.pagamento.deleteMany({ where: { vendaId } });
        await db.itemVenda.deleteMany({ where: { vendaId } });
        await db.venda.delete({ where: { id: vendaId } });
        console.log(`  venda #${alvo.numero} removida`);
      }
    }
    if (pecaId) {
      const p = await db.peca.findUnique({ where: { id: pecaId }, select: { nome: true } });
      if (p && p.nome.startsWith(MARCA)) {
        await db.movimentoEstoque.deleteMany({ where: { pecaId } });
        await db.peca.delete({ where: { id: pecaId } });
        console.log(`  ${p.nome} removida`);
      }
    }
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
