import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { buscarOrcamento, temCusto } from "@/modules/orcamentos/orcamento.service";
import { FORMAS } from "@/modules/vendas/venda.service";
import { brl, data as fData } from "@/lib/formato";
import { Indicador, Indicadores, Pilula } from "@/components/padrao/indicadores";
import { AcoesOrcamento } from "@/modules/orcamentos/components/acoes-orcamento";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) return { title: "Orçamento · LaLolla" };
  try {
    const o = await buscarOrcamento(id, false);
    return { title: `Orçamento ${o.rotulo} · LaLolla` };
  } catch {
    return { title: "Orçamento · LaLolla" };
  }
}

const MODOS: Record<string, string> = {
  A_COMBINAR: "A combinar",
  A_VISTA: "À vista",
  PARCELADO: "Parcelado",
};

export default async function OrcamentoPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) notFound();

  const { id } = await params;
  const fin = veFinanceiro(sessao.data);

  let o;
  try {
    o = await buscarOrcamento(id, fin);
  } catch {
    notFound();
  }

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.vendas.criar,
    editar: admin || sessao.data.permissoes.vendas.editar,
    excluir: admin || sessao.data.permissoes.vendas.excluir,
  };

  const rotuloForma = (f: string | null) =>
    f ? (FORMAS.find(([v]) => v === f)?.[1] ?? f) : "—";

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link
        href="/vendas?aba=orcamentos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Orçamentos
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Orçamento {o.rotulo}</h1>
            {o.status === "ABERTO" && !o.vencido && <Pilula tom="accent">em aberto</Pilula>}
            {o.vencido && <Pilula tom="due">vencido</Pilula>}
            {o.status === "CONVERTIDO" && <Pilula>aprovado</Pilula>}
            {o.status === "RECUSADO" && <Pilula>recusado</Pilula>}
            {o.status === "SUBSTITUIDO" && <Pilula>substituído</Pilula>}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {fData(o.data)}
            {o.cliente ? ` · ${o.cliente.nome}` : " · sem cliente"}
          </p>
        </div>

        <AcoesOrcamento
          orcamento={{
            id: o.id,
            rotulo: o.rotulo,
            status: o.status,
            vencido: o.vencido,
            vendaId: o.vendaId,
            substituidoPor: o.substituidoPor,
            itens: o.itens.length,
          }}
          pode={pode}
        />
      </div>

      {/* ── faixas de contexto: só aparecem quando há o que avisar ── */}
      {o.revisaoDe && (
        <p className="mt-4 rounded-xl border bg-(--ll-surface-2) px-4 py-3 text-sm">
          Esta é a revisão do orçamento Nº {String(o.revisaoDe.numero).padStart(4, "0")}.{" "}
          <Link href={`/orcamentos/${o.revisaoDe.id}`} className="font-medium underline">
            Ver o anterior
          </Link>
        </p>
      )}
      {o.substituidoPor && (
        <p className="mt-4 rounded-xl border bg-(--ll-surface-2) px-4 py-3 text-sm">
          Substituído pelo orçamento Nº {String(o.substituidoPor.numero).padStart(4, "0")}.{" "}
          <Link href={`/orcamentos/${o.substituidoPor.id}`} className="font-medium underline">
            Abrir a revisão
          </Link>
        </p>
      )}
      {o.status === "CONVERTIDO" && o.vendaId && (
        <p className="mt-4 rounded-xl border bg-(--ll-surface-2) px-4 py-3 text-sm">
          A cliente aprovou e isto virou venda. As peças saíram do estoque na venda —{" "}
          <Link href={`/vendas/${o.vendaId}`} className="font-medium underline">
            abrir a venda
          </Link>
          .
        </p>
      )}
      {o.vencido && (
        <p className="mt-4 rounded-xl border border-(--ll-danger)/30 bg-(--ll-danger-soft) px-4 py-3 text-sm">
          A validade acabou em {fData(o.validoAte)}. As peças <strong>não estão mais
          reservadas</strong>. Dá para converter assim mesmo, ou criar uma revisão com preço novo.
        </p>
      )}

      <div className="mt-5">
        <Indicadores>
          <Indicador titulo="Total" valor={brl(o.total)} sub={`${o.itens.length} peças`} />
          <Indicador
            titulo="Validade"
            valor={o.validoAte ? fData(o.validoAte) : "—"}
            sub={
              o.status !== "ABERTO"
                ? "encerrado"
                : o.vencido
                  ? "venceu"
                  : o.diasParaVencer === 0
                    ? "vence hoje"
                    : `faltam ${o.diasParaVencer} dia${o.diasParaVencer === 1 ? "" : "s"}`
            }
            tom={o.vencido ? "neg" : o.status === "ABERTO" ? "accent" : "neutro"}
          />
          <Indicador
            titulo="Pagamento"
            valor={MODOS[o.modoPagamento] ?? "—"}
            sub={
              o.modoPagamento === "PARCELADO"
                ? `${o.parcelas}× · ${rotuloForma(o.formaPagamento)}`
                : o.modoPagamento === "A_VISTA"
                  ? rotuloForma(o.formaPagamento)
                  : "nada sai no PDF"
            }
          />
          {temCusto(o) && (
            <Indicador
              titulo="Margem estimada"
              valor={o.margem === null ? "—" : `${o.margem.toFixed(1).replace(".", ",")}%`}
              sub={`custo de hoje: ${brl(o.custo)}`}
              tom={o.margem !== null && o.margem < 0 ? "neg" : "neutro"}
            />
          )}
        </Indicadores>
      </div>

      {/* ── itens ── */}
      <section className="mt-4 rounded-xl border bg-card">
        <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Peças da proposta
        </h2>
        <ul className="divide-y">
          {o.itens.map((i) => (
            <li key={i.id} className="flex items-center gap-3 px-4 py-3">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {i.sku}
                  {i.tamanho ? ` · tam. ${i.tamanho}` : ""} · {i.quantidade} × {brl(i.precoUnit)}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(i.total)}</span>
            </li>
          ))}
        </ul>

        <div className="space-y-1.5 border-t px-4 py-3 text-sm">
          <div className="flex justify-between">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{brl(o.subtotal)}</span>
          </div>
          {o.desconto > 0 && (
            <div className="flex justify-between">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums text-(--ll-ok)">− {brl(o.desconto)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-1.5 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{brl(o.total)}</span>
          </div>
        </div>
      </section>

      {o.observacao && (
        <section className="mt-4 rounded-xl border bg-card p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Observação
          </h2>
          <p className="mt-1.5 whitespace-pre-wrap text-sm">{o.observacao}</p>
        </section>
      )}

      {/* A reserva é o efeito menos óbvio do orçamento; dizer isso na ficha
          evita a pergunta "por que essa peça aparece reservada no estoque?". */}
      {o.status === "ABERTO" && !o.vencido && (
        <p className="mt-4 text-sm text-muted-foreground">
          Enquanto este orçamento estiver em aberto e dentro da validade, estas peças aparecem
          como <strong>reservadas</strong> no Estoque. Elas não saíram da prateleira — o app só
          avisa, se alguém for vender uma delas para outra pessoa.
        </p>
      )}
    </main>
  );
}
