import "server-only";

import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import type { Linha } from "@prisma/client";
import { AJUSTES_PADRAO, chaveCategorias, lerAjustes } from "@/modules/ajustes/ajustes.service";

/*
 * CATEGORIAS DE PEÇA — portadas de `telaCategorias` do app antigo.
 *
 * A lista mora nos Ajustes (uma linha de Config), e a peça guarda o NOME da
 * categoria, não um id. É isso que decide as duas regras abaixo: renomear
 * precisa levar as peças junto, e excluir precisa soltá-las — senão elas
 * ficam apontando para um nome que não existe mais e somem dos filtros.
 *
 * Por isso renomear e excluir gravam a lista E as peças numa transação só.
 */

const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

/*
 * Cada linha tem a sua lista (perfume não aparece entre as de anel). As
 * peças são filtradas pela linha também: "Outros" de semijoia e "Outros" de
 * Outros são categorias diferentes, e renomear uma não pode levar a outra.
 */
async function gravarLista(tx: Tx, linha: Linha, lista: string[]) {
  const chave = chaveCategorias(linha);
  await tx.config.upsert({
    where: { chave },
    update: { valor: lista },
    create: { chave, valor: lista },
    select: { chave: true },
  });
}

export async function painelCategorias(linha: Linha) {
  const [ajustes, usos] = await Promise.all([
    lerAjustes(),
    prisma.peca.groupBy({
      by: ["categoria"],
      where: { tipo: "PECA", arquivada: false, linha },
      _count: true,
    }),
  ]);
  const categorias = ajustes.categorias[linha];
  const porNome = new Map(usos.map((u) => [u.categoria, u._count]));
  return {
    lista: categorias.map((nome) => ({ nome, pecas: porNome.get(nome) ?? 0 })),
    semCategoria: porNome.get("") ?? 0,
    // Peça antiga ou categoria tirada da lista por fora: aparece para alguém resolver.
    foraDaLista: usos
      .filter((u) => u.categoria !== "" && !categorias.includes(u.categoria))
      .map((u) => ({ nome: u.categoria, pecas: u._count })),
  };
}

export async function criarCategoria(linha: Linha, nome: string) {
  const categorias = (await lerAjustes()).categorias[linha];
  if (categorias.some((c) => igual(c, nome))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe uma categoria com esse nome nesta linha.");
  }
  await prisma.$transaction((tx) => gravarLista(tx, linha, [...categorias, nome]));
}

/** Devolve quantas peças mudaram junto. */
export async function renomearCategoria(linha: Linha, de: string, para: string): Promise<number> {
  const categorias = (await lerAjustes()).categorias[linha];
  const i = categorias.indexOf(de);
  if (i < 0) throw new ErroDominio("NAO_ENCONTRADO", "Essa categoria não está mais na lista. Atualize a tela.");
  if (de === para) return 0;
  if (categorias.some((c, k) => k !== i && igual(c, para))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe uma categoria com esse nome nesta linha.");
  }
  const nova = categorias.map((c, k) => (k === i ? para : c));
  return prisma.$transaction(async (tx) => {
    await gravarLista(tx, linha, nova);
    const r = await tx.peca.updateMany({ where: { tipo: "PECA", linha, categoria: de }, data: { categoria: para } });
    return r.count;
  });
}

/** Devolve quantas peças ficaram sem categoria. Nenhuma peça é apagada. */
export async function excluirCategoria(linha: Linha, nome: string): Promise<number> {
  const categorias = (await lerAjustes()).categorias[linha];
  if (!categorias.includes(nome)) {
    throw new ErroDominio("NAO_ENCONTRADO", "Essa categoria não está mais na lista. Atualize a tela.");
  }
  return prisma.$transaction(async (tx) => {
    await gravarLista(
      tx,
      linha,
      categorias.filter((c) => c !== nome),
    );
    const r = await tx.peca.updateMany({ where: { tipo: "PECA", linha, categoria: nome }, data: { categoria: "" } });
    return r.count;
  });
}

/* "Restaurar lista de fábrica" não mexe nas peças, como no app antigo: uma
   que use categoria fora da lista continua com ela, marcada como fora. */
export async function restaurarCategorias(linha: Linha) {
  await prisma.$transaction((tx) => gravarLista(tx, linha, [...AJUSTES_PADRAO.categorias[linha]]));
}
