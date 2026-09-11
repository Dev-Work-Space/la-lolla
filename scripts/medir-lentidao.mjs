/*
 * De onde vem a lentidão ao trocar de tela. Só leitura.
 *
 *   node scripts/medir-lentidao.mjs
 *
 * Mede três coisas separadas, porque as soluções são diferentes:
 *   1. latência de UMA ida e volta ao banco (o Supabase está no Canadá)
 *   2. quantas consultas cada tela dispara
 *   3. quanto tempo o servidor gasta por tela
 */
import pg from "pg";

const URL_RUNTIME = process.env.DATABASE_URL;
const URL_DIRETA = process.env.DIRECT_URL;

function ms(t) {
  return `${t.toFixed(0)} ms`;
}

async function medirLatencia(url, rotulo) {
  const c = new pg.Client({ connectionString: url });
  const t0 = performance.now();
  await c.connect();
  const conectar = performance.now() - t0;

  const tempos = [];
  for (let i = 0; i < 10; i++) {
    const t = performance.now();
    await c.query("select 1");
    tempos.push(performance.now() - t);
  }
  await c.end();

  tempos.sort((a, b) => a - b);
  const mediana = tempos[Math.floor(tempos.length / 2)];
  console.log(`  ${rotulo}`);
  console.log(`    abrir conexão : ${ms(conectar)}`);
  console.log(`    ida e volta   : ${ms(mediana)}  (menor ${ms(tempos[0])}, maior ${ms(tempos.at(-1))})`);
  return mediana;
}

console.log("\n=== 1. DISTÂNCIA ATÉ O BANCO ===");
const latRuntime = await medirLatencia(URL_RUNTIME, "pooler 6543 (o que a aplicação usa)");
const latDireta = await medirLatencia(URL_DIRETA, "pooler 5432 (migrations)");

console.log("\n=== 2. QUANTAS CONSULTAS CADA TELA DISPARA ===");
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");

const prisma = new PrismaClient({
  adapter: new PrismaPg({ connectionString: URL_RUNTIME, max: 1 }),
  log: [{ emit: "event", level: "query" }],
});

let consultas = 0;
let tempoBanco = 0;
prisma.$on("query", (e) => {
  consultas++;
  tempoBanco += e.duration;
});

async function medirTela(nome, fn) {
  consultas = 0;
  tempoBanco = 0;
  const t0 = performance.now();
  await fn();
  const total = performance.now() - t0;
  const espera = total - tempoBanco;
  console.log(
    `  ${nome.padEnd(22)} ${String(consultas).padStart(3)} consultas · ` +
      `${ms(total).padStart(8)} total · ${ms(tempoBanco).padStart(8)} no banco`,
  );
  return { nome, consultas, total };
}

process.env.DATABASE_URL = URL_RUNTIME;

const painel = await import("../src/modules/painel/painel.service.ts").catch(() => null);
const catalogo = await import("../src/modules/pecas/catalogo.service.ts").catch(() => null);
const pessoas = await import("../src/modules/pessoas/pessoa.service.ts").catch(() => null);

const resultados = [];

if (painel) {
  resultados.push(
    await medirTela("Início", async () => {
      await Promise.all([
        painel.contextoInicio("Teste"),
        painel.serie6Meses(),
        painel.ritmo14(),
        painel.maisVendidasNoMes(),
        painel.pendencias(),
      ]);
    }),
  );
}

if (catalogo) {
  resultados.push(
    await medirTela("Estoque (catálogo)", async () => {
      await Promise.all([
        catalogo.indicadoresCatalogo(true),
        catalogo.listarCatalogo({ veFinanceiro: true }),
        catalogo.opcoesDeFiltro(),
      ]);
    }),
  );
  resultados.push(
    await medirTela("Estoque (insumos)", async () => {
      await Promise.all([catalogo.indicadoresInsumos(), catalogo.listarInsumos()]);
    }),
  );
}

if (pessoas) {
  resultados.push(
    await medirTela("Cadastros (clientes)", async () => {
      await Promise.all([pessoas.indicadoresClientes(), pessoas.listarClientes({})]);
    }),
  );
}

await prisma.$disconnect();

console.log("\n=== 3. CONCLUSÃO ===");
const pior = resultados.sort((a, b) => b.total - a.total)[0];
if (pior) {
  const idas = pior.consultas;
  const custoRede = idas * latRuntime;
  console.log(`  Tela mais pesada: ${pior.nome} — ${idas} consultas em ${ms(pior.total)}`);
  console.log(`  Só de ida e volta até o Canadá: ${idas} × ${ms(latRuntime)} = ${ms(custoRede)}`);
  console.log(
    `  Ou seja, ~${Math.round((custoRede / pior.total) * 100)}% do tempo é a DISTÂNCIA, não a consulta.`,
  );
}
console.log(`\n  Latência por ida e volta: ${ms(latRuntime)} (runtime) · ${ms(latDireta)} (direta)`);
console.log("  Referência: banco na mesma máquina fica em 0,1–1 ms.\n");
