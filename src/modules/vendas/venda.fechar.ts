import "server-only";

import { Prisma, type FormaPagamento, type ResolucaoDevolucao } from "@prisma/client";
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

/*
 * `carteiraId` é ONDE o dinheiro entrou — a gaveta, o banco.
 *
 * Sem ele, todo dinheiro de venda ficava fora das carteiras e o Financeiro
 * mostrava a loja vendendo sem o caixa subir. Era o buraco mais caro que
 * restava: a venda é a maior entrada da loja.
 *
 * Continua opcional de propósito. Quem não vê financeiro (a vendedora) não
 * recebe a lista de carteiras e não tem como escolher — o pagamento dela cai
 * em "sem carteira", que é um grupo que existe justamente para isso, e o João
 * atribui depois.
 */
export type PagamentoEntrada = {
  forma: FormaPagamento;
  valor: number;
  parcelas?: number;
  carteiraId?: string | null;
};

/*
 * A EMBALAGEM que saiu com a venda: o saquinho, a caixinha, o laço.
 *
 * Não é item de venda — não tem preço, ninguém cobra por ela. É CUSTO, e é
 * o custo que some quando não se registra: a loja acha que ganhou R$ 90 numa
 * peça e ganhou R$ 86. Por isso o insumo entra pelo custo congelado, igual
 * ao da peça, e baixa do estoque dele pelo mesmo caminho: movimento.
 */
export type InsumoEntrada = { pecaId: string; quantidade: number };

export type VendaEntrada = {
  clienteId?: string | null;
  vendedorId?: string | null;
  itens: ItemEntrada[];
  /** Embalagem e insumos consumidos nesta venda. Custo, nunca preço. */
  insumos?: InsumoEntrada[];
  desconto: number;
  observacao?: string | null;
  pagamentos: PagamentoEntrada[];
  /** Quando sobra saldo: em quantas vezes e de quanto em quanto tempo. */
  /*
   * O parcelamento.
   *
   * `vencimentos` é a combinação DE VERDADE: uma data por parcela, do jeito
   * que a cliente combinou. Quando ela vem, manda nela; `intervalo` e
   * `primeiroVencimento` continuam existindo porque são o atalho de quem só
   * quer "3x, todo dia 10" e não quer digitar três datas.
   */
  aPrazo?: {
    parcelas: number;
    intervalo: Intervalo;
    primeiroVencimento: Date;
    vencimentos?: Date[] | null;
  } | null;
  /*
   * A DATA DA VENDA, que não é a data do registro.
   *
   * A venda de sábado lançada na segunda fatura no sábado. Sem este campo o
   * relatório do mês, o "vendido hoje" e o caixa usavam "quando foi digitado".
   */
  data?: Date | null;
  /*
   * A venda veio de um orçamento aprovado. Entra na MESMA transação de
   * propósito: se o orçamento fosse marcado depois, uma queda de rede no meio
   * deixaria a venda feita e a proposta ainda "em aberto" — reservando peça
   * que já saiu da loja, e passível de ser convertida uma segunda vez.
   */
  orcamentoId?: string | null;
};

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function fecharVenda(entrada: VendaEntrada) {
  if (entrada.itens.length === 0) {
    throw new ErroDominio("REGRA_NEGOCIO", "Adicione ao menos uma peça à venda.");
  }

  return prisma.$transaction(async (tx) => {
    /*
     * O orçamento é conferido ANTES de qualquer gravação. Converter duas vezes
     * geraria duas vendas para a mesma proposta — o estoque baixaria em dobro
     * e a cliente apareceria devendo o dobro. Acontece mais do que parece: dois
     * toques no botão, ou a mesma página aberta em dois aparelhos.
     */
    if (entrada.orcamentoId) {
      const orc = await tx.orcamento.findUnique({
        where: { id: entrada.orcamentoId },
        select: { id: true, numero: true, status: true },
      });
      if (!orc) throw new ErroDominio("NAO_ENCONTRADO", "Esse orçamento não existe mais.");
      if (orc.status === "CONVERTIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          `O orçamento Nº ${String(orc.numero).padStart(4, "0")} já virou venda. Abra a venda dele em vez de converter de novo.`,
        );
      }
      if (orc.status === "SUBSTITUIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          "Esse orçamento foi substituído por uma revisão. Converta a revisão, que é a que vale.",
        );
      }
    }

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

    /*
     * Os insumos, lidos na mesma transação e pelo mesmo motivo: o custo tem
     * de ser o do instante do fechamento. Se a caixinha subir de preço mês
     * que vem, a margem desta venda não pode mudar junto.
     */
    const insumos = (entrada.insumos ?? []).filter((i) => i.quantidade > 0);
    const insumosPorId = new Map<string, { nome: string; custo: number; saldo: number }>();
    if (insumos.length > 0) {
      const achados = await tx.peca.findMany({
        where: { id: { in: [...new Set(insumos.map((i) => i.pecaId))] } },
        select: { id: true, nome: true, tipo: true, custo: true, movimentos: { select: { delta: true } } },
      });
      for (const p of achados) {
        insumosPorId.set(p.id, {
          nome: p.nome,
          custo: Number(p.custo ?? 0),
          saldo: p.movimentos.reduce((sm, m) => sm + m.delta, 0),
        });
        if (p.tipo !== "INSUMO") {
          throw new ErroDominio(
            "REGRA_NEGOCIO",
            `"${p.nome}" é peça, não insumo. Peça entra no carrinho, com preço.`,
          );
        }
      }
      for (const i of insumos) {
        const p = insumosPorId.get(i.pecaId);
        if (!p) throw new ErroDominio("NAO_ENCONTRADO", "Um dos insumos não existe mais.");
        if (i.quantidade > p.saldo) {
          throw new ErroDominio(
            "REGRA_NEGOCIO",
            `"${p.nome}" tem só ${p.saldo} em estoque e a venda usaria ${i.quantidade}. Dê entrada antes.`,
          );
        }
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
    const dataVenda = entrada.data ?? new Date();

    const venda = await tx.venda.create({
      data: {
        status: "FECHADA",
        data: dataVenda,
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
            carteiraId: p.carteiraId || null,
            /* O dinheiro entrou no dia da VENDA, não no dia do registro. */
            data: dataVenda,
          })),
        },
      },
      select: { id: true, numero: true },
    });

    // 3a — a embalagem consumida, com o custo congelado
    for (const i of insumos) {
      const p = insumosPorId.get(i.pecaId)!;
      await tx.insumoVenda.create({
        data: {
          vendaId: venda.id,
          pecaId: i.pecaId,
          quantidade: i.quantidade,
          custoUnit: new Prisma.Decimal(p.custo.toFixed(2)),
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: -i.quantidade,
          motivo: "VENDA",
          origem: venda.id,
          observacao: `Embalagem da venda #${venda.numero}`,
          data: dataVenda,
        },
      });
    }

    // 3 — estoque baixa por movimento, com a venda como origem
    for (const i of entrada.itens) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: -i.quantidade,
          motivo: "VENDA",
          origem: venda.id,
          observacao: `Venda #${venda.numero}`,
          /* A peça saiu da prateleira no dia da venda. O histórico da peça
             tem de contar a mesma história que o relatório do mês. */
          data: dataVenda,
        },
      });
    }

    // 5 — o saldo a prazo vira parcelas em contas a receber
    if (saldo > 0.005 && entrada.aPrazo) {
      const { parcelas, intervalo, primeiroVencimento, vencimentos } = entrada.aPrazo;
      /* Data escolhida parcela a parcela tem prioridade sobre o intervalo. */
      const vencimentoDe = (k: number) =>
        vencimentos?.[k] ??
        (k === 0 ? primeiroVencimento : vencimentoParcela(primeiroVencimento, k, intervalo));
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
            vencimento: vencimentoDe(k),
            vendaId: venda.id,
            parcela: k + 1,
            deParcelas: parcelas,
          },
        });
      }
    }

    /* 6 — o orçamento vira Aprovado e passa a apontar para a venda. Daqui em
       diante ele deixa de reservar peça, porque só reserva quem está ABERTO. */
    if (entrada.orcamentoId) {
      await tx.orcamento.update({
        where: { id: entrada.orcamentoId },
        data: { status: "CONVERTIDO", vendaId: venda.id },
      });
    }

    return venda;
  });
}

/*
 * EDITAR uma venda já fechada.
 *
 * Existe no app antigo e é usada de verdade: a moça lança a venda com a
 * cliente no balcão e descobre depois que era outro anel, outro preço, outra
 * cliente. Sem edição, a única saída é cancelar e lançar de novo — e aí a
 * venda muda de número, some do histórico da cliente e a numeração fica com
 * buracos.
 *
 * O caminho é ESTORNAR e refazer, nunca "corrigir por cima": o estoque só
 * muda por movimento, então a venda antiga devolve o que tinha tirado e a
 * venda nova tira de novo. Fica tudo no histórico da peça — quem olhar vai ver
 * a edição, com o número da venda do lado.
 *
 * Duas coisas a edição NÃO faz, de propósito:
 *
 *   - não mexe nos recebimentos. Dinheiro que entrou é fato; para desfazer,
 *     existe "remover recebimento", que devolve o valor à carteira.
 *   - não edita venda com devolução registrada. A devolução já mexeu no item,
 *     no estoque e no caixa; refazer os itens por cima apagaria esse rastro.
 */
export type EdicaoEntrada = {
  vendaId: string;
  clienteId?: string | null;
  itens: ItemEntrada[];
  insumos?: InsumoEntrada[];
  desconto: number;
  observacao?: string | null;
  data?: Date | null;
  /*
   * O parcelamento.
   *
   * `vencimentos` é a combinação DE VERDADE: uma data por parcela, do jeito
   * que a cliente combinou. Quando ela vem, manda nela; `intervalo` e
   * `primeiroVencimento` continuam existindo porque são o atalho de quem só
   * quer "3x, todo dia 10" e não quer digitar três datas.
   */
  aPrazo?: {
    parcelas: number;
    intervalo: Intervalo;
    primeiroVencimento: Date;
    vencimentos?: Date[] | null;
  } | null;
};

export async function editarVenda(entrada: EdicaoEntrada) {
  if (entrada.itens.length === 0) {
    throw new ErroDominio("REGRA_NEGOCIO", "A venda precisa de ao menos uma peça.");
  }

  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUnique({
      where: { id: entrada.vendaId },
      select: {
        id: true,
        numero: true,
        status: true,
        itens: { select: { id: true, pecaId: true, quantidade: true } },
        insumos: { select: { id: true, pecaId: true, quantidade: true } },
        pagamentos: { select: { valor: true } },
        devolucoes: { select: { id: true } },
      },
    });
    if (!v) throw new ErroDominio("NAO_ENCONTRADO", "Essa venda não existe mais.");
    if (v.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "Venda cancelada não se edita.");
    }
    if (v.devolucoes.length > 0) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Esta venda tem devolução registrada e não pode ser editada. " +
          "Para mudar o que foi vendido, cancele a venda e lance de novo.",
      );
    }

    const dataVenda = entrada.data ?? new Date();

    /* 1 — estorna o que a venda tinha tirado do estoque, peça e embalagem. */
    for (const i of v.itens) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: i.quantidade,
          motivo: "AJUSTE",
          origem: v.id,
          observacao: `Edição da venda #${v.numero} · estorno`,
          data: dataVenda,
        },
      });
    }
    for (const i of v.insumos) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: i.quantidade,
          motivo: "AJUSTE",
          origem: v.id,
          observacao: `Edição da venda #${v.numero} · estorno da embalagem`,
          data: dataVenda,
        },
      });
    }
    await tx.itemVenda.deleteMany({ where: { vendaId: v.id } });
    await tx.insumoVenda.deleteMany({ where: { vendaId: v.id } });

    /* 2 — as peças novas, com saldo já contando o estorno acima. */
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
      const saldo = p.movimentos.reduce((s, m) => s + m.delta, 0);
      if (it.quantidade > saldo) {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          saldo <= 0
            ? `"${p.nome}" está sem estoque. Dê entrada pelo Portal de compras antes.`
            : `"${p.nome}" tem só ${saldo} em estoque e a venda pede ${it.quantidade}.`,
        );
      }
    }

    const insumos = (entrada.insumos ?? []).filter((i) => i.quantidade > 0);
    const insumosPorId = new Map<string, { nome: string; custo: number; saldo: number }>();
    if (insumos.length > 0) {
      const achados = await tx.peca.findMany({
        where: { id: { in: [...new Set(insumos.map((i) => i.pecaId))] } },
        select: { id: true, nome: true, tipo: true, custo: true, movimentos: { select: { delta: true } } },
      });
      for (const p of achados) {
        if (p.tipo !== "INSUMO") {
          throw new ErroDominio("REGRA_NEGOCIO", `"${p.nome}" é peça, não insumo.`);
        }
        insumosPorId.set(p.id, {
          nome: p.nome,
          custo: Number(p.custo ?? 0),
          saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
        });
      }
      for (const i of insumos) {
        const p = insumosPorId.get(i.pecaId);
        if (!p) throw new ErroDominio("NAO_ENCONTRADO", "Um dos insumos não existe mais.");
        if (i.quantidade > p.saldo) {
          throw new ErroDominio(
            "REGRA_NEGOCIO",
            `"${p.nome}" tem só ${p.saldo} em estoque e a venda usaria ${i.quantidade}.`,
          );
        }
      }
    }

    const itensCalc = entrada.itens.map((i) => ({
      quantidade: i.quantidade,
      devolvido: 0,
      precoUnit: i.precoUnit,
      custoUnit: Number(porId.get(i.pecaId)!.custo ?? 0),
    }));
    const total = totalDe(itensCalc, entrada.desconto);
    const pago = r2(v.pagamentos.reduce((s, p) => s + Number(p.valor), 0));

    /* O dinheiro já recebido não some numa edição. Se o novo total é menor do
       que ele, a diferença é da cliente — e devolver dinheiro é outra
       operação, com registro próprio. */
    if (pago > total + 0.005) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `Esta venda já recebeu ${pago.toFixed(2)} e o novo total é ${total.toFixed(2)}. ` +
          `Remova o recebimento a mais antes de editar, ou registre a devolução.`,
      );
    }

    const saldo = r2(total - pago);
    if (saldo > 0.005 && !entrada.clienteId) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Selecione o cliente para venda a prazo — venda avulsa precisa sair quitada.",
      );
    }
    if (saldo > 0.005 && !entrada.aPrazo) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Falta combinar como o saldo será pago. Informe o parcelamento.",
      );
    }

    /* 3 — itens e embalagem novos, com o estoque baixando outra vez. */
    for (const i of entrada.itens) {
      await tx.itemVenda.create({
        data: {
          vendaId: v.id,
          pecaId: i.pecaId,
          quantidade: i.quantidade,
          precoUnit: new Prisma.Decimal(i.precoUnit.toFixed(2)),
          custoUnit: porId.get(i.pecaId)!.custo,
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: -i.quantidade,
          motivo: "VENDA",
          origem: v.id,
          observacao: `Venda #${v.numero} · editada`,
          data: dataVenda,
        },
      });
    }
    for (const i of insumos) {
      const p = insumosPorId.get(i.pecaId)!;
      await tx.insumoVenda.create({
        data: {
          vendaId: v.id,
          pecaId: i.pecaId,
          quantidade: i.quantidade,
          custoUnit: new Prisma.Decimal(p.custo.toFixed(2)),
        },
      });
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: -i.quantidade,
          motivo: "VENDA",
          origem: v.id,
          observacao: `Embalagem da venda #${v.numero} · editada`,
          data: dataVenda,
        },
      });
    }

    /* 4 — as parcelas em aberto são refeitas para o novo saldo. As já pagas
       ficam: elas são recibo do que a cliente pagou, não previsão. */
    await tx.conta.updateMany({
      where: { vendaId: v.id, status: "ABERTA" },
      data: { status: "CANCELADA" },
    });

    if (saldo > 0.005 && entrada.aPrazo) {
      const { parcelas, intervalo, primeiroVencimento, vencimentos } = entrada.aPrazo;
      /* Data escolhida parcela a parcela tem prioridade sobre o intervalo. */
      const vencimentoDe = (k: number) =>
        vencimentos?.[k] ??
        (k === 0 ? primeiroVencimento : vencimentoParcela(primeiroVencimento, k, intervalo));
      const valorBase = Math.floor((saldo / parcelas) * 100) / 100;
      const sobra = r2(saldo - valorBase * parcelas);
      for (let k = 0; k < parcelas; k++) {
        const ultima = k === parcelas - 1;
        await tx.conta.create({
          data: {
            tipo: "RECEBER",
            status: "ABERTA",
            descricao: `Venda #${v.numero} · parcela ${k + 1}/${parcelas}`,
            valor: new Prisma.Decimal((ultima ? valorBase + sobra : valorBase).toFixed(2)),
            vencimento: vencimentoDe(k),
            vendaId: v.id,
            parcela: k + 1,
            deParcelas: parcelas,
          },
        });
      }
    }

    return tx.venda.update({
      where: { id: v.id },
      data: {
        data: dataVenda,
        clienteId: entrada.clienteId || null,
        subtotal: new Prisma.Decimal(
          itensCalc.reduce((s, i) => s + i.precoUnit * i.quantidade, 0).toFixed(2),
        ),
        desconto: new Prisma.Decimal(entrada.desconto.toFixed(2)),
        total: new Prisma.Decimal(total.toFixed(2)),
        observacao: entrada.observacao || null,
      },
      select: { id: true, numero: true },
    });
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
      select: {
        id: true,
        numero: true,
        status: true,
        itens: { select: { pecaId: true, quantidade: true, devolvido: true } },
        insumos: { select: { pecaId: true, quantidade: true } },
      },
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

    /* A embalagem volta junto. Ela saiu do estoque quando a venda saiu; se a
       venda não existe mais, o saquinho está de volta na gaveta. */
    for (const i of v.insumos) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: i.quantidade,
          motivo: "DEVOLUCAO",
          origem: v.id,
          observacao: `Cancelamento da venda #${v.numero} · embalagem`,
        },
      });
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

/**
 * Receber depois do fechamento — uma parcela ou um valor avulso.
 *
 * A regra que mais dá trabalho, e que vem da documentação (seção 06):
 *
 *   "Recebeu menos que a parcela: a parcela é baixada com o valor recebido e
 *    o restante vira uma nova parcela em aberto, com o mesmo vencimento."
 *
 * Sem isso, receber R$ 50 de uma parcela de R$ 80 baixava a parcela inteira e
 * os R$ 30 sumiam da cobrança — a cliente ficava devendo sem nada a cobrar.
 */
export async function receberPagamento(entrada: {
  vendaId: string;
  forma: FormaPagamento;
  valor: number;
  contaId?: string | null;
  carteiraId?: string | null;
  data?: Date | null;
}) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUnique({
      where: { id: entrada.vendaId },
      select: {
        id: true,
        numero: true,
        status: true,
        total: true,
        pagamentos: { select: { valor: true } },
      },
    });
    if (!v) throw new ErroDominio("NAO_ENCONTRADO", "Essa venda não existe mais.");
    if (v.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "Venda cancelada não recebe pagamento.");
    }
    if (entrada.valor <= 0) {
      throw new ErroDominio("DADOS_INVALIDOS", "Informe um valor maior que zero.");
    }

    const jaPago = v.pagamentos.reduce((s, p) => s + Number(p.valor), 0);
    const saldo = r2(Number(v.total) - jaPago);
    if (entrada.valor > saldo + 0.005) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `Esta venda deve ${saldo.toFixed(2)} e o valor informado é ${entrada.valor.toFixed(2)}. ` +
          `Receber a mais viraria troco, não pagamento.`,
      );
    }

    const quando = entrada.data ?? new Date();

    const pag = await tx.pagamento.create({
      data: {
        vendaId: entrada.vendaId,
        forma: entrada.forma,
        valor: new Prisma.Decimal(entrada.valor.toFixed(2)),
        carteiraId: entrada.carteiraId || null,
        data: quando,
      },
      select: { id: true },
    });

    if (entrada.contaId) {
      const conta = await tx.conta.findUnique({
        where: { id: entrada.contaId },
        select: { id: true, valor: true, vencimento: true, parcela: true, deParcelas: true, descricao: true },
      });
      if (!conta) throw new ErroDominio("NAO_ENCONTRADO", "Essa parcela não existe mais.");
      await abaterParcelas(tx, entrada.vendaId, entrada.valor, quando, [conta]);
    } else {
      /*
       * Sem parcela escolhida, o dinheiro abate as que estão em aberto, da
       * mais antiga para a mais nova.
       *
       * Antes o pagamento era criado e as parcelas ficavam TODAS em aberto:
       * a venda dizia "quitada" (total − pagamentos = 0) e o Financeiro
       * continuava cobrando as duas parcelas. As mesmas duas telas com duas
       * verdades que o João já tinha reclamado, só que pelo outro lado.
       */
      const abertas = await tx.conta.findMany({
        where: { vendaId: entrada.vendaId, tipo: "RECEBER", status: "ABERTA" },
        select: { id: true, valor: true, vencimento: true, parcela: true, deParcelas: true, descricao: true },
        orderBy: [{ vencimento: "asc" }, { parcela: "asc" }],
      });
      await abaterParcelas(tx, entrada.vendaId, entrada.valor, quando, abertas);
    }

    return pag;
  });
}

/**
 * Espalha um valor recebido sobre as parcelas, na ordem em que vieram.
 *
 * Cada parcela coberta por inteiro fica PAGA. A última, se sobrar menos que
 * ela vale, é baixada pelo que foi pago e o resto vira outra parcela em
 * aberto com o mesmo vencimento — regra da documentação, seção 06. Sem ela,
 * receber R$ 50 de uma parcela de R$ 80 baixava a parcela inteira e os R$ 30
 * sumiam da cobrança.
 */
async function abaterParcelas(
  tx: Prisma.TransactionClient,
  vendaId: string,
  valor: number,
  quando: Date,
  parcelas: Array<{
    id: string;
    valor: Prisma.Decimal;
    vencimento: Date;
    parcela: number | null;
    deParcelas: number | null;
    descricao: string;
  }>,
) {
  let restante = r2(valor);

  for (const conta of parcelas) {
    if (restante <= 0.005) break;
    const daParcela = r2(Number(conta.valor));
    const pagoAqui = Math.min(daParcela, restante);
    const sobra = r2(daParcela - pagoAqui);

    await tx.conta.update({
      where: { id: conta.id },
      data: {
        status: "PAGA",
        pagoEm: quando,
        /* A parcela fica valendo o que de fato foi pago. O que faltou vira
           outra parcela, logo abaixo — nenhuma sobra desaparece. */
        ...(sobra > 0.005 ? { valor: new Prisma.Decimal(pagoAqui.toFixed(2)) } : {}),
      },
    });

    if (sobra > 0.005) {
      await tx.conta.create({
        data: {
          tipo: "RECEBER",
          status: "ABERTA",
          descricao: `${conta.descricao} · saldo`,
          valor: new Prisma.Decimal(sobra.toFixed(2)),
          // Mesmo vencimento: o que faltou já venceu junto com o resto.
          vencimento: conta.vencimento,
          vendaId,
          parcela: conta.parcela,
          deParcelas: conta.deParcelas,
        },
      });
    }

    restante = r2(restante - pagoAqui);
  }
}

/**
 * Remover um recebimento lançado errado.
 *
 * O valor volta para o saldo em aberto, e — a parte que o app antigo já fazia e
 * que é fácil esquecer — as parcelas que aquele dinheiro quitou REABREM. Sem
 * isso a venda ficaria devendo sem nenhuma parcela cobrando: o Financeiro não
 * teria o que mostrar e a cobrança sumia.
 *
 * O pagamento é apagado, não marcado: ele não aconteceu. O saldo da carteira
 * sai dele direto, então tirar a linha já devolve o caixa ao que era.
 */
export async function removerPagamento(pagamentoId: string) {
  return prisma.$transaction(async (tx) => {
    const p = await tx.pagamento.findUnique({
      where: { id: pagamentoId },
      select: {
        id: true,
        valor: true,
        vendaId: true,
        venda: { select: { id: true, status: true } },
      },
    });
    if (!p) throw new ErroDominio("NAO_ENCONTRADO", "Esse recebimento não existe mais.");
    if (p.venda.status === "CANCELADA") {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "A venda está cancelada. Nela os recebimentos ficam como histórico.",
      );
    }

    const valor = r2(Number(p.valor));
    await tx.pagamento.delete({ where: { id: pagamentoId } });

    /*
     * Reabre da parcela paga MAIS RECENTE para trás — é a ordem inversa da que
     * baixou, e é a única que devolve a venda ao estado anterior quando se
     * remove o último recebimento, que é o caso comum do erro de digitação.
     */
    const pagas = await tx.conta.findMany({
      where: { vendaId: p.vendaId, tipo: "RECEBER", status: "PAGA" },
      select: { id: true, valor: true, vencimento: true, parcela: true, deParcelas: true, descricao: true },
      orderBy: [{ pagoEm: "desc" }, { vencimento: "desc" }],
    });

    let restante = valor;
    for (const c of pagas) {
      if (restante <= 0.005) break;
      const daParcela = r2(Number(c.valor));

      if (restante >= daParcela - 0.005) {
        await tx.conta.update({
          where: { id: c.id },
          data: { status: "ABERTA", pagoEm: null },
        });
        restante = r2(restante - daParcela);
      } else {
        /* Só parte daquela parcela é desfeita: o que volta a dever fica numa
           parcela em aberto e o que continua pago fica na que já existia. */
        await tx.conta.update({
          where: { id: c.id },
          data: { valor: new Prisma.Decimal(r2(daParcela - restante).toFixed(2)) },
        });
        await tx.conta.create({
          data: {
            tipo: "RECEBER",
            status: "ABERTA",
            descricao: c.descricao,
            valor: new Prisma.Decimal(restante.toFixed(2)),
            vencimento: c.vencimento,
            vendaId: p.vendaId,
            parcela: c.parcela,
            deParcelas: c.deParcelas,
          },
        });
        restante = 0;
      }
    }

    return { vendaId: p.vendaId, valor };
  });
}

/*
 * DEVOLUÇÃO — a peça que volta para a prateleira.
 *
 * Três coisas acontecem juntas, e é por isso que existe um registro próprio em
 * vez de só somar "devolvido" no item:
 *
 *   1. a peça volta ao estoque, por movimento
 *   2. o total da venda cai
 *   3. o dinheiro se acerta — abatendo o que a cliente ainda deve, ou saindo
 *      do caixa de volta para a mão dela
 *
 * O app antigo gravava só o 1 e o 2 e deixava o 3 por conta da pessoa, num
 * lançamento manual em Financeiro · Caixa (é o que o tutorial dele mandava
 * fazer). Na prática o lançamento era esquecido: a peça voltava, o total caía
 * e o dinheiro devolvido nunca saía do caixa — que passava a mostrar mais
 * dinheiro do que a gaveta tinha.
 *
 * A ORDEM do acerto é o que evita devolver dinheiro que a cliente nem pagou:
 * o valor devolvido abate PRIMEIRO as parcelas em aberto. Só o que sobrar
 * depois disso é dinheiro que já entrou e precisa voltar.
 */
export type DevolucaoEntrada = {
  vendaId: string;
  itens: Array<{ itemVendaId: string; quantidade: number }>;
  data?: Date | null;
  motivo?: string | null;
  resolucao: ResolucaoDevolucao;
  /** Só quando sobra dinheiro a devolver: de qual carteira ele sai. */
  carteiraId?: string | null;
};

export async function registrarDevolucao(entrada: DevolucaoEntrada) {
  return prisma.$transaction(async (tx) => {
    const v = await tx.venda.findUnique({
      where: { id: entrada.vendaId },
      select: {
        id: true,
        numero: true,
        status: true,
        desconto: true,
        data: true,
        cliente: { select: { nome: true } },
        itens: {
          select: {
            id: true,
            pecaId: true,
            quantidade: true,
            devolvido: true,
            precoUnit: true,
            custoUnit: true,
            peca: { select: { nome: true } },
          },
        },
        pagamentos: { select: { valor: true } },
      },
    });
    if (!v) throw new ErroDominio("NAO_ENCONTRADO", "Essa venda não existe mais.");
    if (v.status === "CANCELADA") {
      throw new ErroDominio("REGRA_NEGOCIO", "A venda já foi cancelada inteira.");
    }

    const pedidos = entrada.itens.filter((i) => i.quantidade > 0);
    if (pedidos.length === 0) {
      throw new ErroDominio("DADOS_INVALIDOS", "Escolha ao menos uma peça para devolver.");
    }

    const porId = new Map(v.itens.map((i) => [i.id, i]));
    let total = 0;
    for (const p of pedidos) {
      const item = porId.get(p.itemVendaId);
      if (!item) throw new ErroDominio("NAO_ENCONTRADO", "Esse item não é desta venda.");
      const podeVoltar = item.quantidade - item.devolvido;
      if (p.quantidade > podeVoltar) {
        throw new ErroDominio(
          "DADOS_INVALIDOS",
          `De "${item.peca.nome}" só é possível devolver ${podeVoltar} unidade${podeVoltar === 1 ? "" : "s"}.`,
        );
      }
      total = r2(total + Number(item.precoUnit) * p.quantidade);
    }

    /*
     * O acerto do dinheiro, decidido ANTES de gravar qualquer coisa.
     *
     * `aberto` é o que a cliente ainda devia. O que o devolvido passar disso
     * é dinheiro que ela já pagou — e esse é o único que pode voltar em
     * espécie.
     */
    const abertas = await tx.conta.findMany({
      where: { vendaId: v.id, tipo: "RECEBER", status: "ABERTA" },
      select: { id: true, valor: true, vencimento: true },
      orderBy: [{ vencimento: "desc" }],
    });
    const aberto = r2(abertas.reduce((s2, c) => s2 + Number(c.valor), 0));
    const abatido = Math.min(total, aberto);
    const emDinheiro = r2(total - abatido);

    if (emDinheiro > 0.005 && entrada.resolucao === "ABATER") {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `A cliente já pagou ${emDinheiro.toFixed(2)} a mais do que o novo total. ` +
          `Escolha "Devolver o valor" para acertar essa diferença.`,
      );
    }
    if (emDinheiro <= 0.005 && entrada.resolucao === "DEVOLVER") {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        "Não há dinheiro a devolver: esta venda ainda não foi paga. A devolução abate do saldo.",
      );
    }

    const quando = entrada.data ?? new Date();

    // 1 — a peça volta ao estoque e o item fica marcado
    for (const p of pedidos) {
      const item = porId.get(p.itemVendaId)!;
      await tx.itemVenda.update({
        where: { id: item.id },
        data: { devolvido: { increment: p.quantidade } },
      });
      await tx.movimentoEstoque.create({
        data: {
          pecaId: item.pecaId,
          delta: p.quantidade,
          motivo: "DEVOLUCAO",
          origem: v.id,
          observacao: `Devolução da venda #${v.numero}${entrada.motivo ? ` · ${entrada.motivo}` : ""}`,
          data: quando,
        },
      });
    }

    // 2 — as parcelas em aberto encolhem, da última para a primeira
    let sobrando = abatido;
    for (const c of abertas) {
      if (sobrando <= 0.005) break;
      const daParcela = r2(Number(c.valor));
      if (sobrando >= daParcela - 0.005) {
        /* A parcela inteira deixou de existir. Cancelada, não apagada: ela
           aparece no histórico da venda com o motivo. */
        await tx.conta.update({ where: { id: c.id }, data: { status: "CANCELADA" } });
        sobrando = r2(sobrando - daParcela);
      } else {
        await tx.conta.update({
          where: { id: c.id },
          data: { valor: new Prisma.Decimal(r2(daParcela - sobrando).toFixed(2)) },
        });
        sobrando = 0;
      }
    }

    // 3 — o dinheiro que já tinha entrado sai da carteira
    let lancamentoId: string | null = null;
    if (emDinheiro > 0.005) {
      const quem = v.cliente?.nome ?? "venda avulsa";
      const lanc = await tx.lancamento.create({
        data: {
          carteiraId: entrada.carteiraId || null,
          descricao: `Devolução · ${quem} · venda #${v.numero}`,
          // Saída: negativo. É a mesma convenção do resto do caixa.
          valor: new Prisma.Decimal((-emDinheiro).toFixed(2)),
          categoria: "Devolução",
          data: quando,
        },
        select: { id: true },
      });
      lancamentoId = lanc.id;
    }

    const dev = await tx.devolucao.create({
      data: {
        vendaId: v.id,
        data: quando,
        motivo: entrada.motivo?.trim() || null,
        resolucao: entrada.resolucao,
        total: new Prisma.Decimal(total.toFixed(2)),
        lancamentoId,
        itens: {
          create: pedidos.map((p) => ({
            itemVendaId: p.itemVendaId,
            quantidade: p.quantidade,
            precoUnit: porId.get(p.itemVendaId)!.precoUnit,
          })),
        },
      },
      select: { id: true },
    });

    return { id: dev.id, vendaId: v.id, total, abatido, emDinheiro };
  });
}