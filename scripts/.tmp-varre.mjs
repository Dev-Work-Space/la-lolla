import { chromium } from "playwright-core";
const [BASE] = [process.argv[2]];
const ROTAS = ["/estoque", "/estoque?aba=insumos", "/estoque/categorias", "/cadastros", "/cadastros?aba=fornecedores", "/financeiro", "/financeiro?aba=contas&tipo=receber", "/financeiro?aba=contas&tipo=pagar", "/financeiro?aba=fluxo", "/financeiro?aba=carteiras", "/usuarios", "/ajustes"];
const b = await chromium.launch();
for (const [nome, vp, toque] of [["PC", { width: 1200, height: 900 }, false], ["CELULAR", { width: 390, height: 844 }, true]]) {
  const ctx = await b.newContext({ viewport: vp, hasTouch: toque, isMobile: toque });
  const p = await ctx.newPage();
  const erros = []; p.on("pageerror", (e) => erros.push(e.message.slice(0, 120)));
  await p.goto(`${BASE}/login`); await p.fill("#usuario", "zzqa"); await p.fill("#senha", process.env.SENHA_TESTE);
  await p.click('button[type="submit"]'); await p.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 60000 });
  console.log(`\n===== ${nome} =====`);
  for (const rota of ROTAS) {
    await p.goto(BASE + rota, { waitUntil: "networkidle" }); await p.waitForTimeout(300);
    const gatilhos = await p.locator('main [aria-haspopup="dialog"]:visible').count();
    const linhas = [];
    for (let i = 0; i < gatilhos; i++) {
      await p.goto(BASE + rota, { waitUntil: "networkidle" });
      const g = p.locator('main [aria-haspopup="dialog"]:visible').nth(i);
      const rotulo = ((await g.innerText().catch(() => "")) || (await g.getAttribute("aria-label")) || "?").trim().replace(/\s+/g, " ").slice(0, 28);
      await g.click({ timeout: 4000 }).catch(() => {}); await p.waitForTimeout(700);
      const nivel1 = await p.locator('[data-slot="dialog-content"]').count();
      const fundo1 = await p.$$eval('[data-slot="dialog-overlay"]', (l) => l.map((e) => Number(getComputedStyle(e).backgroundColor.match(/[\d.]+(?=\))/)?.[0] ?? 0)));
      let extra = "";
      const filho = p.locator('[data-slot="dialog-content"] [aria-haspopup="dialog"]:visible').first();
      if (nivel1 && (await filho.count())) {
        const antes = (await p.locator('[data-slot="dialog-title"]').allInnerTexts()).join(" > ");
        await filho.click({ timeout: 3000 }).catch(() => {}); await p.waitForTimeout(700);
        const popups = await p.locator('[data-slot="dialog-content"]').count();
        const fundos = await p.locator('[data-slot="dialog-overlay"]').count();
        const pai = (await p.locator('[data-slot="dialog-title"]').allInnerTexts()).join(" > ");
        extra = ` | ANINHADA: popups=${popups} fundos=${fundos} títulos="${pai}"${popups !== fundos ? " ⚠ SEM FUNDO" : ""}${pai.includes(antes.split(" > ")[0]) ? "" : " ⚠ PRIMEIRA SUMIU"}`;
      }
      const ok = nivel1 > 0 && fundo1.length > 0 && fundo1.every((a) => a > 0.2);
      linhas.push(`   ${ok ? "ok " : "⚠  "} "${rotulo}" → janelas=${nivel1} fundo=${JSON.stringify(fundo1)}${extra}`);
    }
    console.log(`${rota}  (${gatilhos} botões de janela)`); linhas.forEach((l) => console.log(l));
  }
  if (erros.length) console.log("erros de página:", [...new Set(erros)]);
}
await b.close();
