import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/guard";
import { buscarCompra } from "@/modules/compras/compra.service";
import { brl, data as fData, dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Indicador, Pilula } from "@/components/padrao/indicadores";

export const runtime = "nodejs";

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return { title: "Compra · LaLolla" };
  try {
    const c = await buscarCompra(id);
    return { title: `Compra #${c.numero} · LaLolla` };
  } catch {
    return { title: "Compra · LaLolla" };
  }
}

export default async function CompraPage({ params }: { params: Promise<{ id: string }> }) {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();

  const { id } = await params;
  let c;
  try {
    c = await buscarCompra(id);
  } catch {
    notFound();
  }

  const pago = c.total - c.saldo;

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <Link
        href="/compras"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Portal de compras
      </Link>

      <div className="mt-3">
        <div className="flex flex-wrap items-center gap-2">
          <h1 className="text-xl font-bold tracking-tight">Compra #{c.numero}</h1>
          {c.saldo > 0 ? <Pilula tom="due">a pagar</Pilula> : <Pilula>quitada</Pilula>}
          {!c.aPrazo && <Pilula>à vista</Pilula>}
        </div>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {dataHora(c.criadoEm)} · {c.fornecedor.nome}
        </p>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Indicador titulo="Total" valor={brl(c.total)} sub={`${c.itens.length} itens`} />
        <Indicador titulo="Unidades" valor={c.unidades} sub="entraram no estoque" />
        <Indicador titulo="Pago" valor={brl(pago)} sub={c.aPrazo ? "das parcelas" : "à vista"} />
        <Indicador
          titulo="Falta"
          valor={brl(c.saldo)}
          sub={c.saldo > 0 ? "ao fornecedor" : "nada a pagar"}
          tom={c.saldo > 0 ? "neg" : "neutro"}
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Itens
          </h2>
          <ul className="divide-y">
            {c.itens.map((i) => (
              <li key={i.id} className="flex items-center gap-3 px-4 py-2.5">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/estoque/${i.pecaId}`}
                    className="block truncate text-sm font-medium hover:underline"
                  >
                    {i.nome}
                    {i.insumo && (
                      <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                        insumo
                      </span>
                    )}
                  </Link>
                  <span className="block truncate text-xs text-muted-foreground">
                    {i.sku} · {i.quantidade} × {brl(i.custoUnit)}
                  </span>
                </span>
                <span className="shrink-0 text-sm font-medium tabular-nums">
                  {brl(i.custoUnit * i.quantidade)}
                </span>
              </li>
            ))}
          </ul>

          <div className="flex items-baseline justify-between border-t px-4 py-3">
            <span className="font-semibold">Total</span>
            <span className="text-lg font-bold tabular-nums">{brl(c.total)}</span>
          </div>

          {c.observacao && (
            <p className="border-t px-4 py-3 text-sm text-muted-foreground">{c.observacao}</p>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {c.aPrazo ? "Parcelas" : "Pagamento"}
          </h2>
          {c.parcelas.length > 0 ? (
            <ul className="divide-y">
              {c.parcelas.map((p) => (
                <li key={p.id} className="flex items-center gap-2 px-4 py-2.5">
                  <span className="min-w-0 flex-1">
                    <span className="block text-sm font-medium">
                      {p.numero && p.de ? `${p.numero}/${p.de}` : "Parcela única"}
                    </span>
                    <span className="block text-xs text-muted-foreground">
                      vence {fData(p.vencimento)}
                    </span>
                  </span>
                  {p.paga ? (
                    <Pilula>paga</Pilula>
                  ) : (
                    p.vencimento < new Date() && <Pilula tom="due">vencida</Pilula>
                  )}
                  <span
                    className={cn(
                      "shrink-0 text-sm font-medium tabular-nums",
                      p.paga && "text-muted-foreground line-through",
                    )}
                  >
                    {brl(p.valor)}
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <div className="px-4 py-6">
              <p className="text-sm">Pago à vista</p>
              <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                O valor saiu da carteira no momento da compra e aparece no extrato do caixa como
                Mercadoria.
              </p>
            </div>
          )}

          <p className="border-t px-4 py-3 text-xs leading-relaxed text-muted-foreground">
            O estoque de cada item já entrou por movimento, e o custo das peças foi atualizado com
            o que foi pago aqui.
          </p>
        </section>
      </div>
    </main>
  );
}
