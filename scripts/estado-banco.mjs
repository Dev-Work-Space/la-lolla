/*
 * Fotografia do banco, só leitura. Nenhuma linha é criada, alterada ou
 * apagada aqui — serve para conferir sobra de teste antes de rodar as sondas.
 *
 *   npx dotenvx run -- node scripts/estado-banco.mjs
 */
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

const pecas = await db.peca.findMany({
  select: {
    sku: true,
    nome: true,
    tipo: true,
    totalRecebido: true,
    arquivada: true,
    movimentos: { select: { delta: true } },
  },
  orderBy: { sku: "asc" },
});

console.log("PEÇAS");
for (const p of pecas) {
  const saldo = p.movimentos.reduce((s, m) => s + m.delta, 0);
  const marcas = [];
  if (p.totalRecebido === 0) marcas.push("NUNCA COMPRADA");
  if (saldo <= 0) marcas.push("ZERADA");
  if (p.arquivada) marcas.push("ARQUIVADA");
  console.log(
    `  ${p.sku.padEnd(12)} ${p.nome.slice(0, 30).padEnd(30)} saldo ${String(saldo).padStart(4)}  recebido ${String(p.totalRecebido).padStart(4)}  ${marcas.join(" ")}`,
  );
}

const [vendas, contas, lanc, clientes, forn] = await Promise.all([
  db.venda.count(),
  db.conta.count(),
  db.lancamento.count(),
  db.cliente.count(),
  db.fornecedor.count(),
]);
console.log(
  `\nTOTAIS  peças ${pecas.length} · vendas ${vendas} · contas ${contas} · lançamentos ${lanc} · clientes ${clientes} · fornecedores ${forn}`,
);

await db.$disconnect();
