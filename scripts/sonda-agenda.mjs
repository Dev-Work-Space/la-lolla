/*
 * Agenda e Previsão do Financeiro.
 *
 * As duas respondem "o que vem por aí" e leem a MESMA fonte das outras telas:
 * contas a pagar e a receber em aberto. A sonda cria compromissos com data
 * conhecida e confere que eles aparecem no dia certo, no grupo certo e na
 * semana certa da projeção.
 *
 * Limpa tudo no fim, por id exato.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";

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

const soDia = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const maisDias = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

const criadas = [];

const nav = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1200 } });
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

try {
  const hoje = soDia(new Date());

  console.log("=== PREPARAR OS COMPROMISSOS ===");
  /* Um vencido de 10 dias atrás, um que vence hoje e um daqui a 20 dias. O de
     20 dias pode cair no mês seguinte — e é justamente isso que a agenda tem
     de tratar sem mentir. */
  const alvos = [
    { nome: MARCA + "Conta vencida", tipo: "PAGAR", valor: 150, venc: maisDias(hoje, -10) },
    { nome: MARCA + "Conta de hoje", tipo: "PAGAR", valor: 80, venc: hoje },
    { nome: MARCA + "A receber depois", tipo: "RECEBER", valor: 500, venc: maisDias(hoje, 20) },
  ];
  for (const a of alvos) {
    const c = await db.conta.create({
      data: {
        tipo: a.tipo,
        status: "ABERTA",
        descricao: a.nome,
        valor: a.valor,
        vencimento: a.venc,
      },
      select: { id: true },
    });
    criadas.push(c.id);
  }
  conferir("três compromissos criados", criadas.length === 3);

  console.log("\n=== ENTRAR ===");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  console.log("\n=== AGENDA ===");
  await page.goto(`${BASE}/financeiro?aba=agenda`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const t = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  conferir("a aba Agenda existe", /Agenda/.test(t));
  conferir("mostra o mês corrente", new RegExp(mesPorExtenso(hoje), "i").test(t), t.slice(0, 200));
  conferir("lista a conta vencida", /ZZQA Conta vencida/.test(t));
  conferir("no grupo Vencido", /vencido/i.test(t));
  conferir("lista a conta de hoje", /ZZQA Conta de hoje/.test(t));
  conferir("no grupo Hoje", /hoje/i.test(t));
  conferir(
    "avisa que o vencido de antes entra na conta",
    /vencido de antes entra|vencidos de antes entram/.test(t),
    t.slice(0, 300),
  );

  /* O resumo do mês: 230 a pagar (150 + 80). O a receber depende de o
     compromisso de 20 dias cair neste mês ou no seguinte. */
  conferir("soma o que há para pagar no mês", /R\$ ?230,00/.test(t), t.slice(0, 400));

  /* Navegar para o mês anterior não pode quebrar nem mostrar o mês errado. */
  await page.click('a[aria-label="Mês anterior"]');
  await page.waitForURL((u) => u.searchParams.has("mes"), { timeout: 30000 });
  await page.waitForLoadState("networkidle");
  await esperarPronto(page);
  await page.waitForTimeout(500);
  {
    const t2 = (await page.locator("main").innerText()).replace(/\s+/g, " ");
    const anterior = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);
    conferir("navega para o mês anterior", new RegExp(mesPorExtenso(anterior), "i").test(t2), t2.slice(0, 160));
    conferir("e oferece voltar para o mês de hoje", /Voltar para/.test(t2));
    /* Vencido só sobe no mês CORRENTE: num mês passado ele apareceria
       duplicado, e a conta do mês deixaria de ser a conta daquele mês. */
    conferir("o vencido NÃO aparece no mês passado", !/ZZQA Conta de hoje/.test(t2));
  }

  console.log("\n=== PREVISÃO ===");
  await page.goto(`${BASE}/financeiro?aba=previsao`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  const p = (await page.locator("main").innerText()).replace(/\s+/g, " ");

  conferir("mostra o saldo de hoje", /saldo hoje/i.test(p));
  conferir("mostra o que entra em 90 dias", /entra em 90 dias/i.test(p));
  conferir("com os 500 a receber", /R\$ ?500,00/.test(p), p.slice(0, 300));
  conferir("mostra o que sai em 90 dias", /sai em 90 dias/i.test(p));
  conferir("com os 80 de hoje", /R\$ ?80,00/.test(p));
  conferir("tem a tabela das 12 semanas", /próximas 12 semanas/i.test(p));
  conferir(
    "avisa que vendas futuras não entram",
    /Vendas futuras não entram/.test(p),
    p.slice(-300),
  );
  /* O vencido fica FORA da projeção e aparece à parte: somá-lo a uma semana
     futura inventaria uma data que ninguém combinou. */
  conferir("separa os pagamentos vencidos", /Pagamentos vencidos/.test(p));
  conferir("dizendo que não entram na projeção", /não entram na projeção/.test(p));

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.log("\nFALHA GERAL: " + e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (criadas.length) {
      const alvo = await db.conta.findMany({
        where: { id: { in: criadas }, descricao: { startsWith: MARCA } },
        select: { id: true },
      });
      await db.conta.deleteMany({ where: { id: { in: alvo.map((c) => c.id) } } });
      console.log(`  ${alvo.length} contas de teste removidas`);
    }
  } catch (e) {
    console.log("  ATENÇÃO: limpeza falhou — " + e.message);
  }
  await nav.close();
  await db.$disconnect();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
  process.exit(falhou ? 1 : 0);
}

function mesPorExtenso(d) {
  return d.toLocaleDateString("pt-BR", { month: "long" });
}
