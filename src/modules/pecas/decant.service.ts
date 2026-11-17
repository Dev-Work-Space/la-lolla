import "server-only";

import { prisma } from "@/lib/prisma";
import { ErroDominio, NaoEncontrado } from "@/lib/errors";
import { proximoSku } from "./peca.service";
import type { EnvaseDados } from "./decant.schemas";

const r2 = (n: number) => Math.round(n * 100) / 100;

/*
 * ENVASAR DECANTS — decisão do João (17/11): decant é um produto com estoque
 * em unidades, ligado ao perfume de onde sai. Os ml do frasco NÃO são
 * contados. É a única entrada de estoque que não vem de compra: o decant sai
 * da própria loja, não de um fornecedor.
 *
 * Numa transação só: cria o tamanho (se for novo), dá entrada nos decants e,
 * se marcado, baixa 1 frasco do perfume. Ou tudo, ou nada.
 */
export async function envasarDecants(d: EnvaseDados) {
  return prisma.$transaction(async (tx) => {
    const perfume = await tx.peca.findUnique({
      where: { id: d.perfumeId },
      select: {
        id: true,
        nome: true,
        categoria: true,
        linha: true,
        tipo: true,
        arquivada: true,
        perfumeId: true,
        volumeMl: true,
        custo: true,
        fornecedorId: true,
        movimentos: { select: { delta: true } },
      },
    });
    if (!perfume || perfume.arquivada) throw new NaoEncontrado("Perfume");
    if (perfume.linha !== "PERFUMARIA" || perfume.tipo !== "PECA" || perfume.perfumeId) {
      throw new ErroDominio("REGRA_NEGOCIO", "Decant só sai de um perfume da linha Perfumaria (o frasco inteiro).");
    }

    let decant: { id: string; nome: string; volumeMl: number | null };
    if (d.decantId) {
      const achado = await tx.peca.findFirst({
        where: { id: d.decantId, perfumeId: perfume.id, arquivada: false },
        select: { id: true, nome: true, volumeMl: true },
      });
      if (!achado) throw new ErroDominio("NAO_ENCONTRADO", "Esse decant não é deste perfume ou foi arquivado. Atualize a tela.");
      decant = achado;
    } else {
      const ml = d.volumeMl!;
      const repetido = await tx.peca.findFirst({
        where: { perfumeId: perfume.id, volumeMl: ml, arquivada: false },
        select: { id: true },
      });
      if (repetido) {
        throw new ErroDominio("REGRA_NEGOCIO", `Já existe o decant de ${ml} ml deste perfume. Escolha ele na lista.`);
      }
      decant = await tx.peca.create({
        data: {
          sku: await proximoSku(tx),
          // Mesmo nome e categoria do perfume: no catálogo ele vira uma opção de ml do mesmo card.
          nome: perfume.nome,
          categoria: perfume.categoria,
          linha: "PERFUMARIA",
          volumeMl: ml,
          tamanho: `${ml} ml`,
          perfumeId: perfume.id,
          fornecedorId: perfume.fornecedorId,
          precoTabela: d.precoTabela ?? null,
        },
        select: { id: true, nome: true, volumeMl: true },
      });
    }

    if (d.baixarFrasco) {
      const saldo = perfume.movimentos.reduce((s, m) => s + m.delta, 0);
      if (saldo < 1) {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          `"${perfume.nome}" está sem frasco em estoque para baixar. Desmarque "baixar 1 frasco" ou dê entrada no perfume antes.`,
        );
      }
      await tx.movimentoEstoque.create({
        data: { pecaId: perfume.id, delta: -1, motivo: "ENVASE", observacao: `Frasco aberto para decants de ${decant.volumeMl} ml` },
      });
    }

    /*
     * Custo do decant = custo do frasco ÷ ml do frasco × ml do decant, mais o
     * frasquinho. Sem custo ou sem volume no perfume não há conta honesta: o
     * decant fica sem custo (aparece como "sem custo" na margem) em vez de
     * nascer com um número inventado.
     */
    const custoPorMl =
      perfume.custo !== null && perfume.volumeMl ? Number(perfume.custo) / perfume.volumeMl : null;
    const custo =
      custoPorMl !== null && decant.volumeMl ? r2(custoPorMl * decant.volumeMl + (d.custoFrasquinho ?? 0)) : null;

    await tx.movimentoEstoque.create({
      data: {
        pecaId: decant.id,
        delta: d.quantidade,
        motivo: "ENVASE",
        observacao: `Envase de ${d.quantidade} × ${decant.volumeMl} ml`,
      },
    });
    await tx.peca.update({
      where: { id: decant.id },
      data: {
        totalRecebido: { increment: d.quantidade },
        ...(custo !== null ? { custo } : {}),
      },
    });

    return { decantId: decant.id, nome: decant.nome, volumeMl: decant.volumeMl, quantidade: d.quantidade, custo };
  });
}
