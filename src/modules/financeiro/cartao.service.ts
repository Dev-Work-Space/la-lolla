import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cartaoVencido, validadeBR } from "./cartao.regras";
import type { CartaoResumo, FaturaLinha } from "./financeiro.tipos";

/* A conta de "em que fatura isto cai" mora em `cartao.regras`, que é neutro:
   a tela de compra mostra o vencimento antes de salvar, e tem de ser a MESMA
   conta. Reexportada aqui para quem já importava do serviço. */
export { vencimentoDaFatura, cartaoVencido, validadeBR } from "./cartao.regras";

/*
 * CARTÃO DE CRÉDITO.
 *
 * Cartão NÃO é carteira. Carteira é onde o dinheiro ESTÁ; cartão é quanto dá
 * para gastar antes de ter o dinheiro. Por isso ele fica fora do saldo do
 * caixa e fora de todo lugar onde se escolhe de onde o dinheiro saiu: no
 * crédito o dinheiro só sai mesmo no dia em que a fatura é paga.
 *
 * A regra que faz o resto funcionar sozinho: cada compra no crédito vira uma
 * CONTA A PAGAR com vencimento na fatura certa. Assim o limite usado é sempre
 * a soma do que ainda não foi pago — uma fonte só, sem um contador paralelo
 * para sair do lugar.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Os cartões com limite, usado, disponível e a próxima fatura.
 *
 * `usado` sai das contas em aberto do cartão, mais o `usadoInicial` — o que
 * já estava comprometido antes de a loja usar o app. Sem esse campo o limite
 * apareceria inteiro no primeiro dia e a pessoa gastaria o que não tinha.
 */
export async function cartoesComLimite(): Promise<CartaoResumo[]> {
  const cartoes = await prisma.carteira.findMany({
    where: { arquivada: false, tipo: "CARTAO" },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      limite: true,
      usadoInicial: true,
      diaFechamento: true,
      diaVencimento: true,
      validade: true,
      contasCartao: {
        where: { status: "ABERTA" },
        select: { valor: true, vencimento: true },
        orderBy: { vencimento: "asc" },
      },
    },
  });

  return cartoes.map((c) => {
    const abertas = c.contasCartao;
    const usado = r2(num(c.usadoInicial) + abertas.reduce((s, x) => s + num(x.valor), 0));
    const limite = num(c.limite);
    const disponivel = r2(limite - usado);

    /* A próxima fatura é o conjunto de contas que vence no MESMO dia da mais
       antiga em aberto. Ninguém paga uma compra do cartão, paga a fatura. */
    const primeira = abertas[0]?.vencimento ?? null;
    const doGrupo = primeira
      ? abertas.filter((x) => x.vencimento.getTime() === primeira.getTime())
      : [];

    return {
      id: c.id,
      nome: c.nome,
      limite,
      usadoInicial: num(c.usadoInicial),
      usado,
      disponivel,
      pct: limite > 0 ? Math.max(0, Math.min(100, Math.round((usado / limite) * 100))) : 0,
      diaFechamento: c.diaFechamento,
      diaVencimento: c.diaVencimento,
      validade: c.validade,
      validadeBR: validadeBR(c.validade),
      vencido: cartaoVencido(c.validade),
      proximaFatura: primeira
        ? {
            vencimento: primeira,
            total: r2(doGrupo.reduce((s, x) => s + num(x.valor), 0)),
            compras: doGrupo.length,
          }
        : null,
    };
  });
}

/** As compras de uma fatura: tudo do cartão que vence naquele dia. */
export async function faturaDoCartao(cartaoId: string, vencimento: Date): Promise<FaturaLinha[]> {
  const itens = await prisma.conta.findMany({
    where: { cartaoId, status: "ABERTA", vencimento },
    orderBy: [{ dataCompra: "asc" }, { descricao: "asc" }],
    select: {
      id: true,
      descricao: true,
      valor: true,
      dataCompra: true,
      parcela: true,
      deParcelas: true,
    },
  });

  return itens.map((c) => ({
    id: c.id,
    descricao: c.descricao,
    valor: num(c.valor),
    dataCompra: c.dataCompra,
    parcela: c.parcela && c.deParcelas ? `${c.parcela}/${c.deParcelas}` : null,
  }));
}

/** Um cartão pelo id, com o que o cálculo da fatura precisa. */
export async function buscarCartao(id: string) {
  return prisma.carteira.findFirst({
    where: { id, tipo: "CARTAO" },
    select: {
      id: true,
      nome: true,
      limite: true,
      usadoInicial: true,
      diaFechamento: true,
      diaVencimento: true,
      validade: true,
    },
  });
}
