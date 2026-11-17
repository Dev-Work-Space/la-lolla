import "server-only";

import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { LINHAS, type Precificacao } from "@/modules/pecas/linha";
import { AJUSTES_PADRAO, CHAVES, chaveCategorias, chaveFator, chavePreco, type Ajustes } from "./ajustes.tipos";

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
  const chaves = [
    ...Object.values(CHAVES),
    ...LINHAS.flatMap((l) => [chaveFator(l), chavePreco(l), chaveCategorias(l)]),
  ];
  const linhas = await prisma.config.findMany({
    where: { chave: { in: [...new Set(chaves)] } },
    select: { chave: true, valor: true },
  });

  const bruto = new Map(linhas.map((l) => [l.chave, l.valor]));
  const numero = (chave: string, padrao: number) => {
    const n = Number(bruto.get(chave));
    return bruto.has(chave) && Number.isFinite(n) && n >= 0 ? n : padrao;
  };

  const precificacao = Object.fromEntries(
    LINHAS.map((l) => {
      const padrao = AJUSTES_PADRAO.precificacao[l];
      const preco = bruto.get(chavePreco(l)) as { modo?: unknown; valor?: unknown } | undefined;
      const valor = Number(preco?.valor);
      let fator = numero(chaveFator(l), padrao.fator);
      // Semijoia sempre teve código: um multiplicador zerado zeraria o custo de toda peça nova.
      if (l === "SEMIJOIA" && fator === 0) fator = padrao.fator;
      return [
        l,
        {
          fator,
          modoPreco: preco?.modo === "PERCENTUAL" ? "PERCENTUAL" : preco?.modo === "MULTIPLICADOR" ? "MULTIPLICADOR" : padrao.modoPreco,
          valorPreco: Number.isFinite(valor) && valor >= 0 ? valor : padrao.valorPreco,
        } satisfies Precificacao,
      ];
    }),
  ) as Ajustes["precificacao"];

  const categorias = Object.fromEntries(
    LINHAS.map((l) => {
      const v = bruto.get(chaveCategorias(l));
      // Lista vazia é escolha de quem excluiu todas; só a AUSÊNCIA da linha cai na de fábrica.
      return [l, Array.isArray(v) ? v.map(String) : AJUSTES_PADRAO.categorias[l]];
    }),
  ) as Ajustes["categorias"];

  return {
    precificacao,
    meta: numero(CHAVES.meta, AJUSTES_PADRAO.meta),
    diasParado: numero(CHAVES.diasParado, AJUSTES_PADRAO.diasParado) || AJUSTES_PADRAO.diasParado,
    descontoVista: numero(CHAVES.descontoVista, AJUSTES_PADRAO.descontoVista),
    urlApp: typeof bruto.get(CHAVES.urlApp) === "string" ? String(bruto.get(CHAVES.urlApp)) : "",
    categorias,
    // Mesma regra das categorias: só a AUSÊNCIA da linha cai na de fábrica.
    materiais: Array.isArray(bruto.get(CHAVES.materiais))
      ? (bruto.get(CHAVES.materiais) as unknown[]).map(String)
      : AJUSTES_PADRAO.materiais,
  };
});

/** `chave` é a chave de Config: uma de CHAVES ou a de uma linha (chaveFator, chavePreco…). */
export async function gravarAjuste(chave: string, valor: unknown) {
  return prisma.config.upsert({
    where: { chave },
    update: { valor: valor as never },
    create: { chave, valor: valor as never },
    select: { chave: true },
  });
}
