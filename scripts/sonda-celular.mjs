/*
 * O app cabe no celular e se comporta como sistema?
 *
 * Nasceu de um pedido do João: "faça com que o design fique perfeitamente
 * encaixado no celular, e não deixe deslizar pro lado, faça travado, que nem
 * sistema mesmo".
 *
 * Confere, em CADA tela e nos dois temas:
 *   - nada passa da largura (o que faria a página deslizar de lado)
 *   - o zoom está travado no <meta viewport>
 *   - os alvos de toque têm tamanho de dedo
 *   - o tema escuro realmente troca as cores, e não fica texto preto no preto
 *
 * Só leitura.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const TELAS = [
  ["Início", "/"],
  ["Vendas", "/vendas"],
  ["Compras", "/compras"],
  ["Estoque", "/estoque"],
  ["Insumos", "/estoque?aba=insumos"],
  ["Financeiro", "/financeiro"],
  ["A pagar", "/financeiro?aba=pagar"],
  ["Carteiras", "/financeiro?aba=carteiras"],
  ["Cadastros", "/cadastros"],
  ["Fornecedores", "/cadastros?aba=fornecedores"],
  ["Ajustes", "/ajustes"],
];

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

try {
  // 390px é o iPhone que o João usa; 360 é o Android mais apertado do mercado.
  for (const largura of [360, 390]) {
    const ctx = await navegador.newContext({
      viewport: { width: largura, height: 780 },
      isMobile: true,
      hasTouch: true,
      deviceScaleFactor: 3,
    });
    const page = await ctx.newPage();

    await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await esperarPronto(page);
    await page.fill("#usuario", "teste");
    await page.fill("#senha", "Teste@2026!");
    await page.click('button[type="submit"]');
    await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
    await esperarPronto(page);

    console.log(`\n=== ${largura}px — NADA DESLIZA PARA O LADO ===`);
    for (const [nome, rota] of TELAS) {
      await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
      await esperarPronto(page);
      await page.waitForTimeout(250);

      const m = await page.evaluate(() => {
        const doc = document.documentElement;
        // Quem é o culpado, se houver: o elemento mais largo que a tela.
        let pior = null;
        let piorLargura = 0;
        for (const el of document.querySelectorAll("body *")) {
          const r = el.getBoundingClientRect();
          const passa = r.right - window.innerWidth;
          if (passa > 1 && r.width > piorLargura) {
            piorLargura = r.width;
            pior = `${el.tagName.toLowerCase()}.${String(el.className).slice(0, 40)}`;
          }
        }
        return {
          doc: doc.scrollWidth,
          win: window.innerWidth,
          rolou: doc.scrollWidth > window.innerWidth + 1,
          pior,
        };
      });
      conferir(
        `${nome}: cabe na largura`,
        !m.rolou,
        `${m.doc}px numa tela de ${m.win}px${m.pior ? ` — culpado: ${m.pior}` : ""}`,
      );
    }

    if (largura === 390) {
      console.log("\n=== TRAVADO COMO SISTEMA ===");
      const viewport = await page.getAttribute('meta[name="viewport"]', "content");
      conferir("zoom travado no viewport", /user-scalable=no|maximum-scale=1/.test(viewport ?? ""), viewport);
      const toque = await page.evaluate(
        () => getComputedStyle(document.documentElement).touchAction,
      );
      conferir("toque duplo não dá zoom", toque === "manipulation", toque);
      const elastico = await page.evaluate(
        () => getComputedStyle(document.documentElement).overscrollBehavior,
      );
      conferir("sem efeito elástico", /none/.test(elastico), elastico);

      console.log("\n=== ALVO DE TOQUE ===");
      await page.goto(BASE, { waitUntil: "domcontentloaded" });
      await esperarPronto(page);
      const pequenos = await page.evaluate(() => {
        const ruins = [];
        for (const el of document.querySelectorAll(
          'nav[data-nav="inferior"] a, header button, header a',
        )) {
          const r = el.getBoundingClientRect();
          if (r.height > 0 && r.height < 36) ruins.push(`${el.textContent?.trim() || el.tagName} ${Math.round(r.height)}px`);
        }
        return ruins;
      });
      conferir("barra de baixo e cabeçalho com alvo de dedo", pequenos.length === 0, pequenos.join(" · "));
    }

    await ctx.close();
  }

  /* ─────────── TEMA ESCURO ─────────── */
  console.log("\n=== TEMA CLARO E ESCURO ===");
  const ctx = await navegador.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });
  await esperarPronto(page);

  const fundo = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const claro = await fundo();

  const botao = page.locator('header button[aria-label*="tema"]').first();
  conferir("o botão de tema está no cabeçalho", (await botao.count()) > 0);

  // Insiste: antes da hidratação o clique não faz nada.
  for (let i = 0; i < 6; i++) {
    await botao.click().catch(() => {});
    const mudou = await page
      .waitForFunction(() => document.documentElement.dataset.theme === "dark", undefined, {
        timeout: 2000,
      })
      .then(() => true)
      .catch(() => false);
    if (mudou) break;
    await page.waitForTimeout(500);
  }

  const escuro = await fundo();
  conferir("o fundo mudou de verdade", claro !== escuro, `${claro} → ${escuro}`);

  /*
   * Mede a cor pelo CANVAS, não por regex.
   *
   * A paleta é escrita em oklch e o navegador devolve `lab(2.75 0 0)` — meu
   * medidor antigo procurava números em `rgb(...)`, não achava nada e
   * acusava que o escuro não era escuro, com o app certo. O canvas resolve
   * qualquer cor de CSS para RGB de verdade.
   */
  const luminanciaDe = (cor) =>
    page.evaluate((c) => {
      const cv = document.createElement("canvas");
      cv.width = cv.height = 1;
      const ctx = cv.getContext("2d");
      ctx.fillStyle = c;
      ctx.fillRect(0, 0, 1, 1);
      const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
      return 0.2126 * r + 0.7152 * g + 0.0722 * b;
    }, cor);

  const lumEscuro = await luminanciaDe(escuro);
  conferir("o escuro é mesmo escuro", lumEscuro < 90, `${escuro} → luz ${Math.round(lumEscuro)}`);

  const corTexto = await page.evaluate(() => getComputedStyle(document.body).color);
  const textoLegivel = Math.abs((await luminanciaDe(corTexto)) - lumEscuro);
  conferir("texto contrasta com o fundo", textoLegivel > 100, `diferença ${Math.round(textoLegivel)}`);

  await page.reload({ waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  const depois = await page.evaluate(() => document.documentElement.dataset.theme);
  conferir("o tema escolhido sobrevive ao recarregar", depois === "dark", String(depois));
  conferir("sem piscar branco ao abrir", await fundo().then((f) => f === escuro));

  await ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
