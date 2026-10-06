import "server-only";

import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { AJUSTES_PADRAO, CHAVES, lerAjustes } from "@/modules/ajustes/ajustes.service";

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

async function gravarLista(tx: Tx, lista: string[]) {
  await tx.config.upsert({
    where: { chave: CHAVES.categorias },
    update: { valor: lista },
    create: { chave: CHAVES.categorias, valor: lista },
    select: { chave: true },
  });
}

export async function painelCategorias() {
  const [{ categorias }, usos] = await Promise.all([
    lerAjustes(),
    prisma.peca.groupBy({
      by: ["categoria"],
      where: { tipo: "PECA", arquivada: false },
      _count: true,
    }),
  ]);
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

export async function criarCategoria(nome: string) {
  const { categorias } = await lerAjustes();
  if (categorias.some((c) => igual(c, nome))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe uma categoria com esse nome.");
  }
  await prisma.$transaction((tx) => gravarLista(tx, [...categorias, nome]));
}

/** Devolve quantas peças mudaram junto. */
export async function renomearCategoria(de: string, para: string): Promise<number> {
  const { categorias } = await lerAjustes();
  const i = categorias.indexOf(de);
  if (i < 0) throw new ErroDominio("NAO_ENCONTRADO", "Essa categoria não está mais na lista. Atualize a tela.");
  if (de === para) return 0;
  if (categorias.some((c, k) => k !== i && igual(c, para))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe uma categoria com esse nome.");
  }
  const nova = categorias.map((c, k) => (k === i ? para : c));
  return prisma.$transaction(async (tx) => {
    await gravarLista(tx, nova);
    const r = await tx.peca.updateMany({ where: { tipo: "PECA", categoria: de }, data: { categoria: para } });
    return r.count;
  });
}

/** Devolve quantas peças ficaram sem categoria. Nenhuma peça é apagada. */
export async function excluirCategoria(nome: string): Promise<number> {
  const { categorias } = await lerAjustes();
  if (!categorias.includes(nome)) {
    throw new ErroDominio("NAO_ENCONTRADO", "Essa categoria não está mais na lista. Atualize a tela.");
  }
  return prisma.$transaction(async (tx) => {
    await gravarLista(
      tx,
      categorias.filter((c) => c !== nome),
    );
    const r = await tx.peca.updateMany({ where: { tipo: "PECA", categoria: nome }, data: { categoria: "" } });
    return r.count;
  });
}

/* "Restaurar lista de fábrica" não mexe nas peças, como no app antigo: uma
   que use categoria fora da lista continua com ela, marcada como fora. */
export async function restaurarCategorias() {
  await prisma.$transaction((tx) => gravarLista(tx, [...AJUSTES_PADRAO.categorias]));
}
