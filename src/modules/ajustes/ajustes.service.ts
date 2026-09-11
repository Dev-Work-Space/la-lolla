import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { AJUSTES_PADRAO, CHAVES, type Ajustes } from "./ajustes.tipos";

export * from "./ajustes.tipos";

/*
 * Leitura dos ajustes.
 *
 * `cache()` memoiza por REQUISIÇÃO: a página, o service da venda e o do
 * estoque podem pedir o multiplicador que o banco é consultado uma vez só.
 *
 * Cada ajuste é uma LINHA própria em Config, e não um objeto único. Assim
 * gravar a meta não tem como sobrescrever o multiplicador — erro clássico de
 * configuração guardada num JSON só.
 */
export const lerAjustes = cache(async (): Promise<Ajustes> => {
  const linhas = await prisma.config.findMany({
    where: { chave: { in: Object.values(CHAVES) } },
    select: { chave: true, valor: true },
  });

  const bruto = new Map(linhas.map((l) => [l.chave, l.valor]));
  const numero = (chave: string, padrao: number) => {
    const n = Number(bruto.get(chave));
    return Number.isFinite(n) && n >= 0 ? n : padrao;
  };

  const cats = bruto.get(CHAVES.categorias);

  return {
    // Um multiplicador zerado zeraria o custo de toda peça nova: cai no padrão.
    fator: numero(CHAVES.fator, AJUSTES_PADRAO.fator) || AJUSTES_PADRAO.fator,
    meta: numero(CHAVES.meta, AJUSTES_PADRAO.meta),
    diasParado: numero(CHAVES.diasParado, AJUSTES_PADRAO.diasParado) || AJUSTES_PADRAO.diasParado,
    descontoVista: numero(CHAVES.descontoVista, AJUSTES_PADRAO.descontoVista),
    urlApp: typeof bruto.get(CHAVES.urlApp) === "string" ? String(bruto.get(CHAVES.urlApp)) : "",
    categorias:
      Array.isArray(cats) && cats.length > 0
        ? cats.map(String)
        : AJUSTES_PADRAO.categorias,
  };
});

/*
 * Quantas peças usam cada categoria.
 *
 * Serve ao editor de categorias dos Ajustes. Sem esse número, tirar uma
 * categoria da lista é um tiro no escuro: as peças continuariam apontando
 * para algo que não existe mais e sumiriam dos filtros sem ninguém perceber.
 */
export async function usoDasCategorias(): Promise<Record<string, number>> {
  const linhas = await prisma.peca.groupBy({
    by: ["categoria"],
    where: { tipo: "PECA", arquivada: false },
    _count: true,
  });
  return Object.fromEntries(linhas.map((l) => [l.categoria, l._count]));
}

export async function gravarAjuste(chave: keyof typeof CHAVES, valor: unknown) {
  return prisma.config.upsert({
    where: { chave: CHAVES[chave] },
    update: { valor: valor as never },
    create: { chave: CHAVES[chave], valor: valor as never },
    select: { chave: true },
  });
}
