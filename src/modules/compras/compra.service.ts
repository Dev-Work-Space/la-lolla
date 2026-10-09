import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio, NaoEncontrado } from "@/lib/errors";
import { vencimentoParcela, type Intervalo } from "@/modules/vendas/venda.service";
import { comprovanteExiste } from "@/modules/financeiro/comprovante.service";
import { dividirEmParcelas, valoresValidos } from "@/lib/parcelas";

/*
 * PORTAL DE COMPRAS.
 *
 * A regra que manda aqui é a 2.12 da documentação:
 *
 *   "Dar entrada em peça É uma saída de caixa. A validação roda ANTES de
 *    qualquer gravação, para nunca sobrar peça criada sem a compra
 *    correspondente."
 *
 * Por isso `registrarCompra` faz tudo dentro de uma transação e confere tudo
 * antes de escrever a primeira linha. Uma compra que gravasse o estoque mas
 * falhasse no pagamento deixaria peça na prateleira e dinheiro intacto — o
 * tipo de erro que só aparece no fim do mês, quando o caixa não bate.
 *
 * Peças e insumos entram pelo MESMO fluxo, como o João pediu: os dois são
 * coisas que a loja compra e guarda.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));
const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));

export type ItemCompraEntrada = {
  pecaId: string;
  quantidade: number;
  custoUnit: number;
};

export type CompraEntrada = {
  fornecedorId: string;
  itens: ItemCompraEntrada[];
  observacao?: string | null;
  /**
   * Como se paga. DUAS partes, e pode ter uma só ou as duas:
   *   - `agora`: o que sai da carteira hoje — o total à vista, ou a ENTRADA;
   *   - `prazo`: o resto, em parcelas no contas a pagar.
   * Sem `prazo`, `agora` tem de ser o total. Com `prazo`, `agora` (se houver)
   * é a entrada, e as parcelas somam o que falta.
   */
  pagamento: {
    agora?: { valor: number; carteiraId: string; comprovanteId?: string | null } | null;
    prazo?: {
      parcelas: number;
      intervalo: Intervalo;
      primeiroVencimento: Date;
      /** Uma data por parcela, quando a pessoa escolheu uma a uma. */
      vencimentos?: Date[] | null;
      /** O valor de cada parcela, quando escolhido à mão. */
      valores?: number[] | null;
    } | null;
  };
};

/**
 * A peça que chega já escolhida na Nova compra — pelo botão Entrada da ficha.
 * Mesmo formato da busca de itens da tela, e o fornecedor da peça para vir
 * marcado. Peça arquivada não volta: não se compra o que saiu do catálogo.
 */
export async function itemParaCompra(pecaId: string) {
  const p = await prisma.peca.findFirst({
    where: { id: pecaId, arquivada: false },
    select: {
      id: true,
      sku: true,
      nome: true,
      tipo: true,
      unidade: true,
      custo: true,
      codigoFornecedor: true,
      fator: true,
      fornecedorId: true,
      movimentos: { select: { delta: true } },
    },
  });
  if (!p) return null;
  return {
    fornecedorId: p.fornecedorId,
    item: {
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      insumo: p.tipo === "INSUMO",
      unidade: p.unidade ?? "un",
      custo: num(p.custo),
      codigoFornecedor: p.codigoFornecedor ? Number(p.codigoFornecedor) : null,
      fator: p.fator ? Number(p.fator) : null,
      saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
    },
  };
}

export async function registrarCompra(entrada: CompraEntrada) {
  if (entrada.itens.length === 0) {
    throw new ErroDominio("REGRA_NEGOCIO", "Adicione ao menos um item à compra.");
  }

  return prisma.$transaction(async (tx) => {
    /* ── 1. CONFERE TUDO antes de gravar qualquer coisa (regra 2.12) ── */
    const fornecedor = await tx.fornecedor.findUnique({
      where: { id: entrada.fornecedorId },
      select: { id: true, nome: true },
    });
    if (!fornecedor) throw new ErroDominio("NAO_ENCONTRADO", "Fornecedor não encontrado.");

    const ids = [...new Set(entrada.itens.map((i) => i.pecaId))];
    const pecas = await tx.peca.findMany({
      where: { id: { in: ids } },
      select: { id: true, nome: true, tipo: true },
    });
    const porId = new Map(pecas.map((p) => [p.id, p]));

    for (const it of entrada.itens) {
      const p = porId.get(it.pecaId);
      if (!p) throw new ErroDominio("NAO_ENCONTRADO", "Um dos itens não existe mais.");
      if (it.quantidade <= 0) {
        throw new ErroDominio("DADOS_INVALIDOS", `Quantidade inválida em "${p.nome}".`);
      }
      if (it.custoUnit < 0) {
        throw new ErroDominio("DADOS_INVALIDOS", `Custo inválido em "${p.nome}".`);
      }
    }

    const total = r2(entrada.itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0));
    if (total <= 0) {
      throw new ErroDominio("REGRA_NEGOCIO", "O total da compra precisa ser maior que zero.");
    }

    const { agora, prazo } = entrada.pagamento;
    const entradaValor = agora ? r2(agora.valor) : 0;
    if (!agora && !prazo) {
      throw new ErroDominio("REGRA_NEGOCIO", "Diga como a compra será paga: agora, em parcelas, ou entrada mais parcelas.");
    }
    if (agora) {
      const c = await tx.carteira.findUnique({ where: { id: agora.carteiraId }, select: { id: true, tipo: true } });
      if (!c) {
        throw new ErroDominio(
          "DADOS_INVALIDOS",
          "Escolha de qual carteira o dinheiro saiu — a compra precisa aparecer no caixa.",
        );
      }
      if (entradaValor <= 0) throw new ErroDominio("DADOS_INVALIDOS", "O valor pago agora precisa ser maior que zero.");
      /* Comprovante: só o dinheiro vivo (carteira espécie) dispensa. */
      if (c.tipo !== "ESPECIE" && !(await comprovanteExiste(agora.comprovanteId))) {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          "Anexe o comprovante do pagamento: tire uma foto ou escolha da galeria. Só o dinheiro vivo dispensa.",
        );
      }
    }
    const saldoAPrazo = r2(total - entradaValor);
    if (entradaValor > total + 0.005) {
      throw new ErroDominio("REGRA_NEGOCIO", `O valor pago agora (${entradaValor.toFixed(2)}) é maior que o total da compra (${total.toFixed(2)}).`);
    }
    if (prazo && saldoAPrazo <= 0.005) {
      throw new ErroDominio("REGRA_NEGOCIO", "A entrada já cobre o total: tire as parcelas ou diminua a entrada.");
    }
    if (!prazo && saldoAPrazo > 0.005) {
      throw new ErroDominio("REGRA_NEGOCIO", `Faltam ${saldoAPrazo.toFixed(2)} para pagar. Parcele o resto ou aumente o valor pago agora.`);
    }
    if (prazo?.valores?.length && !valoresValidos(saldoAPrazo, prazo.parcelas, prazo.valores)) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `As parcelas não fecham: o que falta pagar é ${saldoAPrazo.toFixed(2)} e as parcelas somam ${prazo.valores
          .reduce((s, v) => s + v, 0)
          .toFixed(2)}. Ajuste os valores até a diferença zerar.`,
      );
    }

    /* ── 2. a compra e os itens ── */
    const compra = await tx.compra.create({
      data: {
        fornecedorId: fornecedor.id,
        total: dec(total),
        aPrazo: Boolean(prazo),
        vencimento: prazo ? prazo.primeiroVencimento : null,
        observacao: entrada.observacao || null,
        itens: {
          create: entrada.itens.map((i) => ({
            pecaId: i.pecaId,
            quantidade: i.quantidade,
            custoUnit: dec(i.custoUnit),
          })),
        },
      },
      select: { id: true, numero: true },
    });

    /* ── 3. estoque entra por MOVIMENTO, e o custo da peça é atualizado ── */
    for (const i of entrada.itens) {
      await tx.movimentoEstoque.create({
        data: {
          pecaId: i.pecaId,
          delta: i.quantidade,
          motivo: "COMPRA",
          origem: compra.id,
          observacao: `Compra #${compra.numero} · ${fornecedor.nome}`,
        },
      });

      // O custo passa a ser o desta compra: é o que a loja pagou de verdade
      // pela unidade que está na prateleira agora. Vendas antigas não mudam,
      // porque o custo delas ficou congelado no item.
      await tx.peca.update({
        where: { id: i.pecaId },
        data: {
          custo: dec(i.custoUnit),
          fornecedorId: fornecedor.id,
          // Total recebido do fornecedor: DIFERENTE do estoque atual. Sobe
          // aqui e desce só na devolução ao fornecedor. É com ele que se
          // calcula o que se deve por peças antigas e o que é "nunca
          // comprada" (documentação, seção 15).
          totalRecebido: { increment: i.quantidade },
          // À vista já sai pago; com parcela, fica devendo.
          pagoFornecedor: !prazo,
        },
      });
    }

    /* ── 4. o dinheiro (regra 2.12) ── */
    if (agora) {
      // O que sai da carteira hoje: o total à vista, ou só a entrada.
      await tx.lancamento.create({
        data: {
          carteiraId: agora.carteiraId,
          descricao: `Compra #${compra.numero} · ${fornecedor.nome}${prazo ? " · entrada" : ""}`,
          valor: dec(-entradaValor), // saída é negativa
          categoria: "Mercadoria",
          comprovanteId: agora.comprovanteId || null,
        },
      });
    }
    if (prazo) {
      const { parcelas, intervalo, primeiroVencimento, vencimentos } = prazo;
      // Sobra de centavos na ÚLTIMA parcela (documentação, seção 15) — a menos
      // que os valores tenham sido escolhidos à mão.
      const valores = prazo.valores?.length ? prazo.valores.map(r2) : dividirEmParcelas(saldoAPrazo, parcelas);

      for (let k = 0; k < parcelas; k++) {
        await tx.conta.create({
          data: {
            tipo: "PAGAR",
            status: "ABERTA",
            descricao:
              parcelas > 1
                ? `Compra #${compra.numero} · ${fornecedor.nome} · ${k + 1}/${parcelas}`
                : `Compra #${compra.numero} · ${fornecedor.nome}`,
            valor: dec(valores[k]),
            /* Data escolhida parcela a parcela tem prioridade sobre o intervalo. */
            vencimento:
              vencimentos?.[k] ??
              (k === 0 ? primeiroVencimento : vencimentoParcela(primeiroVencimento, k, intervalo)),
            fornecedorId: fornecedor.id,
            compraId: compra.id,
            ...(parcelas > 1 ? { parcela: k + 1, deParcelas: parcelas } : {}),
          },
        });
      }
    }

    return compra;
  });
}

/* ─────────────────────── leitura ─────────────────────── */

const SELECAO = {
  id: true,
  numero: true,
  total: true,
  aPrazo: true,
  vencimento: true,
  observacao: true,
  data: true,
  fornecedor: { select: { id: true, nome: true } },
  itens: {
    select: {
      id: true,
      quantidade: true,
      custoUnit: true,
      peca: { select: { id: true, nome: true, sku: true, tipo: true } },
    },
  },
  parcelas: { select: { id: true, valor: true, status: true, vencimento: true, parcela: true, deParcelas: true } },
} satisfies Prisma.CompraSelect;

export const FILTROS_COMPRA = [
  ["todas", "Todas"],
  ["devendo", "Em aberto"],
  ["quitadas", "Quitadas"],
  ["mes", "Este mês"],
] as const;

export type FiltroCompra = (typeof FILTROS_COMPRA)[number][0];

function montar(c: Prisma.CompraGetPayload<{ select: typeof SELECAO }>) {
  const abertas = c.parcelas.filter((p) => p.status === "ABERTA");
  return {
    id: c.id,
    numero: c.numero,
    fornecedor: c.fornecedor,
    total: num(c.total),
    aPrazo: c.aPrazo,
    vencimento: c.vencimento,
    observacao: c.observacao,
    data: c.data,
    itens: c.itens.map((i) => ({
      id: i.id,
      pecaId: i.peca.id,
      nome: i.peca.nome,
      sku: i.peca.sku,
      insumo: i.peca.tipo === "INSUMO",
      quantidade: i.quantidade,
      custoUnit: num(i.custoUnit),
    })),
    unidades: c.itens.reduce((s, i) => s + i.quantidade, 0),
    parcelas: c.parcelas.map((p) => ({
      id: p.id,
      valor: num(p.valor),
      vencimento: p.vencimento,
      paga: p.status === "PAGA",
      numero: p.parcela,
      de: p.deParcelas,
    })),
    // Saldo devedor: soma das parcelas em aberto. À vista, zero.
    saldo: r2(abertas.reduce((s, p) => s + num(p.valor), 0)),
  };
}

export type Compra = ReturnType<typeof montar>;

export async function listarCompras(opcoes: { busca?: string; filtro?: FiltroCompra }) {
  const { busca, filtro = "todas" } = opcoes;
  const q = busca?.trim();
  const mes0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1);

  const where: Prisma.CompraWhereInput = {
    ...(filtro === "mes" ? { data: { gte: mes0 } } : {}),
    ...(q
      ? {
          OR: [
            ...(/^\d+$/.test(q) ? [{ numero: Number(q) }] : []),
            { fornecedor: { nome: { contains: q, mode: "insensitive" as const } } },
            { itens: { some: { peca: { nome: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const cruas = await prisma.compra.findMany({
    where,
    select: SELECAO,
    orderBy: { data: "desc" },
    take: 200,
  });

  let compras = cruas.map(montar);
  if (filtro === "devendo") compras = compras.filter((c) => c.saldo > 0.005);
  else if (filtro === "quitadas") compras = compras.filter((c) => c.saldo <= 0.005);
  return compras;
}

export async function buscarCompra(id: string) {
  const c = await prisma.compra.findUnique({ where: { id }, select: SELECAO });
  if (!c) throw new NaoEncontrado("Compra");
  return montar(c);
}

export async function indicadoresCompras() {
  const hoje = new Date();
  const mes0 = new Date(hoje.getFullYear(), hoje.getMonth(), 1);
  const mesAnt0 = new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1);

  const [mes, anterior, aPagar, todas] = await Promise.all([
    prisma.compra.aggregate({ where: { data: { gte: mes0 } }, _sum: { total: true }, _count: true }),
    prisma.compra.aggregate({
      where: { data: { gte: mesAnt0, lt: mes0 } },
      _sum: { total: true },
    }),
    prisma.conta.aggregate({
      where: { tipo: "PAGAR", status: "ABERTA", compraId: { not: null } },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.compra.count(),
  ]);

  const unidades = await prisma.itemCompra.aggregate({
    where: { compra: { data: { gte: mes0 } } },
    _sum: { quantidade: true },
  });

  return {
    compradoMes: num(mes._sum?.total),
    comprasMes: mes._count,
    compradoMesAnterior: num(anterior._sum?.total),
    unidadesMes: unidades._sum?.quantidade ?? 0,
    aPagar: num(aPagar._sum?.valor),
    parcelasAbertas: aPagar._count,
    total: todas,
  };
}
