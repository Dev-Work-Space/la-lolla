import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { r2 } from "@/lib/parcelas";
import { dataDoCampo, fimDoDia, inicioDoDia } from "@/lib/dia";
import { promocaoEncerrada, promocaoValendo } from "./promocao";
import type { PromocaoDados } from "./promocao.schemas";

/*
 * CENTRAL DE PROMOÇÕES (João, 18/11): pôr um grupo inteiro em promoção — por
 * categoria, linha, material, fornecedor ou produto a produto — com % ou
 * preço fixo, e com data para acabar. Grava o `precoPromocional` e o
 * `promocaoAte` de cada produto; quem decide se vale é `promocao.ts`.
 *
 * Preço fixo que não fica abaixo do preço normal de um produto não vira
 * promoção para ele (documentação, seção 02): esse produto fica de fora e a
 * tela diz quantos.
 */

const BASE: Prisma.PecaWhereInput = { tipo: "PECA", arquivada: false, precoTabela: { not: null } };

function onde(d: PromocaoDados): Prisma.PecaWhereInput {
  switch (d.alvo) {
    case "categoria":
      return { ...BASE, categoria: d.qual };
    case "linha":
      return { ...BASE, linha: d.qual as Prisma.PecaWhereInput["linha"] };
    case "material":
      return { ...BASE, material: d.qual };
    case "fornecedor":
      return { ...BASE, fornecedorId: d.qual };
    case "produtos":
      return { ...BASE, id: { in: d.ids ?? [] } };
  }
}

function novoPreco(tabela: number, d: PromocaoDados) {
  return d.modo === "PERCENTUAL" ? r2(tabela * (1 - d.valor / 100)) : r2(d.valor);
}

async function calcular(d: PromocaoDados) {
  const pecas = await prisma.peca.findMany({
    where: onde(d),
    select: { id: true, sku: true, nome: true, precoTabela: true },
    orderBy: { nome: "asc" },
    take: 501,
  });
  if (pecas.length > 500) {
    throw new ErroDominio("REGRA_NEGOCIO", "São mais de 500 produtos de uma vez. Escolha um grupo menor.");
  }
  const entram: Array<{ id: string; sku: string; nome: string; de: number; por: number }> = [];
  let ficam = 0;
  for (const p of pecas) {
    const de = Number(p.precoTabela);
    const por = novoPreco(de, d);
    if (por > 0 && por < de) entram.push({ id: p.id, sku: p.sku, nome: p.nome, de, por });
    else ficam++;
  }
  return { entram, ficam };
}

function fimDa(d: PromocaoDados): Date | null {
  if (!d.ate) return null;
  const dia = dataDoCampo(d.ate);
  if (!dia) return null;
  if (dia < inicioDoDia()) throw new ErroDominio("REGRA_NEGOCIO", "A data de fim já passou. Escolha hoje ou um dia à frente.");
  return fimDoDia(dia);
}

/** O que aconteceria — sem gravar nada. */
export async function previaPromocao(d: PromocaoDados) {
  fimDa(d);
  const { entram, ficam } = await calcular(d);
  return { quantos: entram.length, ficam, exemplos: entram.slice(0, 4) };
}

export async function aplicarPromocao(d: PromocaoDados) {
  const ate = fimDa(d);
  const { entram, ficam } = await calcular(d);
  if (entram.length === 0) {
    throw new ErroDominio(
      "REGRA_NEGOCIO",
      ficam
        ? "Nenhum produto ficaria mais barato com esse preço. Use um valor menor que o preço normal deles."
        : "Nenhum produto com preço nesse grupo.",
    );
  }
  // Tudo ou nada: metade da loja em promoção e metade não seria pior que nenhuma.
  await prisma.$transaction(
    entram.map((p) =>
      prisma.peca.update({ where: { id: p.id }, data: { precoPromocional: p.por, promocaoAte: ate }, select: { id: true } }),
    ),
  );
  return { aplicados: entram.length, ficam };
}

/** Volta ao preço normal. Nada mais muda no produto. */
export async function tirarPromocao(ids: string[]) {
  const r = await prisma.peca.updateMany({
    where: { id: { in: ids }, tipo: "PECA" },
    data: { precoPromocional: null, promocaoAte: null },
  });
  return r.count;
}

export async function painelPromocoes() {
  const [comPromo, todos, fornecedores] = await Promise.all([
    prisma.peca.findMany({
      where: { tipo: "PECA", arquivada: false, precoPromocional: { not: null } },
      select: { id: true, sku: true, nome: true, categoria: true, precoTabela: true, precoPromocional: true, promocaoAte: true },
      orderBy: [{ promocaoAte: "asc" }, { nome: "asc" }],
    }),
    prisma.peca.findMany({
      where: BASE,
      select: { id: true, sku: true, nome: true, categoria: true, linha: true, material: true, fornecedorId: true, precoTabela: true },
      orderBy: { nome: "asc" },
    }),
    prisma.fornecedor.findMany({ select: { id: true, nome: true }, orderBy: { nome: "asc" } }),
  ]);

  const conta = (chave: (p: (typeof todos)[number]) => string | null) => {
    const m = new Map<string, number>();
    for (const p of todos) {
      const k = chave(p);
      if (k) m.set(k, (m.get(k) ?? 0) + 1);
    }
    return m;
  };
  const porCategoria = conta((p) => p.categoria || null);
  const porMaterial = conta((p) => p.material);
  const porFornecedor = conta((p) => p.fornecedorId);
  const porLinha = conta((p) => p.linha);

  return {
    promocoes: comPromo.map((p) => {
      const de = Number(p.precoTabela ?? 0);
      const por = Number(p.precoPromocional);
      return {
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        categoria: p.categoria,
        de,
        por,
        pct: de > 0 && por < de ? Math.round((1 - por / de) * 100) : null,
        ate: p.promocaoAte?.toISOString() ?? null,
        valendo: promocaoValendo(p),
        encerrada: promocaoEncerrada(p),
      };
    }),
    produtos: todos.map((p) => ({ id: p.id, sku: p.sku, nome: p.nome, preco: Number(p.precoTabela) })),
    opcoes: {
      categoria: [...porCategoria].map(([v, n]) => ({ valor: v, rotulo: v, n })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
      linha: [...porLinha].map(([v, n]) => ({ valor: v, rotulo: v, n })),
      material: [...porMaterial].map(([v, n]) => ({ valor: v, rotulo: v, n })).sort((a, b) => a.rotulo.localeCompare(b.rotulo, "pt-BR")),
      fornecedor: fornecedores.filter((f) => porFornecedor.has(f.id)).map((f) => ({ valor: f.id, rotulo: f.nome, n: porFornecedor.get(f.id)! })),
    },
  };
}
