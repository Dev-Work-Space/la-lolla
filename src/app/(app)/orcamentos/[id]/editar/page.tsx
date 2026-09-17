import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { buscarOrcamento } from "@/modules/orcamentos/orcamento.service";
import { campoDaData } from "@/lib/dia";
import { EditorOrcamento } from "@/modules/orcamentos/components/editor-orcamento";

export const runtime = "nodejs";
export const metadata = { title: "Editar orçamento · LaLolla" };

export default async function EditarOrcamentoPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) notFound();

  const { id } = await params;

  let o;
  try {
    o = await buscarOrcamento(id, veFinanceiro(sessao.data));
  } catch {
    notFound();
  }

  /* Aprovado e substituído não se editam. A ficha explica o porquê e oferece
     o caminho certo; aqui só desviamos para lá, para a URL digitada à mão não
     abrir um formulário que nunca vai salvar. */
  if (o.travado) redirect(`/orcamentos/${o.id}`);

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href={`/orcamentos/${o.id}`}
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Orçamento {o.rotulo}
      </Link>
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">Editar {o.rotulo}</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        O número não muda. Se a cliente já recebeu o PDF, prefira <strong>Revisar</strong>: ali
        nasce um número novo e o papel antigo continua valendo o que dizia.
      </p>

      <EditorOrcamento
        orcamento={{
          id: o.id,
          numero: o.numero,
          clienteId: o.cliente?.id ?? null,
          data: campoDaData(o.data),
          validadeDias: o.validadeDias,
          desconto: o.desconto,
          subtotal: o.subtotal,
          observacao: o.observacao,
          modoPagamento: o.modoPagamento,
          formaPagamento: o.formaPagamento,
          parcelas: o.parcelas,
          primeiroVencimento: o.primeiroVencimento ? campoDaData(o.primeiroVencimento) : null,
          itens: o.itens.map((i) => ({
            pecaId: i.pecaId,
            sku: i.sku,
            nome: i.nome,
            tamanho: i.tamanho,
            saldo: null,
            quantidade: i.quantidade,
            precoUnit: i.precoUnit,
          })),
        }}
      />
    </main>
  );
}
