import Link from "next/link";
import { ArrowDownRight, ArrowUpRight, ArrowLeftRight } from "lucide-react";
import { brl, data as fData, hora } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import { cn } from "@/lib/utils";
import { Lista, Vazio } from "@/components/padrao/indicadores";
import {
  movimentoDoPeriodo,
  resumoMensal,
  saidasPorCategoria,
  type CarteiraSaldo,
} from "../financeiro.service";
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

  const [linhas, serie, categorias] = await Promise.all([
    movimentoDoPeriodo(dtDe, dtAte),
    resumoMensal(6),
    saidasPorCategoria(dtDe, dtAte),
  ]);
  const maiorMes = Math.max(1, ...serie.map((m) => Math.max(m.entradas, m.saidas)));

  /*
   * Agrupado por DIA, com o resultado do dia ao lado — como no app antigo.
   * Uma lista corrida de trinta linhas responde "o que aconteceu"; agrupada
   * por dia ela também responde "como foi terça", que é a pergunta que se faz
   * ao conferir o caixa.
   */
  const dias: Array<{ dia: string; quando: Date; itens: typeof linhas; saldo: number }> = [];
  for (const l of linhas) {
    const chave = fData(l.quando);
    const ja = dias.find((d) => d.dia === chave);
    const sinal = l.origem === "transferencia" ? 0 : l.tipo === "entrada" ? l.valor : -l.valor;
    if (ja) {
      ja.itens.push(l);
      ja.saldo = Math.round((ja.saldo + sinal) * 100) / 100;
    } else {
      dias.push({ dia: chave, quando: l.quando, itens: [l], saldo: sinal });
    }
  }

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

      {/* campoDaData, não toISOString: o "até" é o fim do dia LOCAL, e em UTC
          isso já é o dia seguinte — o campo mostrava amanhã. */}
      <PeriodoCaixa de={campoDaData(dtDe)} ate={campoDaData(dtAte)} />

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

      {/*
        Entradas × saídas dos últimos seis meses.
        É a figura que o João olhava primeiro no app antigo: uma coisa é saber
        que o mês fechou positivo, outra é ver que ele vem caindo há três.
      */}
      <section className="rounded-xl border bg-card p-4">
        <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Entradas e saídas
        </h2>
        {serie.some((m) => m.entradas > 0 || m.saidas > 0) ? (
          <>
            <div className="mt-3 flex h-28 items-end gap-3">
              {serie.map((m) => (
                <span key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                  <span className="flex h-24 w-full items-end justify-center gap-1">
                    <i
                      aria-hidden
                      title={`Entradas ${brl(m.entradas)}`}
                      className="block w-1/3 rounded-t bg-emerald-600"
                      style={{ height: `${(m.entradas / maiorMes) * 100}%` }}
                    />
                    <i
                      aria-hidden
                      title={`Saídas ${brl(m.saidas)}`}
                      className="block w-1/3 rounded-t bg-(--ll-danger)"
                      style={{ height: `${(m.saidas / maiorMes) * 100}%` }}
                    />
                  </span>
                  <span className="text-[10px] text-muted-foreground">{m.rotulo}</span>
                </span>
              ))}
            </div>
            <p className="mt-2 flex items-center gap-4 text-[11px] text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2 rounded-sm bg-emerald-600" /> Entradas
              </span>
              <span className="flex items-center gap-1.5">
                <i aria-hidden className="size-2 rounded-sm bg-(--ll-danger)" /> Saídas
              </span>
            </p>
          </>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">Sem movimentação no período.</p>
        )}
      </section>

      {/* Para onde o dinheiro foi. Só saída, e só do período escolhido. */}
      {categorias.length > 0 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Saídas por categoria
          </h2>
          <ul className="mt-3 space-y-2">
            {categorias.map((c) => (
              <li key={c.categoria}>
                <div className="flex items-baseline justify-between gap-2 text-sm">
                  <span className="truncate">{c.categoria}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">
                    {brl(c.valor)}
                  </span>
                </div>
                <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-(--ll-danger)"
                    style={{ width: `${Math.max(2, c.pct)}%` }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      {dias.length === 0 && <Lista>{<Vazio texto="Nenhum movimento neste período." />}</Lista>}

      {dias.map((d) => (
        <section key={d.dia}>
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              {d.dia}
            </h2>
            <span
              className={cn(
                "text-xs tabular-nums",
                d.saldo < 0 ? "text-destructive" : "text-muted-foreground",
              )}
            >
              {d.saldo >= 0 ? "+" : "−"} {brl(Math.abs(d.saldo))}
            </span>
          </div>
          <Lista>
            {d.itens.map((l) => {
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
                    {hora(l.quando)}
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
            })}
          </Lista>
        </section>
      ))}
    </div>
  );
}
