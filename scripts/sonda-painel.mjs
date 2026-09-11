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

/*
 * Lê do banco — SÓ LEITURA — o que decide se dois widgets devem aparecer.
 * Sem isto a sonda só passaria num banco vazio.
 */
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

const metaCfg = await db.config.findUnique({ where: { chave: "meta" }, select: { valor: true } });
const metaDefinida = Number(metaCfg?.valor ?? 0) > 0;

const agora = new Date();
const mes0 = new Date(agora.getFullYear(), agora.getMonth(), 1);
const vendasMes = await db.venda.count({
  where: { status: { not: "CANCELADA" }, criadoEm: { gte: mes0 } },
});
const vendeuNoMes = vendasMes > 0;

// O convite "Primeiro passo" depende de faturamento do ANO, não do mês.
const ano0 = new Date(agora.getFullYear(), 0, 1);
const somaAno = await db.venda.aggregate({
  where: { status: { not: "CANCELADA" }, criadoEm: { gte: ano0 } },
  _sum: { total: true },
});
const faturouNoAno = Number(somaAno._sum.total ?? 0) > 0;
await db.$disconnect();

console.log(
  `  (banco: meta ${metaDefinida ? "definida" : "zerada"}, ${vendasMes} venda(s) no mês)`,
);

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

  /*
   * "meta" e "maisvendidas" somem quando não há dado — é a regra do app
   * antigo, e é ISSO que se confere aqui.
   *
   * Antes estas duas linhas exigiam que os widgets estivessem AUSENTES, o que
   * só valia num banco vazio: bastou o João definir uma meta e existir uma
   * venda no mês para a sonda acusar falha num app certo. Conferir a regra
   * contra o estado real do banco vale nos dois sentidos e não quebra
   * sozinho.
   */
  const regra = (id, temDado, comDado, semDado) =>
    conferir(temDado ? comDado : semDado, temDado === wgts.includes(id));

  regra("meta", metaDefinida, '"meta" aparece com meta definida', '"meta" some sem meta');
  regra(
    "maisvendidas",
    vendeuNoMes,
    '"maisvendidas" aparece com venda no mês',
    '"maisvendidas" some sem venda no mês',
  );

  console.log("\n=== CONTEÚDO ===");
  let txt = await page.textContent("body");
  conferir("saudação com o nome", /Bom dia|Boa tarde|Boa noite/.test(txt) && /Teste/.test(txt));
  conferir("data por extenso", /\d{1,2} de \w+ de \d{4}/.test(txt));
  /*
   * "Primeiro passo" é o convite que aparece enquanto a loja não faturou nada
   * no ano. Exigir que ele esteja SEMPRE na tela só valia num banco vazio —
   * mesma armadilha da meta e das mais vendidas. Confere a regra, não o
   * estado: aparece sem faturamento, some com faturamento.
   */
  if (faturouNoAno) {
    conferir('"Primeiro passo" some depois da primeira venda', !/Primeiro passo/.test(txt));
  } else {
    conferir('estado inicial "Primeiro passo"', /Primeiro passo/.test(txt));
    conferir("convite da primeira venda", /o resto do painel se preenche sozinho/.test(txt));
  }
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

  /*
   * MONTAR PAINEL mudou de lugar: era um diálogo no Início e virou uma seção
   * da tela de Ajustes, a pedido do João — o Início é para olhar a loja, não
   * para configurá-la. A sonda acompanha a mudança e testa no endereço novo.
   */
  console.log("\n=== MONTAR PAINEL (agora nos Ajustes) ===");
  conferir(
    "o botão saiu do Início",
    !(await page.textContent("main")).includes("Montar painel"),
  );

  const irAosAjustes = async () => {
    await page.goto(`${BASE}/ajustes`, { waitUntil: "domcontentloaded" });
    await esperarPronto(page);
    await page.waitForSelector("text=Meu painel do Início", { timeout: 15000 });
  };

  /*
   * Mexe no painel e só volta quando o aparelho GRAVOU.
   *
   * A seção existir na tela não quer dizer que ela já está ouvindo: antes da
   * hidratação o clique não dispara nada e o localStorage fica como estava —
   * a sonda seguia em frente achando que tinha mudado. Insistir até o valor
   * gravado mudar é o que uma pessoa faria ao ver que nada aconteceu.
   */
  const mexerNoPainel = async (acao, tentativas = 6) => {
    const antes = await page.evaluate(() => localStorage.getItem("lalolla-painel"));
    for (let i = 0; i < tentativas; i++) {
      await acao();
      const gravou = await page
        .waitForFunction((a) => localStorage.getItem("lalolla-painel") !== a, antes, {
          timeout: 2500,
        })
        .then(() => true)
        .catch(() => false);
      if (gravou) return;
      await page.waitForTimeout(600);
    }
    throw new Error("o painel não gravou depois de várias tentativas");
  };
  const voltarAoInicio = async () => {
    await page.goto(BASE, { waitUntil: "domcontentloaded" });
    await esperarPronto(page);
    await page.waitForTimeout(400);
  };

  await irAosAjustes();
  const secao = await page.textContent("main");
  conferir("a seção vive nos Ajustes", /Meu painel do Início/.test(secao));
  conferir("avisa que vale só neste aparelho", /Vale só neste aparelho/.test(secao));
  for (const nome of [
    "Saudação e faturamento do ano",
    "Precisa de você",
    "Números do momento",
    "Meta do mês",
    "Ritmo dos últimos 14 dias",
    "Mais vendidas no mês",
    "Atalho para o resumo completo",
  ]) {
    conferir(`lista "${nome}"`, secao.includes(nome));
  }
  for (const t of ["Pequeno", "Médio", "Grande", "Largura toda"]) {
    conferir(`tamanho "${t}"`, secao.includes(t));
  }
  conferir("tem Restaurar padrão", /Restaurar padrão/.test(secao));

  console.log("\n=== DESLIGAR UM BLOCO ===");
  /*
   * Pelo NOME, não por posição. `nth(2)` dependia da ordem salva no aparelho —
   * e a ordem é justamente uma das coisas que esta sonda mexe, então a
   * execução anterior podia deixar outro bloco naquela casa e o teste
   * desligava o widget errado.
   */
  const caixaDe = (nome) =>
    page.locator(`label:has-text("${nome}") input[type="checkbox"]`).first();
  await mexerNoPainel(() => caixaDe("Números do momento").uncheck());
  await voltarAoInicio();
  wgts = await presentes();
  conferir('"numeros" sumiu ao desligar', !wgts.includes("numeros"));

  await page.reload({ waitUntil: "networkidle" });
  await esperarPronto(page);
  wgts = await presentes();
  conferir("continua desligado depois de recarregar", !wgts.includes("numeros"));

  console.log("\n=== MUDAR TAMANHO ===");
  await irAosAjustes();
  await mexerNoPainel(() => page.locator(`button:has-text("Largura toda")`).first().click());
  await voltarAoInicio();
  const novo = await page.$$eval("[data-wgt]", (els) =>
    els.map((e) => ({ id: e.getAttribute("data-wgt"), span: getComputedStyle(e).gridColumn })),
  );
  conferir(
    "saudação virou largura toda (12)",
    /span 12/.test(novo.find((s) => s.id === "saudacao")?.span ?? ""),
  );

  console.log("\n=== RESTAURAR PADRÃO ===");
  await irAosAjustes();
  await mexerNoPainel(() => page.click(`button:has-text("Restaurar padrão")`));
  await voltarAoInicio();
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
