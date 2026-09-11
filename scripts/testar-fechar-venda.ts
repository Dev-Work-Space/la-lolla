/*
 * Testa `fecharVenda` direto, sem navegador, para separar o que é problema
 * de tela do que é problema de regra/transação.
 *
 * Cria a peça, fecha a venda, confere os números e limpa tudo.
 */
import { prisma } from "../src/lib/prisma";
import { fecharVenda, cancelarVenda, devolverItem } from "../src/modules/vendas/venda.fechar";
import { buscarVenda } from "../src/modules/vendas/venda.service";

const MARCA = "ZZQA ";
let passou = 0;
let falhou = 0;
const conferir = (n: string, c: boolean, d = "") => {
  if (c) {
    passou++;
    console.log(`  OK    ${n}`);
  } else {
    falhou++;
    console.log(`  FALHA ${n}${d ? " — " + d : ""}`);
  }
};

let pecaId: string | null = null;
let vendaId: string | null = null;

async function main() {
  console.log("\n=== PREPARAR ===");
  const peca = await prisma.peca.create({
    data: {
      sku: `ZZ-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Anel Transação",
      categoria: "Anéis",
      custo: 40,
      precoTabela: 100,
    },
    select: { id: true },
  });
  pecaId = peca.id;
  await prisma.movimentoEstoque.create({
    data: { pecaId, delta: 10, motivo: "COMPRA", observacao: "preparo" },
  });
  await prisma.peca.update({ where: { id: pecaId }, data: { totalRecebido: { increment: 10 } } });

  // Prova que a peça está visível numa consulta normal antes da transação.
  const existe = await prisma.peca.findUnique({ where: { id: pecaId }, select: { id: true } });
  conferir("a peça existe antes de fechar", existe !== null);

  console.log("\n=== FECHAR A VENDA ===");
  const v = await fecharVenda({
    itens: [{ pecaId, quantidade: 2, precoUnit: 100 }],
    desconto: 10,
    pagamentos: [{ forma: "DINHEIRO", valor: 150 }],
    aPrazo: { parcelas: 2, intervalo: "mes", primeiroVencimento: new Date() },
  });
  vendaId = v.id;
  conferir("venda criada", !!v.id);

  const f = await buscarVenda(v.id, true);
  conferir("total 190", f.total === 190, String(f.total));
  conferir("pago 150", f.pago === 150, String(f.pago));
  conferir("saldo 40", f.saldo === 40, String(f.saldo));
  conferir("custo congelado 80 (2 × 40)", "custo" in f && f.custo === 80, String((f as never)["custo"]));
  conferir("margem (190−80)/190 = 57,9%", "margem" in f && f.margem === 57.9, String((f as never)["margem"]));
  conferir("2 parcelas de 20", f.parcelas.length === 2 && f.parcelas.every((p) => p.valor === 20));

  const saldo = await prisma.movimentoEstoque.aggregate({ where: { pecaId }, _sum: { delta: true } });
  conferir("estoque 10 − 2 = 8", saldo._sum.delta === 8, String(saldo._sum.delta));

  console.log("\n=== DEVOLVER 1 ===");
  await devolverItem(f.itens[0].id, 1);
  const f2 = await buscarVenda(v.id, true);
  conferir("total caiu para 90", f2.total === 90, String(f2.total));
  conferir("custo caiu para 40", "custo" in f2 && f2.custo === 40, String((f2 as never)["custo"]));
  const saldo2 = await prisma.movimentoEstoque.aggregate({ where: { pecaId }, _sum: { delta: true } });
  conferir("estoque voltou para 9", saldo2._sum.delta === 9, String(saldo2._sum.delta));

  console.log("\n=== CANCELAR ===");
  await cancelarVenda(v.id, "teste");
  const f3 = await buscarVenda(v.id, true);
  conferir("continua existindo", !!f3.id);
  conferir("status CANCELADA", f3.cancelada);
  conferir("parcelas canceladas", f3.parcelas.every((p) => !p.paga));
  const saldo3 = await prisma.movimentoEstoque.aggregate({ where: { pecaId }, _sum: { delta: true } });
  conferir("estoque voltou ao original (10)", saldo3._sum.delta === 10, String(saldo3._sum.delta));
}

main()
  .catch((e) => {
    falhou++;
    console.error("\nERRO:", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    console.log("\n=== LIMPEZA ===");
    try {
      if (vendaId) {
        await prisma.conta.deleteMany({ where: { vendaId } });
        await prisma.pagamento.deleteMany({ where: { vendaId } });
        await prisma.itemVenda.deleteMany({ where: { vendaId } });
        await prisma.venda.delete({ where: { id: vendaId } });
        console.log("  venda removida");
      }
      if (pecaId) {
        await prisma.movimentoEstoque.deleteMany({ where: { pecaId } });
        await prisma.peca.delete({ where: { id: pecaId } });
        console.log("  peça removida");
      }
    } catch (e) {
      console.log("  limpeza falhou:", e instanceof Error ? e.message : e);
    }
    await prisma.$disconnect();
    console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
    process.exitCode = falhou === 0 ? 0 : 1;
  });
