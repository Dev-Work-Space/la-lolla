import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { calcularCusto, calcularMargem } from "./peca.service";

/*
 * Catálogo e insumos, portados de `viewCatalogo` e `viewInsumos`.
 *
 * Uma diferença deliberada de implementação, invisível na tela: o app antigo
 * guardava `produto.estoque` como número gravado E mantinha um registro de
 * movimentos ao lado. Aqui o saldo é SEMPRE a soma dos movimentos (regra 2.4
 * da documentação: "estoque só se mexe por movimento"). O número que aparece
 * é o mesmo; o que muda é que não existem duas verdades para divergirem.
 */

const dec = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/** Os 7 filtros do catálogo, na ordem do app antigo. */
export const FILTROS_PECA = [
  ["todos", "Todas"],
  ["acabando", "Acabando"],
  ["zerado", "Zeradas"],
  ["nunca", "Nunca compradas"],
  ["parada", "Sem venda"],
  ["devendo", "A acertar"],
  ["semfoto", "Sem foto"],
] as const;

export type FiltroPeca = (typeof FILTROS_PECA)[number][0];

/** "Nunca comprada" e "A acertar" são financeiro: vendedor não vê. */
export function filtrosVisiveis(veFinanceiro: boolean) {
  return FILTROS_PECA.filter((c) => veFinanceiro || (c[0] !== "devendo" && c[0] !== "nunca"));
}

export type LinhaCatalogo = {
  id: string;
  sku: string;
  nome: string;
  categoria: string;
  tamanho: string | null;
  saldo: number;
  minimo: number;
  /** nunca entrou uma unidade sequer — diferente de "acabou" */
  nuncaComprada: boolean;
  reservada: number;
  foto: string | null;
  fornecedor: string | null;
  codigoFornecedor: number | null;
  precoTabela: number | null;
  /** Menor que o sugerido: vira o preço usado na venda e sai na etiqueta. */
  precoPromocional: number | null;
  /** O preço que de fato vai para a venda. */
  precoVigente: number | null;
  /** só para quem vê financeiro */
  custo?: number | null;
  margem?: number | null;
  aPagar?: boolean;
};

const SELECAO = {
  id: true,
  sku: true,
  nome: true,
  categoria: true,
  tamanho: true,
  minimo: true,
  precoTabela: true,
  precoPromocional: true,
  totalRecebido: true,
  codigoFornecedor: true,
  custo: true,
  pagoFornecedor: true,
  fornecedor: { select: { id: true, nome: true } },
  imagens: { where: { principal: true }, take: 1, select: { pathThumb: true } },
  movimentos: { select: { delta: true, motivo: true } },
} satisfies Prisma.PecaSelect;

export async function listarCatalogo(opcoes: {
  busca?: string;
  filtro?: FiltroPeca;
  fornecedorId?: string;
  categoria?: string;
  veFinanceiro: boolean;
}) {
  const { busca, filtro = "todos", fornecedorId, categoria, veFinanceiro } = opcoes;

  const q = busca?.trim();
  const where: Prisma.PecaWhereInput = {
    tipo: "PECA",
    arquivada: false,
    ...(categoria ? { categoria } : {}),
    ...(fornecedorId === "__sem"
      ? { fornecedorId: null }
      : fornecedorId
        ? { fornecedorId }
        : {}),
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { sku: { contains: q, mode: "insensitive" } },
            { categoria: { contains: q, mode: "insensitive" } },
            { fornecedor: { nome: { contains: q, mode: "insensitive" } } },
          ],
        }
      : {}),
  };

  const [pecas, totalCatalogo, reservas, comVenda] = await Promise.all([
    prisma.peca.findMany({ where, select: SELECAO, orderBy: { nome: "asc" } }),
    prisma.peca.count({ where: { tipo: "PECA", arquivada: false } }),
    // Reservadas: em orçamento ainda aberto.
    prisma.itemOrcamento.groupBy({
      by: ["pecaId"],
      where: { orcamento: { status: "ABERTO" } },
      _sum: { quantidade: true },
    }),
    // Quem já vendeu alguma vez — alimenta o filtro "Sem venda".
    prisma.itemVenda.groupBy({
      by: ["pecaId"],
      where: { venda: { status: { not: "CANCELADA" } } },
      _count: true,
    }),
  ]);

  const porReserva = new Map(reservas.map((r) => [r.pecaId, r._sum.quantidade ?? 0]));
  const vendeu = new Set(comVenda.map((v) => v.pecaId));

  let linhas: LinhaCatalogo[] = pecas.map((p) => {
    const saldo = p.movimentos.reduce((s, m) => s + m.delta, 0);
    // "Nunca comprada" = total recebido zero (documentação, seção 15). É
    // diferente de "acabou": a primeira nunca chegou.
    const nuncaComprada = p.totalRecebido === 0;
    const custo = dec(p.custo);
    const preco = dec(p.precoTabela);
    const promo = dec(p.precoPromocional);
    // Promocional só vale se for MENOR que o sugerido (documentação, seção 02).
    const vigente = promo !== null && preco !== null && promo < preco ? promo : preco;

    const base: LinhaCatalogo = {
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      categoria: p.categoria,
      tamanho: p.tamanho,
      saldo,
      minimo: p.minimo,
      nuncaComprada,
      reservada: porReserva.get(p.id) ?? 0,
      foto: p.imagens[0]?.pathThumb ?? null,
      fornecedor: p.fornecedor?.nome ?? null,
      codigoFornecedor: veFinanceiro ? dec(p.codigoFornecedor) : null,
      precoTabela: preco,
      precoPromocional: promo,
      precoVigente: vigente,
    };

    // Os campos de dinheiro só existem no objeto de quem pode vê-los.
    if (!veFinanceiro) return base;
    return { ...base, custo, margem: calcularMargem(custo, vigente), aPagar: !p.pagoFornecedor };
  });

  // Os mesmos sete filtros, com o mesmo significado.
  if (filtro === "acabando")
    linhas = linhas.filter((p) => !p.nuncaComprada && p.saldo > 0 && p.saldo <= p.minimo);
  else if (filtro === "zerado") linhas = linhas.filter((p) => !p.nuncaComprada && p.saldo <= 0);
  else if (filtro === "nunca") linhas = linhas.filter((p) => p.nuncaComprada);
  else if (filtro === "parada") linhas = linhas.filter((p) => !vendeu.has(p.id));
  else if (filtro === "devendo") linhas = linhas.filter((p) => p.aPagar === true);
  else if (filtro === "semfoto") linhas = linhas.filter((p) => !p.foto);

  return { linhas, totalCatalogo };
}

/** Os 4 (ou 3) indicadores do topo, conforme a permissão. */
export async function indicadoresCatalogo(veFinanceiro: boolean) {
  const pecas = await prisma.peca.findMany({
    where: { tipo: "PECA", arquivada: false },
    select: { custo: true, precoTabela: true, movimentos: { select: { delta: true } } },
  });

  const saldos = pecas.map((p) => ({
    saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
    custo: dec(p.custo) ?? 0,
    preco: dec(p.precoTabela) ?? 0,
  }));

  if (!veFinanceiro) {
    return {
      veFinanceiro: false as const,
      modelos: pecas.length,
      unidades: saldos.reduce((s, p) => s + Math.max(0, p.saldo), 0),
      zeradas: saldos.filter((p) => p.saldo <= 0).length,
    };
  }

  const mes0 = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
  const [contas, comprasMes] = await Promise.all([
    prisma.conta.aggregate({
      where: { tipo: "PAGAR", status: "ABERTA", fornecedorId: { not: null } },
      _sum: { valor: true },
      _count: true,
    }),
    prisma.compra.aggregate({ where: { criadoEm: { gte: mes0 } }, _sum: { total: true } }),
  ]);

  const aCusto = saldos.reduce((s, p) => s + p.custo * Math.max(0, p.saldo), 0);
  const aVenda = saldos.reduce((s, p) => s + p.preco * Math.max(0, p.saldo), 0);

  return {
    veFinanceiro: true as const,
    aCusto,
    aVenda,
    margemPotencial: aVenda - aCusto,
    devoFornecedor: Number(contas._sum.valor ?? 0),
    parcelasAbertas: contas._count,
    comprasMes: Number(comprasMes._sum.total ?? 0),
  };
}

/** Fornecedores e categorias que REALMENTE têm peça, com a contagem. */
export async function opcoesDeFiltro() {
  const [porFornecedor, porCategoria, semFornecedor] = await Promise.all([
    prisma.peca.groupBy({
      by: ["fornecedorId"],
      where: { tipo: "PECA", arquivada: false, fornecedorId: { not: null } },
      _count: true,
    }),
    prisma.peca.groupBy({
      by: ["categoria"],
      where: { tipo: "PECA", arquivada: false },
      _count: true,
    }),
    prisma.peca.count({ where: { tipo: "PECA", arquivada: false, fornecedorId: null } }),
  ]);

  const nomes = await prisma.fornecedor.findMany({
    where: { id: { in: porFornecedor.map((f) => f.fornecedorId!).filter(Boolean) } },
    select: { id: true, nome: true },
  });
  const mapa = new Map(nomes.map((n) => [n.id, n.nome]));

  return {
    fornecedores: porFornecedor
      .map((f) => ({ id: f.fornecedorId!, nome: mapa.get(f.fornecedorId!) ?? "?", qtd: f._count }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
    semFornecedor,
    categorias: porCategoria
      .map((c) => ({ nome: c.categoria, qtd: c._count }))
      .sort((a, b) => a.nome.localeCompare(b.nome, "pt-BR")),
  };
}

/* ══════════════════════════ INSUMOS ══════════════════════════ */

export type LinhaInsumo = {
  id: string;
  nome: string;
  unidade: string;
  saldo: number;
  minimo: number;
  custo: number | null;
};

/** Plural bobo evitado: "1 un." e "12 un." usam a mesma palavra. */
export function unidadeDe(u: string | null, singular = false): string {
  const base = (u ?? "un").trim() || "un";
  return singular ? base.replace(/s$/, "") : base;
}

export async function listarInsumos(busca?: string) {
  const q = busca?.trim();
  const insumos = await prisma.peca.findMany({
    where: {
      tipo: "INSUMO",
      arquivada: false,
      ...(q ? { nome: { contains: q, mode: "insensitive" } } : {}),
    },
    select: {
      id: true,
      nome: true,
      unidade: true,
      minimo: true,
      custo: true,
      movimentos: { select: { delta: true } },
    },
    orderBy: { nome: "asc" },
  });

  return insumos.map<LinhaInsumo>((i) => ({
    id: i.id,
    nome: i.nome,
    unidade: unidadeDe(i.unidade),
    saldo: i.movimentos.reduce((s, m) => s + m.delta, 0),
    minimo: i.minimo,
    custo: dec(i.custo),
  }));
}

export async function indicadoresInsumos() {
  const linhas = await listarInsumos();
  return {
    total: linhas.length,
    valor: linhas.reduce((s, i) => s + (i.custo ?? 0) * Math.max(0, i.saldo), 0),
    acabando: linhas.filter((i) => i.saldo <= i.minimo).length,
  };
}

export { calcularCusto };

/* ══════════════════════════ FICHA DA PEÇA ══════════════════════════ */

export type MovimentoLinha = {
  id: string;
  delta: number;
  motivo: string;
  observacao: string | null;
  quando: Date;
  /** saldo acumulado DEPOIS deste movimento */
  saldoApos: number;
};

export const ROTULO_MOTIVO: Record<string, string> = {
  COMPRA: "Compra",
  VENDA: "Venda",
  DEVOLUCAO: "Devolução",
  AJUSTE: "Ajuste",
  INVENTARIO: "Inventário",
  PERDA: "Perda",
};

/**
 * Ficha completa de uma peça ou insumo.
 * Devolve `null` quando não existe — quem chama decide se é 404.
 */
export async function fichaPeca(id: string, veFinanceiro: boolean) {
  const p = await prisma.peca.findUnique({
    where: { id },
    select: {
      id: true,
      sku: true,
      tipo: true,
      nome: true,
      categoria: true,
      tamanho: true,
      unidade: true,
      minimo: true,
      precoTabela: true,
      codigoFornecedor: true,
      fator: true,
      custo: true,
      pagoFornecedor: true,
      totalRecebido: true,
      ultimaSerie: true,
      criadoEm: true,
      fornecedor: { select: { id: true, nome: true } },
      imagens: { orderBy: { criadoEm: "asc" }, select: { id: true, pathMedia: true, principal: true } },
      movimentos: { orderBy: { criadoEm: "asc" }, select: { id: true, delta: true, motivo: true, observacao: true, criadoEm: true } },
    },
  });
  if (!p) return null;

  // Saldo acumulado: caminha do mais antigo para o mais novo somando.
  let acumulado = 0;
  const historico: MovimentoLinha[] = p.movimentos.map((m) => {
    acumulado += m.delta;
    return {
      id: m.id,
      delta: m.delta,
      motivo: m.motivo,
      observacao: m.observacao,
      quando: m.criadoEm,
      saldoApos: acumulado,
    };
  });
  historico.reverse(); // na tela, o mais recente em cima

  const [reservada, vendidas] = await Promise.all([
    prisma.itemOrcamento.aggregate({
      where: { pecaId: id, orcamento: { status: "ABERTO" } },
      _sum: { quantidade: true },
    }),
    prisma.itemVenda.aggregate({
      where: { pecaId: id, venda: { status: { not: "CANCELADA" } } },
      _sum: { quantidade: true },
    }),
  ]);

  const custo = dec(p.custo);
  const preco = dec(p.precoTabela);

  return {
    id: p.id,
    sku: p.sku,
    tipo: p.tipo,
    nome: p.nome,
    categoria: p.categoria,
    tamanho: p.tamanho,
    unidade: unidadeDe(p.unidade),
    minimo: p.minimo,
    precoTabela: preco,
    fornecedor: p.fornecedor,
    imagens: p.imagens,
    criadoEm: p.criadoEm,
    ultimaSerie: p.ultimaSerie,
    saldo: acumulado,
    // Quantas já ENTRARAM desde sempre — a documentação pede esse número no
    // cartão de estoque, e é ele que separa "acabou" de "nunca chegou".
    totalRecebido: p.totalRecebido,
    reservada: reservada._sum.quantidade ?? 0,
    vendidas: vendidas._sum.quantidade ?? 0,
    historico,
    // Dinheiro só entra no objeto de quem pode ver.
    ...(veFinanceiro
      ? {
          codigoFornecedor: dec(p.codigoFornecedor),
          fator: dec(p.fator),
          custo,
          margem: calcularMargem(custo, preco),
          aPagar: !p.pagoFornecedor,
          valorEmEstoque: (custo ?? 0) * Math.max(0, acumulado),
        }
      : {}),
  };
}

export type Ficha = NonNullable<Awaited<ReturnType<typeof fichaPeca>>>;
