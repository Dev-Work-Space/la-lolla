import "server-only";

import { Prisma, type FormaPagamento, type ModoPagamentoOrcamento, type StatusOrcamento } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NaoEncontrado } from "@/lib/errors";
import { fimDoDia, inicioDoDia, somaDias } from "@/lib/dia";

/*
 * ORÇAMENTO — a proposta que vai ao cliente antes de fechar a venda.
 *
 * É o mesmo fluxo da venda em dois estágios, e por isso divide a aba com ela.
 * Três diferenças mandam no arquivo inteiro:
 *
 * 1. NÃO BAIXA ESTOQUE. As peças ficam RESERVADAS enquanto o orçamento está
 *    aberto e dentro da validade. Vender uma peça reservada para outra pessoa
 *    avisa, mas não bloqueia — quem decide é quem está no balcão.
 *
 * 2. NÃO CONFERE ESTOQUE. Dá para orçar peça que não tem em casa: a proposta
 *    é justamente para saber se vale a pena encomendar.
 *
 * 3. NÃO SE EDITA DEPOIS DE ENVIADO. Mudou o combinado, nasce uma REVISÃO:
 *    orçamento novo, número novo, e o anterior fica SUBSTITUÍDO. O PDF que o
 *    cliente já tem na mão precisa continuar existindo do jeito que foi
 *    enviado — senão a loja e a cliente ficam discutindo dois papéis
 *    diferentes com o mesmo número.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));

/** Validades que a tela oferece. A de fábrica é 7 dias. */
export const VALIDADES = [3, 7, 15, 30] as const;
export const VALIDADE_PADRAO = 7;

export const STATUS_ORCAMENTO: Array<[StatusOrcamento, string]> = [
  ["ABERTO", "Em aberto"],
  ["CONVERTIDO", "Aprovado"],
  ["RECUSADO", "Recusado"],
  ["SUBSTITUIDO", "Substituído"],
];

export function nomeStatus(s: StatusOrcamento): string {
  return STATUS_ORCAMENTO.find(([id]) => id === s)?.[1] ?? "—";
}

/*
 * Substituídos ganharam filtro próprio.
 *
 * A documentação aponta como defeito (item 10) o fato de eles só aparecerem
 * em "Todos": quem procura a versão antiga de um orçamento revisado tinha de
 * varrer a lista inteira. O João mandou corrigir os pontos de atenção, então
 * o filtro entra aqui.
 */
export const FILTROS_ORCAMENTO = [
  ["todos", "Todos"],
  ["aberto", "Em aberto"],
  ["vencidos", "Vencidos"],
  ["aprovados", "Aprovados"],
  ["recusados", "Recusados"],
  ["substituidos", "Substituídos"],
] as const;

export type FiltroOrcamento = (typeof FILTROS_ORCAMENTO)[number][0];

/** "Nº 0001" — o número que sai no PDF e que a cliente cita no WhatsApp. */
export function numeroOrc(numero: number): string {
  return "Nº " + String(numero).padStart(4, "0");
}

/** Data + dias de validade. Gravamos as duas coisas: os dias porque é o que a
 *  tela pergunta, e a data final porque é o que as consultas comparam. */
export function calcularValidoAte(data: Date, validadeDias: number): Date {
  return fimDoDia(somaDias(inicioDoDia(data), validadeDias));
}

/* ─────────────────────── reserva de peças ─────────────────────── */

/*
 * A REGRA DA RESERVA, num lugar só.
 *
 * Reserva = soma das quantidades em orçamentos ABERTOS **e dentro da
 * validade**. Orçamento vencido, recusado, aprovado ou substituído deixa de
 * reservar — a peça volta a estar livre sozinha, sem ninguém precisar
 * lembrar de liberar.
 *
 * O catálogo já contava reserva, mas só olhava o status: um orçamento de três
 * meses atrás, vencido havia muito, continuava segurando peça no catálogo
 * para sempre. É o mesmo cálculo em dois lugares — agora é um só.
 */
export async function reservaPorPeca(ignorarOrcamentoId?: string): Promise<Map<string, number>> {
  const agora = new Date();
  const linhas = await prisma.itemOrcamento.groupBy({
    by: ["pecaId"],
    where: {
      orcamento: {
        status: "ABERTO",
        validoAte: { gte: agora },
        ...(ignorarOrcamentoId ? { id: { not: ignorarOrcamentoId } } : {}),
      },
    },
    _sum: { quantidade: true },
  });
  return new Map(linhas.map((l) => [l.pecaId, l._sum.quantidade ?? 0]));
}

/** Os orçamentos abertos que seguram uma peça — para o aviso na venda. */
export async function orcamentosQueReservam(pecaId: string) {
  const agora = new Date();
  return prisma.orcamento.findMany({
    where: {
      status: "ABERTO",
      validoAte: { gte: agora },
      itens: { some: { pecaId } },
    },
    select: { id: true, numero: true, cliente: { select: { nome: true } } },
    orderBy: { numero: "asc" },
  });
}

/* ─────────────────────── leitura ─────────────────────── */

const SELECAO = {
  id: true,
  numero: true,
  status: true,
  data: true,
  validadeDias: true,
  validoAte: true,
  subtotal: true,
  desconto: true,
  observacao: true,
  modoPagamento: true,
  formaPagamento: true,
  parcelas: true,
  primeiroVencimento: true,
  vendaId: true,
  /* Documento, cidade e UF entram porque saem no PDF, no bloco do cliente —
     é o que faz a proposta parecer documento da loja e não recado. */
  cliente: {
    select: {
      id: true,
      nome: true,
      telefone: true,
      tipo: true,
      doc: true,
      cidade: true,
      uf: true,
    },
  },
  revisaoDe: { select: { id: true, numero: true } },
  substituidoPor: { select: { id: true, numero: true } },
  itens: {
    select: {
      id: true,
      quantidade: true,
      precoUnit: true,
      peca: { select: { id: true, nome: true, sku: true, tamanho: true, custo: true } },
    },
  },
} satisfies Prisma.OrcamentoSelect;

type LinhaCrua = Prisma.OrcamentoGetPayload<{ select: typeof SELECAO }>;

/*
 * Mesma união discriminada da venda: custo e margem NÃO EXISTEM no tipo de
 * quem não vê o financeiro. O compilador impede o vazamento — não a
 * disciplina de quem escreve a tela.
 */
export type ItemOrcamentoVisivel = {
  id: string;
  pecaId: string;
  nome: string;
  sku: string;
  tamanho: string | null;
  quantidade: number;
  precoUnit: number;
  total: number;
};

export type OrcamentoPublico = {
  id: string;
  numero: number;
  rotulo: string;
  status: StatusOrcamento;
  statusNome: string;
  data: Date;
  validadeDias: number;
  validoAte: Date | null;
  vencido: boolean;
  diasParaVencer: number | null;
  cliente: {
    id: string;
    nome: string;
    telefone: string | null;
    tipo: "PF" | "PJ";
    doc: string | null;
    cidade: string | null;
    uf: string | null;
  } | null;
  observacao: string | null;
  modoPagamento: ModoPagamentoOrcamento;
  formaPagamento: FormaPagamento | null;
  parcelas: number | null;
  primeiroVencimento: Date | null;
  vendaId: string | null;
  revisaoDe: { id: string; numero: number } | null;
  substituidoPor: { id: string; numero: number } | null;
  itens: ItemOrcamentoVisivel[];
  subtotal: number;
  desconto: number;
  total: number;
  /** Já virou venda ou foi aposentado: não aceita mais mudança nenhuma. */
  travado: boolean;
};

export type OrcamentoComCusto = OrcamentoPublico & { custo: number; margem: number | null };
export type Orcamento = OrcamentoPublico | OrcamentoComCusto;

export function temCusto(o: Orcamento): o is OrcamentoComCusto {
  return "custo" in o;
}

function montar(o: LinhaCrua, veFinanceiro: boolean): Orcamento {
  const itens: ItemOrcamentoVisivel[] = o.itens.map((i) => ({
    id: i.id,
    pecaId: i.peca.id,
    nome: i.peca.nome,
    sku: i.peca.sku,
    tamanho: i.peca.tamanho,
    quantidade: i.quantidade,
    precoUnit: num(i.precoUnit),
    total: r2(num(i.precoUnit) * i.quantidade),
  }));

  const subtotal = r2(itens.reduce((s, i) => s + i.total, 0));
  const desconto = num(o.desconto);
  const total = Math.max(0, r2(subtotal - desconto));

  const hoje0 = inicioDoDia();
  const vencido = o.status === "ABERTO" && !!o.validoAte && o.validoAte < hoje0;
  const diasParaVencer = o.validoAte
    ? Math.round((inicioDoDia(o.validoAte).getTime() - hoje0.getTime()) / 86_400_000)
    : null;

  const base: OrcamentoPublico = {
    id: o.id,
    numero: o.numero,
    rotulo: numeroOrc(o.numero),
    status: o.status,
    statusNome: nomeStatus(o.status),
    data: o.data,
    validadeDias: o.validadeDias,
    validoAte: o.validoAte,
    vencido,
    diasParaVencer,
    cliente: o.cliente,
    observacao: o.observacao,
    modoPagamento: o.modoPagamento,
    formaPagamento: o.formaPagamento,
    parcelas: o.parcelas,
    primeiroVencimento: o.primeiroVencimento,
    vendaId: o.vendaId,
    revisaoDe: o.revisaoDe,
    substituidoPor: o.substituidoPor,
    itens,
    subtotal,
    desconto,
    total,
    travado: o.status === "CONVERTIDO" || o.status === "SUBSTITUIDO",
  };

  if (!veFinanceiro) return base;

  /* O custo do orçamento é o de HOJE, não um congelado: a proposta ainda não
     aconteceu, e a margem que interessa é a que a loja teria se fechasse
     agora. Só na venda o custo congela. */
  const custo = r2(o.itens.reduce((s, i) => s + num(i.peca.custo) * i.quantidade, 0));
  const margem = total > 0 ? Math.round(((total - custo) / total) * 1000) / 10 : null;
  return { ...base, custo, margem };
}

export async function listarOrcamentos(opcoes: {
  busca?: string;
  filtro?: FiltroOrcamento;
  veFinanceiro: boolean;
}) {
  const { busca, filtro = "todos", veFinanceiro } = opcoes;
  const agora = new Date();
  const q = busca?.trim();
  const numeroBuscado = q && /^\d+$/.test(q) ? Number(q) : undefined;

  const porFiltro: Record<FiltroOrcamento, Prisma.OrcamentoWhereInput> = {
    todos: {},
    aberto: { status: "ABERTO", validoAte: { gte: agora } },
    vencidos: { status: "ABERTO", validoAte: { lt: agora } },
    aprovados: { status: "CONVERTIDO" },
    recusados: { status: "RECUSADO" },
    substituidos: { status: "SUBSTITUIDO" },
  };

  const where: Prisma.OrcamentoWhereInput = {
    ...porFiltro[filtro],
    ...(q
      ? {
          OR: [
            ...(numeroBuscado ? [{ numero: numeroBuscado }] : []),
            { cliente: { nome: { contains: q, mode: "insensitive" as const } } },
            { itens: { some: { peca: { nome: { contains: q, mode: "insensitive" as const } } } } },
            { itens: { some: { peca: { sku: { contains: q, mode: "insensitive" as const } } } } },
          ],
        }
      : {}),
  };

  const cruas = await prisma.orcamento.findMany({
    where,
    select: SELECAO,
    orderBy: { numero: "desc" },
    take: 200,
  });

  return cruas.map((o) => montar(o, veFinanceiro));
}

export async function buscarOrcamento(id: string, veFinanceiro: boolean) {
  const o = await prisma.orcamento.findUnique({ where: { id }, select: SELECAO });
  if (!o) throw new NaoEncontrado("Orçamento");
  return montar(o, veFinanceiro);
}

/** Indicadores da sub-aba: quantos esperam resposta e quanto isso vale. */
export async function indicadoresOrcamentos() {
  const agora = new Date();

  const abertos = await prisma.orcamento.findMany({
    where: { status: "ABERTO" },
    select: SELECAO,
  });
  const lista = abertos.map((o) => montar(o, false));
  const dentroDaValidade = lista.filter((o) => !o.vencido);
  const vencidos = lista.filter((o) => o.vencido);

  /* "Vencendo" é o aviso do Início: até 2 dias, contando hoje. Dois dias é o
     que sobra para ligar para a cliente antes de o preço deixar de valer. */
  const vencendo = dentroDaValidade.filter(
    (o) => o.diasParaVencer !== null && o.diasParaVencer <= 2,
  );

  const convertidos = await prisma.orcamento.count({ where: { status: "CONVERTIDO" } });

  return {
    emAberto: dentroDaValidade.length,
    valorPotencial: r2(dentroDaValidade.reduce((s, o) => s + o.total, 0)),
    vencidos: vencidos.length,
    valorVencido: r2(vencidos.reduce((s, o) => s + o.total, 0)),
    vencendo: vencendo.length,
    convertidos,
    agora,
  };
}
