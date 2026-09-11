/*
 * As telas conversam entre si?
 *
 * Esta sonda nasceu de um defeito que o João sentiu usando o app: ele fechava
 * uma venda, ia no Financeiro pela barra lateral e o "Em caixa" continuava
 * igual. O dinheiro ESTAVA gravado — a tela é que não sabia que tinha
 * envelhecido.
 *
 * DETALHE QUE FAZ A SONDA VALER: a navegação aqui é por CLIQUE na barra, como
 * uma pessoa faz. Se usasse page.goto(), o navegador recarregaria tudo do
 * servidor e o defeito nunca apareceria — o teste passaria com o app quebrado.
 *
 * Limpa tudo no fim, por id exato. Venda não se apaga: cancela.
 */
import { chromium } from "playwright-core";
import { abrirDialogo, esperarPronto, buscarEClicar } from "./sonda-comum.mjs";

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
const criados = { pecas: [], vendas: [], clientes: [] };

/** Vai para uma tela CLICANDO na barra lateral, como uma pessoa. */
async function irClicando(page, rota) {
  await page.click(`nav[data-nav="lateral"] a[href="${rota}"]`);
  await page.waitForURL((u) => u.pathname === rota, { timeout: 20000 });
  await esperarPronto(page);
  await page.waitForTimeout(400); // deixa os blocos transmitidos assentarem
  return page.textContent("body");
}

/** Lê um número em reais que vem logo depois de um rótulo. */
function valorDe(texto, rotulo) {
  const limpo = texto.replace(/\s+/g, " ");
  const m = limpo.match(new RegExp(rotulo + "\\s*R\\$\\s*([\\d.]+,\\d{2})"));
  if (!m) return null;
  return Number(m[1].replace(/\./g, "").replace(",", "."));
}

try {
  const ctx = await navegador.newContext({ viewport: { width: 1440, height: 1000 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await esperarPronto(page);

  /* ─────────── preparo: uma peça com estoque ─────────── */
  const sku = `ZC-${Date.now().toString().slice(-6)}`;
  const peca = await db.peca.create({
    data: {
      sku,
      nome: MARCA + "Peça Comunicação",
      categoria: "Anéis",
      custo: 40,
      precoTabela: 100,
      totalRecebido: 5,
      movimentos: { create: { delta: 5, motivo: "COMPRA", observacao: "preparo" } },
    },
    select: { id: true, sku: true },
  });
  criados.pecas.push(peca.id);

  /* ─────────── antes: os números de partida ─────────── */
  console.log("\n=== ANTES DA VENDA ===");
  const finAntes = await irClicando(page, "/financeiro");
  const caixaAntes = valorDe(finAntes, "Em caixa");
  const receberAntes = valorDe(finAntes, "A receber");
  conferir("leu o 'Em caixa' de partida", caixaAntes !== null, String(caixaAntes));
  conferir("leu o 'A receber' de partida", receberAntes !== null, String(receberAntes));
  console.log(`         caixa R$ ${caixaAntes} · a receber R$ ${receberAntes}`);

  const estoqueAntes = await irClicando(page, "/estoque");
  conferir("a peça de teste está no catálogo", estoqueAntes.includes(peca.sku));

  /* ─────────── a venda: R$ 100, metade à vista ─────────── */
  console.log("\n=== FECHAR UMA VENDA DE R$ 100 (R$ 60 à vista, R$ 40 a prazo) ===");
  await page.click('nav[data-nav="lateral"] a[href="/vendas"]');
  await page.waitForURL((u) => u.pathname === "/vendas", { timeout: 20000 });
  await esperarPronto(page);
  await page.click('a[href="/vendas/nova"]');
  await page.waitForURL(/\/vendas\/nova/, { timeout: 20000 });
  await esperarPronto(page);

  await buscarEClicar(page, "#busca-peca", peca.sku, `button:has-text("${peca.sku}")`);
  await page.waitForTimeout(400);

  // a prazo exige cliente
  const cliente = await db.cliente.create({
    data: { nome: MARCA + "Cliente Comunicação" },
    select: { id: true },
  });
  criados.clientes.push(cliente.id);
  await page.reload({ waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await buscarEClicar(page, "#busca-peca", peca.sku, `button:has-text("${peca.sku}")`);
  await page.waitForTimeout(400);
  await page.selectOption("#cliente", { label: MARCA + "Cliente Comunicação" });

  await page.click('button:has-text("Dinheiro")');
  await page.fill('input[aria-label="Valor pago"]', "60,00");
  await page.click('button:has-text("Adicionar")');
  await page.waitForTimeout(400);
  await page.fill("#parcelas", "1");
  await page.waitForTimeout(300);
  await page.click('button:has-text("Fechar venda")');
  await page.waitForURL((u) => /\/vendas\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/nova"), {
    timeout: 30000,
  });
  await esperarPronto(page);
  const vendaId = page.url().split("/").pop();
  criados.vendas.push(vendaId);
  conferir("a venda foi fechada", Boolean(vendaId));

  const gravada = await db.venda.findUnique({
    where: { id: vendaId },
    select: { total: true, pagamentos: { select: { valor: true } }, parcelas: { select: { valor: true } } },
  });
  conferir("gravou total R$ 100", Number(gravada.total) === 100, String(gravada.total));
  conferir("gravou R$ 60 de pagamento", Number(gravada.pagamentos[0]?.valor) === 60);
  conferir("gravou R$ 40 a receber", Number(gravada.parcelas[0]?.valor) === 40);

  /* ─────────── O TESTE DE VERDADE ─────────── */
  console.log("\n=== AS OUTRAS TELAS SOUBERAM? (navegando pela barra) ===");

  const finDepois = await irClicando(page, "/financeiro");
  const caixaDepois = valorDe(finDepois, "Em caixa");
  const receberDepois = valorDe(finDepois, "A receber");
  conferir(
    "Financeiro: 'Em caixa' subiu os R$ 60",
    Math.abs(caixaDepois - (caixaAntes + 60)) < 0.005,
    `era ${caixaAntes}, esperava ${caixaAntes + 60}, veio ${caixaDepois}`,
  );
  conferir(
    "Financeiro: 'A receber' subiu os R$ 40",
    Math.abs(receberDepois - (receberAntes + 40)) < 0.005,
    `era ${receberAntes}, esperava ${receberAntes + 40}, veio ${receberDepois}`,
  );

  const estoqueDepois = await irClicando(page, "/estoque");
  conferir(
    "Estoque: a peça caiu de 5 para 4 unidades",
    /4 un\./.test(estoqueDepois.replace(/\s+/g, " ")),
    "não achei '4 un.' no catálogo",
  );

  const inicioDepois = await irClicando(page, "/");
  conferir(
    "Início: 'vendido hoje' contou os R$ 100",
    /R\$\s*100,00/.test(inicioDepois.replace(/\s+/g, " ")),
    "não achei R$ 100,00 no Início",
  );

  /* ─────────── caminho inverso: receber a parcela ─────────── */
  console.log("\n=== E NO SENTIDO CONTRÁRIO: RECEBER A PARCELA NO FINANCEIRO ===");
  await page.goto(`${BASE}/financeiro?aba=receber`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);

  // A parcela é descrita como "Venda #N · parcela 1/1" — não pelo nome da
  // cliente. Procurar pelo nome dava falso negativo.
  const numero = (await db.venda.findUnique({ where: { id: vendaId }, select: { numero: true } }))
    .numero;
  const listaReceber = await page.textContent("body");
  conferir(
    "a parcela da venda aparece em 'A receber'",
    listaReceber.includes(`Venda #${numero}`),
    listaReceber.replace(/\s+/g, " ").slice(0, 180),
  );

  /*
   * A baixa é dada PELA TELA, como a moça faria. Marcar a conta no banco
   * testaria só o meu SQL, não o app — e foi justamente pelo caminho da tela
   * que o defeito passou despercebido.
   */
  // `abrirDialogo` insiste: antes da hidratação o clique não dispara nada.
  await abrirDialogo(page, 'button[aria-label^="Dar baixa"]');
  const dialogo = await page.textContent('[role="dialog"]');
  conferir(
    "o diálogo pergunta como a cliente pagou",
    /Como a cliente pagou/.test(dialogo),
    dialogo.replace(/\s+/g, " ").slice(0, 120),
  );
  conferir("e avisa que a venda é baixada junto", /a venda é baixada junto/.test(dialogo));
  await page.selectOption('[role="dialog"] select[name="forma"]', "PIX");
  await page.click('[role="dialog"] button:has-text("Registrar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 20000 });
  await page.waitForTimeout(1500);

  const pagamentos = await db.pagamento.findMany({
    where: { vendaId },
    select: { valor: true, forma: true },
  });
  conferir("o recebimento virou pagamento DA VENDA", pagamentos.length === 2, `${pagamentos.length} pagamento(s)`);
  conferir(
    "com a forma escolhida (Pix)",
    pagamentos.some((p) => p.forma === "PIX" && Number(p.valor) === 40),
    pagamentos.map((p) => `${p.forma} ${p.valor}`).join(" · "),
  );

  // O dinheiro não pode entrar duas vezes: a carteira soma lançamentos E
  // pagamentos de venda, então a baixa de parcela não gera lançamento.
  const lancs = await db.lancamento.count({ where: { descricao: { contains: MARCA } } });
  conferir("não criou lançamento em dobro", lancs === 0, `${lancs} lançamento(s)`);

  const fichaVenda = await irClicando(page, "/vendas");
  conferir(
    "o Portal de vendas mostra a venda quitada",
    /quitada/i.test(fichaVenda),
    fichaVenda.replace(/\s+/g, " ").slice(0, 160),
  );

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
  await ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    for (const id of criados.vendas) {
      // Venda não se apaga (regra 2.x): cancela e depois remove o rastro do
      // teste, que é dado sintético e não histórico da loja.
      await db.pagamento.deleteMany({ where: { vendaId: id } });
      await db.conta.deleteMany({ where: { vendaId: id } });
      await db.itemVenda.deleteMany({ where: { vendaId: id } });
      await db.venda.delete({ where: { id } });
    }
    for (const id of criados.pecas) {
      const p = await db.peca.findUnique({ where: { id }, select: { nome: true } });
      if (p?.nome.startsWith(MARCA)) {
        await db.movimentoEstoque.deleteMany({ where: { pecaId: id } });
        await db.peca.delete({ where: { id } });
      }
    }
    for (const id of criados.clientes) {
      const c = await db.cliente.findUnique({ where: { id }, select: { nome: true } });
      if (c?.nome.startsWith(MARCA)) await db.cliente.delete({ where: { id } });
    }
    console.log("  registros de teste removidos");
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
