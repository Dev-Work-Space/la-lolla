import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { campoDaData } from "@/lib/dia";
import { buscarOrcamento } from "@/modules/orcamentos/orcamento.service";
import { saldoDasPecas } from "@/modules/pecas/catalogo.service";
import { NovaVenda, type VendaDeOrcamento } from "@/modules/vendas/components/nova-venda";

export const runtime = "nodejs";
export const metadata = { title: "Nova venda · LaLolla" };

export default async function NovaVendaPage({
  searchParams,
}: {
  searchParams: Promise<{ orcamento?: string }>;
}) {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) notFound();

  const { orcamento: orcamentoId } = await searchParams;

  let deOrcamento: VendaDeOrcamento | undefined;
  if (orcamentoId) {
    let o;
    try {
      o = await buscarOrcamento(orcamentoId, veFinanceiro(sessao.data));
    } catch {
      notFound();
    }
    /* Já convertido ou substituído: a tela de fechamento não é o lugar de
       descobrir isso. A ficha explica o que aconteceu e oferece o caminho. */
    if (o.travado) redirect(`/orcamentos/${o.id}`);

    const saldos = await saldoDasPecas(o.itens.map((i) => i.pecaId));
    deOrcamento = {
      id: o.id,
      rotulo: o.rotulo,
      clienteId: o.cliente?.id ?? null,
      clienteNome: o.cliente?.nome ?? null,
      desconto: o.desconto,
      subtotal: o.subtotal,
      parcelas: o.parcelas,
      primeiroVencimento: o.primeiroVencimento ? campoDaData(o.primeiroVencimento) : null,
      itens: o.itens.map((i) => ({
        pecaId: i.pecaId,
        sku: i.sku,
        nome: i.nome,
        tamanho: i.tamanho,
        quantidade: i.quantidade,
        precoUnit: i.precoUnit,
        saldo: saldos.get(i.pecaId) ?? 0,
      })),
    };
  }

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href={deOrcamento ? `/orcamentos/${deOrcamento.id}` : "/vendas"}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        {deOrcamento ? `Orçamento ${deOrcamento.rotulo}` : "Portal de vendas"}
      </Link>
      <h1 className="mb-5 mt-3 text-xl font-bold tracking-tight">
        {deOrcamento ? "Fechar a venda do orçamento" : "Nova venda"}
      </h1>
      <NovaVenda orcamento={deOrcamento} />
    </main>
  );
}
