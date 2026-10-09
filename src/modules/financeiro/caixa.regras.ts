import type { Prisma } from "@prisma/client";

/*
 * O QUE CONTA NO CAIXA.
 *
 * Pedido do João (08/10/2026): a venda e a compra se fecham SEM o comprovante,
 * mas o dinheiro só entra (ou sai) do caixa quando o comprovante for anexado —
 * e só nas formas que têm papel: Pix, débito e crédito, ou saída por banco.
 * Dinheiro vivo e a gaveta contam na hora.
 *
 * Neutro (sem server-only): são só condições de busca, usadas por todas as
 * consultas que somam caixa. Se cada uma escrevesse a sua, uma delas
 * esqueceria a regra e o saldo de uma tela divergiria do da outra.
 */

/** Recebimento de venda que já entrou: dinheiro vivo, ou com comprovante. */
export const pagamentoNoCaixa = {
  OR: [{ forma: "DINHEIRO" }, { comprovanteId: { not: null } }],
} satisfies Prisma.PagamentoWhereInput;

/**
 * Lançamento que já aconteceu no caixa. Fica de fora: a saída que exige
 * comprovante e ainda não tem, e a taxa da maquininha de um recebimento que
 * ainda espera o dele (a taxa só existe depois do dinheiro).
 */
export const lancamentoNoCaixa = {
  NOT: [
    { exigeComprovante: true, comprovanteId: null },
    { taxaDe: { is: { forma: { in: ["DEBITO", "CREDITO"] }, comprovanteId: null } } },
  ],
} satisfies Prisma.LancamentoWhereInput;
