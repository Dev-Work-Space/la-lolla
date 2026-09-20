import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ehHoje, fimDoMes, inicioDoDia, inicioDoMes, somaMeses } from "@/lib/dia";
import { Vazio } from "@/components/padrao/indicadores";
import { compromissosDoMes, urlDoMes } from "../agenda.service";

/*
 * AGENDA — o mês inteiro numa grade de sete colunas.
 *
 * O app antigo tinha uma tira rolável de 21 dias que era cortada na borda da
 * tela e não deixava voltar para janeiro. A grade resolve os dois de uma vez,
 * e é a forma que qualquer pessoa já sabe ler sem instrução.
 *
 * As barrinhas em cada dia são proporcionais ao maior valor do mês: dá para
 * ver onde estão os dias pesados sem ler um número sequer.
 */

const DIAS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const nomeMes = (d: Date) =>
  d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });

export async function PainelAgenda({ mes }: { mes: Date }) {
  const compromissos = await compromissosDoMes(mes);
  const inicio = inicioDoMes(mes);
  const fim = fimDoMes(mes);
  const hoje = inicioDoDia(new Date());
  const ehMesCorrente = inicio.getMonth() === hoje.getMonth() && inicio.getFullYear() === hoje.getFullYear();

  const receber = compromissos.filter((c) => c.tipo === "receber");
  const pagar = compromissos.filter((c) => c.tipo === "pagar");
  const totalRec = receber.reduce((s, c) => s + c.valor, 0);
  const totalPag = pagar.reduce((s, c) => s + c.valor, 0);
  const sobra = Math.round((totalRec - totalPag) * 100) / 100;
  const atrasados = compromissos.filter((c) => c.atrasado);

  /* Uma casa por dia do mês, com o que vence nela. */
  const nDias = fim.getDate();
  const celulas = Array.from({ length: nDias }, (_, k) => {
    const dia = new Date(inicio.getFullYear(), inicio.getMonth(), k + 1);
    const doDia = compromissos.filter(
      (c) => c.vencimento.getMonth() === dia.getMonth() && c.vencimento.getDate() === dia.getDate(),
    );
    return {
      dia,
      rec: doDia.filter((c) => c.tipo === "receber").reduce((s, c) => s + c.valor, 0),
      pag: doDia.filter((c) => c.tipo === "pagar").reduce((s, c) => s + c.valor, 0),
    };
  });
  const maior = Math.max(1, ...celulas.map((c) => Math.max(c.rec, c.pag)));
  const vazios = inicio.getDay();

  const link = (d: Date) => `/financeiro?aba=agenda&mes=${urlDoMes(d)}`;

  /* Agrupado por urgência, não por data: "vencido" e "hoje" são categorias
     diferentes de "daqui a três semanas", mesmo caindo no mesmo mês. */
  const grupos: Array<{ rotulo: string; tom: "neg" | "accent" | "neutro"; itens: typeof compromissos }> = [
    { rotulo: "Vencido", tom: "neg" as const, itens: compromissos.filter((c) => c.atrasado) },
    {
      rotulo: "Hoje",
      tom: "accent" as const,
      itens: compromissos.filter((c) => !c.atrasado && ehHoje(c.vencimento)),
    },
    {
      rotulo: "Depois",
      tom: "neutro" as const,
      itens: compromissos.filter((c) => !c.atrasado && !ehHoje(c.vencimento)),
    },
  ].filter((g) => g.itens.length > 0);

  return (
    <div className="ll-entra space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Link
          href={link(somaMeses(inicio, -1))}
          aria-label="Mês anterior"
          className="grid size-9 place-items-center rounded-lg border hover:bg-muted"
        >
          <ChevronLeft className="size-4" aria-hidden />
        </Link>
        <p className="text-sm font-semibold capitalize">{nomeMes(inicio)}</p>
        <Link
          href={link(somaMeses(inicio, 1))}
          aria-label="Próximo mês"
          className="grid size-9 place-items-center rounded-lg border hover:bg-muted"
        >
          <ChevronRight className="size-4" aria-hidden />
        </Link>
      </div>

      {!ehMesCorrente && (
        <Link
          href={link(hoje)}
          className="block rounded-lg border border-dashed px-3 py-2 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar para {nomeMes(hoje)}
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-4 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A receber</p>
          <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
            {brl(totalRec)}
          </p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A pagar</p>
          <p className="text-lg font-bold tabular-nums text-destructive">{brl(totalPag)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sobra</p>
          <p
            className={cn(
              "text-lg font-bold tabular-nums",
              sobra < 0 ? "text-destructive" : "text-(--ll-accent)",
            )}
          >
            {brl(sobra)}
          </p>
        </div>
      </div>

      {atrasados.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {atrasados.length} {atrasados.length === 1 ? "vencido de antes entra" : "vencidos de antes entram"} nesta
          conta.
        </p>
      )}

      <div>
        <div className="grid grid-cols-7 gap-1 text-center text-[10px] uppercase tracking-wide text-muted-foreground">
          {DIAS.map((d) => (
            <span key={d}>{d}</span>
          ))}
        </div>
        <div className="mt-1 grid grid-cols-7 gap-1">
          {Array.from({ length: vazios }, (_, k) => (
            <span key={`vazio-${k}`} />
          ))}
          {celulas.map((c) => {
            const alt = (v: number) => (v > 0 ? Math.max(3, Math.round((v / maior) * 16)) : 0);
            const quanto =
              (c.rec > 0 ? `a receber ${brl(c.rec)}` : "") +
              (c.rec > 0 && c.pag > 0 ? ", " : "") +
              (c.pag > 0 ? `a pagar ${brl(c.pag)}` : "");
            return (
              <span
                key={c.dia.toISOString()}
                aria-label={`${c.dia.getDate()} · ${quanto || "nada marcado"}`}
                className={cn(
                  "flex h-14 flex-col items-center justify-between rounded-lg border px-1 py-1.5",
                  ehHoje(c.dia) ? "border-(--ll-accent) bg-(--ll-accent-soft)" : "bg-card",
                )}
              >
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {c.dia.getDate()}
                </span>
                <span className="flex items-end gap-0.5" aria-hidden>
                  {c.rec > 0 && (
                    <i
                      className="block w-1.5 rounded-sm bg-emerald-600"
                      style={{ height: alt(c.rec) }}
                    />
                  )}
                  {c.pag > 0 && (
                    <i
                      className="block w-1.5 rounded-sm bg-(--ll-danger)"
                      style={{ height: alt(c.pag) }}
                    />
                  )}
                </span>
              </span>
            );
          })}
        </div>
      </div>

      {grupos.length === 0 ? (
        <Vazio texto={`Nada marcado em ${nomeMes(inicio)}.`} />
      ) : (
        grupos.map((g) => {
          const soma = g.itens.reduce(
            (s, c) => s + (c.tipo === "receber" ? c.valor : -c.valor),
            0,
          );
          return (
            <section key={g.rotulo}>
              <div className="flex items-baseline justify-between gap-3">
                <h2
                  className={cn(
                    "text-[11px] font-medium uppercase tracking-wide",
                    g.tom === "neg" && "text-destructive",
                    g.tom === "accent" && "text-(--ll-accent)",
                    g.tom === "neutro" && "text-muted-foreground",
                  )}
                >
                  {g.rotulo}
                </h2>
                <span className="text-xs tabular-nums text-muted-foreground">
                  {soma >= 0 ? "+" : "−"} {brl(Math.abs(soma))}
                </span>
              </div>
              <ul className="mt-1.5 divide-y rounded-xl border bg-card">
                {g.itens.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 px-4 py-2.5">
                    <span
                      aria-hidden
                      className={cn(
                        "size-2 shrink-0 rounded-full",
                        c.tipo === "receber" ? "bg-emerald-600" : "bg-(--ll-danger)",
                      )}
                    />
                    <span className="min-w-0 flex-1">
                      {c.href ? (
                        <Link href={c.href} className="block truncate text-sm font-medium hover:underline">
                          {c.titulo}
                        </Link>
                      ) : (
                        <span className="block truncate text-sm font-medium">{c.titulo}</span>
                      )}
                      <span className="block truncate text-xs text-muted-foreground">
                        {c.quem ? `${c.quem} · ` : ""}vence {fData(c.vencimento)}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 text-sm font-medium tabular-nums",
                        c.tipo === "receber"
                          ? "text-emerald-700 dark:text-emerald-400"
                          : "text-destructive",
                      )}
                    >
                      {c.tipo === "receber" ? "+" : "−"} {brl(c.valor)}
                    </span>
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
