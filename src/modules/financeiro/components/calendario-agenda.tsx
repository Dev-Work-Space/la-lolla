"use client";

import { createContext, useContext, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ptBR } from "react-day-picker/locale";
import type { DayButton } from "react-day-picker";
import { Calendar, CalendarDayButton } from "@/components/ui/calendar";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { diaDoIso, isoDoDia } from "../periodo";

/*
 * O MÊS DA AGENDA, no calendário do shadcn (pedido do João, 08/10/2026:
 * "pegue o calendário do ui.shadcn.com e substitua na agenda").
 *
 * O componente é o oficial (`ui/calendar.tsx`, de react-day-picker): ele cuida
 * do teclado (setas, Home/End, PageUp/PageDown), do leitor de tela e da troca
 * de mês. O que é nosso aqui é o que vai dentro de cada dia — as duas barrinhas
 * do que entra e do que sai — e o endereço: o dia e o mês escolhidos moram na
 * URL, como no resto do Financeiro, então o servidor segue montando as listas.
 *
 * Fica sempre na mesma ordem — receber à esquerda, pagar à direita — para a
 * leitura não depender só da cor.
 */

export type ValoresDoDia = { rec: number; pag: number };

const Valores = createContext<{ dias: Record<string, ValoresDoDia>; maior: number }>({ dias: {}, maior: 1 });

const DIAS_CURTOS = ["dom", "seg", "ter", "qua", "qui", "sex", "sáb"];

const mesDaUrl = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;

function DiaComBarras({ day, modifiers, children, ...props }: React.ComponentProps<typeof DayButton>) {
  const { dias, maior } = useContext(Valores);
  const v = dias[isoDoDia(day.date)];
  const alt = (n: number) => (n > 0 ? Math.max(3, Math.round((n / maior) * 18)) : 0);
  return (
    <CalendarDayButton
      day={day}
      modifiers={modifiers}
      locale={ptBR}
      {...props}
      className={cn(
        "aspect-auto h-14 justify-between py-1.5 text-[13px] tabular-nums",
        modifiers.today && !modifiers.selected && "font-bold text-(--ll-accent)",
      )}
    >
      {children}
      <span aria-hidden className="flex h-5 items-end gap-0.5">
        {v && v.rec > 0 && <i className="block w-1.5 rounded-sm bg-emerald-600" style={{ height: alt(v.rec) }} />}
        {v && v.pag > 0 && <i className="block w-1.5 rounded-sm bg-(--ll-danger)" style={{ height: alt(v.pag) }} />}
      </span>
    </CalendarDayButton>
  );
}

export function CalendarioAgenda({
  mes,
  selecionado,
  dias,
  params,
}: {
  /** "AAAA-MM-DD" do primeiro dia do mês mostrado. */
  mes: string;
  /** "AAAA-MM-DD" do dia tocado, ou nulo. */
  selecionado: string | null;
  dias: Record<string, ValoresDoDia>;
  /** Os filtros que já estão na URL (mostrar, vista…), para não perdê-los. */
  params: Record<string, string>;
}) {
  const router = useRouter();
  const [, navegando] = useTransition();
  const mesData = diaDoIso(mes) ?? new Date();
  /* O mês mostrado muda na hora, antes de o servidor responder; a página
     remonta o componente (`key`) quando o endereço de fato muda. */
  const [mostrado, setMostrado] = useState(mesData);

  const maior = Math.max(1, ...Object.values(dias).flatMap((v) => [v.rec, v.pag]));

  const ir = (mudanca: Record<string, string | null>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === null) p.delete(k);
      else p.set(k, v);
    }
    navegando(() => router.push(`/financeiro?${p.toString()}`, { scroll: false }));
  };

  return (
    <Valores.Provider value={{ dias, maior }}>
      <Calendar
        mode="single"
        locale={ptBR}
        weekStartsOn={1}
        showOutsideDays={false}
        month={mostrado}
        onMonthChange={(m) => {
          setMostrado(m);
          ir({ vista: null, semana: null, dia: null, mes: mesDaUrl(m) });
        }}
        selected={selecionado ? (diaDoIso(selecionado) ?? undefined) : undefined}
        /* Tocar no dia já escolhido chega aqui sem data: volta ao mês inteiro. */
        onSelect={(d) => ir({ dia: d ? isoDoDia(d) : null, mes: mesDaUrl(mostrado) })}
        className="w-full rounded-xl border bg-card p-3"
        /* ATENÇÃO: cada chave aqui SUBSTITUI a classe padrão do shadcn, não se
           soma a ela. Por isso as classes de largura e de posição (`w-full`,
           `relative`, `flex`) vêm repetidas: sem elas as células encolhiam
           e as setas do mês iam parar no canto da página. */
        classNames={{
          root: "w-full",
          months: "relative flex w-full flex-col gap-4",
          day: "group/day relative h-14 w-full rounded-(--cell-radius) p-0 text-center select-none",
          week: "mt-1 flex w-full",
          caption_label: "text-sm font-semibold select-none first-letter:uppercase",
          today: "rounded-(--cell-radius) bg-(--ll-accent-soft)",
        }}
        formatters={{ formatWeekdayName: (d) => DIAS_CURTOS[d.getDay()] }}
        labels={{
          labelDayButton: (date) => {
            const v = dias[isoDoDia(date)];
            const dia = date.toLocaleDateString("pt-BR", { weekday: "long", day: "numeric", month: "long" });
            const quanto = [v?.rec ? `a receber ${brl(v.rec)}` : "", v?.pag ? `a pagar ${brl(v.pag)}` : ""]
              .filter(Boolean)
              .join(", ");
            return `${dia} · ${quanto || "nada marcado"}`;
          },
        }}
        components={{ DayButton: DiaComBarras }}
      />
      <p className="mt-2 flex flex-wrap items-center gap-4 text-[11px] text-muted-foreground">
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="size-2 rounded-sm bg-emerald-600" /> A receber (barra da esquerda)
        </span>
        <span className="flex items-center gap-1.5">
          <i aria-hidden className="size-2 rounded-sm bg-(--ll-danger)" /> A pagar (barra da direita)
        </span>
        <span>Toque num dia para ver só ele.</span>
      </p>
    </Valores.Provider>
  );
}
