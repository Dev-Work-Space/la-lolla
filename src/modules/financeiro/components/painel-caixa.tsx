import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { brl, dataHora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Lista, Vazio } from "@/components/padrao/indicadores";
import { movimentoDoPeriodo, type CarteiraSaldo } from "../financeiro.service";
import { FormLancamento } from "./form-lancamento";
import { FormTransferencia } from "./form-transferencia";
import { PeriodoCaixa } from "./periodo-caixa";

/*
 * O extrato. Lançamentos, pagamentos de venda e transferências na MESMA linha
 * do tempo.
 *
 * No app antigo os três viviam em listas separadas e o João tinha de somar de
 * cabeça para saber o que entrou no dia. Aqui a pergunta "o que aconteceu com
 * o dinheiro hoje?" tem uma resposta só.
 */
export async function PainelCaixa({
  de,
  ate,
  carteiras,
  pode,
}: {
  de?: string;
  ate?: string;
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const hoje = new Date();
  const inicioPadrao = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const dtDe = de ? new Date(de + "T00:00:00") : inicioPadrao;
  const dtAte = ate ? new Date(ate + "T23:59:59") : new Date(hoje.setHours(23, 59, 59, 999));

  const linhas = await movimentoDoPeriodo(dtDe, dtAte);

  const entrou = linhas.filter((l) => l.tipo === "entrada" && l.origem !== "transferencia");
  const saiu = linhas.filter((l) => l.tipo === "saida" && l.origem !== "transferencia");
  const totalEntrou = entrou.reduce((s, l) => s + l.valor, 0);
  const totalSaiu = saiu.reduce((s, l) => s + l.valor, 0);

  return (
    <div className="ll-entra space-y-4">
      {pode.criar && (
        <div className="flex flex-wrap gap-2">
          <FormLancamento tipo="entrada" carteiras={carteiras} />
          <FormLancamento tipo="saida" carteiras={carteiras} />
          {carteiras.length > 1 && <FormTransferencia carteiras={carteiras} />}
        </div>
      )}

      <PeriodoCaixa
        de={dtDe.toISOString().slice(0, 10)}
        ate={dtAte.toISOString().slice(0, 10)}
      />

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-lg border bg-card p-3">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Entrou
          </p>
          <p className="mt-1 overflow-hidden whitespace-nowrap text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {brl(totalEntrou)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Saiu
          </p>
          <p className="mt-1 overflow-hidden whitespace-nowrap text-lg font-bold tabular-nums text-destructive">
            {brl(totalSaiu)}
          </p>
        </div>
        <div className="rounded-lg border bg-card p-3">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Sobrou
          </p>
          <p
            className={cn(
              "mt-1 overflow-hidden whitespace-nowrap text-lg font-bold tabular-nums",
              totalEntrou - totalSaiu < 0 && "text-destructive",
            )}
          >
            {brl(totalEntrou - totalSaiu)}
          </p>
        </div>
      </div>

      <Lista>
        {linhas.length > 0 ? (
          linhas.map((l) => {
            const Icone =
              l.origem === "transferencia"
                ? ArrowLeftRight
                : l.tipo === "entrada"
                  ? ArrowDownRight
                  : ArrowUpRight;

            const corpo = (
              <>
                <span
                  className={cn(
                    "grid size-8 shrink-0 place-items-center rounded-full",
                    l.origem === "transferencia"
                      ? "bg-muted text-muted-foreground"
                      : l.tipo === "entrada"
                        ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
                        : "bg-destructive/10 text-destructive",
                  )}
                >
                  <Icone className="size-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{l.descricao}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {dataHora(l.quando)}
                    {l.categoria ? ` · ${l.categoria}` : ""}
                    {l.carteira ? ` · ${l.carteira}` : " · sem carteira"}
                  </span>
                </span>
                <span
                  className={cn(
                    "shrink-0 text-sm font-semibold tabular-nums",
                    l.origem === "transferencia"
                      ? "text-muted-foreground"
                      : l.tipo === "entrada"
                        ? "text-emerald-700 dark:text-emerald-400"
                        : "text-destructive",
                  )}
                >
                  {l.origem === "transferencia" ? "" : l.tipo === "entrada" ? "+ " : "− "}
                  {brl(l.valor)}
                </span>
              </>
            );

            return l.href ? (
              <Link
                key={l.origem + l.id}
                href={l.href}
                className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40"
              >
                {corpo}
              </Link>
            ) : (
              <div key={l.origem + l.id} className="flex items-center gap-3 px-3 py-2.5">
                {corpo}
              </div>
            );
          })
        ) : (
          <Vazio texto="Nenhum movimento neste período." />
        )}
      </Lista>
    </div>
  );
}
