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
let insumoId = null;
let vendaId = null;
let clienteId = null;

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

  /* Um insumo com estoque, para provar a embalagem na venda. */
  const insumo = await db.peca.create({
    data: {
      sku: `ZI-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Caixinha",
      categoria: "Embalagem",
      tipo: "INSUMO",
      unidade: "cx",
      custo: 2,
      codigoFornecedor: 11,
    },
    select: { id: true, nome: true },
  });
  insumoId = insumo.id;
  await db.movimentoEstoque.create({
    data: { pecaId: insumoId, delta: 20, motivo: "COMPRA", observacao: "preparo do teste" },
  });
  conferir("insumo criado com 20 unidades", true);

  /* A cliente da venda a prazo. Criada aqui para o teste não depender de
     haver cadastro no banco. */
  const cliente = await db.cliente.create({
    data: { nome: MARCA + "Cliente da Venda", tipo: "PF" },
    select: { id: true },
  });
  clienteId = cliente.id;

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

  console.log("\n--- embalagem ---");
  await page.selectOption("#insumo-venda", insumoId);
  await page.waitForTimeout(300);
  await page.click(`button[aria-label="Mais um ${MARCA}Caixinha"]`);
  await page.waitForTimeout(300);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    /* Sem espaço obrigatório entre rótulo e valor: eles são dois <span> lado a
       lado, e o texto da página vem colado. */
    conferir(
      "custo de embalagem 2 × R$ 2,00",
      /Custo de embalagem *R\$ *4,00/.test(t),
      t.match(/Custo de embalagem *R\$ *[\d.,]+/)?.[0],
    );
  }

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
  await page.waitForTimeout(300);
  txt = await page.textContent("body");
  conferir("2× de R$ 20,00", /2×\s*de\s*R\$\s*20,00/.test(txt.replace(/\s+/g, " ")));

  /* O botão que evita redigitar o que a tela já mostra. */
  conferir(
    "oferece pagar o valor cheio de uma vez",
    (await page.locator('button:has-text("Pagou tudo")').count()) === 1,
  );

  /*
   * O VENCIMENTO DE CADA PARCELA, escolhido à mão.
   *
   * A cliente que combina "uma em novembro e a outra só em março" existe, e
   * antes o app só sabia repetir um intervalo fixo. A sonda muda a data da 2ª
   * parcela para um dia que NENHUM intervalo geraria e confere o que foi
   * gravado — é o único jeito de provar que a escolha chegou ao banco.
   */
  const campos = page.locator('input[aria-label^="Vencimento da parcela"]');
  conferir("mostra uma data por parcela", (await campos.count()) === 2, String(await campos.count()));
  const escolhida = new Date(Date.now() + 97 * 86400000).toISOString().slice(0, 10);
  await campos.nth(1).fill(escolhida);
  await page.waitForTimeout(300);

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

  // A cliente do teste, escolhida pelo id — não "a primeira da lista".
  conferir(
    "a cliente do teste aparece na lista",
    await page.$eval(
      "#cliente",
      (s, id) => [...s.options].some((o) => o.value === id),
      clienteId,
    ),
  );
  await page.selectOption("#cliente", clienteId);
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

  /* A data que a pessoa escolheu para a 2ª parcela tem de estar no banco,
     exatamente como ela digitou. */
  const segunda = await db.conta.findFirst({
    where: { vendaId, parcela: 2 },
    select: { vencimento: true },
  });
  conferir(
    "o vencimento escolhido à mão foi gravado",
    segunda?.vencimento.toISOString().slice(0, 10) === escolhida,
    `esperava ${escolhida}, veio ${segunda?.vencimento.toISOString().slice(0, 10)}`,
  );

  /*
   * O dinheiro da venda tem de CAIR NUMA CARTEIRA.
   *
   * Até hoje não caía: nenhum pagamento de venda tinha carteira, e o "Em
   * caixa" do Financeiro somava lançamento e transferência mas nunca venda.
   * A loja vendia e o caixa não mexia.
   */
  const pagFechamento = await db.pagamento.findFirst({
    where: { vendaId },
    select: { carteiraId: true, data: true, carteira: { select: { nome: true } } },
  });
  conferir(
    "pagamento do fechamento caiu numa carteira",
    Boolean(pagFechamento.carteiraId),
    String(pagFechamento.carteira?.nome),
  );
  const hoje = new Date().toDateString();
  conferir(
    "pagamento tem a data da venda",
    new Date(pagFechamento.data).toDateString() === hoje,
    String(pagFechamento.data),
  );
  const vData = await db.venda.findUnique({ where: { id: vendaId }, select: { data: true } });
  conferir("venda gravou a data", new Date(vData.data).toDateString() === hoje, String(vData.data));

  console.log("\n=== RECEBER R$ 10 DE UMA PARCELA DE R$ 20 ===");
  await abrirDialogo(page, 'button:has-text("Receber")');
  conferir("o recebimento pergunta a data", Boolean(await page.$("#data-recebimento")));
  /* A lista de carteiras chega do servidor DEPOIS que a janela abre — perguntar
     no mesmo instante acusava falha num app certo. */
  const temCarteira = await page
    .waitForSelector("#carteira-recebimento", { timeout: 15000 })
    .then(() => true, () => false);
  conferir("o recebimento pergunta a carteira", temCarteira);
  await page.fill('[role="dialog"] #valor', "10,00");
  await page.click('[role="dialog"] button:has-text("Registrar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const pags = await db.pagamento.findMany({
    where: { vendaId },
    select: { valor: true, carteiraId: true },
    orderBy: { criadoEm: "asc" },
  });
  conferir("virou um segundo pagamento de 10", pags.length === 2 && Number(pags[1].valor) === 10);
  conferir("e esse também caiu em carteira", Boolean(pags[1]?.carteiraId));

  /*
   * A parte que faltava: o pagamento existia e as parcelas ficavam TODAS em
   * aberto. A venda dizia quitada e o Financeiro seguia cobrando.
   */
  const contas = await db.conta.findMany({
    where: { vendaId },
    select: { valor: true, status: true, descricao: true },
    orderBy: [{ status: "asc" }, { valor: "asc" }],
  });
  const pagas = contas.filter((c) => c.status === "PAGA");
  const abertas = contas.filter((c) => c.status === "ABERTA");
  conferir("a parcela mais antiga foi baixada por 10", pagas.length === 1 && Number(pagas[0].valor) === 10, JSON.stringify(contas));
  conferir("os outros 10 viraram parcela em aberto", abertas.some((c) => Number(c.valor) === 10 && /saldo/.test(c.descricao)));
  conferir(
    "nada sumiu: parcelas ainda somam 40",
    Math.abs(contas.reduce((s, c) => s + Number(c.valor), 0) - 40) < 0.005,
  );


  /*
   * Recebimento se lança errado — valor trocado, dois toques no botão. Remover
   * tem de desfazer as DUAS coisas: o dinheiro e a cobrança. Se só o pagamento
   * some, a venda fica devendo sem nenhuma parcela cobrando.
   */
  console.log("\n=== REMOVER O RECEBIMENTO ===");
  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  /* O rótulo tem espaço FINO entre "R$" e o número (o Intl usa um espaço
     que não quebra), então casar pelo fim do texto é o que funciona. */
  await abrirDialogo(page, 'button[aria-label$="10,00"]');
  await page.click('[role="dialog"] button:has-text("Remover")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const pags2 = await db.pagamento.findMany({ where: { vendaId }, select: { valor: true } });
  conferir("sobrou só o pagamento do fechamento", pags2.length === 1, String(pags2.length));
  const contas2 = await db.conta.findMany({
    where: { vendaId, status: "ABERTA" },
    select: { valor: true },
  });
  conferir(
    "as parcelas voltaram a somar 40 em aberto",
    Math.abs(contas2.reduce((s, c) => s + Number(c.valor), 0) - 40) < 0.005,
    JSON.stringify(contas2),
  );

  /* Recebe de novo para o resto da sonda continuar do mesmo ponto. */
  await abrirDialogo(page, 'button:has-text("Receber")');
  await page.waitForSelector("#carteira-recebimento", { timeout: 15000 });
  await page.fill('[role="dialog"] #valor', "10,00");
  await page.click('[role="dialog"] button:has-text("Registrar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  console.log("\n=== A EMBALAGEM ENTROU NO CUSTO ===");
  const ins = await db.insumoVenda.findMany({
    where: { vendaId },
    select: { quantidade: true, custoUnit: true, pecaId: true },
  });
  conferir("gravou 2 caixinhas", ins.length === 1 && ins[0].quantidade === 2, JSON.stringify(ins));
  conferir("com o custo congelado em 2,00", Number(ins[0]?.custoUnit) === 2);
  const movIns = await db.movimentoEstoque.findMany({
    where: { pecaId: insumoId },
    select: { delta: true },
  });
  conferir(
    "estoque do insumo baixou (20 − 2 = 18)",
    movIns.reduce((a, m) => a + m.delta, 0) === 18,
  );
  /* Margem sobre o custo da peça (80) MAIS a embalagem (4): (190 − 84) / 190. */
  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("a margem desconta a embalagem", /custo R\$ 84,00/.test(t), t.match(/custo R\$ [\d.,]+/)?.[0]);
    conferir("a ficha mostra a embalagem", /Embalagem e insumos/.test(t));
  }

  console.log("\n=== O ESTOQUE BAIXOU POR MOVIMENTO ===");
  let movs = await db.movimentoEstoque.findMany({
    where: { pecaId },
    select: { delta: true, motivo: true, origem: true },
    orderBy: { criadoEm: "asc" },
  });
  conferir("movimento de venda existe", movs.some((m) => m.motivo === "VENDA" && m.delta === -2));
  conferir("movimento aponta para a venda", movs.some((m) => m.origem === vendaId));
  conferir("saldo 10 − 2 = 8", movs.reduce((s, m) => s + m.delta, 0) === 8);

  /*
   * Editar a venda: a moça lança com a cliente no balcão e descobre depois
   * que era outro desconto. O caminho é estornar e refazer — o estoque só
   * muda por movimento.
   */
  console.log("\n=== EDITAR A VENDA ===");
  await page.goto(`${BASE}/vendas/${vendaId}/editar`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("a tela diz que está editando", /Editando a venda #\d+/.test(t));
    conferir("mostra o que já foi recebido", /Já recebido: ?R\$ ?160,00/.test(t), t.slice(0, 200));
    conferir("não pede forma de pagamento", !/Como pagou/.test(t));
  }
  conferir(
    "a embalagem veio junto",
    (await page.locator(`button[aria-label="Mais um ${MARCA}Caixinha"]`).count()) === 1,
  );
  conferir(
    "a peça veio no carrinho",
    (await page.locator(`button[aria-label="Mais um ${MARCA}Anel de Venda"]`).count()) === 1,
  );

  await page.fill("#desconto", "10");
  await page.waitForTimeout(400);
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL((u) => /\/vendas\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/editar"), {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);

  const vEd = await db.venda.findUnique({
    where: { id: vendaId },
    select: {
      total: true,
      desconto: true,
      itens: { select: { quantidade: true } },
      insumos: { select: { quantidade: true } },
    },
  });
  conferir("total virou 180 (10% de 200)", Number(vEd.total) === 180, String(vEd.total));
  conferir("continua com 1 item de 2 unidades", vEd.itens.length === 1 && vEd.itens[0].quantidade === 2);
  conferir("a embalagem não sumiu", vEd.insumos.length === 1 && vEd.insumos[0].quantidade === 2);

  const movsEd = await db.movimentoEstoque.findMany({
    where: { pecaId },
    select: { delta: true, motivo: true, observacao: true },
  });
  conferir(
    "o estorno ficou no histórico da peça",
    movsEd.some((m) => m.motivo === "AJUSTE" && m.delta === 2 && /Edição/.test(m.observacao ?? "")),
  );
  conferir("o saldo continua 8", movsEd.reduce((s, m) => s + m.delta, 0) === 8);

  const contasEd = await db.conta.findMany({
    where: { vendaId, status: "ABERTA" },
    select: { valor: true },
  });
  conferir(
    "as parcelas foram refeitas para o novo saldo (20)",
    Math.abs(contasEd.reduce((s, c) => s + Number(c.valor), 0) - 20) < 0.005,
    JSON.stringify(contasEd),
  );

  /* Volta ao desconto de 5% para o resto da sonda seguir do mesmo ponto —
     e de quebra prova que editar duas vezes não empilha estoque errado. */
  await page.goto(`${BASE}/vendas/${vendaId}/editar`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.fill("#desconto", "5");
  await page.waitForTimeout(400);
  await page.click('button:has-text("Salvar alterações")');
  await page.waitForURL((u) => /\/vendas\/[^/]+$/.test(u.pathname) && !u.pathname.endsWith("/editar"), {
    timeout: 30000,
  });
  await page.waitForTimeout(1500);

  const movsEd2 = await db.movimentoEstoque.findMany({ where: { pecaId }, select: { delta: true } });
  conferir(
    "duas edições e o saldo continua 8",
    movsEd2.reduce((s, m) => s + m.delta, 0) === 8,
    String(movsEd2.reduce((s, m) => s + m.delta, 0)),
  );

  console.log("\n=== DEVOLVER 1 PEÇA ===");
  /*
   * A venda deve 30 (10 + 20 em aberto) e já recebeu 160. Devolver uma peça de
   * 100 abate os 30 que faltavam e devolve 70 em dinheiro — a conta que o app
   * antigo deixava para a pessoa fazer de cabeça.
   */
  await abrirDialogo(page, 'button:has-text("Devolver")');
  await page.fill(`input[aria-label="Devolver de ${MARCA}Anel de Venda"]`, "1");
  await page.fill("#motivo-devolucao", "não serviu");
  await page.waitForTimeout(400);
  {
    const t = (await page.textContent('[role="dialog"]')).replace(/\s+/g, " ");
    /* Rótulo e valor são dois elementos lado a lado: no texto da página eles
       vêm colados, sem espaço. */
    conferir("mostra o que abate", /Abate do que ela deve ?− ?R\$ ?30,00/.test(t), t.slice(0, 200));
    conferir("mostra o que volta em dinheiro", /Volta em dinheiro ?R\$ ?70,00/.test(t), t.slice(0, 200));
  }
  /* A carteira só aparece quando há dinheiro a devolver, e vem do servidor. */
  await page.waitForSelector("#carteira-devolucao", { timeout: 15000 });
  await page.click('[role="dialog"] button:has-text("Confirmar devolução")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const v2 = await db.venda.findUnique({
    where: { id: vendaId },
    select: { itens: { select: { devolvido: true } } },
  });
  conferir("item marcado como devolvido", v2.itens[0].devolvido === 1);

  const dev = await db.devolucao.findFirst({
    where: { vendaId },
    select: {
      total: true,
      motivo: true,
      resolucao: true,
      lancamentoId: true,
      itens: { select: { quantidade: true } },
    },
  });
  /* `lancamentoId` é só um id guardado, não uma relação do Prisma: o
     lançamento se busca à parte. */
  const lancDev = dev?.lancamentoId
    ? await db.lancamento.findUnique({
        where: { id: dev.lancamentoId },
        select: { valor: true, categoria: true, carteiraId: true },
      })
    : null;
  conferir("a devolução ficou registrada", Boolean(dev), "nenhuma devolução gravada");
  conferir("com o valor de 100", Number(dev?.total) === 100, String(dev?.total));
  conferir("com o motivo", dev?.motivo === "não serviu", String(dev?.motivo));
  conferir("resolução DEVOLVER", dev?.resolucao === "DEVOLVER", String(dev?.resolucao));
  conferir("saiu 70 do caixa", Number(lancDev?.valor) === -70, String(lancDev?.valor));
  conferir("na categoria Devolução", lancDev?.categoria === "Devolução");
  conferir("de uma carteira de verdade", Boolean(lancDev?.carteiraId));

  const restantes = await db.conta.findMany({
    where: { vendaId, status: "ABERTA" },
    select: { valor: true },
  });
  conferir("não sobrou parcela a receber", restantes.length === 0, JSON.stringify(restantes));

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("a ficha lista a devolução", /Devoluções/.test(t));
    conferir("dizendo que o valor voltou", /valor devolvido/.test(t));
    conferir("e com o motivo", /não serviu/.test(t));
  }
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
  /* O que estava em aberto para de ser cobrado. A parcela JÁ PAGA continua
     PAGA: ela é histórico do que aconteceu antes do cancelamento, e o
     dinheiro dela some do caixa sozinho — o saldo da carteira ignora
     pagamento de venda cancelada. */
  conferir("nenhuma parcela continua em aberto", !v3.parcelas.some((p) => p.status === "ABERTA"));
  conferir("o que estava aberto foi cancelado", v3.parcelas.some((p) => p.status === "CANCELADA"));

  movs = await db.movimentoEstoque.findMany({ where: { pecaId }, select: { delta: true } });
  conferir("estoque voltou ao original (10)", movs.reduce((s, m) => s + m.delta, 0) === 10);
  const movIns2 = await db.movimentoEstoque.findMany({
    where: { pecaId: insumoId },
    select: { delta: true },
  });
  conferir("a embalagem também voltou (20)", movIns2.reduce((a, m) => a + m.delta, 0) === 20);

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
        /* A devolução em dinheiro vira lançamento de saída no caixa, e o
           lançamento não some junto com a venda — é dinheiro que se moveu.
           Sem apagar aqui, cada rodada da sonda deixa um buraco no caixa. */
        const devs = await db.devolucao.findMany({
          where: { vendaId },
          select: { lancamentoId: true },
        });
        const lancs = devs.map((d) => d.lancamentoId).filter(Boolean);
        await db.devolucao.deleteMany({ where: { vendaId } });
        if (lancs.length) await db.lancamento.deleteMany({ where: { id: { in: lancs } } });
        await db.insumoVenda.deleteMany({ where: { vendaId } });
        await db.itemVenda.deleteMany({ where: { vendaId } });
        await db.venda.delete({ where: { id: vendaId } });
        console.log(`  venda #${alvo.numero} removida`);
      }
    }
    if (clienteId) {
      const c = await db.cliente.findUnique({ where: { id: clienteId }, select: { nome: true } });
      if (c && c.nome.startsWith(MARCA)) {
        await db.cliente.delete({ where: { id: clienteId } });
        console.log(`  ${c.nome} removida`);
      }
    }
    if (insumoId) {
      const p = await db.peca.findUnique({ where: { id: insumoId }, select: { nome: true } });
      if (p && p.nome.startsWith(MARCA)) {
        await db.insumoVenda.deleteMany({ where: { pecaId: insumoId } });
        await db.movimentoEstoque.deleteMany({ where: { pecaId: insumoId } });
        await db.peca.delete({ where: { id: insumoId } });
        console.log(`  ${p.nome} removida`);
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
