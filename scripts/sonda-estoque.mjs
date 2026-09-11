/*
 * Fase 2 — Estoque. Confere catálogo e insumos contra o PARIDADE.md,
 * inclusive a diferença de indicadores entre admin e vendedor.
 *
 * Cria um insumo de teste pela interface e o remove no fim, por nome exato.
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
  conferir("mostra o SKU", /DEMO-\d{4}/.test(txt));
  conferir("mostra unidades", /\d+ un\./.test(txt));
  conferir('coluna "custo"', /custo/i.test(txt));
  conferir('pílula "A pagar"', /A pagar/.test(txt));

  console.log("\n=== FILTRAR DE VERDADE ===");
  await page.goto(`${BASE}/estoque?filtro=zerado`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro zeradas não traz peça com saldo", !/DEMO-0001/.test(txt));
  conferir("mostra a contagem N de M", /\d+ de \d+ peças/.test(txt));
  conferir("oferece limpar filtros", /Limpar filtros/.test(txt));

  await page.goto(`${BASE}/estoque?categoria=An%C3%A9is`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("filtro por categoria traz os anéis", /Anel Solitário/.test(txt));
  conferir("filtro por categoria exclui os brincos", !/Brinco Gota/.test(txt));

  console.log("\n=== INSUMOS ===");
  await page.goto(`${BASE}/estoque?aba=insumos`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir('indicador "Em estoque"', txt.includes("Em estoque"));
  conferir('indicador "Acabando"', txt.includes("Acabando"));
  conferir("explica o que é insumo", /saquinho, caixinha, laço/.test(txt));
  conferir("lista os insumos de demonstração", /Caixinha de veludo/.test(txt));
  conferir("mostra a unidade", /\d+ un/.test(txt));
  conferir("mostra custo por unidade", /por un/.test(txt));

  console.log("\n=== CADASTRAR INSUMO ===");
  await page.click('button:has-text("Novo insumo")');
  await page.waitForSelector('[role="dialog"]');
  await page.fill("#nome", MARCA + "Laço de cetim");
  await page.fill("#unidade", "par");
  await page.fill("#minimo", "10");
  await page.fill("#custo", "1,25");
  await page.click('[role="dialog"] button:has-text("Salvar insumo")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 15000 });
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

  /* ───────────────── LIMPEZA ───────────────── */
  console.log("\n=== LIMPEZA ===");
  await page.setViewportSize({ width: 1366, height: 950 });
  await page.goto(`${BASE}/estoque?aba=insumos&busca=${encodeURIComponent(MARCA)}`, {
    waitUntil: "networkidle",
  });
  await esperarPronto(page);
  const restou = (await page.textContent("body")).includes(MARCA + "Laço de cetim");
  console.log(
    restou
      ? `  o insumo "${MARCA}Laço de cetim" continua no banco (ainda não há botão de excluir insumo)`
      : "  nada a limpar",
  );
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
