import "server-only";

import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { urlAssinada } from "@/lib/storage";
import { skuDoCodigo } from "@/modules/pecas/etiqueta.schemas";
import { reservaPorPeca } from "@/modules/orcamentos/orcamento.service";

/*
 * PDV — o "caixa de supermercado" pedido pelo João (18/11): passa a etiqueta
 * na câmera, a peça entra no carrinho, e no fim abre a venda de sempre já
 * preenchida para cobrar. Aqui só se LÊ: preço, estoque e reserva. Quem grava
 * a venda continua sendo `fecharVenda`, com todas as regras dele.
 */

export type PecaPdv = {
  id: string;
  sku: string;
  nome: string;
  tamanho: string | null;
  material: string | null;
  /** O mesmo preço que a busca da venda usa (preço de tabela). */
  preco: number;
  estoque: number;
  /** Em orçamento aberto e dentro da validade. */
  reservado: number;
  foto: string | null;
};

const SELECAO = {
  id: true,
  sku: true,
  nome: true,
  tamanho: true,
  material: true,
  precoTabela: true,
  movimentos: { select: { delta: true } },
  imagens: { where: { principal: true }, take: 1, select: { pathThumb: true } },
} as const;

export async function pecaParaPdv(codigo: string): Promise<PecaPdv> {
  const sku = skuDoCodigo(codigo);
  const p = await prisma.peca.findFirst({ where: { sku, tipo: "PECA", arquivada: false }, select: SELECAO });
  if (!p) {
    throw new ErroDominio(
      "NAO_ENCONTRADO",
      `Nenhum produto com o código ${sku}. Confira a etiqueta ou digite o código como está nela.`,
    );
  }
  const reservas = await reservaPorPeca();
  return {
    id: p.id,
    sku: p.sku,
    nome: p.nome,
    tamanho: p.tamanho,
    material: p.material,
    preco: p.precoTabela ? Number(p.precoTabela) : 0,
    estoque: p.movimentos.reduce((s, m) => s + m.delta, 0),
    reservado: reservas.get(p.id) ?? 0,
    foto: await urlAssinada(p.imagens[0]?.pathThumb ?? null),
  };
}

/** Os itens do PDV no formato da tela de venda, com preço e estoque relidos do banco. */
export async function itensDoPdv(lista: Array<{ id: string; quantidade: number }>) {
  const pecas = await prisma.peca.findMany({
    where: { id: { in: lista.map((i) => i.id) }, tipo: "PECA", arquivada: false },
    select: SELECAO,
  });
  const porId = new Map(pecas.map((p) => [p.id, p]));
  // Mantém a ordem em que passaram no caixa; id que não existe mais fica de fora.
  return lista.flatMap((i) => {
    const p = porId.get(i.id);
    if (!p) return [];
    const preco = p.precoTabela ? Number(p.precoTabela) : 0;
    return [
      {
        pecaId: p.id,
        sku: p.sku,
        nome: p.nome,
        tamanho: p.tamanho,
        quantidade: i.quantidade,
        precoUnit: preco,
        saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
      },
    ];
  });
}
