/*
 * Orçamentos, ponta a ponta.
 *
 * Confere as regras que a documentação (seção 07) prende ao orçamento, e que
 * são justamente as que separam uma proposta de uma venda:
 *
 *   - o orçamento NÃO baixa estoque; ele RESERVA
 *   - a reserva só vale enquanto estiver aberto E dentro da validade
 *   - revisar cria número novo e aposenta o anterior como SUBSTITUÍDO
 *   - orçamento aprovado ou substituído não se edita
 *   - converter baixa o estoque, some a reserva e o orçamento vira Aprovado
 *   - converter DUAS VEZES é recusado
 *
 * Grava dado de teste marcado com ZZQA e limpa por id exato no fim.
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

const saldoDe = async (id) => {
  const r = await db.movimentoEstoque.aggregate({ where: { pecaId: id }, _sum: { delta: true } });
  return r._sum.delta ?? 0;
};

let pecaId = null;
let clienteId = null;
let orcIds = [];
let vendaId = null;

try {
  const admin = await entrar("teste", "Teste@2026!");
  const page = admin.page;

  console.log("\n=== PREPARAR ===");
  const peca = await db.peca.create({
    data: {
      sku: `ZO-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Colar de Orcamento",
      categoria: "Colares",
      custo: 40,
      precoTabela: 100,
      codigoFornecedor: 10,
      fator: 4,
    },
    select: { id: true, nome: true, sku: true },
  });
  pecaId = peca.id;
  await db.movimentoEstoque.create({
    data: { pecaId, delta: 10, motivo: "COMPRA", observacao: "preparo do teste" },
  });
  await db.peca.update({ where: { id: pecaId }, data: { totalRecebido: { increment: 10 } } });
  conferir("peça criada com 10 unidades", (await saldoDe(pecaId)) === 10);

  const cliente = await db.cliente.create({
    data: { nome: MARCA + "Cliente Orcamento", tipo: "PF" },
    select: { id: true, nome: true },
  });
  clienteId = cliente.id;

  console.log("\n=== FAZER O ORÇAMENTO (2 × 100, 10% de desconto) ===");
  await page.goto(`${BASE}/orcamentos/novo`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.fill("#busca-peca", peca.sku);
  await page.waitForSelector(`button:has-text("${peca.sku}")`, { timeout: 20000 });
  await page.click(`button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);
  await page.click(`button[aria-label="Mais um ${peca.nome}"]`);
  await page.selectOption("#orc-cliente", clienteId);
  await page.selectOption("#orc-validade", "7");
  await page.click('button:has-text("10%")');
  await page.waitForTimeout(400);

  let txt = await page.textContent("body");
  conferir("subtotal 2 × 100 = 200", /R\$\s*200,00/.test(txt));
  conferir("10% de desconto = total 180", /R\$\s*180,00/.test(txt));

  await page.click('button:has-text("Gerar orçamento")');
  /* Esperar por `/orcamentos/<qualquer coisa>` casaria com a PRÓPRIA tela de
     /orcamentos/novo e seguiria antes de gravar — a sonda passava a testar o
     id "novo". Espera pela ficha de verdade. */
  await page.waitForURL(
    (u) => /\/orcamentos\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/novo"),
    { timeout: 30000 },
  );
  await esperarPronto(page);

  const primeiroId = page.url().split("/").pop();
  orcIds.push(primeiroId);
  const orc1 = await db.orcamento.findUnique({
    where: { id: primeiroId },
    select: { numero: true, status: true, total: true, validoAte: true, validadeDias: true },
  });
  conferir("orçamento gravado como ABERTO", orc1?.status === "ABERTO", orc1?.status);
  conferir("total 180 no banco", Number(orc1?.total) === 180, String(orc1?.total));
  conferir("validade de 7 dias gravada", orc1?.validadeDias === 7);

  const diasDeValidade = Math.round(
    (new Date(orc1.validoAte).setHours(0, 0, 0, 0) - new Date().setHours(0, 0, 0, 0)) / 86400000,
  );
  conferir("válido até daqui a 7 dias", diasDeValidade === 7, String(diasDeValidade));

  console.log("\n=== NÃO BAIXA ESTOQUE, MAS RESERVA ===");
  conferir("estoque continua 10", (await saldoDe(pecaId)) === 10);

  await page.goto(`${BASE}/estoque?busca=${peca.sku}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("catálogo mostra '2 reservadas'", /2 reservadas/.test(txt));

  console.log("\n=== REVISAR: nasce número novo, o antigo é substituído ===");
  await page.goto(`${BASE}/orcamentos/${primeiroId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.click('button:has-text("Revisar")');
  await page.waitForSelector('button:has-text("Criar revisão")', { timeout: 15000 });
  await page.click('button:has-text("Criar revisão")');
  await page.waitForURL((u) => u.pathname !== `/orcamentos/${primeiroId}`, { timeout: 30000 });
  await esperarPronto(page);

  const revisaoId = page.url().split("/").pop();
  orcIds.push(revisaoId);
  const [antigo, revisao] = await Promise.all([
    db.orcamento.findUnique({ where: { id: primeiroId }, select: { status: true, numero: true } }),
    db.orcamento.findUnique({
      where: { id: revisaoId },
      select: { status: true, numero: true, revisaoDeId: true, total: true },
    }),
  ]);
  conferir("o anterior virou SUBSTITUIDO", antigo?.status === "SUBSTITUIDO", antigo?.status);
  conferir("a revisão nasce ABERTO", revisao?.status === "ABERTO");
  conferir("a revisão tem número novo", revisao?.numero > antigo?.numero);
  conferir("a revisão aponta para o anterior", revisao?.revisaoDeId === primeiroId);
  conferir("a revisão manteve o total", Number(revisao?.total) === 180);

  console.log("\n=== A RESERVA SEGUE O QUE VALE ===");
  await page.goto(`${BASE}/estoque?busca=${peca.sku}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  // Só a revisão reserva: o substituído parou de segurar peça. Se os dois
  // reservassem, apareceriam 4 — e a loja acharia que não pode vender.
  conferir("continua '2 reservadas' (não 4)", /2 reservadas/.test(txt) && !/4 reservadas/.test(txt));

  console.log("\n=== SUBSTITUÍDO NÃO SE EDITA ===");
  await page.goto(`${BASE}/orcamentos/${primeiroId}/editar`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  conferir(
    "editar o substituído desvia para a ficha",
    page.url().endsWith(`/orcamentos/${primeiroId}`),
    page.url(),
  );

  console.log("\n=== CONVERTER EM VENDA ===");
  await page.goto(`${BASE}/vendas/nova?orcamento=${revisaoId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("a venda abre travada, citando o orçamento", /vêm travados/i.test(txt));
  conferir("total do orçamento veio junto", /R\$\s*180,00/.test(txt));

  await page.click('button:has-text("Dinheiro")');
  await page.fill('input[aria-label="Valor pago"]', "180,00");
  await page.click('button:has-text("Adicionar")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Fechar venda")');
  /* Mesmo cuidado da gravação do orçamento: `/vendas/<algo>` casaria com a
     própria `/vendas/nova` e a sonda leria o banco ANTES de a transação
     terminar — acusando "não converteu" num app que converteu certo. */
  await page.waitForURL(
    (u) => /\/vendas\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/nova"),
    { timeout: 30000 },
  );
  await esperarPronto(page);
  vendaId = page.url().split("/").pop();

  const depois = await db.orcamento.findUnique({
    where: { id: revisaoId },
    select: { status: true, vendaId: true },
  });
  conferir("orçamento virou CONVERTIDO", depois?.status === "CONVERTIDO", depois?.status);
  conferir("orçamento aponta para a venda", depois?.vendaId === vendaId);
  conferir("estoque caiu de 10 para 8", (await saldoDe(pecaId)) === 8, String(await saldoDe(pecaId)));

  await page.goto(`${BASE}/estoque?busca=${peca.sku}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("a reserva sumiu depois de virar venda", !/reservada/.test(txt));

  console.log("\n=== CONVERTER DUAS VEZES É RECUSADO ===");
  await page.goto(`${BASE}/vendas/nova?orcamento=${revisaoId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  conferir(
    "a segunda conversão desvia para a ficha",
    page.url().endsWith(`/orcamentos/${revisaoId}`),
    page.url(),
  );
  const vendasDoOrc = await db.venda.count({ where: { id: vendaId } });
  conferir("continua existindo UMA venda só", vendasDoOrc === 1);

  console.log("\n=== A LISTA E OS FILTROS ===");
  await page.goto(`${BASE}/vendas?aba=orcamentos&filtro=substituidos`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro 'Substituídos' acha o antigo", txt.includes(`Nº ${String(antigo.numero).padStart(4, "0")}`));

  await page.goto(`${BASE}/vendas?aba=orcamentos&filtro=aprovados`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro 'Aprovados' acha a revisão", txt.includes(`Nº ${String(revisao.numero).padStart(4, "0")}`));

  conferir("nenhum erro de console", admin.erros.length === 0, admin.erros.join(" | "));
} catch (e) {
  falhou++;
  console.log("\nFALHA GERAL: " + e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (vendaId) {
      await db.conta.deleteMany({ where: { vendaId } });
      await db.venda.delete({ where: { id: vendaId } });
      console.log("  venda de teste removida");
    }
    for (const id of orcIds) {
      await db.orcamento.deleteMany({ where: { id } });
    }
    if (orcIds.length) console.log(`  ${orcIds.length} orçamento(s) de teste removido(s)`);
    if (pecaId) {
      await db.movimentoEstoque.deleteMany({ where: { pecaId } });
      await db.peca.delete({ where: { id: pecaId } });
      console.log("  peça de teste removida");
    }
    if (clienteId) {
      await db.cliente.delete({ where: { id: clienteId } });
      console.log("  cliente de teste removido");
    }
  } catch (e) {
    console.log("  ATENÇÃO: limpeza falhou — " + e.message);
  }
  await navegador.close();
  await db.$disconnect();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
  process.exit(falhou ? 1 : 0);
}
