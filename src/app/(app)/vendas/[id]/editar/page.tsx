import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { campoDaData } from "@/lib/dia";
import { prisma } from "@/lib/prisma";
import { saldoDasPecas } from "@/modules/pecas/catalogo.service";
import { buscarVenda } from "@/modules/vendas/venda.service";
import { NovaVenda, type VendaParaEditar } from "@/modules/vendas/components/nova-venda";

export const runtime = "nodejs";
export const metadata = { title: "Editar venda · LaLolla" };

export default async function EditarVendaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) notFound();

  const { id } = await params;

  let v;
  try {
    v = await buscarVenda(id, veFinanceiro(sessao.data));
  } catch {
    notFound();
  }

  /* Cancelada não se edita, e venda com devolução também não: a devolução já
     mexeu no item, no estoque e no caixa. A ficha é que explica isso — chegar
     até o formulário para só então ser recusado é perder o trabalho digitado. */
  if (v.cancelada || v.devolucoes.length > 0) redirect(`/vendas/${v.id}`);

  const saldos = await saldoDasPecas(v.itens.map((i) => i.pecaId));

  /*
   * A embalagem não vem em `buscarVenda` para quem não vê financeiro (é
   * custo), mas a edição precisa dela: salvar sem os insumos os apagaria da
   * venda sem ninguém pedir. Por isso vem daqui, só com peça e quantidade —
   * sem o custo, que continua sendo assunto de quem vê financeiro.
   */
  const insumos = await prisma.insumoVenda.findMany({
    where: { vendaId: v.id },
    select: { pecaId: true, quantidade: true },
  });

  const edicao: VendaParaEditar = {
    id: v.id,
    numero: v.numero,
    clienteId: v.cliente?.id ?? null,
    data: campoDaData(v.data),
    desconto: v.desconto,
    subtotal: v.subtotal,
    observacao: v.observacao,
    pago: v.pago,
    itens: v.itens.map((i) => ({
      pecaId: i.pecaId,
      sku: i.sku,
      nome: i.nome,
      tamanho: i.tamanho,
      quantidade: i.quantidade,
      precoUnit: i.precoUnit,
      /* O saldo que a tela mostra já soma de volta o que ESTA venda tirou:
         na edição as peças voltam ao estoque antes de sair de novo, então
         elas estão disponíveis. Sem isso, editar uma venda que zerou o
         estoque acusaria falta da própria peça que ela vendeu. */
      saldo: (saldos.get(i.pecaId) ?? 0) + i.quantidade,
    })),
    insumos: insumos.map((i) => ({ pecaId: i.pecaId, quantidade: i.quantidade })),
  };

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href={`/vendas/${v.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Venda #{v.numero}
      </Link>
      <h1 className="mb-5 mt-3 text-xl font-bold tracking-tight">Editar a venda #{v.numero}</h1>
      <NovaVenda edicao={edicao} />
    </main>
  );
}
