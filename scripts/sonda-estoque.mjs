/*
 * Fase 2 — Estoque. Confere catálogo e insumos contra o PARIDADE.md,
 * inclusive a diferença de indicadores entre admin e vendedor.
 *
 * Cria um insumo de teste pela interface e o remove no fim, por id exato,
 * conferindo o nome de cada linha antes de apagar.
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

/* A sonda passou a MONTAR o cenário que confere, então fala com o banco.
   Precisa de `--env-file=.env` — o `npm run sondas` já passa. */
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});
const criados = { pecas: [], fornecedores: [] };

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });

async function entrar(usuario, senha) {
  const ctx = await navegador.newContext({ viewport: { width: 1366, height: 950 } });
  const page = await ctx.newPage();
  const erros = [];
  page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
  page.on("pageerror", (e) => erros.push("pageerror: " + e.message));
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", usuario);
  await page.fill("#senha", senha);
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 15000 });
  await esperarPronto(page);
  return { ctx, page, erros };
}

try {
  /* ───────────────── ADMIN ───────────────── */
  const admin = await entrar("teste", "Teste@2026!");
  let page = admin.page;

  /*
   * A sonda MONTA o cenário que vai conferir.
   *
   * Antes ela lia as peças de demonstração que existiam no banco (DEMO-0001,
   * "Anel Solitário", "Caixinha de veludo"). No dia em que o João mandou
   * limpar os mocks, onze conferências passaram a falhar num app que estava
   * certo — o teste dependia de dado que não era dele. Agora ele cria o que
   * precisa, marcado com ZZQA, e apaga no fim.
   */
  console.log("\n=== PREPARAR O CENÁRIO ===");
  const forn = await db.fornecedor.create({
    data: { nome: MARCA + "Fornecedor" },
    select: { id: true },
  });
  criados.fornecedores.push(forn.id);

  const criarPeca = async (dados, saldo) => {
    const p = await db.peca.create({
      data: { fornecedorId: forn.id, ...dados },
      select: { id: true, sku: true, nome: true },
    });
    criados.pecas.push(p.id);
    if (saldo !== 0) {
      await db.movimentoEstoque.create({
        data: { pecaId: p.id, delta: Math.abs(saldo), motivo: "COMPRA", observacao: "preparo" },
      });
      await db.peca.update({
        where: { id: p.id },
        data: { totalRecebido: { increment: Math.abs(saldo) } },
      });
    }
    return p;
  };

  const anel = await criarPeca(
    {
      sku: `ZA-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Anel de Prova",
      categoria: "Anéis",
      custo: 40,
      precoTabela: 120,
      codigoFornecedor: 10,
      minimo: 2,
      pagoFornecedor: false,
    },
    5,
  );
  const brinco = await criarPeca(
    {
      sku: `ZB-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Brinco de Prova",
      categoria: "Brincos",
      custo: 20,
      precoTabela: 70,
      codigoFornecedor: 5,
      pagoFornecedor: true,
    },
    3,
  );
  const insumo = await criarPeca(
    {
      sku: `ZI-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Caixinha de Prova",
      categoria: "Embalagem",
      tipo: "INSUMO",
      unidade: "un",
      custo: 2,
      codigoFornecedor: 1,
      minimo: 5,
    },
    10,
  );
  conferir("cenário montado", !!anel.id && !!brinco.id && !!insumo.id);

  console.log("\n=== SUB-ABAS ===");
  await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  let txt = await page.textContent("body");
  conferir('aba "Peças"', txt.includes("Peças"));
  conferir('aba "Insumos"', txt.includes("Insumos"));

  console.log("\n=== INDICADORES DO ADMIN (financeiro) ===");
  for (const t of ["Estoque a custo", "Estoque a venda", "Saldo com fornecedor", "Compras no mês"]) {
    conferir(`indicador "${t}"`, txt.includes(t));
  }
  conferir("mostra margem potencial", /Margem potencial de/.test(txt));

  console.log("\n=== OS 7 FILTROS ===");
  for (const c of ["Todas", "Acabando", "Zeradas", "Nunca compradas", "Sem venda", "A acertar", "Sem foto"]) {
    conferir(`filtro "${c}"`, txt.includes(c));
  }

  console.log("\n=== BUSCA E SELETORES ===");
  const ph = await page.getAttribute('input[name="busca"]', "placeholder");
  conferir("busca com o texto do app antigo", (ph ?? "").includes("LL-"), ph);
  const fornOpts = await page.$$eval('select[aria-label="Filtrar por fornecedor"] option', (o) =>
    o.map((x) => x.textContent),
  );
  conferir("seletor de fornecedor existe", fornOpts.length > 0);
  conferir(
    "fornecedor mostra a contagem",
    fornOpts.some((t) => /\(\d+\)/.test(t)),
    fornOpts.join(" | "),
  );
  const catOpts = await page.$$eval('select[aria-label="Filtrar por categoria"] option', (o) =>
    o.map((x) => x.textContent),
  );
  conferir(
    "categoria mostra a contagem",
    catOpts.some((t) => /\(\d+\)/.test(t)),
    catOpts.slice(0, 4).join(" | "),
  );

  console.log("\n=== LINHAS DO CATÁLOGO ===");
  conferir("mostra o SKU", txt.includes(anel.sku), anel.sku);
  conferir("mostra unidades", /\d+ un\./.test(txt));
  conferir('coluna "custo"', /custo/i.test(txt));
  conferir('pílula "A pagar"', /A pagar/.test(txt));

  console.log("\n=== FILTRAR DE VERDADE ===");
  await page.goto(`${BASE}/estoque?filtro=zerado`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro zeradas não traz peça com saldo", !txt.includes(anel.sku));
  conferir("mostra a contagem N de M", /\d+ de \d+ peças/.test(txt));
  conferir("oferece limpar filtros", /Limpar filtros/.test(txt));

  await page.goto(`${BASE}/estoque?categoria=An%C3%A9is`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro por categoria traz os anéis", txt.includes(anel.nome), anel.nome);
  conferir("filtro por categoria exclui os brincos", !txt.includes(brinco.nome));

  console.log("\n=== INSUMOS ===");
  await page.goto(`${BASE}/estoque?aba=insumos`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir('indicador "Em estoque"', txt.includes("Em estoque"));
  conferir('indicador "Acabando"', txt.includes("Acabando"));
  conferir("explica o que é insumo", /saquinho, caixinha, laço/.test(txt));
  conferir("lista os insumos", txt.includes(insumo.nome), insumo.nome);
  conferir("mostra a unidade", /\d+ un/.test(txt));
  conferir("mostra custo por unidade", /por un/.test(txt));

  console.log("\n=== CADASTRAR INSUMO ===");
  await abrirDialogo(page, 'button:has-text("Novo insumo")');
  await page.fill("#nome", MARCA + "Laço de cetim");
  await page.fill("#unidade", "par");
  await page.fill("#minimo", "10");
  await page.fill("#custo", "1,25");
  await page.click('[role="dialog"] button:has-text("Salvar insumo")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  const apareceu = await page
    .waitForFunction((n) => document.body.innerText.includes(n), MARCA + "Laço de cetim", {
      timeout: 15000,
    })
    .then(() => true)
    .catch(() => false);
  conferir("insumo aparece na lista", apareceu);
  txt = await page.textContent("body");
  conferir("usa a unidade digitada", /por par/.test(txt));
  conferir("mostra sem estoque (nasce zerado)", /sem estoque/.test(txt));

  await page.screenshot({ path: "scripts/shots/estoque-insumos.png", fullPage: true });
  await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.screenshot({ path: "scripts/shots/estoque-catalogo.png", fullPage: true });

  /*
   * FOTO OBRIGATÓRIA NA PEÇA (documentação, seção 09).
   *
   * A última conferência se adapta: com o Supabase Storage ligado, a peça tem
   * de ser criada; sem as chaves, a tela tem de DIZER o que fazer em vez de
   * mostrar "algo deu errado". Nos dois casos o que não pode acontecer é peça
   * gravada pela metade — sem foto ou sem cadastro.
   */
  console.log("\n=== FOTO É OBRIGATÓRIA NA PEÇA ===");
  await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await abrirDialogo(page, 'button:has-text("Nova peça")');

  let dlg = await page.textContent('[role="dialog"]');
  conferir("o cadastro pede foto", /Adicionar foto/i.test(dlg));

  await page.fill("#nome", MARCA + "Peça sem Foto");
  await page.fill("#codigoFornecedor", "30");
  await page.click('[role="dialog"] button:has-text("Salvar peça")');
  await page.waitForTimeout(2000);
  dlg = await page.textContent('[role="dialog"]');
  conferir("recusa sem foto, dizendo o motivo", /Adicione a foto da peça/i.test(dlg), dlg.slice(0, 120));

  // PNG 4×4 montado na mão: não depende de arquivo no disco.
  await page.setInputFiles('[role="dialog"] input[type="file"]', {
    name: "peca.png",
    mimeType: "image/png",
    buffer: Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAYAAACp8Z5+AAAAHElEQVQI12P8z8Dwn4EIwMRAJBhVSFyoAAB6BgMBqmHJHwAAAABJRU5ErkJggg==",
      "base64",
    ),
  });
  await page.waitForSelector('button:has-text("Usar esta foto")', { timeout: 15000 });
  await page.click('button:has-text("Usar esta foto")');
  await page.waitForSelector('button:has-text("Trocar")', { timeout: 20000 });
  conferir("recorta e comprime no navegador", true);

  await page.click('[role="dialog"] button:has-text("Salvar peça")');
  await page.waitForTimeout(6000);
  const fechou = (await page.locator('[role="dialog"]').count()) === 0;
  const alertas = fechou ? [] : await page.locator('[role="alert"]').allInnerTexts();
  const explicou = alertas.some((a) => /chaves|Supabase|bucket/i.test(a));

  conferir(
    fechou ? "com o Storage ligado, a peça é criada" : "sem as chaves, a tela diz o que fazer",
    fechou || explicou,
    alertas.join(" | ").slice(0, 160),
  );

  if (!fechou) await page.click('[role="dialog"] button:has-text("Cancelar")');

  console.log("\n=== CELULAR ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/estoque-390.png", fullPage: true });

  conferir("admin: nenhum erro de console", admin.erros.length === 0, admin.erros.slice(0, 2).join(" | "));

  /* ───────────────── VENDEDOR ───────────────── */
  console.log("\n=== VENDEDOR NÃO VÊ DINHEIRO ===");
  const vend = await entrar("vendedora", "Vende@2026!");
  await vend.page.goto(`${BASE}/estoque`, { waitUntil: "networkidle" });
  await esperarPronto(vend.page);
  const vtxt = await vend.page.textContent("body");
  const vhtml = (await vend.page.content()).toLowerCase();

  conferir('vê "Peças no catálogo"', vtxt.includes("Peças no catálogo"));
  conferir('vê "Unidades em estoque"', vtxt.includes("Unidades em estoque"));
  conferir('vê "Sem estoque"', vtxt.includes("Sem estoque"));
  conferir('NÃO vê "Estoque a custo"', !vtxt.includes("Estoque a custo"));
  conferir('NÃO vê "Saldo com fornecedor"', !vtxt.includes("Saldo com fornecedor"));
  conferir('NÃO vê o filtro "A acertar"', !vtxt.includes("A acertar"));
  conferir('NÃO vê o filtro "Nunca compradas"', !vtxt.includes("Nunca compradas"));
  conferir('NÃO vê a pílula "A pagar"', !vtxt.includes("A pagar"));
  conferir("nenhum valor de custo no HTML (112,50)", !vhtml.includes("112,50"));
  conferir("nenhum valor de custo no HTML (81,00)", !vhtml.includes("81,00"));
  conferir('mostra "à venda" no lugar do custo', /à venda/.test(vtxt));
  conferir("vendedor: nenhum erro de console", vend.erros.length === 0, vend.erros.slice(0, 2).join(" | "));
  await vend.ctx.close();

  /*
   * ───────────────── EXCLUIR E LIMPAR ─────────────────
   *
   * A limpeza É o teste. Antes não existia "Excluir" na ficha: a sonda só
   * AVISAVA que o insumo tinha ficado e seguia em frente, então cada execução
   * deixava mais um "ZZQA Laço de cetim" para trás — e os acumulados
   * apareciam como peças zeradas em outras telas.
   *
   * Agora sai pela interface, do jeito que uma pessoa faria.
   */
  console.log("\n=== EXCLUIR (documentação: 'Editar peça') ===");
  await page.setViewportSize({ width: 1366, height: 950 });
  await page.goto(`${BASE}/estoque?aba=insumos&busca=${encodeURIComponent(MARCA)}`, {
    waitUntil: "networkidle",
  });
  await esperarPronto(page);

  let sobrou = 0;
  while ((await page.textContent("body")).includes(MARCA + "Laço de cetim")) {
    await page.click(`a:has-text("${MARCA}Laço de cetim"), [href^="/estoque/"]:has-text("Laço")`);
    await page.waitForURL(/\/estoque\/[^/?]+$/, { timeout: 20000 });
    await esperarPronto(page);

    if (sobrou === 0) {
      const ficha = await page.textContent("body");
      conferir("ficha diz 'nunca comprada' em vez de 'zerada'", /nunca comprada/.test(ficha));
      conferir("ficha oferece excluir", /Excluir insumo/.test(ficha));
    }

    await abrirDialogo(page, 'button:has-text("Excluir insumo")');
    // O aviso é buscado ao abrir; ler antes de ele chegar pegava só o
    // "Conferindo o que está em jogo…".
    await page.waitForFunction(
      () => !document.querySelector('[role="dialog"]')?.textContent?.includes("Conferindo"),
      undefined,
      { timeout: 15000 },
    );
    const aviso = await page.textContent('[role="dialog"]');
    if (sobrou === 0) {
      conferir("o aviso diz o que acontece", /histórico de estoque e as vendas antigas/.test(aviso));
      conferir("sem pendência, o aviso diz isso", /Nada fica pendente/.test(aviso));
    }
    await page.click('[role="dialog"] button:has-text("Excluir insumo")');
    await page.waitForURL(/\/estoque\?aba=insumos/, { timeout: 20000 });
    await esperarPronto(page);
    sobrou++;

    await page.goto(`${BASE}/estoque?aba=insumos&busca=${encodeURIComponent(MARCA)}`, {
      waitUntil: "networkidle",
    });
    await esperarPronto(page);
    if (sobrou > 10) break; // rede de segurança: nunca girar sem fim
  }
  conferir("o insumo some da lista depois de excluir", sobrou > 0);
  console.log(`  ${sobrou} insumo(s) de teste removido(s) pela tela`);
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (criados.pecas.length) {
      const alvo = await db.peca.findMany({
        where: { id: { in: criados.pecas }, nome: { startsWith: MARCA } },
        select: { id: true },
      });
      const ids = alvo.map((p) => p.id);
      await db.movimentoEstoque.deleteMany({ where: { pecaId: { in: ids } } });
      await db.imagemPeca.deleteMany({ where: { pecaId: { in: ids } } });
      await db.peca.deleteMany({ where: { id: { in: ids } } });
      console.log(`  ${ids.length} peças de teste removidas`);
    }
    if (criados.fornecedores.length) {
      const alvo = await db.fornecedor.findMany({
        where: { id: { in: criados.fornecedores }, nome: { startsWith: MARCA } },
        select: { id: true },
      });
      await db.fornecedor.deleteMany({ where: { id: { in: alvo.map((x) => x.id) } } });
      console.log(`  ${alvo.length} fornecedores de teste removidos`);
    }
  } catch (e) {
    console.log("  ATENÇÃO: limpeza falhou — " + e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
