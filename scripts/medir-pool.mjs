/*
 * Testa a hipótese: `max: 1` (uma conexão só) faz as consultas que eu escrevi
 * em Promise.all serem executadas UMA POR VEZ, cada uma pagando os 150 ms de
 * ida e volta até o Canadá.
 *
 * Só leitura.
 */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const URL = process.env.DATABASE_URL;
const ms = (t) => `${t.toFixed(0)} ms`;

async function testar(max, rotulo) {
  const prisma = new PrismaClient({
    adapter: new PrismaPg({ connectionString: URL, max }),
  });

  let consultas = 0;
  const contar = (p) => {
    consultas++;
    return p;
  };

  // Aquece: a primeira conexão custa ~600 ms e mascararia o resultado.
  await prisma.$queryRaw`select 1`;

  const t0 = performance.now();
  // As mesmas consultas que a tela de Início dispara.
  await Promise.all([
    contar(prisma.venda.aggregate({ _sum: { total: true }, _count: true })),
    contar(prisma.venda.aggregate({ where: { status: "FECHADA" }, _sum: { total: true } })),
    contar(prisma.peca.count()),
    contar(prisma.cliente.count()),
    contar(prisma.lancamento.aggregate({ _sum: { valor: true } })),
    contar(prisma.config.findUnique({ where: { chave: "meta" } })),
    contar(prisma.conta.count({ where: { status: "ABERTA" } })),
    contar(prisma.orcamento.count({ where: { status: "ABERTO" } })),
  ]);
  const total = performance.now() - t0;

  await prisma.$disconnect();
  console.log(`  ${rotulo.padEnd(28)} ${consultas} consultas em ${ms(total).padStart(8)}`);
  return total;
}

console.log("\n=== 8 CONSULTAS EM Promise.all, VARIANDO O TAMANHO DO POOL ===\n");
const com1 = await testar(1, "max: 1  (o que está hoje)");
const com5 = await testar(5, "max: 5");
const com10 = await testar(10, "max: 10");

console.log("\n=== LEITURA ===");
console.log(`  Com uma conexão só, as 8 consultas viram fila: ${ms(com1)}`);
console.log(`  Com pool de 10, elas vão juntas:               ${ms(com10)}`);
const ganho = com1 / com10;
console.log(`  Diferença: ${ganho.toFixed(1)}× mais rápido\n`);
