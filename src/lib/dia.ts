/*
 * Limites de dia, mês e semana — o corte que quase toda consulta de dinheiro
 * precisa fazer.
 *
 * Por que existe um módulo só para isto: desde que cada venda, lançamento e
 * movimento passou a ter a DATA DO FATO (separada da data do registro), a
 * pergunta "até hoje" virou a linha que separa o saldo real do saldo
 * imaginado. Um lançamento datado para a semana que vem já está gravado, mas
 * não pode aparecer no caixa de agora — e essa regra tinha de ser a mesma nas
 * carteiras, no caixa, no painel e nos relatórios.
 *
 * Tudo aqui trabalha na hora LOCAL de propósito. O dia da loja começa à
 * meia-noite de Maringá, não em UTC: com UTC, uma venda das 21h de terça cai
 * na quarta e o fechamento do dia não bate com a gaveta.
 *
 * Neutro: sem `server-only` e sem Prisma, para Client Component poder usar.
 */

/** 00:00:00.000 do dia. */
export function inicioDoDia(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** 23:59:59.999 do dia — o limite de "até hoje" numa comparação `lte`. */
export function fimDoDia(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 23, 59, 59, 999);
}

/** Primeiro instante do mês de `d`. */
export function inicioDoMes(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

/** Último instante do mês de `d`. Dia 0 do mês seguinte é o último deste. */
export function fimDoMes(d: Date = new Date()): Date {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999);
}

/** Soma meses preservando o fim de mês: 31/01 + 1 mês = 28/02, não 03/03. */
export function somaMeses(d: Date, meses: number): Date {
  const ultimo = new Date(d.getFullYear(), d.getMonth() + meses + 1, 0).getDate();
  return new Date(
    d.getFullYear(),
    d.getMonth() + meses,
    Math.min(d.getDate(), ultimo),
    d.getHours(),
    d.getMinutes(),
    d.getSeconds(),
    d.getMilliseconds(),
  );
}

export function somaDias(d: Date, dias: number): Date {
  const out = new Date(d);
  out.setDate(out.getDate() + dias);
  return out;
}

/** Dias inteiros de `a` até `b`. Negativo quando `b` já passou. */
export function diasEntre(a: Date, b: Date): number {
  const ms = inicioDoDia(b).getTime() - inicioDoDia(a).getTime();
  return Math.round(ms / 86_400_000);
}

export function ehHoje(d: Date): boolean {
  return diasEntre(new Date(), d) === 0;
}

/**
 * O dia `n` daquele mês, respeitando mês curto: vencimento 31 em fevereiro
 * cai no dia 28. É o que o banco faz com a fatura, e o que evita gerar uma
 * data que não existe.
 */
export function diaNoMes(ref: Date, n: number): Date {
  const ultimo = new Date(ref.getFullYear(), ref.getMonth() + 1, 0).getDate();
  return new Date(ref.getFullYear(), ref.getMonth(), Math.min(Math.max(1, n), ultimo));
}

/** O próximo dia `n` a partir de `desde` (hoje inclusive). */
export function proximoDiaMensal(desde: Date, n: number): Date {
  const candidato = diaNoMes(desde, n);
  if (inicioDoDia(candidato) >= inicioDoDia(desde)) return candidato;
  return diaNoMes(somaMeses(desde, 1), n);
}

/**
 * Converte o valor de um `<input type="date">` ("2026-09-16") para Date
 * local. `new Date("2026-09-16")` seria interpretado como UTC e, em Maringá,
 * voltaria como dia 15 às 21h — um dia inteiro de diferença no relatório.
 */
export function dataDoCampo(valor: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(valor || "").trim());
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? null : d;
}

/** O caminho inverso, para preencher um `<input type="date">`. */
export function campoDaData(d: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}
