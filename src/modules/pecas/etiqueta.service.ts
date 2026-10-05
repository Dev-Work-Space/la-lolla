import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { precosDaEtiqueta, type Etiqueta } from "./etiqueta.regras";
import { skuDoCodigo } from "./etiqueta.schemas";

/*
 * ETIQUETAS — o que vai impresso em cada uma, e a numeração por unidade.
 *
 * A numeração (LL-0001-01, -02…) vem de `ultimaSerie` da peça, como no app
 * antigo: peças iguais recebem códigos diferentes para dar para rastrear qual
 * unidade saiu. Reservar os números é ESCRITA, e acontece numa transação só
 * para o lote inteiro — duas pessoas imprimindo ao mesmo tempo nunca recebem
 * o mesmo número, e um lote que falha no meio não queima números à toa.
 */

const num = (v: Prisma.Decimal | null) => (v === null ? null : Number(v));

const serie = (sku: string, n: number) => `${sku}-${String(n).padStart(2, "0")}`;

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
  numerar: boolean,
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

  // Primeiro número de cada item do pedido, na ordem do pedido.
  const inicio: number[] = [];
  if (numerar) {
    await prisma.$transaction(async (tx) => {
      for (const item of itens) {
        const p = await tx.peca.update({
          where: { id: item.pecaId },
          data: { ultimaSerie: { increment: item.quantidade } },
          select: { ultimaSerie: true },
        });
        inicio.push(p.ultimaSerie - item.quantidade + 1);
      }
    });
  }

  const saida: Etiqueta[] = [];
  itens.forEach((item, k) => {
    const p = porId.get(item.pecaId)!;
    const precos = precosDaEtiqueta(num(p.precoTabela), num(p.precoPromocional));
    for (let u = 0; u < item.quantidade; u++) {
      saida.push({
        codigo: numerar ? serie(p.sku, inicio[k] + u) : p.sku,
        nome: p.nome,
        tamanho: p.tamanho,
        ...precos,
      });
    }
  });
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
