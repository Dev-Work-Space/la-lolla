import Link from "next/link";
import { CreditCard } from "lucide-react";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { faturaDoCartao } from "../cartao.service";
import type { CarteiraSaldo, CartaoResumo } from "../financeiro.tipos";
import { ComprarNoCartao } from "./comprar-no-cartao";
import { FormCartao } from "./form-cartao";
import { PagarFatura } from "./pagar-fatura";

/*
 * Os cartões no CAIXA, em versão curta.
 *
 * No app antigo o cartão morava na tela do caixa, junto das carteiras — e faz
 * sentido: quem abre o Financeiro para ver dinheiro quer ver também quanto
 * ainda dá para gastar e qual fatura está vindo. A ficha completa (barra de
 * limite, validade, editar) continua na aba Carteiras; aqui fica o que se
 * consulta de relance e as duas ações do dia a dia.
 */
export async function ResumoCartoes({
  cartoes,
  carteiras,
  pode,
}: {
  cartoes: CartaoResumo[];
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  if (cartoes.length === 0) {
    if (!pode.criar) return null;
    return (
      <section className="rounded-xl border border-dashed bg-card p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-semibold">Cartão de crédito</p>
            <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
              Cadastre com o limite e o dia do vencimento. Cada compra vira conta a pagar na fatura
              certa — e nada sai do caixa até você pagar a fatura.
            </p>
          </div>
          <FormCartao rotulo="Cadastrar cartão" />
        </div>
      </section>
    );
  }

  const faturas = await Promise.all(
    cartoes.map(async (c) =>
      c.proximaFatura ? await faturaDoCartao(c.id, c.proximaFatura.vencimento) : [],
    ),
  );

  return (
    <section className="rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Cartões de crédito
        </h2>
        <Link
          href="/financeiro?aba=carteiras"
          className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          ver detalhes
        </Link>
      </div>

      <ul className="divide-y">
        {cartoes.map((c, ix) => (
          <li key={c.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
            <span className="grid size-8 shrink-0 place-items-center rounded-full bg-muted text-muted-foreground">
              <CreditCard className="size-4" aria-hidden />
            </span>

            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{c.nome}</span>
              <span className="block truncate text-xs text-muted-foreground">
                {c.proximaFatura
                  ? `fatura de ${brl(c.proximaFatura.total)} vence ${fData(c.proximaFatura.vencimento)}`
                  : "nenhuma fatura em aberto"}
              </span>
            </span>

            <span className="shrink-0 text-right">
              <span
                className={cn(
                  "block text-sm font-semibold tabular-nums",
                  c.disponivel > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                )}
              >
                {brl(c.disponivel)}
              </span>
              <span className="block text-[10px] uppercase tracking-wide text-muted-foreground">
                livre de {brl(c.limite)}
              </span>
            </span>

            <span className="flex shrink-0 gap-2">
              {pode.criar && <ComprarNoCartao cartoes={cartoes} cartaoId={c.id} />}
              {pode.editar && c.proximaFatura && (
                <PagarFatura
                  cartaoId={c.id}
                  cartaoNome={c.nome}
                  vencimento={c.proximaFatura.vencimento}
                  total={c.proximaFatura.total}
                  itens={faturas[ix]}
                  carteiras={carteiras}
                  variante="outline"
                />
              )}
            </span>
          </li>
        ))}
      </ul>

      {pode.criar && (
        <div className="border-t px-4 py-3">
          <FormCartao rotulo="Novo cartão" />
        </div>
      )}
    </section>
  );
}
