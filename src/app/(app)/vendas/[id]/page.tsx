import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { buscarVenda, FORMAS } from "@/modules/vendas/venda.service";
import { brl, data as fData, dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Indicador, Pilula } from "@/components/padrao/indicadores";
import { AcoesVenda, RemoverRecebimento } from "@/modules/vendas/components/acoes-venda";
import { EmitirRecibo } from "@/modules/vendas/components/emitir-recibo";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) return { title: "Venda · LaLolla" };
  try {
    const v = await buscarVenda(id, false);
    return { title: `Venda #${v.numero} · LaLolla` };
  } catch {
    return { title: "Venda · LaLolla" };
  }
}

export default async function VendaPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) notFound();

  const { id } = await params;
  const fin = veFinanceiro(sessao.data);

  let v;
  try {
    v = await buscarVenda(id, fin);
  } catch {
    notFound();
  }

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    editar: admin || sessao.data.permissoes.vendas.editar,
    cancelar: admin || sessao.data.permissoes.vendas.excluir,
  };

  const rotuloForma = (f: string) => FORMAS.find(([v]) => v === f)?.[1] ?? f;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link
        href="/vendas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Portal de vendas
      </Link>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold tracking-tight">Venda #{v.numero}</h1>
            {v.cancelada && <Pilula tom="due">cancelada</Pilula>}
            {!v.cancelada && v.saldo > 0 && <Pilula tom="due">a receber</Pilula>}
            {!v.cancelada && v.comprovantesPendentes > 0 && (
              <Pilula tom="accent">sem comprovante</Pilula>
            )}
          </div>
          <p className="mt-0.5 text-sm text-muted-foreground">
            {dataHora(v.data)}
            {v.cliente ? ` · ${v.cliente.nome}` : " · sem cliente"}
            {v.vendedor ? ` · atendeu ${v.vendedor.nome}` : ""}
          </p>
        </div>

        {!v.cancelada && (
          <div className="flex flex-wrap items-start gap-2">
            <EmitirRecibo
              venda={{
                numero: v.numero,
                data: v.data,
                cliente: v.cliente
                  ? {
                      nome: v.cliente.nome,
                      tipo: v.cliente.tipo,
                      doc: v.cliente.doc,
                      telefone: v.cliente.telefone,
                      cidade: v.cliente.cidade,
                      uf: v.cliente.uf,
                    }
                  : null,
                itens: v.itens.map((i) => ({
                  nome: i.nome,
                  sku: i.sku,
                  tamanho: i.tamanho,
                  /* O que voltou não está mais na compra: o recibo mostra o que
                     a cliente levou de fato. */
                  quantidade: i.quantidade - i.devolvido,
                  precoUnit: i.precoUnit,
                })),
                subtotal: v.subtotal,
                desconto: v.desconto,
                devolvido: v.devolvido,
                total: v.total,
                pago: v.pago,
                saldo: v.saldo,
                pagamentos: v.pagamentos.map((p) => ({
                  data: p.data,
                  forma: p.forma,
                  valor: p.valor,
                })),
                parcelas: v.parcelas
                  .filter((c) => !c.paga)
                  .map((c) => ({ numero: c.numero, vencimento: c.vencimento, valor: c.valor })),
              }}
            />
            <AcoesVenda
            vendaId={v.id}
            numero={v.numero}
            saldo={v.saldo}
            pode={pode}
            itens={v.itens.map((i) => ({
              id: i.id,
              nome: i.nome,
              podeVoltar: i.quantidade - i.devolvido,
              precoUnit: i.precoUnit,
            }))}
              temDevolucao={v.devolucoes.length > 0}
            />
          </div>
        )}
      </div>

      {v.cancelada && (
        <div className="mt-4 rounded-lg border border-destructive/40 bg-destructive/5 px-4 py-3">
          <p className="text-sm font-medium text-destructive">
            Cancelada em {fData(v.canceladaEm)}
          </p>
          {v.motivoCancelada && (
            <p className="mt-0.5 text-sm text-muted-foreground">{v.motivoCancelada}</p>
          )}
          <p className="mt-1.5 text-xs text-muted-foreground">
            O registro fica no histórico, mas não entra em nenhum cálculo de dinheiro. As peças
            voltaram ao estoque.
          </p>
        </div>
      )}

      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador titulo="Total" valor={brl(v.total)} sub={`${v.itens.length} itens`} />
        <Indicador titulo="Pago" valor={brl(v.pago)} sub={v.quitada ? "quitada" : "parcial"} />
        <Indicador
          titulo="Falta"
          valor={brl(v.saldo)}
          sub={v.saldo > 0 ? `${v.parcelas.length} parcelas` : "nada a receber"}
          tom={v.saldo > 0 ? "neg" : "neutro"}
        />
        {fin && "custo" in v ? (
          <Indicador
            titulo="Margem"
            valor={v.margem === null ? "—" : `${v.margem.toFixed(1).replace(".", ",")}%`}
            sub={`custo ${brl(v.custo)}`}
          />
        ) : (
          <Indicador titulo="Desconto" valor={brl(v.desconto)} sub="concedido" />
        )}
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Peças
          </h2>
          <ul className="divide-y">
            {v.itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">
                    {i.nome}
                    {i.devolvido > 0 && (
                      <span className="ml-1.5 text-xs font-normal text-destructive">
                        {i.devolvido} devolvida{i.devolvido === 1 ? "" : "s"}
                      </span>
                    )}
                  </span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.sku}
                    {i.serie ? ` · ${i.serie}` : ""} · {i.quantidade} × {brl(i.precoUnit)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {brl(i.precoUnit * (i.quantidade - i.devolvido))}
                </span>
              </li>
            ))}
          </ul>

          <dl className="space-y-1.5 border-t px-4 py-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{brl(v.subtotal)}</dd>
            </div>
            {v.desconto > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Desconto</dt>
                <dd className="tabular-nums text-destructive">− {brl(v.desconto)}</dd>
              </div>
            )}
            {v.devolvido > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Devolvido</dt>
                <dd className="tabular-nums text-destructive">− {brl(v.devolvido)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-lg font-bold tabular-nums">{brl(v.total)}</dd>
            </div>
          </dl>

          {/*
            A embalagem fica embaixo das peças, e só para quem vê financeiro:
            é custo. Aparece aqui porque a margem lá em cima já a desconta —
            sem a lista, o número em cima pareceria errado.
          */}
          {fin && "insumos" in v && v.insumos.length > 0 && (
            <div className="border-t px-4 py-3">
              <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Embalagem e insumos
              </h3>
              <ul className="mt-2 space-y-1">
                {v.insumos.map((i) => (
                  <li key={i.id} className="flex justify-between text-sm">
                    <span className="min-w-0 truncate text-muted-foreground">
                      {i.nome} · {i.quantidade} × {brl(i.custoUnit)}
                    </span>
                    <span className="shrink-0 tabular-nums">
                      {brl(i.custoUnit * i.quantidade)}
                    </span>
                  </li>
                ))}
              </ul>
              <div className="mt-2 flex justify-between border-t pt-2 text-sm">
                <span className="font-medium">Custo de embalagem</span>
                <span className="font-semibold tabular-nums">{brl(v.custoInsumos)}</span>
              </div>
            </div>
          )}

          {v.observacao && (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">{v.observacao}</p>
          )}
        </section>

        <div className="space-y-4">
          <section className="rounded-xl border bg-card">
            <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Pagamentos
            </h2>
            {v.pagamentos.length > 0 ? (
              <ul className="divide-y">
                {v.pagamentos.map((p) => (
                  <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{rotuloForma(p.forma)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {fData(p.data)}
                      </span>
                    </span>
                    {p.precisaComprovante && !p.temComprovante && (
                      <Pilula tom="accent">sem comprovante</Pilula>
                    )}
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {brl(p.valor)}
                    </span>
                    {pode.cancelar && !v.cancelada && (
                      <RemoverRecebimento
                        pagamentoId={p.id}
                        valor={p.valor}
                        forma={rotuloForma(p.forma)}
                      />
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="px-4 py-6 text-center text-sm text-muted-foreground">
                Nenhum pagamento registrado.
              </p>
            )}
          </section>

          {v.devolucoes.length > 0 && (
            <section className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Devoluções
              </h2>
              <ul className="divide-y">
                {v.devolucoes.map((d) => (
                  <li key={d.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">{brl(d.total)}</span>
                      <span className="block text-xs text-muted-foreground">
                        {fData(d.data)} ·{" "}
                        {d.resolucao === "DEVOLVER" ? "valor devolvido" : "abatido do saldo"}
                        {d.motivo ? ` · ${d.motivo}` : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs text-muted-foreground">{d.pecas} pç</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          {v.parcelas.length > 0 && (
            <section className="rounded-xl border bg-card">
              <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Parcelas
              </h2>
              <ul className="divide-y">
                {v.parcelas.map((c) => (
                  <li key={c.id} className="flex items-center gap-2 px-4 py-2.5">
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-medium">
                        {c.numero}/{c.de}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        vence {fData(c.vencimento)}
                      </span>
                    </span>
                    {c.paga ? (
                      <Pilula>paga</Pilula>
                    ) : (
                      c.vencimento < new Date() && <Pilula tom="due">vencida</Pilula>
                    )}
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        c.paga && "text-muted-foreground line-through",
                      )}
                    >
                      {brl(c.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </main>
  );
}
