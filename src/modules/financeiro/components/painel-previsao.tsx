import Link from "next/link";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Indicador, Indicadores } from "@/components/padrao/indicadores";
import { previsao } from "../agenda.service";
import { BaixarPlanilha } from "./filtros";
import { SaldoPrevisto } from "./painel-visao-geral";

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
/* Até onde olhar: de 1 mês a 1 ano. Por padrão 3 meses, por semana. */
const HORIZONTES = [
  ["1m", "1 mês", 1],
  ["3m", "3 meses", 3],
  ["6m", "6 meses", 6],
  ["12m", "1 ano", 12],
] as const;

export async function PainelPrevisao({ params }: { params: Record<string, string> }) {
  const horizonte = HORIZONTES.find(([h]) => h === params.horizonte) ?? HORIZONTES[1];
  const meses = horizonte[2];
  /* Um ano em semanas são 52 colunas: o padrão vira mês acima de 3 meses,
     mas a pessoa pode pedir semana mesmo assim. */
  const agrupar: "semana" | "mes" =
    params.agrupar === "semana" || params.agrupar === "mes" ? params.agrupar : meses > 3 ? "mes" : "semana";
  const p = await previsao(
    agrupar === "mes" ? { agrupar, meses } : { agrupar, semanas: Math.round(meses * 4.345) },
  );
  const temAlgo = p.linhas.some((l) => l.entra > 0 || l.sai > 0);
  const fim = p.linhas.at(-1)?.saldo ?? p.saldoHoje;
  const rotuloHorizonte = horizonte[1];

  const link = (mudanca: Record<string, string>) => {
    const q = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) q.set(k, v);
    return `/financeiro?${q.toString()}`;
  };

  return (
    <div className="ll-entra space-y-4">
      <div className="flex flex-wrap items-end gap-3 rounded-xl border bg-card p-3">
        <Escolha
          rotulo="Olhar até"
          opcoes={HORIZONTES.map(([h, r]) => [r, link({ horizonte: h }), h === horizonte[0]] as [string, string, boolean])}
        />
        <Escolha
          rotulo="Agrupar por"
          opcoes={[
            ["Semana", link({ agrupar: "semana" }), agrupar === "semana"],
            ["Mês", link({ agrupar: "mes" }), agrupar === "mes"],
          ]}
        />
        <BaixarPlanilha
          nome={`previsao-${rotuloHorizonte.replace(/\s+/g, "-")}-por-${agrupar}`}
          colunas={[agrupar === "mes" ? "Mês" : "Semana", "Entra", "Sai", "Saldo previsto"]}
          linhas={p.linhas.map((l) => [`${fData(l.inicio)} a ${fData(l.fim)}`, l.entra, l.sai, l.saldo])}
        />
      </div>

      <Indicadores>
        <Indicador
          titulo="Saldo hoje"
          valor={brl(p.saldoHoje)}
          sub="caixa acumulado"
          tom={p.saldoHoje < 0 ? "neg" : "accent"}
        />
        <Indicador titulo={`Entra em ${rotuloHorizonte}`} valor={brl(p.totalEntra)} sub="parcelas a receber" />
        <Indicador titulo={`Sai em ${rotuloHorizonte}`} valor={brl(p.totalSai)} sub="contas a pagar" />
        <Indicador
          titulo="Saldo projetado"
          valor={brl(fim)}
          sub="ao fim do período"
          tom={fim < 0 ? "neg" : "accent"}
        />
      </Indicadores>

      {p.pior && (
        <p className="rounded-lg border border-(--ll-danger) bg-(--ll-danger-soft,transparent) px-4 py-3 text-sm">
          O caixa fica negativo {agrupar === "mes" ? "no período que começa em" : "na semana de"}{" "}
          <strong>{fData(p.pior.inicio)}</strong> ({brl(p.pior.saldo)}). Antecipe recebimentos ou
          renegocie um vencimento.
        </p>
      )}

      {(p.atrasadoReceber > 0 || p.atrasadoPagar > 0) && (
        <ul className="divide-y rounded-xl border bg-card">
          {p.atrasadoReceber > 0 && (
            <li className="flex items-center gap-3 px-4 py-2.5">
              <span aria-hidden className="size-2 shrink-0 rounded-full bg-(--ll-danger)" />
              <Link href="/financeiro?aba=contas&tipo=receber&filtro=vencidas" className="min-w-0 flex-1">
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
              <Link href="/financeiro?aba=contas&tipo=pagar&filtro=vencidas" className="min-w-0 flex-1">
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

      {/* A linha do saldo previsto, a mesma da Visão geral. As barras de
          entra × sai (verde e vermelho lado a lado) confundiam quem tem
          daltonismo; os valores de cada período estão na tabela abaixo. */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Saldo previsto · próximos {rotuloHorizonte}
        </h2>
        {temAlgo ? (
          <SaldoPrevisto
            hoje={p.saldoHoje}
            semanas={p.linhas}
            rotuloFim={`em ${rotuloHorizonte}`}
            porMes={agrupar === "mes"}
          />
        ) : (
          <p className="text-sm text-muted-foreground">Nada previsto para os próximos {rotuloHorizonte}.</p>
        )}
      </section>

      <div className="overflow-x-auto rounded-xl border bg-card">
        <table className="w-full min-w-[420px] text-sm">
          <thead>
            <tr className="border-b text-[11px] uppercase tracking-wide text-muted-foreground">
              <th className="px-4 py-2.5 text-left font-medium">{agrupar === "mes" ? "Mês" : "Semana"}</th>
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

function Escolha({ rotulo, opcoes }: { rotulo: string; opcoes: Array<[string, string, boolean]> }) {
  return (
    <span className="space-y-1">
      <span className="block text-xs text-muted-foreground">{rotulo}</span>
      <span className="inline-flex rounded-lg border bg-(--ll-surface-2) p-0.5">
        {opcoes.map(([r, href, ativo]) => (
          <Link
            key={r}
            href={href}
            aria-current={ativo ? "true" : undefined}
            className={cn(
              "rounded-md px-2.5 py-1 text-xs font-medium",
              ativo ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </Link>
        ))}
      </span>
    </span>
  );
}
