import Link from "next/link";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ehHoje, fimDoDia, fimDoMes, inicioDoDia, inicioDoMes, somaDias, somaMeses } from "@/lib/dia";
import { Vazio } from "@/components/padrao/indicadores";
import { compromissosEntre, mesDaUrl, urlDoMes } from "../agenda.service";
import type { CompromissoAgenda } from "../financeiro.tipos";
import { diaDoIso, grupoDe, inicioDaSemana, isoDoDia } from "../periodo";
import { IrParaData } from "./filtros";

/*
 * CALENDÁRIO (a antiga Agenda) — o mês numa grade, ou a semana dia a dia.
 *
 * O app antigo tinha uma tira rolável de 21 dias que era cortada na borda da
 * tela e não deixava voltar para janeiro. A grade resolve os dois de uma vez,
 * e é a forma que qualquer pessoa já sabe ler sem instrução.
 *
 * No MÊS, embaixo da grade vem a lista do mês, e tocar num dia mostra só
 * aquele dia (pedido do João). Na SEMANA, cada dia é uma coluna com as contas
 * escritas.
 *
 * A semana começa na SEGUNDA, como no resto do Financeiro (decisão do João).
 * As barrinhas de cada dia são proporcionais ao maior valor do período, e
 * ficam sempre na mesma ordem — receber à esquerda, pagar à direita —, para
 * não depender só da cor.
 */

const DIAS = ["seg", "ter", "qua", "qui", "sex", "sáb", "dom"];

const nomeMes = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const curta = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

export async function PainelAgenda({ params }: { params: Record<string, string> }) {
  const vista: "mes" | "semana" = params.vista === "semana" ? "semana" : "mes";
  const so = params.so === "pagar" || params.so === "receber" ? params.so : null;
  const hoje = inicioDoDia(new Date());

  const inicio =
    vista === "semana"
      ? inicioDaSemana(diaDoIso(params.semana) ?? (params.mes ? mesDaUrl(params.mes) : hoje))
      : inicioDoMes(mesDaUrl(params.mes));
  const fim = vista === "semana" ? fimDoDia(somaDias(inicio, 6)) : fimDoMes(inicio);
  const contemHoje = inicio <= hoje && fim >= hoje;
  // O dia tocado na grade do mês; fora do mês mostrado, não vale.
  const diaEscolhido = vista === "mes" ? diaDoIso(params.dia) : null;
  const diaSel = diaEscolhido && diaEscolhido >= inicio && diaEscolhido <= fim ? diaEscolhido : null;

  const todos = await compromissosEntre(inicio, fim);
  const compromissos = so ? todos.filter((c) => c.tipo === so) : todos;

  const receber = compromissos.filter((c) => c.tipo === "receber");
  const pagar = compromissos.filter((c) => c.tipo === "pagar");
  const totalRec = receber.reduce((s, c) => s + c.valor, 0);
  const totalPag = pagar.reduce((s, c) => s + c.valor, 0);
  const sobra = Math.round((totalRec - totalPag) * 100) / 100;
  const atrasados = compromissos.filter((c) => c.atrasado && c.vencimento < inicio);

  const link = (mudanca: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    return `/financeiro?${p.toString()}`;
  };
  const irMes = (d: Date) => link({ vista: null, semana: null, dia: null, mes: urlDoMes(d) });
  const irSemana = (d: Date) => link({ vista: "semana", mes: null, dia: null, semana: isoDoDia(inicioDaSemana(d)) });
  // Tocar no dia já escolhido volta para o mês inteiro.
  const irDia = (d: Date) =>
    link({ dia: diaSel && isoDoDia(diaSel) === isoDoDia(d) ? null : isoDoDia(d), mes: urlDoMes(inicio) });
  const anterior = vista === "semana" ? irSemana(somaDias(inicio, -7)) : irMes(somaMeses(inicio, -1));
  const proximo = vista === "semana" ? irSemana(somaDias(inicio, 7)) : irMes(somaMeses(inicio, 1));
  const titulo = vista === "semana" ? `Semana de ${curta(inicio)} a ${curta(somaDias(inicio, 6))}` : nomeMes(inicio);

  const doDia = (dia: Date) =>
    compromissos.filter(
      (c) =>
        c.vencimento.getFullYear() === dia.getFullYear() &&
        c.vencimento.getMonth() === dia.getMonth() &&
        c.vencimento.getDate() === dia.getDate(),
    );
  /* O atrasado de antes do período aparece no dia de HOJE na grade: é hoje
     que ele precisa de atenção, não no dia em que venceu. */
  const doDiaComAtraso = (dia: Date) => (ehHoje(dia) ? [...atrasados, ...doDia(dia)] : doDia(dia));

  return (
    <div className="ll-entra space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link href={anterior} aria-label="Anterior" className="grid size-9 place-items-center rounded-lg border hover:bg-muted">
            <CaretLeftIcon className="size-4" aria-hidden />
          </Link>
          <p className="min-w-44 text-center text-sm font-semibold first-letter:uppercase">{titulo}</p>
          <Link href={proximo} aria-label="Próximo" className="grid size-9 place-items-center rounded-lg border hover:bg-muted">
            <CaretRightIcon className="size-4" aria-hidden />
          </Link>
        </div>

        <div className="flex flex-wrap items-end gap-2">
          <Pilulas
            rotulo="Ver"
            opcoes={[
              ["Mês", irMes(inicio), vista === "mes"],
              ["Semana", irSemana(diaSel ?? (contemHoje ? hoje : inicio)), vista === "semana"],
            ]}
          />
          <Pilulas
            rotulo="Mostrar"
            opcoes={[
              ["Tudo", link({ so: null }), !so],
              ["Só a pagar", link({ so: "pagar" }), so === "pagar"],
              ["Só a receber", link({ so: "receber" }), so === "receber"],
            ]}
          />
          <IrParaData params={params} vista={vista} />
        </div>
      </div>

      {!contemHoje && (
        <Link
          href={vista === "semana" ? irSemana(hoje) : irMes(hoje)}
          className="block rounded-lg border border-dashed px-3 py-2 text-center text-sm text-muted-foreground hover:text-foreground"
        >
          Voltar para {vista === "semana" ? "esta semana" : nomeMes(hoje)}
        </Link>
      )}

      <div className="grid grid-cols-3 gap-2 rounded-xl border bg-card p-4 text-center">
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A receber</p>
          <p className="text-lg font-bold tabular-nums text-emerald-700 dark:text-emerald-400">{brl(totalRec)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">A pagar</p>
          <p className="text-lg font-bold tabular-nums text-destructive">{brl(totalPag)}</p>
        </div>
        <div>
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground">Sobra</p>
          <p className={cn("text-lg font-bold tabular-nums", sobra < 0 ? "text-destructive" : "text-(--ll-accent)")}>
            {brl(sobra)}
          </p>
        </div>
      </div>

      {atrasados.length > 0 && (
        <p className="text-xs text-muted-foreground">
          {atrasados.length} {atrasados.length === 1 ? "vencido de antes entra" : "vencidos de antes entram"} nesta
          conta e aparece{atrasados.length === 1 ? "" : "m"} no dia de hoje.
        </p>
      )}

      {vista === "mes" ? (
        <>
          <GradeDoMes inicio={inicio} doDia={doDiaComAtraso} irDia={irDia} diaSel={diaSel} />
          {diaSel ? (
            <section className="space-y-1.5">
              <div className="flex items-baseline justify-between gap-3">
                <h2 className="text-sm font-semibold first-letter:uppercase">{grupoDe(diaSel, "dia").rotulo}</h2>
                <Link href={irDia(diaSel)} className="text-xs font-medium text-(--ll-accent) hover:underline">
                  Ver o mês inteiro →
                </Link>
              </div>
              {doDiaComAtraso(diaSel).length > 0 ? (
                <ListaDoDia itens={doDiaComAtraso(diaSel)} />
              ) : (
                <Vazio texto="Nada marcado neste dia." />
              )}
            </section>
          ) : (
            <ListaDoMes compromissos={compromissos} inicio={inicio} atrasados={atrasados} />
          )}
        </>
      ) : (
        <SemanaDiaADia inicio={inicio} doDia={doDiaComAtraso} />
      )}

      {compromissos.length === 0 && vista === "semana" && <Vazio texto="Nada marcado nesta semana." />}
    </div>
  );
}

function Pilulas({ rotulo, opcoes }: { rotulo: string; opcoes: Array<[string, string, boolean]> }) {
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

function GradeDoMes({
  inicio,
  doDia,
  irDia,
  diaSel,
}: {
  inicio: Date;
  doDia: (d: Date) => CompromissoAgenda[];
  irDia: (d: Date) => string;
  diaSel: Date | null;
}) {
  const nDias = fimDoMes(inicio).getDate();
  const celulas = Array.from({ length: nDias }, (_, k) => {
    const dia = new Date(inicio.getFullYear(), inicio.getMonth(), k + 1);
    const itens = doDia(dia);
    return {
      dia,
      rec: itens.filter((c) => c.tipo === "receber").reduce((s, c) => s + c.valor, 0),
      pag: itens.filter((c) => c.tipo === "pagar").reduce((s, c) => s + c.valor, 0),
    };
  });
  const maior = Math.max(1, ...celulas.map((c) => Math.max(c.rec, c.pag)));
  // Segunda = 0 … domingo = 6.
  const vazios = (inicio.getDay() + 6) % 7;

  return (
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
            <Link
              key={c.dia.toISOString()}
              href={irDia(c.dia)}
              aria-label={`${c.dia.getDate()} · ${quanto || "nada marcado"} · ver este dia`}
              aria-current={diaSel && diaSel.getDate() === c.dia.getDate() ? "date" : undefined}
              title={quanto || "nada marcado"}
              className={cn(
                "flex h-14 flex-col items-center justify-between rounded-lg border px-1 py-1.5 transition-colors hover:border-foreground/40",
                ehHoje(c.dia) ? "border-(--ll-accent) bg-(--ll-accent-soft)" : "bg-card",
                diaSel && diaSel.getDate() === c.dia.getDate() && "border-foreground ring-2 ring-foreground",
              )}
            >
              <span className="text-[11px] tabular-nums text-muted-foreground">{c.dia.getDate()}</span>
              <span className="flex items-end gap-0.5" aria-hidden>
                {c.rec > 0 && <i className="block w-1.5 rounded-sm bg-emerald-600" style={{ height: alt(c.rec) }} />}
                {c.pag > 0 && <i className="block w-1.5 rounded-sm bg-(--ll-danger)" style={{ height: alt(c.pag) }} />}
              </span>
            </Link>
          );
        })}
      </div>
      <p className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="size-2 rounded-sm bg-emerald-600" /> A receber (barra da esquerda)
        </span>
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="size-2 rounded-sm bg-(--ll-danger)" /> A pagar (barra da direita)
        </span>
        <span>Toque num dia para ver só ele.</span>
      </p>
    </div>
  );
}

function SemanaDiaADia({ inicio, doDia }: { inicio: Date; doDia: (d: Date) => CompromissoAgenda[] }) {
  const dias = Array.from({ length: 7 }, (_, k) => somaDias(inicio, k));
  return (
    <div className="grid gap-2 md:grid-cols-7">
      {dias.map((dia, k) => {
        const itens = doDia(dia);
        const saldo = itens.reduce((s, c) => s + (c.tipo === "receber" ? c.valor : -c.valor), 0);
        return (
          <section
            key={dia.toISOString()}
            className={cn("rounded-xl border bg-card p-2", ehHoje(dia) && "border-(--ll-accent) bg-(--ll-accent-soft)")}
          >
            <div className="flex items-baseline justify-between gap-2 border-b pb-1.5">
              <span className="text-xs font-semibold">
                {DIAS[k]} <span className="font-normal text-muted-foreground">{fData(dia).slice(0, 5)}</span>
              </span>
              {itens.length > 0 && (
                <span className={cn("text-[11px] tabular-nums", saldo < 0 ? "text-destructive" : "text-muted-foreground")}>
                  {saldo >= 0 ? "+" : "−"}
                  {brl(Math.abs(saldo))}
                </span>
              )}
            </div>
            {itens.length === 0 ? (
              <p className="py-2 text-center text-xs text-muted-foreground">—</p>
            ) : (
              <ul className="mt-1 space-y-1">
                {itens.map((c) => (
                  <li key={c.id} className="text-xs">
                    {c.href ? (
                      <Link href={c.href} className="block truncate font-medium hover:underline" title={c.titulo}>
                        {c.titulo}
                      </Link>
                    ) : (
                      <span className="block truncate font-medium" title={c.titulo}>
                        {c.titulo}
                      </span>
                    )}
                    <span
                      className={cn(
                        "tabular-nums",
                        c.tipo === "receber" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
                      )}
                    >
                      {c.tipo === "receber" ? "+ " : "− "}
                      {brl(c.valor)}
                      {c.atrasado ? " · vencido" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </div>
  );
}

/* Uma conta da lista: o ponto e o sinal dizem se entra ou sai — não só a cor. */
function LinhaCompromisso({ c }: { c: CompromissoAgenda }) {
  return (
    <li className="flex items-center gap-3 px-4 py-2.5">
      <span
        aria-hidden
        className={cn("size-2 shrink-0 rounded-full", c.tipo === "receber" ? "bg-emerald-600" : "bg-(--ll-danger)")}
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
          {c.quem ? `${c.quem} · ` : ""}
          {c.tipo === "receber" ? "a receber" : "a pagar"} · vence {fData(c.vencimento)}
          {c.atrasado ? " · vencido" : ""}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-medium tabular-nums",
          c.tipo === "receber" ? "text-emerald-700 dark:text-emerald-400" : "text-destructive",
        )}
      >
        {c.tipo === "receber" ? "+" : "−"} {brl(c.valor)}
      </span>
    </li>
  );
}

function ListaDoDia({ itens }: { itens: CompromissoAgenda[] }) {
  return (
    <ul className="divide-y rounded-xl border bg-card">
      {itens.map((c) => (
        <LinhaCompromisso key={c.id} c={c} />
      ))}
    </ul>
  );
}

/* O mês inteiro embaixo da grade, dia a dia, com o resultado de cada dia. O
   vencido de antes do mês vem primeiro, à parte. */
function ListaDoMes({
  compromissos,
  inicio,
  atrasados,
}: {
  compromissos: CompromissoAgenda[];
  inicio: Date;
  atrasados: CompromissoAgenda[];
}) {
  const doMes = compromissos.filter((c) => c.vencimento >= inicio);
  const dias: Array<{ chave: string; rotulo: string; itens: CompromissoAgenda[] }> = [];
  for (const c of doMes) {
    const { chave, rotulo } = grupoDe(c.vencimento, "dia");
    const d = dias.find((x) => x.chave === chave);
    if (d) d.itens.push(c);
    else dias.push({ chave, rotulo, itens: [c] });
  }
  const grupos = [
    ...(atrasados.length ? [{ chave: "antes", rotulo: "Vencido antes deste mês", itens: atrasados }] : []),
    ...dias,
  ];
  if (grupos.length === 0) return <Vazio texto={`Nada marcado em ${nomeMes(inicio)}.`} />;
  return (
    <div className="space-y-3">
      {grupos.map((g) => {
        const soma = g.itens.reduce((s, c) => s + (c.tipo === "receber" ? c.valor : -c.valor), 0);
        return (
          <section key={g.chave}>
            <div className="flex items-baseline justify-between gap-3">
              <h2
                className={cn(
                  "text-[11px] font-medium uppercase tracking-wide",
                  g.chave === "antes" ? "text-destructive" : "text-muted-foreground",
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
                <LinhaCompromisso key={c.id} c={c} />
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
