import type { Periodo } from "./assistente.schemas";

export const FUSO_LOJA = "America/Sao_Paulo";
const formato = new Intl.DateTimeFormat("en-CA", { timeZone: FUSO_LOJA, year: "numeric", month: "2-digit", day: "2-digit" });
export function diaDaLoja(agora = new Date()): string {
  const partes = formato.formatToParts(agora);
  const campo = (tipo: string) => partes.find((p) => p.type === tipo)?.value;
  return `${campo("year")}-${campo("month")}-${campo("day")}`;
}
// Datas de negócio em São Paulo (UTC-3, sem horário de verão desde 2019).
// Não dependem do TZ do processo (Vercel normalmente usa UTC).
export function inicioDiaLoja(dia: string) { return new Date(`${dia}T00:00:00-03:00`); }
export function deslocarDia(dia: string, dias: number) {
  const d = new Date(`${dia}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
export function intervaloPeriodo(p: Periodo, agora = new Date()) {
  const hoje = diaDaLoja(agora);
  const de = p.de ?? (p.periodo === "hoje" ? hoje : p.periodo === "semana" ? deslocarDia(hoje, -6) : p.periodo === "ano" ? `${hoje.slice(0, 4)}-01-01` : `${hoje.slice(0, 7)}-01`);
  const ate = p.ate ?? hoje;
  return { de, ate, janela: { gte: inicioDiaLoja(de), lt: inicioDiaLoja(deslocarDia(ate, 1)) }, rotulo: `${de} a ${ate} (${FUSO_LOJA})` };
}
