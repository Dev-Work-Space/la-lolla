/*
 * Cartão de crédito, ponta a ponta.
 *
 * Confere as regras que valem dinheiro:
 *   - cartão NÃO entra no "Em caixa" (ele não guarda dinheiro, guarda limite)
 *   - cada compra vira conta a pagar na fatura certa
 *   - parcela de cartão anda de fatura em fatura, uma por mês
 *   - o limite usado é a soma do que ainda não foi pago
 *   - compras do mesmo cartão no mesmo vencimento viram UMA linha em "A pagar"
 *   - pagar a fatura tira dinheiro do caixa e libera limite
 *   - pagar menos que a fatura joga o resto para a fatura seguinte
 *
 * Limpa tudo no fim, por id exato.
 */
import { chromium } from "playwright-core";
import { abrirDialogo, esperarPronto } from "./sonda-comum.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MARCA = "ZZQA ";

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

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

const brl = (n) =>
  "R$ " + Number(n).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

let cartaoId = null;
let carteiraId = null;

const nav = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

try {
  console.log("=== ENTRAR ===");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  /* Uma carteira só desta sonda: pagar a fatura tem de sair de algum lugar, e
     mexer na carteira de verdade da loja seria mexer no caixa dela. */
  const carteira = await db.carteira.create({
    data: { nome: MARCA + "Caixa do teste", tipo: "ESPECIE", saldoInicial: 1000 },
    select: { id: true },
  });
  carteiraId = carteira.id;

  console.log("\n=== CADASTRAR O CARTÃO ===");
  await page.goto(`${BASE}/financeiro?aba=carteiras`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await abrirDialogo(page, 'button:has-text("Cadastrar cartão"), button:has-text("Novo cartão")');
  await page.fill("#cartao-nome", MARCA + "Cartão");
  await page.fill("#cartao-limite", "5.000,00");
  await page.fill("#cartao-venc", "10");
  await page.fill("#cartao-fech", "1");
  await page.click('[role="dialog"] button:has-text("Salvar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  /*
   * ESPERA o cartão de teste aparecer no banco — e PARA se ele não aparecer.
   *
   * Isto não é preciosismo: numa execução em que a gravação demorou mais que o
   * de costume, a sonda seguiu com `cartaoId = null`, o seletor do diálogo
   * caiu no primeiro cartão da lista — o Nubank DE VERDADE — e ela lançou
   * quatro compras e pagou duas faturas no cartão do João, tirando R$ 400 do
   * caixa dele. Sonda que não tem certeza de onde está escrevendo não escreve.
   */
  let cart = null;
  for (let i = 0; i < 20 && !cart; i++) {
    cart = await db.carteira.findFirst({
      where: { nome: MARCA + "Cartão", tipo: "CARTAO" },
      select: { id: true, tipo: true, limite: true, diaVencimento: true, diaFechamento: true },
    });
    if (!cart) await page.waitForTimeout(500);
  }
  if (!cart) throw new Error("o cartão de teste não foi criado — nada será lançado");
  cartaoId = cart.id;
  conferir("cartão gravado como CARTAO", cart?.tipo === "CARTAO", String(cart?.tipo));
  conferir("com limite de 5000", Number(cart?.limite) === 5000, String(cart?.limite));
  conferir("com vencimento no dia 10", cart?.diaVencimento === 10);
  conferir("e fechamento no dia 1", cart?.diaFechamento === 1);

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("a tela mostra o limite livre", /R\$ ?5\.000,00 livres/.test(t), t.slice(0, 200));
  }

  /*
   * O cartão NÃO pode entrar no "Em caixa". Ele não guarda dinheiro: guarda
   * quanto dá para gastar antes de ter o dinheiro.
   */
  const emCaixa = await db.carteira.findMany({
    where: { arquivada: false, tipo: { not: "CARTAO" } },
    select: { id: true },
  });
  conferir(
    "cartão fora da lista de carteiras com dinheiro",
    !emCaixa.some((c) => c.id === cartaoId),
  );

  /* O cartão também tem de estar no CAIXA: é lá que se olha dinheiro, e
     limite é quanto ainda dá para gastar antes de ter o dinheiro. */
  await page.goto(`${BASE}/financeiro?aba=caixa`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    conferir("o cartão aparece na aba Caixa", /Cartões de crédito/i.test(t), t.slice(-300));
    conferir("com o limite livre", /R\$ ?5\.000,00/.test(t));
    conferir(
      "e com o botão de lançar compra",
      (await page.locator('button:has-text("Lançar compra")').count()) > 0,
    );
  }
  await page.goto(`${BASE}/financeiro?aba=carteiras`, { waitUntil: "networkidle" });
  await esperarPronto(page);

  console.log("\n=== COMPRA PARCELADA (300 em 3x) ===");
  await abrirDialogo(page, `button[aria-label="Lançar compra em ${MARCA}Cartão"]`);
  /* Escolhe o cartão DE TESTE pelo id: o botão pertence a uma linha, mas o
     diálogo abre com o primeiro da lista, e o primeiro pode ser um cartão de
     verdade. */
  await page.selectOption("#compra-cartao", cartaoId);
  await page.fill("#compra-desc", MARCA + "Embalagens");
  await page.fill("#compra-valor", "300,00");
  await page.fill("#compra-parcelas", "3");
  await page.click('[role="dialog"] button:has-text("Lançar compra")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const parcelas = await db.conta.findMany({
    where: { cartaoId },
    orderBy: { vencimento: "asc" },
    select: { valor: true, vencimento: true, parcela: true, deParcelas: true, status: true },
  });
  conferir("virou 3 contas a pagar", parcelas.length === 3, String(parcelas.length));
  conferir(
    "de 100 cada",
    parcelas.every((p) => Number(p.valor) === 100),
    JSON.stringify(parcelas.map((p) => Number(p.valor))),
  );
  conferir(
    "todas vencendo no dia 10",
    parcelas.every((p) => p.vencimento.getDate() === 10),
    JSON.stringify(parcelas.map((p) => p.vencimento.toISOString().slice(0, 10))),
  );
  /* Parcela de cartão anda de fatura em fatura: uma por MÊS, não "30 dias". */
  const meses = parcelas.map((p) => p.vencimento.getMonth());
  conferir(
    "uma por mês, em meses seguidos",
    (meses[1] - meses[0] + 12) % 12 === 1 && (meses[2] - meses[1] + 12) % 12 === 1,
    JSON.stringify(meses),
  );

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("limite usado virou 300", /usado R\$ ?300,00 de R\$ ?5\.000,00/.test(t), t.slice(0, 300));
    conferir("e sobram 4.700", /R\$ ?4\.700,00 livres/.test(t));
  }

  console.log("\n=== SEGUNDA COMPRA NA MESMA FATURA ===");
  await abrirDialogo(page, `button[aria-label="Lançar compra em ${MARCA}Cartão"]`);
  /* Escolhe o cartão DE TESTE pelo id: o botão pertence a uma linha, mas o
     diálogo abre com o primeiro da lista, e o primeiro pode ser um cartão de
     verdade. */
  await page.selectOption("#compra-cartao", cartaoId);
  await page.fill("#compra-desc", MARCA + "Anúncio");
  await page.fill("#compra-valor", "200,00");
  await page.click('[role="dialog"] button:has-text("Lançar compra")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const todas = await db.conta.findMany({
    where: { cartaoId, status: "ABERTA" },
    orderBy: { vencimento: "asc" },
    select: { valor: true, vencimento: true },
  });
  const primeiroVenc = todas[0].vencimento.getTime();
  const naPrimeira = todas.filter((c) => c.vencimento.getTime() === primeiroVenc);
  conferir("as duas caem na mesma fatura", naPrimeira.length === 2, String(naPrimeira.length));

  console.log("\n=== A PAGAR MOSTRA UMA LINHA SÓ ===");
  await page.goto(`${BASE}/financeiro?aba=pagar`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    /* innerText do <main>, não textContent do body: o texto do body traz junto
       o payload do React que está dentro das <script>, e ali aparece o nome de
       cada compra do cartão — o teste acusaria a tela de listar o que ela não
       lista. */
    const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    conferir("a fatura aparece agrupada", /Fatura · ZZQA Cartão/.test(t), t.slice(0, 300));
    conferir("dizendo quantas compras tem dentro", /2 compras no cartão/.test(t));
    conferir("com o total da fatura (300)", /R\$ ?300,00/.test(t));
    conferir(
      "e NÃO lista as compras soltas",
      !/ZZQA Embalagens · 1\/3/.test(t),
      (t.match(/.{0,80}Embalagens.{0,80}/) || ["?"])[0],
    );
  }

  console.log("\n=== PAGAR SÓ PARTE DA FATURA (200 de 300) ===");
  await abrirDialogo(page, `button[aria-label="Pagar fatura de ${MARCA}Cartão"], button:has-text("Pagar fatura")`);
  {
    const t = (await page.locator('[role="dialog"]').innerText()).replace(/\s+/g, " ");
    conferir("o diálogo mostra as compras de dentro", /ZZQA Embalagens/.test(t) && /ZZQA Anúncio/.test(t), t.slice(0, 200));
  }
  await page.fill("#fatura-valor", "200,00");
  await page.selectOption("#fatura-carteira", carteiraId);
  await page.click('[role="dialog"] button:has-text("Confirmar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const lanc = await db.lancamento.findFirst({
    where: { carteiraId, categoria: "Cartão de crédito" },
    select: { valor: true, descricao: true },
  });
  conferir("saiu 200 do caixa", Number(lanc?.valor) === -200, String(lanc?.valor));
  conferir("com a descrição da fatura", /Fatura do cartão/.test(lanc?.descricao ?? ""));

  const pagas = await db.conta.count({ where: { cartaoId, status: "PAGA" } });
  conferir("as duas compras daquela fatura foram baixadas", pagas === 2, String(pagas));

  const resto = await db.conta.findFirst({
    where: { cartaoId, status: "ABERTA", descricao: { contains: "saldo" } },
    select: { valor: true, vencimento: true },
  });
  conferir("os 100 que faltaram viraram conta do cartão", Number(resto?.valor) === 100, String(resto?.valor));
  conferir(
    "na fatura seguinte",
    resto ? resto.vencimento.getTime() > primeiroVenc : false,
    String(resto?.vencimento),
  );

  /* O limite: 500 comprados − 200 pagos = 300 ainda ocupando. */
  await page.goto(`${BASE}/financeiro?aba=carteiras`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  {
    const t = (await page.textContent("body")).replace(/\s+/g, " ");
    conferir("o limite voltou a sobrar (4.700 livres)", /R\$ ?4\.700,00 livres/.test(t), t.slice(0, 300));
  }

  const saldo = await db.carteira.findUnique({
    where: { id: carteiraId },
    select: { saldoInicial: true, lancamentos: { select: { valor: true } } },
  });
  const total = Number(saldo.saldoInicial) + saldo.lancamentos.reduce((s, l) => s + Number(l.valor), 0);
  conferir("a carteira do teste caiu para 800", total === 800, brl(total));

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.log("\nFALHA GERAL: " + e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (cartaoId) {
      await db.conta.deleteMany({ where: { cartaoId } });
      const c = await db.carteira.findUnique({ where: { id: cartaoId }, select: { nome: true } });
      if (c?.nome.startsWith(MARCA)) await db.carteira.delete({ where: { id: cartaoId } });
    }
    if (carteiraId) {
      await db.lancamento.deleteMany({ where: { carteiraId } });
      const c = await db.carteira.findUnique({ where: { id: carteiraId }, select: { nome: true } });
      if (c?.nome.startsWith(MARCA)) await db.carteira.delete({ where: { id: carteiraId } });
    }
    console.log("  dados de teste removidos");
  } catch (e) {
    console.log("  ATENÇÃO: limpeza falhou — " + e.message);
  }
  await nav.close();
  await db.$disconnect();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
  process.exit(falhou ? 1 : 0);
}
