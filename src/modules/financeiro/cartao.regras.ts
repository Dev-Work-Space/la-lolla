/*
 * As regras do cartão que a TELA também precisa saber.
 *
 * Módulo neutro: sem "use client" e sem "server-only". O formulário de compra
 * mostra em que fatura o valor vai cair antes de salvar, e quem decide isso é
 * a mesma conta que o servidor faz. Duplicar a regra em JSX seria garantir que
 * um dia as duas discordem — e a que a pessoa lê na tela é a que ela acredita.
 */

import { inicioDoDia, proximoDiaMensal, somaDias } from "@/lib/dia";

/**
 * A compra de tal dia cai em qual fatura?
 *
 * Na primeira que ainda não fechou — e o vencimento é a primeira data de
 * vencimento depois desse fechamento. Sem dia de fechamento cadastrado, vale
 * o próximo vencimento a partir da compra, que é como o app antigo se
 * comportava para quem não sabia o fechamento de cor.
 */
export function vencimentoDaFatura(
  cartao: { diaFechamento: number | null; diaVencimento: number | null },
  compra: Date = new Date(),
): Date {
  const venc = cartao.diaVencimento ?? 10;
  const fech = cartao.diaFechamento ?? 0;
  const dia = inicioDoDia(compra);
  if (!fech) return proximoDiaMensal(dia, venc);
  return proximoDiaMensal(somaDias(proximoDiaMensal(dia, fech), 1), venc);
}

/** "AAAA-MM" já passou? Cartão que vence em setembro vale até 30 de setembro. */
export function cartaoVencido(validade: string | null): boolean {
  if (!validade) return false;
  const hoje = new Date();
  const mes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, "0")}`;
  return validade < mes;
}

/** "09/2027", para a tela. */
export function validadeBR(validade: string | null): string | null {
  if (!validade || validade.length < 7) return null;
  return `${validade.slice(5, 7)}/${validade.slice(0, 4)}`;
}
