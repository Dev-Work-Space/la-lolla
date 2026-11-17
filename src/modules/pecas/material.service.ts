import "server-only";

import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { AJUSTES_PADRAO, CHAVES, lerAjustes } from "@/modules/ajustes/ajustes.service";

/*
 * MATERIAIS DA SEMIJOIA — pedido do João (17/11), no mesmo molde das
 * categorias: a lista mora nos Ajustes e a peça guarda o NOME. Por isso
 * renomear leva as peças junto e excluir as solta (ficam sem material), numa
 * transação só — senão elas apontariam para um nome que não existe mais.
 */

const igual = (a: string, b: string) => a.localeCompare(b, "pt-BR", { sensitivity: "base" }) === 0;

type Tx = Parameters<Parameters<typeof prisma.$transaction>[0]>[0];

async function gravarLista(tx: Tx, lista: string[]) {
  await tx.config.upsert({
    where: { chave: CHAVES.materiais },
    update: { valor: lista },
    create: { chave: CHAVES.materiais, valor: lista },
    select: { chave: true },
  });
}

export async function painelMateriais() {
  const [{ materiais }, usos] = await Promise.all([
    lerAjustes(),
    prisma.peca.groupBy({
      by: ["material"],
      where: { tipo: "PECA", arquivada: false, material: { not: null } },
      _count: true,
    }),
  ]);
  const porNome = new Map(usos.map((u) => [u.material ?? "", u._count]));
  return {
    lista: materiais.map((nome) => ({ nome, pecas: porNome.get(nome) ?? 0 })),
    // Material tirado da lista por fora: aparece para alguém resolver.
    foraDaLista: usos
      .filter((u) => u.material && !materiais.includes(u.material))
      .map((u) => ({ nome: u.material!, pecas: u._count })),
  };
}

export async function criarMaterial(nome: string) {
  const { materiais } = await lerAjustes();
  if (materiais.some((m) => igual(m, nome))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe um material com esse nome.");
  }
  await prisma.$transaction((tx) => gravarLista(tx, [...materiais, nome]));
}

/** Devolve quantas peças mudaram junto. */
export async function renomearMaterial(de: string, para: string): Promise<number> {
  const { materiais } = await lerAjustes();
  const i = materiais.indexOf(de);
  if (i < 0) throw new ErroDominio("NAO_ENCONTRADO", "Esse material não está mais na lista. Atualize a tela.");
  if (de === para) return 0;
  if (materiais.some((m, k) => k !== i && igual(m, para))) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe um material com esse nome.");
  }
  return prisma.$transaction(async (tx) => {
    await gravarLista(tx, materiais.map((m, k) => (k === i ? para : m)));
    const r = await tx.peca.updateMany({ where: { material: de }, data: { material: para } });
    return r.count;
  });
}

/** Devolve quantas peças ficaram sem material. Nenhuma peça é apagada. */
export async function excluirMaterial(nome: string): Promise<number> {
  const { materiais } = await lerAjustes();
  if (!materiais.includes(nome)) {
    throw new ErroDominio("NAO_ENCONTRADO", "Esse material não está mais na lista. Atualize a tela.");
  }
  return prisma.$transaction(async (tx) => {
    await gravarLista(
      tx,
      materiais.filter((m) => m !== nome),
    );
    const r = await tx.peca.updateMany({ where: { material: nome }, data: { material: null } });
    return r.count;
  });
}

/* Restaurar não mexe nas peças: a que usa material fora da lista continua com ele. */
export async function restaurarMateriais() {
  await prisma.$transaction((tx) => gravarLista(tx, [...AJUSTES_PADRAO.materiais]));
}
