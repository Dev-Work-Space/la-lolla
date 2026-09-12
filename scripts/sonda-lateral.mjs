/*
 * Barra lateral e paleta oficial. Mede o comportamento real, não o CSS.
 * Só leitura.
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

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
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

  const nav = page.locator('nav[data-nav="lateral"]').first();

  console.log("\n=== A BARRA É LATERAL NO MONITOR ===");
  const caixa = await nav.boundingBox();
  conferir("encostada na esquerda", Math.round(caixa.x) === 0, `x=${caixa.x}`);
  conferir("ocupa a altura toda", caixa.height >= 890, `h=${caixa.height}`);
  conferir("fechada tem 68px", Math.round(caixa.width) === 68, `w=${caixa.width}`);

  console.log("\n=== ABRE AO PASSAR O MOUSE ===");
  /*
   * `[data-rotulo]` e não `querySelector("span")`: o primeiro span do item
   * hoje é o TRILHO do ícone, não o rótulo. A sonda lia o elemento errado e
   * acusava falha com a barra funcionando — ponto de apoio explícito resolve.
   */
  const rotulo = nav.locator("a", { hasText: "Portal de vendas" }).first();
  const antes = await rotulo.evaluate((el) => {
    const s = el.querySelector("[data-rotulo]");
    return { opacidade: getComputedStyle(s).opacity, largura: getComputedStyle(s).maxWidth };
  });
  conferir("rótulo invisível com a barra fechada", antes.opacidade === "0", antes.opacidade);
  conferir("rótulo com largura zero", antes.largura === "0px", antes.largura);

  await nav.hover();
  await page.waitForTimeout(450);

  const depois = await nav.boundingBox();
  conferir("abre para 244px no hover", Math.round(depois.width) === 244, `w=${depois.width}`);

  const rotDepois = await rotulo.evaluate((el) => {
    const s = el.querySelector("[data-rotulo]");
    return { opacidade: getComputedStyle(s).opacity, texto: s.textContent };
  });
  conferir("rótulo aparece", rotDepois.opacidade === "1", rotDepois.opacidade);
  conferir("mostra o nome completo", rotDepois.texto.includes("Portal de vendas"));

  console.log("\n=== O RÓTULO CONTINUA NO DOCUMENTO (acessibilidade) ===");
  await page.mouse.move(900, 500);
  await page.waitForTimeout(450);
  const fechada = await nav.boundingBox();
  conferir("volta para 68px", Math.round(fechada.width) === 68, `w=${fechada.width}`);
  const display = await rotulo.evaluate((el) => getComputedStyle(el.querySelector("[data-rotulo]")).display);
  conferir("não usa display:none", display !== "none", display);

  console.log("\n=== ABRE TAMBÉM PELO TECLADO ===");
  /*
   * Tab DE VERDADE, não `.focus()` por código.
   *
   * A barra passou a abrir por `:focus-visible` em vez de `focus-within` (ver
   * barra-lateral.tsx) para não ficar presa aberta depois de um clique de
   * mouse. `:focus-visible` é justamente o foco que o navegador julga vindo do
   * teclado, e um `.focus()` programático depois de mexer o mouse não conta.
   * O teste antigo passava sem provar nada sobre teclado; este pressiona a
   * tecla e olha o resultado.
   */
  await page.mouse.move(900, 500);
  await page.waitForTimeout(300);
  await page.keyboard.press("Tab");
  await page.waitForTimeout(450);
  const porFoco = await nav.boundingBox();
  const focoNaBarra = await page.evaluate(
    () => !!document.activeElement?.closest('nav[data-nav="lateral"]'),
  );
  conferir("o Tab leva o foco para a barra", focoNaBarra);
  conferir("abre com foco do teclado", Math.round(porFoco.width) === 244, `w=${porFoco.width}`);
  await page.mouse.move(900, 500);
  await page.locator("main").first().click({ position: { x: 5, y: 5 } }).catch(() => {});
  await page.waitForTimeout(400);

  /*
   * As três conferências abaixo nasceram de defeitos que o João viu na tela e
   * que esta sonda NÃO pegava: ela testava que a barra abre e fecha, nunca
   * como ela abre.
   */
  console.log("\n=== OS ÍCONES NÃO SE MEXEM AO ABRIR ===");
  const centroDoIcone = async () => {
    const b = await nav.locator("a svg").first().boundingBox();
    return +(b.x + b.width / 2).toFixed(1);
  };
  await page.mouse.move(900, 500);
  await page.waitForTimeout(400);
  const xFechada = await centroDoIcone();
  await nav.hover();
  const percurso = [xFechada];
  for (let i = 0; i < 20; i++) {
    percurso.push(await centroDoIcone());
    await page.waitForTimeout(16);
  }
  await page.waitForTimeout(400);
  const xAberta = await centroDoIcone();
  percurso.push(xAberta);
  const viagem = Math.max(...percurso) - Math.min(...percurso);
  conferir("o ícone fica parado durante a abertura", viagem <= 1, `andou ${viagem.toFixed(1)}px`);
  conferir("mesma coluna fechada e aberta", Math.abs(xAberta - xFechada) <= 1, `${xFechada} -> ${xAberta}`);

  console.log("\n=== TODOS OS ÍCONES NA MESMA COLUNA ===");
  const espalhamento = async () => {
    const cxs = await nav.evaluate((n) =>
      [...n.querySelectorAll("a, button")]
        .map((el) => el.querySelector("svg") || el.querySelector("img"))
        .filter(Boolean)
        .map((s) => {
          const r = s.getBoundingClientRect();
          return r.x + r.width / 2;
        }),
    );
    return +(Math.max(...cxs) - Math.min(...cxs)).toFixed(1);
  };
  conferir("alinhados com a barra aberta", (await espalhamento()) <= 1, `${await espalhamento()}px`);
  await page.mouse.move(900, 500);
  await page.waitForTimeout(400);
  conferir("alinhados com a barra fechada", (await espalhamento()) <= 1, `${await espalhamento()}px`);

  console.log("\n=== FECHA SOZINHA DEPOIS DO CLIQUE ===");
  await nav.hover();
  await page.waitForTimeout(350);
  await nav.locator('a[href="/estoque"]').click();
  await page.waitForTimeout(600);
  await page.mouse.move(900, 500);
  await page.waitForTimeout(700);
  const depoisDoClique = Math.round((await nav.boundingBox()).width);
  conferir(
    "não fica presa aberta pelo foco do clique",
    depoisDoClique === 68,
    `w=${depoisDoClique} (o mouse já saiu de cima)`,
  );

  console.log("\n=== BOTÃO DE CLARO/ESCURO ===");
  const botaoTema = nav.locator('button[aria-label="Alternar entre tema claro e escuro"]').first();
  conferir("existe na barra", (await botaoTema.count()) === 1);
  const escuroAntes = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  await botaoTema.click();
  await page.waitForTimeout(350);
  const escuroDepois = await page.evaluate(() => document.documentElement.classList.contains("dark"));
  conferir("o clique troca o tema", escuroAntes !== escuroDepois, `${escuroAntes} -> ${escuroDepois}`);
  /* sol e lua ficam os dois no documento; quem escolhe é o CSS, sem piscada */
  const icones = await botaoTema.evaluate((b) => {
    const svgs = [...b.querySelectorAll("svg")];
    return svgs.map((s) => +getComputedStyle(s).opacity);
  });
  conferir("os dois ícones existem", icones.length === 2, `${icones.length}`);
  conferir(
    "só um aparece de cada vez",
    icones.filter((o) => o > 0.5).length === 1,
    `opacidades: ${icones.join(", ")}`,
  );
  await botaoTema.click();
  await page.waitForTimeout(350);
  await page.mouse.move(900, 500);
  await page.waitForTimeout(400);

  console.log("\n=== A BARRA COBRE O CONTEÚDO, NÃO EMPURRA ===");
  const antesMain = await page.locator("main").first().boundingBox();
  await nav.hover();
  await page.waitForTimeout(450);
  const depoisMain = await page.locator("main").first().boundingBox();
  conferir(
    "o conteúdo não se move ao abrir a barra",
    Math.abs(antesMain.x - depoisMain.x) < 1 && Math.abs(antesMain.width - depoisMain.width) < 1,
    `x ${antesMain.x}→${depoisMain.x}, w ${antesMain.width}→${depoisMain.width}`,
  );
  await page.mouse.move(900, 500);
  await page.waitForTimeout(300);

  console.log("\n=== CORES OFICIAIS ===");
  const cores = await page.evaluate(() => {
    const r = getComputedStyle(document.documentElement);
    const v = (n) => r.getPropertyValue(n).trim().toUpperCase();
    return {
      canvas: v("--ll-canvas"),
      brand: v("--ll-brand"),
      accent: v("--ll-accent"),
      ink: v("--ll-ink"),
      accentSoft: v("--ll-accent-soft"),
      fundoReal: getComputedStyle(document.body).backgroundColor,
    };
  });
  conferir("areia #F7F6F3", cores.canvas === "#F7F6F3", cores.canvas);
  conferir("dourado da marca #A9792C", cores.brand === "#A9792C", cores.brand);
  conferir("acento #8C6620", cores.accent === "#8C6620", cores.accent);
  conferir("tinta #1A1814", cores.ink === "#1A1814", cores.ink);
  conferir("dourado suave #F6EFDF", cores.accentSoft === "#F6EFDF", cores.accentSoft);
  conferir(
    "o fundo da página É a areia",
    cores.fundoReal === "rgb(247, 246, 243)",
    cores.fundoReal,
  );

  console.log("\n=== ABA ATUAL EM DOURADO ===");
  await page.goto(`${BASE}/cadastros`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const atual = await page
    .locator('nav[aria-label="Navegação principal"] a[aria-current="page"]')
    .first()
    .evaluate((el) => ({
      fundo: getComputedStyle(el).backgroundColor,
      cor: getComputedStyle(el).color,
      texto: el.textContent,
    }));
  conferir("a aba atual é Cadastros", atual.texto.includes("Cadastros"), atual.texto);
  conferir("fundo dourado suave", atual.fundo === "rgb(246, 239, 223)", atual.fundo);
  conferir("texto dourado", atual.cor === "rgb(140, 102, 32)", atual.cor);

  console.log("\n=== LOGO OFICIAL ===");
  await nav.hover();
  await page.waitForTimeout(450);
  const logo = page.locator('nav[data-nav="lateral"] img[alt="LaLolla"]').first();
  conferir("logo aparece com a barra aberta", await logo.isVisible());
  const src = await logo.getAttribute("src");
  conferir("usa o arquivo oficial", (src ?? "").includes("logo-lalolla"), src);
  const carregou = await logo.evaluate((el) => el.complete && el.naturalWidth > 0);
  conferir("a imagem carregou de verdade", carregou);

  console.log("\n=== CELULAR CONTINUA COM A BARRA DE BAIXO ===");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const lateralNoCel = await nav.isVisible();
  conferir("barra lateral escondida no celular", !lateralNoCel);
  const debaixo = await page.locator('nav[data-nav="inferior"] a[href="/estoque"]').first().boundingBox();
  conferir("barra de baixo presente", debaixo !== null && debaixo.y > 700, `y=${debaixo?.y}`);
  const larg = await page.evaluate(() => ({
    doc: document.documentElement.scrollWidth,
    win: window.innerWidth,
  }));
  conferir("sem rolagem horizontal", larg.doc <= larg.win + 1, `${larg.doc} vs ${larg.win}`);
  await page.screenshot({ path: "scripts/shots/lateral-390.png", fullPage: true });

  await page.setViewportSize({ width: 1366, height: 900 });
  await page.goto(BASE, { waitUntil: "networkidle" });
  await esperarPronto(page);
  await page.screenshot({ path: "scripts/shots/lateral-fechada.png" });
  await nav.hover();

  await page.waitForTimeout(500);
  await page.screenshot({ path: "scripts/shots/lateral-aberta.png" });

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
