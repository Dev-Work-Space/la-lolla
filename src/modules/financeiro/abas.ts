/*
 * As abas do Financeiro e o endereço de cada uma.
 *
 * Neutro (sem "use client" e sem server-only): a página usa para saber o que
 * desenhar, e o menu lateral usa para acender a opção certa. Desde 08/10 as
 * abas moram no menu, não mais dentro da tela, e as duas leituras da URL
 * tinham de ser a mesma — senão o menu acenderia "A receber" com a tela
 * mostrando "A pagar".
 */

export type Aba = "geral" | "contas" | "fluxo" | "carteiras";
export type TipoContas = "receber" | "pagar" | "calendario";

/*
 * Financeiro em QUATRO abas, reorganizado a pedido do João (07/10/2026), que
 * achou as seis de antes "bem desorganizadas":
 *
 *   Visão geral — o que está atrasado, o que entra e sai nos próximos 30
 *                 dias, para onde o caixa vai e onde o dinheiro está;
 *   Contas      — a pagar e a receber agrupadas por urgência, e o calendário
 *                 do mês (a antiga Agenda);
 *   Fluxo       — o extrato do que já aconteceu, tudo o que vai entrar
 *                 (de qualquer fonte) e a previsão do caixa;
 *   Carteiras   — onde o dinheiro está, com os cartões.
 *
 * Os indicadores ficam FORA das abas de propósito: "quanto tenho" e "quanto
 * devo" são a pergunta de abertura, independente do que se vá fazer depois.
 *
 * Os endereços antigos (?aba=caixa, pagar, receber, agenda, previsao)
 * continuam valendo: caem na aba nova equivalente. Link salvo e aviso do
 * Início não quebram.
 */
export function abaDaUrl(aba?: string, tipo?: string, ver?: string): { qual: Aba; tipo: TipoContas; ver: string } {
  const tipoOk: TipoContas = tipo === "pagar" || tipo === "calendario" ? tipo : "receber";
  switch (aba) {
    case "contas":
      return { qual: "contas", tipo: tipoOk, ver: "" };
    case "pagar":
    case "receber":
      return { qual: "contas", tipo: aba, ver: "" };
    case "agenda":
      return { qual: "contas", tipo: "calendario", ver: "" };
    case "fluxo":
    case "caixa":
      return { qual: "fluxo", tipo: tipoOk, ver: ver === "previsto" || ver === "entrar" ? ver : "realizado" };
    case "previsao":
      return { qual: "fluxo", tipo: tipoOk, ver: "previsto" };
    case "carteiras":
      return { qual: "carteiras", tipo: tipoOk, ver: "" };
    default:
      return { qual: "geral", tipo: tipoOk, ver: "" };
  }
}

/** O nome grande da tela — com as abas no menu, é ele que diz onde se está. */
export function tituloDaAba(qual: Aba, tipo: TipoContas, ver: string): string {
  if (qual === "contas")
    return tipo === "pagar" ? "Contas a pagar" : tipo === "calendario" ? "Calendário de contas" : "Contas a receber";
  if (qual === "fluxo") return ver === "entrar" ? "Vai entrar" : ver === "previsto" ? "Previsão do caixa" : "Extrato";
  return qual === "carteiras" ? "Carteiras e cartões" : "Visão geral";
}
