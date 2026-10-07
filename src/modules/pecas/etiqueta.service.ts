import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { precosDaEtiqueta, type Etiqueta } from "./etiqueta.regras";
import { desenhoSchema, skuDoCodigo } from "./etiqueta.schemas";
import { LIMITES, type DesenhoEtiqueta } from "./etiqueta-desenho";

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

/* ─────────────── modelos desenhados (Ajustes › Criação de etiquetas) ─────────────── */

/*
 * Os modelos moram numa linha de Config, como os outros ajustes da loja: uma
 * lista pequena (até 20), lida inteira, sem tabela nem migration. Cada um é
 * revalidado na leitura — um modelo que ficou estranho por qualquer motivo
 * some da lista em vez de quebrar a impressão.
 */
const CHAVE_DESENHOS = "etiquetaDesenhos";

export async function lerDesenhos(): Promise<DesenhoEtiqueta[]> {
  const linha = await prisma.config.findUnique({ where: { chave: CHAVE_DESENHOS }, select: { valor: true } });
  const lista = Array.isArray(linha?.valor) ? linha.valor : [];
  return lista.flatMap((d) => {
    const ok = desenhoSchema.safeParse(d);
    return ok.success ? [ok.data] : [];
  });
}

async function gravar(lista: DesenhoEtiqueta[]) {
  await prisma.config.upsert({
    where: { chave: CHAVE_DESENHOS },
    update: { valor: lista as unknown as Prisma.InputJsonValue },
    create: { chave: CHAVE_DESENHOS, valor: lista as unknown as Prisma.InputJsonValue },
    select: { chave: true },
  });
}

/** Salva por cima se o id já existe; senão, entra no fim. */
export async function salvarDesenho(d: DesenhoEtiqueta) {
  const lista = await lerDesenhos();
  const i = lista.findIndex((x) => x.id === d.id);
  if (i < 0 && lista.length >= LIMITES.modelos) {
    throw new ErroDominio(
      "REGRA_NEGOCIO",
      `Já são ${LIMITES.modelos} modelos. Apague um que não use mais para criar outro.`,
    );
  }
  if (lista.some((x) => x.id !== d.id && x.nome.toLowerCase() === d.nome.toLowerCase())) {
    throw new ErroDominio("REGRA_NEGOCIO", "Já existe um modelo com esse nome. Escolha outro nome.");
  }
  const nova = i < 0 ? [...lista, d] : lista.map((x) => (x.id === d.id ? d : x));
  await gravar(nova);
}

export async function excluirDesenho(id: string) {
  const lista = await lerDesenhos();
  if (!lista.some((x) => x.id === id)) {
    throw new ErroDominio("NAO_ENCONTRADO", "Esse modelo não existe mais. Atualize a tela.");
  }
  await gravar(lista.filter((x) => x.id !== id));
}
