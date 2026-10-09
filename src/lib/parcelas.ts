/*
 * A CONTA DAS PARCELAS — a mesma no servidor e na tela.
 *
 * Neutro (sem "use client" e sem server-only): a tela mostra "3× de R$ 33,33"
 * e o servidor grava as parcelas; se cada lado dividisse do seu jeito, o que
 * a pessoa viu e o que ficou gravado discordariam por um centavo.
 *
 * Duas regras que vêm da documentação e do João:
 *   - a sobra de centavos vai na ÚLTIMA parcela (100 em 3 = 33,33 · 33,33 · 33,34);
 *   - o valor de cada parcela pode ser ESCOLHIDO à mão ("a primeira de 500 e o
 *     resto em duas"); aí o que sobra é dividido entre as parcelas que ninguém
 *     mexeu.
 */

export const r2 = (n: number) => Math.round(n * 100) / 100;

/** Divide o total em `n` parcelas iguais; os centavos que sobram ficam na última. */
export function dividirEmParcelas(total: number, n: number): number[] {
  const qtd = Math.max(1, Math.floor(n));
  const base = Math.floor((total / qtd) * 100) / 100;
  const sobra = r2(total - base * qtd);
  return Array.from({ length: qtd }, (_, k) => (k === qtd - 1 ? r2(base + sobra) : base));
}

/**
 * As parcelas quando algumas têm valor escolhido à mão (`manuais`, por
 * posição). O resto do total se divide entre as demais. `diferenca` é o que
 * falta (positivo) ou passa (negativo) para fechar o total — só diferente de
 * zero quando TODAS foram mexidas ou quando as manuais já passaram do total.
 */
export function resolverParcelas(
  total: number,
  n: number,
  manuais: Record<number, number>,
): { valores: number[]; diferenca: number; confere: boolean } {
  const qtd = Math.max(1, Math.floor(n));
  const fixas = Object.entries(manuais)
    .map(([k, v]) => [Number(k), v] as const)
    .filter(([k, v]) => k >= 0 && k < qtd && Number.isFinite(v) && v >= 0);
  const somaFixas = r2(fixas.reduce((s, [, v]) => s + v, 0));
  const livres = qtd - fixas.length;

  const valores = new Array<number>(qtd).fill(0);
  for (const [k, v] of fixas) valores[k] = r2(v);

  if (livres > 0) {
    const resto = Math.max(0, r2(total - somaFixas));
    const partes = dividirEmParcelas(resto, livres);
    let i = 0;
    for (let k = 0; k < qtd; k++) if (!fixas.some(([f]) => f === k)) valores[k] = partes[i++];
  }

  const diferenca = r2(total - valores.reduce((s, v) => s + v, 0));
  return { valores, diferenca, confere: Math.abs(diferenca) <= 0.009 };
}

/** O servidor confere o que a tela mandou: quantidade certa, nenhum zero e soma igual ao saldo. */
export function valoresValidos(total: number, n: number, valores: number[]): boolean {
  if (valores.length !== n) return false;
  if (valores.some((v) => !(v >= 0.01))) return false;
  return Math.abs(r2(valores.reduce((s, v) => s + v, 0)) - r2(total)) <= 0.009;
}

/* De quanto em quanto tempo vêm as parcelas. */
export const INTERVALOS = [
  ["mes", "Mensal"],
  ["quinzena", "A cada 15 dias"],
  ["semana", "Semanal"],
] as const;

export type Intervalo = (typeof INTERVALOS)[number][0];

/** Vencimento da parcela k (1-based), a partir de uma data. */
export function vencimentoParcela(base: Date, k: number, intervalo: Intervalo): Date {
  const d = new Date(base);
  if (intervalo === "semana") d.setDate(d.getDate() + 7 * k);
  else if (intervalo === "quinzena") d.setDate(d.getDate() + 15 * k);
  else d.setMonth(d.getMonth() + k);
  return d;
}
