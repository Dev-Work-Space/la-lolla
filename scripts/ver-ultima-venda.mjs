/* Qual foi a última venda criada e com que id. Só leitura. */
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 1 }),
});

const vs = await db.venda.findMany({
  select: {
    id: true,
    numero: true,
    status: true,
    total: true,
    criadoEm: true,
    itens: { select: { quantidade: true, precoUnit: true, custoUnit: true } },
    parcelas: { select: { valor: true, tipo: true, status: true } },
    pagamentos: { select: { valor: true, forma: true } },
  },
  orderBy: { criadoEm: "desc" },
  take: 3,
});

if (vs.length === 0) {
  console.log("NENHUMA venda no banco — o fechamento não gravou.");
} else {
  for (const v of vs) {
    console.log(`  #${v.numero} id=${v.id}`);
    console.log(`    status ${v.status} · total ${v.total} · ${v.criadoEm.toISOString()}`);
    console.log(`    itens: ${v.itens.map((i) => `${i.quantidade}x${i.precoUnit} (custo ${i.custoUnit})`).join(", ")}`);
    console.log(`    pagamentos: ${v.pagamentos.map((p) => `${p.forma} ${p.valor}`).join(", ") || "nenhum"}`);
    console.log(`    parcelas: ${v.parcelas.map((p) => `${p.tipo} ${p.valor} ${p.status}`).join(", ") || "nenhuma"}`);
  }
}
await db.$disconnect();
