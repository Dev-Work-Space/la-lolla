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

    /*
     * NADA FICA ESCONDIDO ATRÁS DAS BARRAS FIXAS.
     *
     * É o defeito da foto que o João mandou: no Ajustes, o campo "Nova
     * categoria" ficava pela metade atrás da barra de baixo. Rolar até o fim
     * e conferir se o último pedaço de conteúdo ainda aparece é a única forma
     * honesta de testar isso — parado no topo, tudo parece certo.
     */
    if (largura === 390) {
      console.log("\n=== NADA ESCONDIDO ATRÁS DAS BARRAS ===");
      for (const [nome, rota] of TELAS) {
        await page.goto(`${BASE}${rota}`, { waitUntil: "domcontentloaded" });
        await esperarPronto(page);
        await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
        await page.waitForTimeout(350);

        const r = await page.evaluate(() => {
          const nav = document.querySelector('nav[data-nav="inferior"]');
          const topoDaBarra = nav ? nav.getBoundingClientRect().top : window.innerHeight;

          const tapados = [];
          for (const el of document.querySelectorAll("main input, main button, main a, main select")) {
            const b = el.getBoundingClientRect();
            if (b.width === 0 || b.height === 0) continue;

            /*
             * Só interessa o que está DENTRO da tela agora. O que rolou para
             * fora por cima não está escondido atrás do cabeçalho — está
             * simplesmente acima, e é assim que rolagem funciona. Sem este
             * corte a medição acusava 60 elementos "tapados" numa tela longa.
             */
            const naTela = b.bottom > 0 && b.top < window.innerHeight;
            if (!naTela) continue;

            /*
             * Só a barra DE BAIXO conta.
             *
             * Passar por baixo do cabeçalho fixo é o comportamento normal de
             * rolagem — é só subir que o elemento reaparece. Já o que fica
             * atrás da barra de baixo COM A PÁGINA NO FIM é inalcançável: não
             * existe mais para onde rolar. Foi esse o defeito da foto do João.
             *
             * Minha primeira medição acusava os dois e enchia o resultado de
             * falso positivo.
             */
            const escondidoPorBaixo = Math.max(0, b.bottom - topoDaBarra);
            const aparece = b.height - escondidoPorBaixo;
            if (aparece < b.height / 2) {
              tapados.push(
                `"${(el.textContent || el.placeholder || "").trim().slice(0, 20)}" (${Math.round(escondidoPorBaixo)}px atrás da barra)`,
              );
            }
          }
          return { tapados: tapados.slice(0, 3), quantos: tapados.length };
        });
        conferir(
          `${nome}: nada tapado pelas barras`,
          r.quantos === 0,
          `${r.quantos} escondido(s): ${r.tapados.join(" · ")}`,
        );
      }

      console.log("\n=== O CABEÇALHO FICA FIXO AO ROLAR ===");
      await page.goto(`${BASE}/estoque`, { waitUntil: "domcontentloaded" });
      await esperarPronto(page);
      const antes = await page.evaluate(() => document.querySelector("header")?.getBoundingClientRect().top);
      await page.evaluate(() => window.scrollTo(0, 900));
      await page.waitForTimeout(350);
      const depois = await page.evaluate(() => {
        const h = document.querySelector("header");
        return { topo: h?.getBoundingClientRect().top, rolou: window.scrollY };
      });
      conferir("a página rolou de verdade", depois.rolou > 200, `scrollY ${depois.rolou}`);
      conferir(
        "o cabeçalho continua no topo",
        Math.abs((depois.topo ?? -999) - (antes ?? 0)) < 2,
        `antes ${antes}, depois ${depois.topo}`,
      );

      console.log("\n=== INSTALÁVEL COMO APP ===");
      const man = await page.evaluate(async () => {
        const link = document.querySelector('link[rel="manifest"]');
        if (!link) return null;
        const r = await fetch(link.getAttribute("href"));
        return r.ok ? r.json() : null;
      });
      conferir("tem manifesto", Boolean(man));
      conferir("abre em tela cheia (standalone)", man?.display === "standalone", man?.display);
      conferir("tem nome da loja", /LaLolla/.test(man?.name ?? ""), man?.name);
      conferir("tem ícone 512", (man?.icons ?? []).some((i) => i.sizes === "512x512"));
      conferir(
        "tem ícone que aguenta o corte do Android",
        (man?.icons ?? []).some((i) => i.purpose === "maskable"),
      );
      const apple = await page.evaluate(
        () => document.querySelector('link[rel="apple-touch-icon"]')?.getAttribute("href") ?? null,
      );
      conferir("tem ícone do iPhone", Boolean(apple), String(apple));

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
