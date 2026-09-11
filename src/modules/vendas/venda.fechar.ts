import "server-only";

import { Prisma, type FormaPagamento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { totalDe, vencimentoParcela, type Intervalo } from "./venda.service";

/*
 * Fechar uma venda. Tudo numa transação só, porque cinco coisas precisam
 * acontecer juntas ou nenhuma acontecer:
 *
 *   1. a venda nasce
 *   2. cada item congela PREÇO e CUSTO do momento
 *   3. o estoque baixa por MOVIMENTO (nunca por edição de saldo)
 *   4. os pagamentos entram
 *   5. o que ficou a prazo vira parcela em contas a receber
 *
 * Se o passo 3 falhar no meio, uma venda sem baixa de estoque teria ficado
 * gravada — e o saldo do catálogo passaria a mentir. Daí a transação.
 */

export type ItemEntrada = { pecaId: string; quantidade: number; precoUnit: number };
export type PagamentoEntrada = { forma: FormaPagamento; valor: number; parcelas?: number };

export type VendaEntrada = {
  clienteId?: string | null;
  vendedorId?: string | null;
  itens: ItemEntrada[];
  desconto: number;
  observacao?: string | null;
  pagamentos: PagamentoEntrada[];
  /** Quando sobra saldo: em quantas vezes e de quanto em quanto tempo. */
  aPrazo?: { parcelas: number; intervalo: Intervalo; primeiroVencimento: Date } | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function fecharVenda(entrada: VendaEntrada) {
  if (entrada.itens.length === 0) {
    throw new ErroDominio("REGRA_NEGOCIO", "Adicione ao menos uma peça à venda.");
  }

  return prisma.$transaction(async (tx) => {
    // Lê as peças DENTRO da transação: preço e custo do instante do fechamento.
    const ids = [...new Set(entrada.itens.map((i) => i.pecaId))];
    const pecas = await tx.peca.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, custo: true, movimentos: { select: { delta: true } } },
    });

    const porId = new Map(pecas.map((p) => [p.id, p]));
    for (const it of entrada.itens) {
      const p = porId.get(it.pecaId);
      if (!p) throw new ErroDominio("NAO_ENCONTRADO", "Uma das peças não existe mais.");
      if (it.quantidade <= 0) {
        throw new ErroDominio("DADOS_INVALIDOS", `Quantidade inválida em "${p.nome}".`);
      }
    }

    /*
     * SALDO NEGATIVO É RECUSADO EM QUALQUER CAMINHO (documentação, seção 15).
     *
     * Eu havia deixado passar com aviso, pensando no balcão — a peça na mão da
     * cliente antes de o app saber. O João manteve a regra do documento, e ele
     * tem razão: saldo negativo contamina o estoque a custo e o saldo com
     * fornecedor, que são números de dinheiro.
     *
     * A mensagem diz o que fazer, em vez de só barrar.
     */
    for (const it of entrada.itens) {
      const p = porId.get(it.pecaId)!;
      const saldo = p.movimentos.reduce((sm, m) => sm + m.delta, 0);
      if (it.quantidade > saldo) {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          saldo <= 0
            ? `"${p.nome}" está sem estoque. Dê entrada pelo Portal de compras antes de vender.`
            : `"${p.nome}" tem só ${saldo} em estoque e a venda pede ${it.quantidade}.`,
        );
      }
    }

    const itensCalc = entrada.itens.map((i) => ({
      quantidade: i.quantidade,
      devolvido: 0,
      precoUnit: i.precoUnit,
      custoUnit: Number(porId.get(i.pecaId)!.custo ?? 0),
    }));

    const total = totalDe(itensCalc, entrada.desconto);
    const pago = r2(entrada.pagamentos.reduce((s, p) => s + p.valor, 0));

    if (pago > total + 0.005) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `O pagamento (${pago.toFixed(2)}) é maior que o total da venda (${total.toFixed(2)}).`,
      );
    }

    const saldo = r2(total - pago);
    // Venda avulsa (sem cliente) não pode ficar a prazo: não haveria de quem
    // cobrar. Documentação, seção 02 e 15.
    if (saldo > 0.005 && !entrada.clienteId) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Selecione o cliente para venda a prazo — venda avulsa precisa sair quitada.",
      );
    }

    if (saldo > 0.005 && !entrada.aPrazo) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Falta combinar como o saldo será pago. Informe o parcelamento ou complete o pagamento.",
      );
    }

    // 1 e 2 — a venda e os itens, com preço e custo congelados
    const venda = await tx.venda.create({
      data: {
        status: "FECHADA",
        clienteId: entrada.clienteId || null,
        vendedorId: entrada.vendedorId || null,
        subtotal: new Prisma.Decimal(
          itensCalc.reduce((s, i) => s + i.precoUnit * i.quantidade, 0).toFixed(2),
        ),
        desconto: new Prisma.Decimal(entrada.desconto.toFixed(2)),
        total: new Prisma.Decimal(total.toFixed(2)),
        observacao: entrada.observacao || null,
        itens: {
          create: entrada.itens.map((i) => ({
            pecaId: i.pecaId,
            quantidade: i.quantidade,
            precoUnit: new Prisma.Decimal(i.precoUnit.toFixed(2)),
            custoUnit: porId.get(i.pecaId)!.custo,
          })),
        },
        pagamentos: {
          create: entrada.pagamentos.map((p) => ({
            forma: p.forma,
            valor: new Prisma.Decimal(p.valor.toFixed(2)),
            parcelas: p.parcelas ?? 1,
          })),
        },
      },
      select: { id: true, numero: true },
    });

    // 3 — estoque baixa por movimento, com a venda como origem
    for (const i of entrada.itens) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: -i.quantidade,
          motivo: "VENDA",
          origem: venda.id,
          observacao: `Venda #${venda.numero}`,
        },
      });
    }

    // 5 — o saldo a prazo vira parcelas em contas a receber
    if (saldo > 0.005 && entrada.aPrazo) {
      const { parcelas, intervalo, primeiroVencimento } = entrada.aPrazo;
      const valorBase = Math.floor((saldo / parcelas) * 100) / 100;
      // A sobra de centavos vai na ÚLTIMA parcela — documentação, seção 15:
      // R$ 100,00 em 3 = 33,33 + 33,33 + 33,34.
      const sobra = r2(saldo - valorBase * parcelas);

      for (let k = 0; k < parcelas; k++) {
        const ultima = k === parcelas - 1;
        await tx.conta.create({
          data: {
            tipo: "RECEBER",
            status: "ABERTA",
            descricao: `Venda #${venda.numero} · parcela ${k + 1}/${parcelas}`,
            valor: new Prisma.Decimal((ultima ? valorBase + sobra : valorBase).toFixed(2)),
            vencimento:
              k === 0 ? primeiroVencimento : vencimentoParcela(primeiroVencimento, k, intervalo),
            vendaId: venda.id,
            parcela: k + 1,
            deParcelas: parcelas,
          },
        });
      }
    }

    return venda;
  });
}

/*
 * Cancelar. Regra 2.10: venda NÃO se apaga.
 *
 * O registro fica, some de todo cálculo de dinheiro, o estoque volta e as
 * parcelas em aberto são canceladas. Quem já pagou continua com o pagamento
 * registrado — devolver dinheiro é outra operação, no caixa.
 */
export async function cancelarVenda(id: string, motivo: string) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUnique({
      where: { id },
      select: { id: true, numero: true, status: true, itens: { select: { pecaId: true, quantidade: true, devolvido: true } } },
    });
    if (!v) throw new ErroDominio("NAO_ENCONTRADO", "Essa venda não existe mais.");
    if (v.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "Esta venda já está cancelada.");
    }

    // Devolve ao estoque o que ainda não tinha voltado por devolução.
    for (const i of v.itens) {
      const volta = i.quantidade - i.devolvido;
      if (volta > 0) {
        await tx.movimentoEstoque.create({
          data: {
            pecaId: i.pecaId,
            delta: volta,
            motivo: "DEVOLUCAO",
            origem: v.id,
            observacao: `Cancelamento da venda #${v.numero}`,
          },
        });
      }
    }

    await tx.conta.updateMany({
      where: { vendaId: id, status: "ABERTA" },
      data: { status: "CANCELADA" },
    });

    return tx.venda.update({
      where: { id },
      data: { status: "CANCELADA", canceladaEm: new Date(), motivoCancelada: motivo },
      select: { id: true, numero: true },
    });
  });
}

/** Registrar um pagamento depois do fechamento (venda a prazo sendo quitada). */
export async function receberPagamento(entrada: {
  vendaId: string;
  forma: FormaPagamento;
  valor: number;
  contaId?: string | null;
}) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUnique({
      where: { id: entrada.vendaId },
      select: { id: true, status: true },
    });
    if (!v) throw new ErroDominio("NAO_ENCONTRADO", "Essa venda não existe mais.");
    if (v.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "Venda cancelada não recebe pagamento.");
    }
    if (entrada.valor <= 0) {
      throw new ErroDominio("DADOS_INVALIDOS", "Informe um valor maior que zero.");
    }

    const pag = await tx.pagamento.create({
      data: {
        vendaId: entrada.vendaId,
        forma: entrada.forma,
        valor: new Prisma.Decimal(entrada.valor.toFixed(2)),
      },
      select: { id: true },
    });

    if (entrada.contaId) {
      await tx.conta.update({
        where: { id: entrada.contaId },
        data: { status: "PAGA", pagoEm: new Date() },
      });
    }

    return pag;
  });
}

/**
 * Devolução: a peça volta ao estoque e o valor abate do total.
 * O item NÃO é apagado — fica o rastro de que a venda existiu e de quanto
 * dela voltou.
 */
export async function devolverItem(itemId: string, quantidade: number) {
  return prisma.$transaction(async (tx) => {
    const item = await tx.itemVenda.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        pecaId: true,
        quantidade: true,
        devolvido: true,
        venda: { select: { id: true, numero: true, status: true } },
      },
    });
    if (!item) throw new ErroDominio("NAO_ENCONTRADO", "Esse item não existe mais.");
    if (item.venda.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "A venda já foi cancelada inteira.");
    }

    const podeVoltar = item.quantidade - item.devolvido;
    if (quantidade <= 0 || quantidade > podeVoltar) {
      throw new ErroDominio(
        "DADOS_INVALIDOS",
        `Só é possível devolver até ${podeVoltar} unidade${podeVoltar === 1 ? "" : "s"}.`,
      );
    }

    await tx.itemVenda.update({
      where: { id: itemId },
      data: { devolvido: { increment: quantidade } },
    });

    await tx.movimentoEstoque.create({
      data: {
        pecaId: item.pecaId,
        delta: quantidade,
        motivo: "DEVOLUCAO",
        origem: item.venda.id,
        observacao: `Devolução da venda #${item.venda.numero}`,
      },
    });

    return { vendaId: item.venda.id };
  });
}
