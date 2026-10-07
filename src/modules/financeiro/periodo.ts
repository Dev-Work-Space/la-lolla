/*
 * PERÍODO — a barra de datas de todas as abas do Financeiro, "estilo ERP".
 *
 * Neutro (sem "use client" e sem server-only): a barra na tela e os serviços
 * no servidor fazem a MESMA conta. Se cada lado calculasse "esta semana" do
 * seu jeito, a lista e o total discordariam no domingo.
 *
 * Duas decisões do João que moram aqui:
 *   - a semana começa na SEGUNDA;
 *   - no Caixa e nas Carteiras, "Este mês" (e semana, e ano) vai só ATÉ HOJE:
 *     um lançamento já marcado para o dia 25 ainda não aconteceu, e somá-lo
 *     ao "quanto sobrou" mostraria dinheiro que ninguém tem.
 */

export type Agrupar = "dia" | "semana" | "mes";

export type Atalho =
  | "hoje"
  | "semana"
  | "mes"
  | "mes-passado"
  | "proximo-mes"
  | "ultimos-30"
  | "proximos-30"
  | "ano"
  | "tudo";

export const ATALHOS: ReadonlyArray<readonly [Atalho, string]> = [
  ["hoje", "Hoje"],
  ["semana", "Esta semana"],
  ["mes", "Este mês"],
  ["mes-passado", "Mês passado"],
  ["proximo-mes", "Próximo mês"],
  ["ultimos-30", "Últimos 30 dias"],
  ["proximos-30", "Próximos 30 dias"],
  ["ano", "Este ano"],
  ["tudo", "Ver tudo"],
];

export const AGRUPAMENTOS: ReadonlyArray<readonly [Agrupar, string]> = [
  ["dia", "Dia"],
  ["semana", "Semana"],
  ["mes", "Mês"],
];

/** `null` nas duas pontas é "Ver tudo". */
export type Periodo = { de: Date | null; ate: Date | null; atalho: Atalho | null };

const dia0 = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const fimDia = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
const maisDias = (d: Date, n: number) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

/** Segunda-feira da semana de `d` (getDay: domingo = 0). */
export function inicioDaSemana(d: Date): Date {
  const volta = (d.getDay() + 6) % 7;
  return maisDias(dia0(d), -volta);
}

/** "AAAA-MM-DD" no fuso local — `toISOString` daria o dia seguinte depois das 21h. */
export function isoDoDia(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function diaDoIso(s: string | undefined | null): Date | null {
  if (!s || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [a, m, d] = s.split("-").map(Number);
  const data = new Date(a, m - 1, d);
  return Number.isNaN(data.getTime()) ? null : data;
}

/**
 * As datas de um atalho. `ateHoje` corta no dia de hoje os atalhos que
 * terminariam no futuro (mês, semana, ano) — ver a decisão lá em cima.
 */
export function periodoDoAtalho(
  atalho: Atalho,
  opcoes: { ateHoje?: boolean; hoje?: Date } = {},
): Periodo {
  const hoje = dia0(opcoes.hoje ?? new Date());
  const corta = (fim: Date) => (opcoes.ateHoje && fim > fimDia(hoje) ? fimDia(hoje) : fim);
  const p = (de: Date | null, ate: Date | null): Periodo => ({ de, ate, atalho });
  switch (atalho) {
    case "hoje":
      return p(hoje, fimDia(hoje));
    case "semana": {
      const seg = inicioDaSemana(hoje);
      return p(seg, corta(fimDia(maisDias(seg, 6))));
    }
    case "mes":
      return p(new Date(hoje.getFullYear(), hoje.getMonth(), 1), corta(fimDia(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0))));
    case "mes-passado":
      return p(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1), fimDia(new Date(hoje.getFullYear(), hoje.getMonth(), 0)));
    case "proximo-mes":
      return p(new Date(hoje.getFullYear(), hoje.getMonth() + 1, 1), fimDia(new Date(hoje.getFullYear(), hoje.getMonth() + 2, 0)));
    case "ultimos-30":
      return p(maisDias(hoje, -29), fimDia(hoje));
    case "proximos-30":
      return p(hoje, fimDia(maisDias(hoje, 29)));
    case "ano":
      return p(new Date(hoje.getFullYear(), 0, 1), corta(fimDia(new Date(hoje.getFullYear(), 11, 31))));
    case "tudo":
      return p(null, null);
  }
}

const ehAtalho = (v: string | undefined): v is Atalho => ATALHOS.some(([a]) => a === v);
export const ehAgrupar = (v: string | undefined): v is Agrupar => v === "dia" || v === "semana" || v === "mes";

/**
 * O período pedido na URL. Datas livres (`de`/`ate`) valem mais que o atalho;
 * sem nada, o padrão de cada aba.
 */
export function periodoDaUrl(
  params: { de?: string; ate?: string; periodo?: string },
  padrao: Atalho,
  opcoes: { ateHoje?: boolean } = {},
): Periodo {
  const de = diaDoIso(params.de);
  const ate = diaDoIso(params.ate);
  if (de || ate) {
    const [a, b] = de && ate && de > ate ? [ate, de] : [de, ate];
    return { de: a, ate: b ? fimDia(b) : null, atalho: null };
  }
  return periodoDoAtalho(ehAtalho(params.periodo) ? params.periodo : padrao, opcoes);
}

/** O período na forma da URL: atalho pelo nome (acompanha o calendário), datas livres pelas datas. */
export function paramsDoPeriodo(p: Periodo): Record<string, string> {
  if (p.atalho) return { periodo: p.atalho };
  const out: Record<string, string> = {};
  if (p.de) out.de = isoDoDia(p.de);
  if (p.ate) out.ate = isoDoDia(p.ate);
  return out;
}

const ehMesInteiro = (de: Date, ate: Date) =>
  de.getDate() === 1 && ate.getMonth() === de.getMonth() && ate.getFullYear() === de.getFullYear();

/**
 * As setas ◀ ▶: um mês inteiro quando o período começa no dia 1º (mês, mês
 * passado…); uma semana inteira quando cabe numa semana; senão, o próprio
 * tamanho do período. "Ver tudo" não anda.
 */
export function deslocar(p: Periodo, sentido: 1 | -1): Periodo | null {
  if (!p.de || !p.ate) return null;
  if (ehMesInteiro(p.de, p.ate)) {
    const de = new Date(p.de.getFullYear(), p.de.getMonth() + sentido, 1);
    return { de, ate: fimDia(new Date(de.getFullYear(), de.getMonth() + 1, 0)), atalho: null };
  }
  const dias = Math.round((dia0(p.ate).getTime() - p.de.getTime()) / 86_400_000) + 1;
  if (dias <= 7) {
    const de = maisDias(inicioDaSemana(p.de), 7 * sentido);
    return { de, ate: fimDia(maisDias(de, 6)), atalho: null };
  }
  const de = maisDias(p.de, dias * sentido);
  return { de, ate: fimDia(maisDias(de, dias - 1)), atalho: null };
}

const mesExtenso = (d: Date) => d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
const curta = (d: Date) => d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });

/** "outubro de 2026", "06/10 a 12/10", "01/09/2026 a 07/10/2026", "Tudo". */
export function rotuloDoPeriodo(p: Periodo): string {
  if (!p.de && !p.ate) return "Todo o período";
  if (!p.de) return `até ${p.ate!.toLocaleDateString("pt-BR")}`;
  if (!p.ate) return `desde ${p.de.toLocaleDateString("pt-BR")}`;
  if (dia0(p.de).getTime() === dia0(p.ate).getTime()) return p.de.toLocaleDateString("pt-BR");
  if (ehMesInteiro(p.de, p.ate) && p.ate.getDate() === new Date(p.ate.getFullYear(), p.ate.getMonth() + 1, 0).getDate()) {
    return mesExtenso(p.de);
  }
  if (p.de.getFullYear() === p.ate.getFullYear()) return `${curta(p.de)} a ${curta(p.ate)}`;
  return `${p.de.toLocaleDateString("pt-BR")} a ${p.ate.toLocaleDateString("pt-BR")}`;
}

/** Em que grupo a data cai: a chave ordena, o rótulo vai na tela. */
export function grupoDe(d: Date, agrupar: Agrupar): { chave: string; rotulo: string } {
  if (agrupar === "mes") {
    return { chave: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, rotulo: mesExtenso(d) };
  }
  if (agrupar === "semana") {
    const seg = inicioDaSemana(d);
    return { chave: isoDoDia(seg), rotulo: `Semana de ${curta(seg)} a ${curta(maisDias(seg, 6))}` };
  }
  const semana = d.toLocaleDateString("pt-BR", { weekday: "long" }).split("-")[0];
  return { chave: isoDoDia(d), rotulo: `${semana.charAt(0).toUpperCase()}${semana.slice(1)}, ${d.toLocaleDateString("pt-BR")}` };
}

/** Se o período inclui o dia de hoje. */
export function incluiHoje(p: Periodo, hoje = new Date()): boolean {
  return (!p.de || p.de <= hoje) && (!p.ate || p.ate >= dia0(hoje));
}

/**
 * As datas do período no formato que a barra recebe ("AAAA-MM-DD"). Mora aqui,
 * no módulo neutro: a página do servidor que importasse isto do arquivo da
 * barra ("use client") receberia uma referência, não a função.
 */
export function datasDaBarra(p: Periodo) {
  return { de: p.de ? isoDoDia(p.de) : null, ate: p.ate ? isoDoDia(p.ate) : null, atalho: p.atalho };
}
