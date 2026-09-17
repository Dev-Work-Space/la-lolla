import "server-only";

import { cache } from "react";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NaoEncontrado } from "@/lib/errors";
import { fimDoDia } from "@/lib/dia";
import {
  CATEGORIAS_FORA_DA_DESPESA,
  type CarteiraSaldo,
  type ContaLinha,
  type FiltroConta,
  type MovimentoCaixa,
} from "./financeiro.tipos";

// Reexporta para quem já importava daqui — mas quem é Client Component deve
// importar de ./financeiro.tipos, que não arrasta o Prisma junto.
export * from "./financeiro.tipos";

/*
 * FINANCEIRO.
 *
 * A distinção que organiza esta tela inteira, e que vem do app antigo:
 *
 *   CARTEIRA é ONDE o dinheiro está — espécie, conta do banco, reserva.
 *   FORMA DE PAGAMENTO é COMO o cliente pagou — Pix, débito, crédito.
 *
 * São eixos diferentes. Um Pix cai no banco, um crédito também, dinheiro vivo
 * fica na espécie. Misturar os dois é o erro clássico de caixa de loja.
 *
 * Saldo de uma carteira =
 *     saldo inicial
 *   + lançamentos dela
 *   + pagamentos de venda que entraram nela
 *   + transferências recebidas
 *   − transferências enviadas
 *
 * Venda CANCELADA não entra em nada — o filtro está em cada consulta.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));


/* ─────────────────────── carteiras ─────────────────────── */


export async function carteirasComSaldo(): Promise<CarteiraSaldo[]> {
  /* Saldo é o que existe HOJE. Um valor datado para amanhã já está gravado,
     mas ainda não aconteceu — somá-lo faria a carteira mostrar dinheiro que
     ninguém tem. É a mesma linha de corte em todos os quatro somatórios. */
  const ate = fimDoDia(new Date());

  const carteiras = await prisma.carteira.findMany({
    /* Cartão de crédito não entra: ele não guarda dinheiro, guarda quanto
       ainda dá para gastar. Some do total do caixa e de todo lugar onde se
       escolhe de onde o dinheiro saiu. */
    where: { arquivada: false, tipo: { not: "CARTAO" } },
    orderBy: [{ ordem: "asc" }, { nome: "asc" }],
    select: {
      id: true,
      nome: true,
      tipo: true,
      ordem: true,
      saldoInicial: true,
      lancamentos: { where: { data: { lte: ate } }, select: { valor: true } },
      pagamentos: {
        where: { venda: { status: { not: "CANCELADA" } }, data: { lte: ate } },
        select: { valor: true },
      },
      transferenciasSai: { where: { data: { lte: ate } }, select: { valor: true } },
      transferenciasEnt: { where: { data: { lte: ate } }, select: { valor: true } },
    },
  });

  return carteiras.map((c) => {
    const lanc = c.lancamentos.map((l) => num(l.valor));
    const vendas = c.pagamentos.map((p) => num(p.valor));
    const saiu = c.transferenciasSai.reduce((s, t) => s + num(t.valor), 0);
    const entrou = c.transferenciasEnt.reduce((s, t) => s + num(t.valor), 0);

    const entradas = r2(lanc.filter((v) => v > 0).reduce((s, v) => s + v, 0) + vendas.reduce((s, v) => s + v, 0) + entrou);
    const saidas = r2(Math.abs(lanc.filter((v) => v < 0).reduce((s, v) => s + v, 0)) + saiu);

    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      ordem: c.ordem,
      saldoInicial: num(c.saldoInicial),
      entradas,
      saidas,
      saldo: r2(num(c.saldoInicial) + entradas - saidas),
    };
  });
}

/** Entrada e saída que ainda não foram atribuídas a nenhuma carteira. */
export async function naoAtribuido() {
  const [lanc, pagos] = await Promise.all([
    prisma.lancamento.aggregate({ where: { carteiraId: null }, _sum: { valor: true } }),
    prisma.pagamento.aggregate({
      where: { carteiraId: null, venda: { status: { not: "CANCELADA" } } },
      _sum: { valor: true },
    }),
  ]);
  return r2(num(lanc._sum?.valor) + num(pagos._sum?.valor));
}

/* ─────────────────────── movimento do caixa ─────────────────────── */


/**
 * O extrato: lançamentos, pagamentos de venda e transferências, tudo na mesma
 * linha do tempo. No app antigo esses três viviam em listas separadas e o
 * João tinha de somar de cabeça para saber o que entrou no dia.
 */
export async function movimentoDoPeriodo(de: Date, ate: Date): Promise<MovimentoCaixa[]> {
  const janela = { gte: de, lte: ate };

  const [lancs, pagos, transfs] = await Promise.all([
    prisma.lancamento.findMany({
      where: { data: janela },
      select: {
        id: true,
        descricao: true,
        categoria: true,
        valor: true,
        data: true,
        comprovanteId: true,
        carteira: { select: { nome: true } },
      },
    }),
    prisma.pagamento.findMany({
      where: { data: janela, venda: { status: { not: "CANCELADA" } } },
      select: {
        id: true,
        forma: true,
        valor: true,
        data: true,
        comprovanteId: true,
        carteira: { select: { nome: true } },
        venda: { select: { id: true, numero: true, cliente: { select: { nome: true } } } },
      },
    }),
    prisma.transferencia.findMany({
      where: { data: janela },
      select: {
        id: true,
        valor: true,
        data: true,
        origem: { select: { nome: true } },
        destino: { select: { nome: true } },
      },
    }),
  ]);

  const linhas: MovimentoCaixa[] = [
    ...lancs.map<MovimentoCaixa>((l) => ({
      id: l.id,
      tipo: num(l.valor) >= 0 ? "entrada" : "saida",
      descricao: l.descricao,
      categoria: l.categoria,
      valor: Math.abs(num(l.valor)),
      carteira: l.carteira?.nome ?? null,
      quando: l.data,
      origem: "lancamento",
      temComprovante: !!l.comprovanteId,
    })),
    ...pagos.map<MovimentoCaixa>((p) => ({
      id: p.id,
      tipo: "entrada",
      descricao: `Venda #${p.venda.numero}${p.venda.cliente ? ` · ${p.venda.cliente.nome}` : ""}`,
      categoria: p.forma,
      valor: num(p.valor),
      carteira: p.carteira?.nome ?? null,
      quando: p.data,
      origem: "venda",
      href: `/vendas/${p.venda.id}`,
      temComprovante: !!p.comprovanteId,
    })),
    ...transfs.map<MovimentoCaixa>((t) => ({
      id: t.id,
      tipo: "saida",
      descricao: `Transferência · ${t.origem.nome} → ${t.destino.nome}`,
      categoria: "Transferência",
      valor: num(t.valor),
      carteira: t.origem.nome,
      quando: t.data,
      origem: "transferencia",
      temComprovante: true,
    })),
  ];

  return linhas.sort((a, b) => b.quando.getTime() - a.quando.getTime());
}

/* ─────────────────────── contas ─────────────────────── */



export async function listarContas(tipo: "PAGAR" | "RECEBER", filtro: FiltroConta = "abertas") {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7);

  const where: Prisma.ContaWhereInput = {
    tipo,
    ...(filtro === "abertas" ? { status: "ABERTA" } : {}),
    ...(filtro === "pagas" ? { status: "PAGA" } : {}),
    ...(filtro === "vencidas" ? { status: "ABERTA", vencimento: { lt: hoje } } : {}),
    ...(filtro === "semana"
      ? { status: "ABERTA", vencimento: { gte: hoje, lte: em7 } }
      : {}),
  };

  const contas = await prisma.conta.findMany({
    where,
    orderBy: [{ vencimento: "asc" }],
    select: {
      id: true,
      tipo: true,
      descricao: true,
      valor: true,
      vencimento: true,
      status: true,
      parcela: true,
      deParcelas: true,
      vendaId: true,
      fornecedor: { select: { nome: true } },
    },
    take: 300,
  });

  return contas.map<ContaLinha>((c) => {
    const dias = Math.ceil((c.vencimento.getTime() - hoje.getTime()) / 86_400_000);
    return {
      id: c.id,
      tipo: c.tipo,
      descricao: c.descricao,
      valor: num(c.valor),
      vencimento: c.vencimento,
      paga: c.status === "PAGA",
      cancelada: c.status === "CANCELADA",
      vencida: c.status === "ABERTA" && dias < 0,
      diasAteVencer: dias,
      fornecedor: c.fornecedor?.nome ?? null,
      vendaId: c.vendaId,
      parcela: c.parcela && c.deParcelas ? `${c.parcela}/${c.deParcelas}` : null,
    };
  });
}

/* ─────────────────────── indicadores ─────────────────────── */

/*
 * `cache()` do React memoiza por REQUISIÇÃO.
 *
 * Faz diferença agora que a tela do Financeiro é montada em pedaços: os
 * quatro indicadores de cima e o painel da aba são blocos independentes, cada
 * um no seu <Suspense>, e os DOIS precisam da lista de carteiras. Sem isto
 * seriam duas viagens ao banco para a mesma resposta; com isto, uma só, e
 * cada bloco aparece assim que fica pronto.
 *
 * Não recebe argumento, então a memoização é exata — não há chave para errar.
 */
export const indicadoresFinanceiro = cache(async () => {
  const hoje = new Date();
  hoje.setHours(0, 0, 0, 0);
  const em7 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7);
  const mes0 = new Date(hoje.getFullYear(), hoje.getMonth(), 1);

  const [carteiras, solto, aPagar, aReceber, vencidasPagar, aVencer, lancMes] = await Promise.all([
    carteirasComSaldo(),
    naoAtribuido(),
    prisma.conta.aggregate({ where: { tipo: "PAGAR", status: "ABERTA" }, _sum: { valor: true }, _count: true }),
    prisma.conta.aggregate({ where: { tipo: "RECEBER", status: "ABERTA" }, _sum: { valor: true }, _count: true }),
    prisma.conta.count({ where: { tipo: "PAGAR", status: "ABERTA", vencimento: { lt: hoje } } }),
    prisma.conta.count({
      where: { status: "ABERTA", vencimento: { gte: hoje, lte: em7 } },
    }),
    prisma.lancamento.findMany({
      where: { data: { gte: mes0 } },
      select: { valor: true, categoria: true },
    }),
  ]);

  const despesasMes = r2(
    Math.abs(
      lancMes
        .filter((l) => num(l.valor) < 0 && !CATEGORIAS_FORA_DA_DESPESA.includes(l.categoria ?? ""))
        .reduce((s, l) => s + num(l.valor), 0),
    ),
  );

  return {
    emCaixa: r2(carteiras.reduce((s, c) => s + c.saldo, 0) + solto),
    naoAtribuido: solto,
    carteiras,
    aPagar: num(aPagar._sum.valor),
    contasAPagar: aPagar._count,
    aReceber: num(aReceber._sum.valor),
    contasAReceber: aReceber._count,
    vencidas: vencidasPagar,
    vencendoEm7: aVencer,
    despesasMes,
  };
});

export async function buscarConta(id: string) {
  const c = await prisma.conta.findUnique({
    where: { id },
    select: { id: true, tipo: true, descricao: true, valor: true, status: true, vendaId: true },
  });
  if (!c) throw new NaoEncontrado("Conta");
  return { ...c, valor: num(c.valor) };
}
