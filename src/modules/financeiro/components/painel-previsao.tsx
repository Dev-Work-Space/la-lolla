import Link from "next/link";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Indicador, Indicadores } from "@/components/padrao/indicadores";
import { previsao } from "../agenda.service";

/*
 * PREVISÃO — as próximas 12 semanas.
 *
 * Parte do saldo de hoje e vai somando o que já está combinado: parcelas a
 * receber e contas a pagar. Venda futura não entra, e isso está escrito na
 * tela — prever venda é chute, e chute no meio de um número de caixa
 * contamina a decisão que ele deveria ajudar a tomar.
 *
 * O aviso de caixa negativo é o motivo de a tela existir: ele aparece semanas
 * antes de o dinheiro faltar, que é quando ainda dá para antecipar um
 * recebimento ou renegociar um vencimento.
 */
export async function PainelPrevisao() {
  const p = await previsao(12);
  const maior = Math.max(1, ...p.linhas.map((l) => Math.max(l.entra, l.sai)));
  const temAlgo = p.linhas.some((l) => l.entra > 0 || l.sai > 0);
  const fim = p.linhas.at(-1)?.saldo ?? p.saldoHoje;

  return (
    <div className="ll-entra space-y-4">
      <Indicadores>
        <Indicador
          titulo="Saldo hoje"
          valor={brl(p.saldoHoje)}
          sub="caixa acumulado"
          tom={p.saldoHoje < 0 ? "neg" : "accent"}
        />
        <Indicador titulo="Entra em 90 dias" valor={brl(p.totalEntra)} sub="parcelas a receber" />
        <Indicador titulo="Sai em 90 dias" valor={brl(p.totalSai)} sub="contas a pagar" />
        <Indicador
          titulo="Saldo projetado"
          valor={brl(fim)}
          sub="ao fim do período"
          tom={fim < 0 ? "neg" : "accent"}
        />
      </Indicadores>

      {p.pior && (
        <p className="rounded-lg border border-(--ll-danger) bg-(--ll-danger-soft,transparent) px-4 py-3 text-sm">
          O caixa fica negativo na semana de{" "}
          <strong>{fData(p.pior.inicio)}</strong> ({brl(p.pior.saldo)}). Antecipe recebimentos ou
          renegocie um vencimento.
        </p>
      )}

      {(p.atrasadoReceber > 0 || p.atrasadoPagar > 0) && (
        <ul className="divide-y rounded-xl border bg-card">
          {p.atrasadoReceber > 0 && (
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--ll-danger)" />
              <Link href="/financeiro?aba=receber&filtro=vencidas" className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Recebimentos vencidos</span>
                <span className="block text-xs text-muted-foreground">
                  não entram na projeção abaixo
                </span>
              </Link>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {brl(p.atrasadoReceber)}
              </span>
            </li>
          )}
          {p.atrasadoPagar > 0 && (
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-amber-500" />
              <Link href="/financeiro?aba=pagar&filtro=vencidas" className="min-w-0 flex-1">
                <span className="block text-sm font-medium">Pagamentos vencidos</span>
                <span className="block text-xs text-muted-foreground">
                  não entram na projeção abaixo
                </span>
              </Link>
              <span className="shrink-0 text-sm font-medium tabular-nums">
                {brl(p.atrasadoPagar)}
              </span>
            </li>
          )}
        </ul>
      )}

      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Próximas 12 semanas
        </h2>

        {temAlgo ? (
          <>
            <div className="mt-3 flex h-28 items-end gap-1.5">
              {p.linhas.map((l) => (
                <span key={l.inicio.toISOString()} className="flex flex-1 flex-col items-center gap-1">
                  <span className="flex h-24 w-full items-end justify-center gap-0.5">
                    <i
                      aria-hidden
                      className="block w-1/3 rounded-t bg-emerald-600"
                      style={{ height: `${(l.entra / maior) * 100}%` }}
                    />
                    <i
                      aria-hidden
                      className="block w-1/3 rounded-t bg-(--ll-danger)"
                      style={{ height: `${(l.sai / maior) * 100}%` }}
                    />
                  </span>
                  <span className="text-[9px] tabular-nums text-muted-foreground">
                    {String(l.inicio.getDate()).padStart(2, "0")}/
                    {String(l.inicio.getMonth() + 1).padStart(2, "0")}
                  </span>
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2 rounded-sm bg-emerald-600" /> Entra
              </span>
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2 rounded-sm bg-(--ll-danger)" /> Sai
              </span>
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            Nada previsto para os próximos 90 dias.
          </p>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">Semana</th>
              <th className="px-4 py-2.5 text-right font-medium">Entra</th>
              <th className="px-4 py-2.5 text-right font-medium">Sai</th>
              <th className="px-4 py-2.5 text-right font-medium">Saldo</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {p.linhas.map((l) => (
              <tr key={l.inicio.toISOString()}>
                <td className="px-4 py-2 text-muted-foreground">
                  {fData(l.inicio)} a {fData(l.fim)}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    l.entra > 0 ? "text-emerald-700 dark:text-emerald-400" : "text-muted-foreground",
                  )}
                >
                  {l.entra > 0 ? brl(l.entra) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right tabular-nums",
                    l.sai > 0 ? "text-destructive" : "text-muted-foreground",
                  )}
                >
                  {l.sai > 0 ? brl(l.sai) : "—"}
                </td>
                <td
                  className={cn(
                    "px-4 py-2 text-right font-semibold tabular-nums",
                    l.saldo < 0 && "text-destructive",
                  )}
                >
                  {brl(l.saldo)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs leading-relaxed text-muted-foreground">
        A projeção parte do saldo de caixa de hoje e considera as parcelas a receber e as contas a
        pagar com vencimento no período. <strong>Vendas futuras não entram.</strong>
      </p>
    </div>
  );
}
