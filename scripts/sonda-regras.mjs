/*
 * As regras que vieram da documentação funcional. Cada checagem aponta para
 * a seção do documento que a define.
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
const criados = { pecas: [], clientes: [], vendas: [], contas: [] };

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

try {
  const admin = await entrar("teste", "Teste@2026!");
  const page = admin.page;

  console.log("\n=== SEÇÃO 15 · SOBRA DE CENTAVOS NA ÚLTIMA PARCELA ===");
  // R$ 100,00 em 3 = 33,33 + 33,33 + 33,34
  await page.goto(`${BASE}/financeiro?aba=pagar`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await abrirDialogo(page, 'button:has-text("Nova conta a pagar")');
  await page.fill("#descricao-c", MARCA + "Centavos");
  await page.fill("#valor-c", "100,00");
  await page.fill("#parcelas-c", "3");
  await page.click('[role="dialog"] button:has-text("Lançar")');
  await page.waitForSelector('[role="dialog"]', { state: "detached", timeout: 30000 });
  await page.waitForTimeout(1500);

  const parcelas = await db.conta.findMany({
    where: { descricao: { startsWith: MARCA + "Centavos" } },
    select: { id: true, valor: true, parcela: true },
    orderBy: { parcela: "asc" },
  });
  criados.contas.push(...parcelas.map((p) => p.id));
  const valores = parcelas.map((p) => Number(p.valor));
  conferir("criou 3 parcelas", parcelas.length === 3, String(parcelas.length));
  conferir("1ª e 2ª de 33,33", valores[0] === 33.33 && valores[1] === 33.33, valores.join(" · "));
  conferir("a ÚLTIMA leva o centavo (33,34)", valores[2] === 33.34, String(valores[2]));
  conferir("somam exatamente 100", Math.abs(valores.reduce((a, b) => a + b, 0) - 100) < 0.001);

  console.log("\n=== SEÇÃO 15 · ESTOQUE NEGATIVO É RECUSADO ===");
  const peca = await db.peca.create({
    data: {
      sku: `ZR-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Peça Sem Estoque",
      categoria: "Anéis",
      custo: 10,
      precoTabela: 50,
    },
    select: { id: true, sku: true, nome: true },
  });
  criados.pecas.push(peca.id);

  await page.goto(`${BASE}/vendas/nova`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await buscarEClicar(page, "#busca-peca", peca.sku, `button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);
  await page.click('button:has-text("Dinheiro")');
  await page.fill('input[aria-label="Valor pago"]', "50,00");
  await page.click('button:has-text("Adicionar")');
  await page.waitForTimeout(300);
  await page.click('button:has-text("Fechar venda")');
  await page.waitForTimeout(2500);

  let txt = await page.textContent("body");
  conferir("a venda é RECUSADA sem estoque", /sem estoque/i.test(txt), txt.slice(0, 120));
  conferir("a mensagem diz o que fazer", /Portal de compras/i.test(txt));
  const vendasCriadas = await db.itemVenda.count({ where: { pecaId: peca.id } });
  conferir("nada foi gravado", vendasCriadas === 0, String(vendasCriadas));

  console.log("\n=== SEÇÃO 15 · VENDA AVULSA NÃO FIA ===");
  await db.movimentoEstoque.create({
    data: { pecaId: peca.id, delta: 5, motivo: "COMPRA", observacao: "preparo" },
  });
  await db.peca.update({ where: { id: peca.id }, data: { totalRecebido: { increment: 5 } } });
  await page.reload({ waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await buscarEClicar(page, "#busca-peca", peca.sku, `button:has-text("${peca.sku}")`);
  await page.waitForTimeout(300);
  // sem cliente e sem pagar nada -> tem de recusar
  await page.click('button:has-text("Fechar venda")');
  await page.waitForTimeout(2500);
  txt = await page.textContent("body");
  conferir(
    "recusa venda avulsa a prazo",
    /Selecione o cliente/i.test(txt),
    txt.match(/Selecione[^.]*\./)?.[0] ?? txt.slice(0, 120),
  );

  console.log("\n=== SEÇÃO 15 · DESCONTO É PERCENTUAL ===");
  txt = await page.textContent("body");
  conferir("campo em % sobre o subtotal", /% sobre o subtotal/.test(txt));
  conferir("atalho de 5%", /5%/.test(txt));
  await page.fill('input[aria-label="Desconto em porcento"]', "10");
  await page.waitForTimeout(400);
  txt = await page.textContent("body");
  // peça de R$ 50 com 10% = R$ 5 de desconto, total R$ 45
  conferir("10% de R$ 50 = R$ 5,00", /R\$\s*5,00/.test(txt));
  conferir("total vira R$ 45,00", /R\$\s*45,00/.test(txt));

  console.log("\n=== SEÇÃO 03 · SENHA PELAS REGRAS DO DOCUMENTO ===");
  // Testa pela tela de primeiro acesso de um usuário novo: é onde a regra
  // aparece para quem usa.
  const novo = await db.usuario.create({
    data: { email: "zzqa-senha", nome: MARCA + "Senha", papel: "VENDEDOR", permissoes: {} },
    select: { id: true, email: true },
  });
  const ctx2 = await navegador.newContext();
  const p2 = await ctx2.newPage();
  const tentar = async (senha) => {
    await p2.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
    await esperarPronto(p2);
    await p2.fill("#usuario", novo.email);
    await p2.fill("#senha", senha);
    await p2.click('button[type="submit"]');
    await p2.waitForTimeout(1800);
    return p2.textContent("body");
  };
  conferir("recusa senha curta (7)", /pelo menos 8/.test(await tentar("Ab1234!")));
  conferir("recusa só números", /misture letras/i.test(await tentar("12348765")));
  conferir("recusa caractere repetido", /mesmo caractere/i.test(await tentar("aaaaaaaa")));
  conferir("recusa senha óbvia", /muito comum/i.test(await tentar("password")));
  await ctx2.close();
  await db.usuario.delete({ where: { id: novo.id } });

  console.log("\n=== AJUSTES ===");
  await page.goto(`${BASE}/ajustes`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  txt = await page.textContent("body");
  conferir("tela de Ajustes abre para admin", /Multiplicador do custo/.test(txt));
  conferir("multiplicador padrão 2,9", /2,9/.test(txt));
  conferir("avisa que não recalcula peças antigas", /não recalcula peças/i.test(txt));
  conferir("tem desconto à vista", /Desconto à vista/.test(txt));
  conferir("tem dias parado", /Cliente parado depois de/.test(txt));
  conferir("tem categorias", /Categorias de peça/.test(txt));

  console.log("\n=== PONTO DE ATENÇÃO 5 · VENDEDOR NÃO VÊ AJUSTES ===");
  const vend = await entrar("vendedora", "Vende@2026!");
  const resp = await vend.page.goto(`${BASE}/ajustes`, { waitUntil: "domcontentloaded" });
  const vtxt = await vend.page.textContent("body");
  conferir(
    "vendedora não acessa Ajustes",
    resp.status() === 404 || /não encontrad|404/i.test(vtxt),
    `status ${resp.status()}`,
  );
  // O link tem de sumir numa tela que ela VÊ — na página de 404 a barra nem
  // é desenhada, então testar lá não provava nada.
  await vend.page.goto(BASE, { waitUntil: "domcontentloaded" });
  await esperarPronto(vend.page);
  const navVend = await vend.page
    .locator('nav[data-nav="lateral"]')
    .first()
    .textContent()
    .catch(() => "");
  conferir("nem vê o link na navegação", !/Ajustes/.test(navVend ?? ""), navVend ?? "");
  await vend.ctx.close();

  conferir("admin: sem erro de console", admin.erros.length === 0, admin.erros.slice(0, 2).join(" | "));
  await admin.ctx.close();
} catch (e) {
  falhou++;
  console.error("\nERRO:", e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    for (const id of criados.contas) await db.conta.deleteMany({ where: { id } });
    for (const id of criados.pecas) {
      const p = await db.peca.findUnique({ where: { id }, select: { nome: true } });
      if (p?.nome.startsWith(MARCA)) {
        await db.movimentoEstoque.deleteMany({ where: { pecaId: id } });
        await db.peca.delete({ where: { id } });
      }
    }
    await db.usuario.deleteMany({ where: { nome: { startsWith: MARCA } } });
    console.log("  registros de teste removidos");
  } catch (e) {
    console.log("  limpeza falhou:", e.message);
  }
  await db.$disconnect();
  await navegador.close();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
  process.exitCode = falhou === 0 ? 0 : 1;
}
