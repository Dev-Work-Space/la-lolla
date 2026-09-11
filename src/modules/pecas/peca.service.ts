import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio, NaoEncontrado } from "@/lib/errors";
import type { CriarPecaDados, InsumoDados, PecaComCusto, PecaPublica, PecaVisivel } from "./peca.schema";

/*
 * Aqui mora a REGRA DE NEGÓCIO. Nem a página nem a action decidem nada:
 * elas autenticam, validam formato e delegam. Assim a regra é testável sem
 * subir servidor, e existe num lugar só.
 */

/** Regra 2.1: custo = código do fornecedor × fator. */
export function calcularCusto(codigoFornecedor: number, fator: number): number {
  return Math.round(codigoFornecedor * fator * 100) / 100;
}

/** Margem sobre o preço de tabela. Null quando falta um dos dois. */
export function calcularMargem(custo: number | null, preco: number | null): number | null {
  if (custo === null || preco === null || preco === 0) return null;
  return Math.round(((preco - custo) / preco) * 1000) / 10; // %, 1 casa
}

const dec = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/**
 * Regra 2.3: o SKU interno é nosso (LL-0001) e não tem relação com o código
 * do fornecedor. Gerado dentro da transação para dois cadastros simultâneos
 * não receberem o mesmo número.
 */
async function proximoSku(tx: Prisma.TransactionClient): Promise<string> {
  const ultima = await tx.peca.findFirst({
    where: { sku: { startsWith: "LL-" } },
    orderBy: { sku: "desc" },
    select: { sku: true },
  });
  const n = ultima ? Number(ultima.sku.slice(3)) + 1 : 1;
  if (!Number.isFinite(n)) throw new ErroDominio("ERRO_INTERNO", "Não consegui gerar o código da peça.");
  return `LL-${String(n).padStart(4, "0")}`;
}

/*
 * O ponto de segurança mais importante do módulo: a peça sai daqui já
 * filtrada. Não existe caminho em que o custo chegue a quem não pode vê-lo,
 * porque o campo nem entra no objeto.
 */
function projetar(p: LinhaPeca, saldo: number, veFinanceiro: boolean): PecaVisivel {
  const publica: PecaPublica = {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    categoria: p.categoria,
    tamanho: p.tamanho,
    tipo: p.tipo,
    precoTabela: dec(p.precoTabela),
    saldo,
    imagemThumb: p.imagens[0]?.pathThumb ?? null,
  };

  if (!veFinanceiro) return publica;

  const custo = dec(p.custo);
  const comCusto: PecaComCusto = {
    ...publica,
    codigoFornecedor: dec(p.codigoFornecedor),
    fator: dec(p.fator),
    custo,
    margem: calcularMargem(custo, publica.precoTabela),
  };
  return comCusto;
}

const selecao = {
  id: true,
  sku: true,
  nome: true,
  categoria: true,
  tamanho: true,
  tipo: true,
  precoTabela: true,
  codigoFornecedor: true,
  fator: true,
  custo: true,
  imagens: { where: { principal: true }, take: 1, select: { pathThumb: true } },
} satisfies Prisma.PecaSelect;

type LinhaPeca = Prisma.PecaGetPayload<{ select: typeof selecao }>;

export async function listarPecas(opcoes: {
  busca?: string;
  tipo?: "PECA" | "INSUMO";
  veFinanceiro: boolean;
}): Promise<PecaVisivel[]> {
  const { busca, tipo, veFinanceiro } = opcoes;

  const where: Prisma.PecaWhereInput = {
    arquivada: false,
    ...(tipo ? { tipo } : {}),
    ...(busca
      ? {
          OR: [
            { nome: { contains: busca, mode: "insensitive" } },
            { sku: { contains: busca, mode: "insensitive" } },
            { categoria: { contains: busca, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const pecas = await prisma.peca.findMany({ where, select: selecao, orderBy: { nome: "asc" }, take: 300 });
  if (pecas.length === 0) return [];

  // Regra 2.4: saldo é a SOMA dos movimentos, nunca um campo editável.
  // Uma agregação só para todas as peças, em vez de N consultas.
  const saldos = await prisma.movimentoEstoque.groupBy({
    by: ["pecaId"],
    where: { pecaId: { in: pecas.map((p) => p.id) } },
    _sum: { delta: true },
  });
  const porPeca = new Map(saldos.map((s) => [s.pecaId, s._sum.delta ?? 0]));

  return pecas.map((p) => projetar(p, porPeca.get(p.id) ?? 0, veFinanceiro));
}

export async function buscarPeca(id: string, veFinanceiro: boolean): Promise<PecaVisivel> {
  const p = await prisma.peca.findUnique({ where: { id }, select: selecao });
  if (!p) throw new NaoEncontrado("Peça");

  const agg = await prisma.movimentoEstoque.aggregate({
    where: { pecaId: id },
    _sum: { delta: true },
  });
  return projetar(p, agg._sum.delta ?? 0, veFinanceiro);
}

export async function criarPeca(dados: CriarPecaDados, veFinanceiro: boolean) {
  const gravaCusto = veFinanceiro && dados.codigoFornecedor !== undefined && dados.fator !== undefined;

  return prisma.$transaction(async (tx) => {
    const sku = await proximoSku(tx);

    return tx.peca.create({
      data: {
        sku,
        nome: dados.nome,
        categoria: dados.categoria,
        tipo: dados.tipo,
        tamanho: dados.tamanho || null,
        precoTabela: dados.precoTabela ?? null,
        fornecedorId: dados.fornecedorId || null,
        // Sem permissão de financeiro os três campos ficam de fora: a peça
        // nasce SEM custo, em vez de nascer com custo errado.
        ...(gravaCusto
          ? {
              codigoFornecedor: dados.codigoFornecedor,
              fator: dados.fator,
              custo: calcularCusto(dados.codigoFornecedor!, dados.fator!),
            }
          : {}),
      },
      select: { id: true, sku: true, nome: true },
    });
  });
}

/**
 * Atualização é MERGE, não replace — a mesma lição do app antigo: um vendedor
 * edita o nome da peça sem apagar o custo que ele nem enxerga. Os campos
 * financeiros só entram no update quando quem edita pode vê-los.
 */
export async function editarPeca(id: string, dados: CriarPecaDados, veFinanceiro: boolean) {
  const existe = await prisma.peca.findUnique({ where: { id }, select: { id: true } });
  if (!existe) throw new NaoEncontrado("Peça");

  const gravaCusto = veFinanceiro && dados.codigoFornecedor !== undefined && dados.fator !== undefined;

  return prisma.peca.update({
    where: { id },
    data: {
      nome: dados.nome,
      categoria: dados.categoria,
      tipo: dados.tipo,
      tamanho: dados.tamanho || null,
      precoTabela: dados.precoTabela ?? null,
      fornecedorId: dados.fornecedorId || null,
      ...(gravaCusto
        ? {
            codigoFornecedor: dados.codigoFornecedor,
            fator: dados.fator,
            custo: calcularCusto(dados.codigoFornecedor!, dados.fator!),
          }
        : {}),
    },
    select: { id: true, sku: true },
  });
}

/** Saldo atual = soma dos movimentos. Uma consulta, sem carregar a lista. */
export async function saldoDe(pecaId: string): Promise<number> {
  const r = await prisma.movimentoEstoque.aggregate({
    where: { pecaId },
    _sum: { delta: true },
  });
  return r._sum.delta ?? 0;
}

/**
 * Regra 2.4: estoque só muda por movimento. Não existe "editar o saldo" —
 * existe registrar entrada ou saída, e o saldo é consequência.
 */
export async function movimentarEstoque(entrada: {
  pecaId: string;
  delta: number;
  motivo: "COMPRA" | "VENDA" | "DEVOLUCAO" | "AJUSTE" | "INVENTARIO" | "PERDA";
  origem?: string;
  observacao?: string;
}) {
  if (entrada.delta === 0) {
    throw new ErroDominio("DADOS_INVALIDOS", "O movimento não pode ser zero.");
  }
  return prisma.movimentoEstoque.create({ data: entrada, select: { id: true } });
}

/** Numeração por unidade na etiqueta: LL-0001-01, LL-0001-02… */
export async function proximaSerie(pecaId: string, quantas: number): Promise<string[]> {
  const p = await prisma.peca.update({
    where: { id: pecaId },
    data: { ultimaSerie: { increment: quantas } },
    select: { sku: true, ultimaSerie: true },
  });
  const fim = p.ultimaSerie;
  const inicio = fim - quantas + 1;
  return Array.from({ length: quantas }, (_, i) => `${p.sku}-${String(inicio + i).padStart(2, "0")}`);
}

/* ══════════════════════════ INSUMOS ══════════════════════════ */

/*
 * Insumo é uma Peca com tipo = INSUMO. Mesma tabela de propósito: o insumo
 * entra por compra, sai por movimento e tem custo — exatamente como a peça.
 * Duas tabelas quase iguais só criariam dois caminhos para a mesma regra.
 */
export async function criarInsumo(dados: InsumoDados) {
  return prisma.$transaction(async (tx) => {
    const ultima = await tx.peca.findFirst({
      where: { sku: { startsWith: "IN-" } },
      orderBy: { sku: "desc" },
      select: { sku: true },
    });
    const n = ultima ? Number(ultima.sku.slice(3)) + 1 : 1;
    return tx.peca.create({
      data: {
        sku: `IN-${String(n).padStart(4, "0")}`,
        tipo: "INSUMO",
        nome: dados.nome,
        categoria: "Insumo",
        unidade: dados.unidade,
        minimo: dados.minimo,
        custo: dados.custo ?? null,
      },
      select: { id: true, sku: true },
    });
  });
}

export async function editarInsumo(id: string, dados: InsumoDados) {
  const existe = await prisma.peca.findFirst({
    where: { id, tipo: "INSUMO" },
    select: { id: true },
  });
  if (!existe) throw new NaoEncontrado("Insumo");

  return prisma.peca.update({
    where: { id },
    data: {
      nome: dados.nome,
      unidade: dados.unidade,
      minimo: dados.minimo,
      custo: dados.custo ?? null,
    },
    select: { id: true },
  });
}
