import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { urlsAssinadas } from "@/lib/storage";
import { reservaPorPeca } from "@/modules/orcamentos/orcamento.service";
import { saldoDasPecas } from "./catalogo.service";
import type { FiltroVitrine } from "./vitrine.schemas";
import type { ModeloVitrine, PecaVitrine } from "./vitrine.tipos";

/*
 * Catálogo público: o que a cliente vê pelo link, sem login.
 *
 * Fica de fora o que não dá para vender: insumo, peça arquivada, peça que
 * nunca chegou (cadastrada mas sem nenhuma entrada) e peça sem preço. A
 * esgotada aparece, marcada, por decisão do João: a cliente pode pedir.
 */
export async function listarVitrine(filtro: FiltroVitrine) {
  const q = filtro.busca;
  const where: Prisma.PecaWhereInput = {
    tipo: "PECA",
    arquivada: false,
    totalRecebido: { gt: 0 },
    precoTabela: { not: null },
    ...(q
      ? {
          OR: [
            { nome: { contains: q, mode: "insensitive" } },
            { categoria: { contains: q, mode: "insensitive" } },
          ],
        }
      : {}),
  };

  const pecas = await prisma.peca.findMany({
    where,
    select: {
      id: true,
      sku: true,
      nome: true,
      categoria: true,
      tamanho: true,
      precoTabela: true,
      precoPromocional: true,
      imagens: { where: { principal: true }, take: 1, select: { pathMedia: true } },
    },
    orderBy: { nome: "asc" },
  });

  // As categorias saem antes do filtro de categoria: a cliente precisa ver as outras para trocar.
  const categorias = [...new Set(pecas.map((p) => p.categoria))].sort((a, b) => a.localeCompare(b, "pt-BR"));
  const escolhidas = filtro.categoria ? pecas.filter((p) => p.categoria === filtro.categoria) : pecas;

  const [saldos, reservas] = await Promise.all([
    saldoDasPecas(escolhidas.map((p) => p.id)),
    reservaPorPeca(),
  ]);

  let linhas: PecaVitrine[] = escolhidas.map((p) => {
    const sugerido = Number(p.precoTabela);
    const promo = p.precoPromocional === null ? null : Number(p.precoPromocional);
    // Promocional só vale se for MENOR que o sugerido (documentação, seção 02).
    const emPromocao = promo !== null && promo < sugerido;
    const livre = (saldos.get(p.id) ?? 0) - (reservas.get(p.id) ?? 0);
    return {
      id: p.id,
      sku: p.sku,
      nome: p.nome,
      categoria: p.categoria,
      tamanho: p.tamanho,
      preco: emPromocao ? promo : sugerido,
      precoDe: emPromocao ? sugerido : null,
      descontoPct: emPromocao ? Math.round((1 - promo / sugerido) * 100) : null,
      disponivel: livre > 0,
      foto: p.imagens[0]?.pathMedia ?? null,
    };
  });

  const assinadas = await urlsAssinadas(linhas.map((l) => l.foto));
  linhas = linhas.map((l) => ({ ...l, foto: l.foto ? (assinadas.get(l.foto) ?? null) : null }));

  return { modelos: agrupar(linhas), categorias };
}

// "Aliança  Prata" e "aliança prata" são o mesmo modelo cadastrado duas vezes com digitação diferente.
const chaveDoModelo = (p: PecaVitrine) =>
  `${p.categoria}|${p.nome.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim()}`;

function agrupar(linhas: PecaVitrine[]): ModeloVitrine[] {
  const porChave = new Map<string, ModeloVitrine>();
  for (const p of linhas) {
    const chave = chaveDoModelo(p);
    const m = porChave.get(chave);
    if (m) m.variantes.push(p);
    else porChave.set(chave, { chave, nome: p.nome, categoria: p.categoria, variantes: [p] });
  }
  const modelos = [...porChave.values()];
  for (const m of modelos) {
    // "numeric" põe aro 9 antes de aro 16, e 5 ml antes de 100 ml.
    m.variantes.sort((a, b) => (a.tamanho ?? "").localeCompare(b.tamanho ?? "", "pt-BR", { numeric: true }));
  }
  // O que dá para levar agora vem primeiro; o modelo todo esgotado fica no fim, sem sumir.
  const temAlgum = (m: ModeloVitrine) => m.variantes.some((v) => v.disponivel);
  return modelos.sort((a, b) => Number(temAlgum(b)) - Number(temAlgum(a)));
}
