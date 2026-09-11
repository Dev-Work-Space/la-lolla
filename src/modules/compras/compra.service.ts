import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio, NaoEncontrado } from "@/lib/errors";
import { vencimentoParcela, type Intervalo } from "@/modules/vendas/venda.service";

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
  /** À vista sai do caixa agora; a prazo vira conta a pagar. */
  pagamento:
    | { tipo: "avista"; carteiraId: string }
    | { tipo: "prazo"; parcelas: number; intervalo: Intervalo; primeiroVencimento: Date };
};

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

    if (entrada.pagamento.tipo === "avista") {
      const c = await tx.carteira.findUnique({
        where: { id: entrada.pagamento.carteiraId },
        select: { id: true },
      });
      if (!c) {
        throw new ErroDominio(
          "DADOS_INVALIDOS",
          "Escolha de qual carteira o dinheiro saiu — a compra precisa aparecer no caixa.",
        );
      }
    }

    const total = r2(entrada.itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0));
    if (total <= 0) {
      throw new ErroDominio("REGRA_NEGOCIO", "O total da compra precisa ser maior que zero.");
    }

    /* ── 2. a compra e os itens ── */
    const compra = await tx.compra.create({
      data: {
        fornecedorId: fornecedor.id,
        total: dec(total),
        aPrazo: entrada.pagamento.tipo === "prazo",
        vencimento:
          entrada.pagamento.tipo === "prazo" ? entrada.pagamento.primeiroVencimento : null,
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
          // À vista já sai pago; a prazo fica devendo e a peça acende
          // "A pagar" no catálogo.
          pagoFornecedor: entrada.pagamento.tipo === "avista",
        },
      });
    }

    /* ── 4. o dinheiro (regra 2.12) ── */
    if (entrada.pagamento.tipo === "avista") {
      await tx.lancamento.create({
        data: {
          carteiraId: entrada.pagamento.carteiraId,
          descricao: `Compra #${compra.numero} · ${fornecedor.nome}`,
          valor: dec(-total), // saída é negativa
          categoria: "Mercadoria",
        },
      });
    } else {
      const { parcelas, intervalo, primeiroVencimento } = entrada.pagamento;
      const base = Math.floor((total / parcelas) * 100) / 100;
      const sobra = r2(total - base * parcelas);

      for (let k = 0; k < parcelas; k++) {
        await tx.conta.create({
          data: {
            tipo: "PAGAR",
            status: "ABERTA",
            descricao:
              parcelas > 1
                ? `Compra #${compra.numero} · ${fornecedor.nome} · ${k + 1}/${parcelas}`
                : `Compra #${compra.numero} · ${fornecedor.nome}`,
            // Sobra de centavos na ÚLTIMA parcela (documentação, seção 15).
            valor: dec(k === parcelas - 1 ? base + sobra : base),
            vencimento:
              k === 0 ? primeiroVencimento : vencimentoParcela(primeiroVencimento, k, intervalo),
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
  criadoEm: true,
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
    criadoEm: c.criadoEm,
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
    ...(filtro === "mes" ? { criadoEm: { gte: mes0 } } : {}),
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
    orderBy: { criadoEm: "desc" },
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
    prisma.compra.aggregate({ where: { criadoEm: { gte: mes0 } }, _sum: { total: true }, _count: true }),
    prisma.compra.aggregate({
      where: { criadoEm: { gte: mesAnt0, lt: mes0 } },
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
    where: { compra: { criadoEm: { gte: mes0 } } },
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
