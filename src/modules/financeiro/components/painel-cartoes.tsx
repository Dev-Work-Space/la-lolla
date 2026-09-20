import { CreditCard } from "lucide-react";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { faturaDoCartao } from "../cartao.service";
import type { CarteiraSaldo, CartaoResumo } from "../financeiro.tipos";
import { ComprarNoCartao } from "./comprar-no-cartao";
import { FormCartao } from "./form-cartao";
import { PagarFatura } from "./pagar-fatura";

/*
 * Cartões de crédito.
 *
 * Fica embaixo das carteiras, como no app antigo, e com o mesmo aviso: limite
 * é quanto dá para gastar, não dinheiro em caixa. Por isso o cartão não entra
 * no "Em caixa" e não aparece em nenhum lugar onde se escolhe de onde o
 * dinheiro saiu.
 *
 * A barra colorida é o que se lê de longe: verde-ouro até 70% do limite,
 * âmbar até 90%, vermelho depois. Quem passa dos 90% precisa saber disso
 * antes de passar o cartão de novo.
 */
export async function PainelCartoes({
  cartoes,
  carteiras,
  pode,
}: {
  cartoes: CartaoResumo[];
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  if (cartoes.length === 0) {
    return (
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-sm font-semibold">Cartão de crédito</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
          Cadastre o cartão com o limite e o dia do vencimento. Cada compra no crédito vira uma
          conta a pagar na fatura certa, e aqui você vê quanto do limite ainda sobra.
        </p>
        {pode.criar && (
          <div className="mt-3">
            <FormCartao rotulo="Cadastrar cartão" />
          </div>
        )}
      </section>
    );
  }

  /* As compras de cada fatura em aberto, para o diálogo de pagamento mostrar
     o que tem dentro sem precisar de outra viagem ao servidor. */
  const faturas = await Promise.all(
    cartoes.map(async (c) =>
      c.proximaFatura ? await faturaDoCartao(c.id, c.proximaFatura.vencimento) : [],
    ),
  );

  const livre = cartoes.reduce((s, c) => s + c.disponivel, 0);

  return (
    <section className="space-y-3">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold">Cartões de crédito</h2>
        <span className="text-xs text-muted-foreground">{brl(livre)} livres</span>
      </div>
      <p className="text-xs text-muted-foreground">
        Limite é quanto dá para gastar, não dinheiro em caixa. A fatura vira conta a pagar no
        vencimento.
      </p>

      <div className="grid gap-3 lg:grid-cols-2">
        {cartoes.map((c, ix) => (
          <article key={c.id} className="rounded-xl border bg-card p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
                  <CreditCard className="size-4" aria-hidden />
                </span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{c.nome}</span>
                  <span className="block text-[11px] text-muted-foreground">
                    {c.diaVencimento ? `vence todo dia ${c.diaVencimento}` : "vencimento não definido"}
                    {c.validadeBR ? ` · válido até ${c.validadeBR}` : ""}
                  </span>
                </span>
              </div>
              {pode.editar && <FormCartao cartao={c} />}
            </div>

            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  c.pct >= 90
                    ? "bg-(--ll-danger)"
                    : c.pct >= 70
                      ? "bg-amber-500"
                      : "bg-(--ll-accent)",
                )}
                style={{ width: `${c.pct}%` }}
              />
            </div>

            <div className="mt-2 flex items-baseline justify-between gap-2 text-sm">
              <span className="text-xs text-muted-foreground">
                usado {brl(c.usado)} de {brl(c.limite)}
              </span>
              <span
                className={cn(
                  "font-semibold tabular-nums",
                  c.disponivel > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                )}
              >
                {brl(c.disponivel)} livres
              </span>
            </div>

            {c.vencido && (
              <p className="mt-3 rounded-lg border border-(--ll-danger) px-3 py-2 text-xs text-destructive">
                Cartão vencido em {c.validadeBR}.
              </p>
            )}
            {c.disponivel <= 0 && (
              <p className="mt-3 rounded-lg border border-dashed px-3 py-2 text-xs text-muted-foreground">
                Limite esgotado. Pague a fatura para liberar.
              </p>
            )}

            {c.proximaFatura ? (
              <div className="mt-3 flex items-baseline justify-between gap-2 border-t pt-2.5 text-sm">
                <span className="text-xs text-muted-foreground">
                  próxima fatura · vence {fData(c.proximaFatura.vencimento)}
                </span>
                <strong className="tabular-nums">{brl(c.proximaFatura.total)}</strong>
              </div>
            ) : (
              <p className="mt-3 border-t pt-2.5 text-xs text-muted-foreground">
                Nenhuma fatura em aberto.
              </p>
            )}

            <div className="mt-3 flex flex-wrap gap-2">
              {pode.criar && <ComprarNoCartao cartoes={cartoes} cartaoId={c.id} />}
              {pode.editar && c.proximaFatura && (
                <PagarFatura
                  cartaoId={c.id}
                  cartaoNome={c.nome}
                  vencimento={c.proximaFatura.vencimento}
                  total={c.proximaFatura.total}
                  itens={faturas[ix]}
                  carteiras={carteiras}
                />
              )}
            </div>
          </article>
        ))}
      </div>

      {pode.criar && <FormCartao rotulo="Novo cartão" />}
    </section>
  );
}
