import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { precosDaEtiqueta, type Etiqueta } from "./etiqueta.regras";
import { skuDoCodigo } from "./etiqueta.schemas";

/*
 * ETIQUETAS — o que vai impresso em cada uma.
 *
 * Um código por PEÇA, não por unidade: três anéis iguais saem os três com
 * LL-0004. O app antigo numerava cada etiqueta (LL-0004-01, -02…) e o novo
 * copiou; o João mandou tirar (07/10/2026) — o código identifica o modelo, e
 * número de unidade só confundia na prateleira. Imprimir voltou a ser só
 * leitura. As etiquetas antigas com sufixo continuam lendo: `skuDoCodigo`
 * descarta o "-07".
 */

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

/** Dados de etiqueta de um punhado de peças — para a pré-visualização das telas. */
export async function pecasParaEtiqueta(ids: string[]) {
  const pecas = await prisma.peca.findMany({
    where: { id: { in: ids }, arquivada: false, tipo: "PECA" },
    select: {
      id: true,
      sku: true,
      nome: true,
      tamanho: true,
      precoTabela: true,
      precoPromocional: true,
      movimentos: { select: { delta: true } },
    },
  });
  return pecas.map((p) => ({
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    tamanho: p.tamanho,
    saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
    ...precosDaEtiqueta(num(p.precoTabela), num(p.precoPromocional)),
  }));
}

export async function montarEtiquetas(
  itens: Array<{ pecaId: string; quantidade: number }>,
): Promise<Etiqueta[]> {
  const ids = [...new Set(itens.map((i) => i.pecaId))];
  const pecas = await prisma.peca.findMany({
    where: { id: { in: ids }, arquivada: false, tipo: "PECA" },
    select: { id: true, sku: true, nome: true, tamanho: true, precoTabela: true, precoPromocional: true },
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));
  if (itens.some((i) => !porId.has(i.pecaId))) {
    throw new ErroDominio(
      "NAO_ENCONTRADO",
      "Uma das peças não existe mais ou foi arquivada. Atualize a tela e escolha de novo.",
    );
  }

  const saida: Etiqueta[] = [];
  for (const item of itens) {
    const p = porId.get(item.pecaId)!;
    const etiqueta: Etiqueta = {
      codigo: p.sku,
      nome: p.nome,
      tamanho: p.tamanho,
      ...precosDaEtiqueta(num(p.precoTabela), num(p.precoPromocional)),
    };
    for (let u = 0; u < item.quantidade; u++) saida.push(etiqueta);
  }
  return saida;
}

/** O que o leitor de QR leu → a peça. Peça arquivada não é encontrada. */
export async function pecaPorCodigo(codigo: string) {
  const sku = skuDoCodigo(codigo);
  const p = await prisma.peca.findFirst({
    where: { sku, arquivada: false },
    select: { id: true, nome: true },
  });
  if (!p) {
    throw new ErroDominio(
      "NAO_ENCONTRADO",
      `Nenhuma peça com o código ${sku}. Confira a etiqueta ou digite o código como está nela.`,
    );
  }
  return p;
}
