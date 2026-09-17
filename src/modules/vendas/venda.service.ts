import "server-only";

import { Prisma, type FormaPagamento, type StatusVenda } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio, NaoEncontrado } from "@/lib/errors";

/*
 * REGRAS DA VENDA. Portadas do app antigo linha a linha, porque erro aqui é
 * dinheiro errado no caixa do João.
 *
 *   totalVenda   = subtotal − desconto − devolvido   (nunca negativo)
 *   saldoVenda   = total − pago                       (nunca negativo)
 *   quitada      = saldo ≤ 0,005
 *   custoVenda   = Σ(custo CONGELADO no item × qtd)
 *
 * E a mais importante de todas:
 *
 *   VENDA CANCELADA continua na lista e no histórico, mas SOME de todo
 *   cálculo de dinheiro — faturamento, margem, a receber, caixa, relatório.
 *   Uma cancelada que escape corrompe o número inteiro.
 *
 * Por isso existe `VIVA` abaixo, e todo lugar que soma dinheiro usa ele.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));

/** Tolerância de centavo. Comparar float com 0 dá saldo de R$ 0,0000001. */
const EPS = 0.005;

/** O filtro que protege todo cálculo de dinheiro. */
export const VIVA = { status: { not: "CANCELADA" as const } };

export const FORMAS: Array<[FormaPagamento, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

/*
 * Pix, Débito e Crédito exigem comprovante. A pendência é DERIVADA: quem
 * precisa de comprovante e está sem ele, está pendente. Não existe campo
 * "pendente" para sincronizar — e por isso não existe como dessincronizar.
 */
export const PEDE_COMPROVANTE: FormaPagamento[] = ["PIX", "DEBITO", "CREDITO"];

export const INTERVALOS = [
  ["mes", "Mensal"],
  ["quinzena", "A cada 15 dias"],
  ["semana", "Semanal"],
] as const;

export type Intervalo = (typeof INTERVALOS)[number][0];

/** Vencimento da parcela k (1-based), a partir de uma data. */
export function vencimentoParcela(base: Date, k: number, intervalo: Intervalo): Date {
  const d = new Date(base);
  if (intervalo === "semana") d.setDate(d.getDate() + 7 * k);
  else if (intervalo === "quinzena") d.setDate(d.getDate() + 15 * k);
  else d.setMonth(d.getMonth() + k);
  return d;
}

/* ─────────────────────── cálculo ─────────────────────── */

type ItemCalc = { quantidade: number; devolvido: number; precoUnit: number; custoUnit: number };

export function subtotalDe(itens: ItemCalc[]): number {
  return r2(itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0));
}

export function devolvidoDe(itens: ItemCalc[]): number {
  return r2(itens.reduce((s, i) => s + i.precoUnit * i.devolvido, 0));
}

export function totalDe(itens: ItemCalc[], desconto: number): number {
  const t = r2(subtotalDe(itens) - desconto - devolvidoDe(itens));
  return t > 0 ? t : 0;
}

/** Custo congelado: o que a peça custava no dia, não o de hoje. */
export function custoDe(itens: ItemCalc[]): number {
  return r2(itens.reduce((s, i) => s + i.custoUnit * (i.quantidade - i.devolvido), 0));
}

export function margemDe(total: number, custo: number): number | null {
  if (total <= 0) return null;
  return Math.round(((total - custo) / total) * 1000) / 10;
}

/* ─────────────────────── leitura ─────────────────────── */

const SELECAO_VENDA = {
  id: true,
  numero: true,
  status: true,
  desconto: true,
  observacao: true,
  data: true,
  canceladaEm: true,
  motivoCancelada: true,
  cliente: { select: { id: true, nome: true } },
  vendedor: { select: { id: true, nome: true } },
  itens: {
    select: {
      id: true,
      quantidade: true,
      devolvido: true,
      precoUnit: true,
      custoUnit: true,
      serie: true,
      peca: { select: { id: true, nome: true, sku: true } },
    },
  },
  pagamentos: {
    select: { id: true, forma: true, valor: true, parcelas: true, comprovanteId: true, data: true },
  },
  parcelas: {
    select: { id: true, valor: true, vencimento: true, status: true, parcela: true, deParcelas: true },
    orderBy: { vencimento: "asc" as const },
  },
} satisfies Prisma.VendaSelect;

type LinhaCrua = Prisma.VendaGetPayload<{ select: typeof SELECAO_VENDA }>;

/*
 * As duas formas da venda, declaradas à mão de propósito.
 *
 * `VendaComCusto` tem custo e margem. `VendaPublica` NÃO OS TEM — não são
 * nulos, não existem no tipo. Com a união, `"custo" in v` estreita e o
 * TypeScript passa a IMPEDIR, em tempo de compilação, que a tela do vendedor
 * tente ler margem. Mesma proteção do catálogo.
 *
 * Escrever o tipo à mão (em vez de inferir) é o que torna essa garantia real:
 * inferido de um retorno condicional, ele viraria só uma união frouxa.
 */
export type ItemVendaVisivel = {
  id: string;
  pecaId: string;
  nome: string;
  sku: string;
  serie: string | null;
  quantidade: number;
  devolvido: number;
  precoUnit: number;
  custoUnit: number;
};

export type VendaPublica = {
  id: string;
  numero: number;
  status: StatusVenda;
  cancelada: boolean;
  cliente: { id: string; nome: string } | null;
  vendedor: { id: string; nome: string } | null;
  observacao: string | null;
  data: Date;
  canceladaEm: Date | null;
  motivoCancelada: string | null;
  itens: ItemVendaVisivel[];
  pagamentos: Array<{
    id: string;
    forma: FormaPagamento;
    valor: number;
    parcelas: number;
    temComprovante: boolean;
    precisaComprovante: boolean;
    data: Date;
  }>;
  parcelas: Array<{
    id: string;
    valor: number;
    vencimento: Date;
    paga: boolean;
    numero: number | null;
    de: number | null;
  }>;
  subtotal: number;
  desconto: number;
  devolvido: number;
  total: number;
  pago: number;
  saldo: number;
  quitada: boolean;
  comprovantesPendentes: number;
};

export type VendaComCusto = VendaPublica & { custo: number; margem: number | null };
export type Venda = VendaPublica | VendaComCusto;

/** `"custo" in v` já estreita; isto é só para deixar a intenção explícita. */
export function temCusto(v: Venda): v is VendaComCusto {
  return "custo" in v;
}

function montar(v: LinhaCrua, veFinanceiro: boolean): Venda {
  const itens = v.itens.map((i) => ({
    id: i.id,
    pecaId: i.peca.id,
    nome: i.peca.nome,
    sku: i.peca.sku,
    serie: i.serie,
    quantidade: i.quantidade,
    devolvido: i.devolvido,
    precoUnit: num(i.precoUnit),
    custoUnit: num(i.custoUnit),
  }));

  const desconto = num(v.desconto);
  const subtotal = subtotalDe(itens);
  const devolvido = devolvidoDe(itens);
  const total = totalDe(itens, desconto);
  const pago = r2(v.pagamentos.reduce((s, p) => s + num(p.valor), 0));
  const saldo = total - pago > EPS ? r2(total - pago) : 0;

  // Pendência de comprovante: derivada dos pagamentos, não gravada.
  const semComprovante = v.pagamentos.filter(
    (p) => PEDE_COMPROVANTE.includes(p.forma) && !p.comprovanteId,
  );

  const base = {
    id: v.id,
    numero: v.numero,
    status: v.status,
    cancelada: v.status === "CANCELADA",
    cliente: v.cliente,
    vendedor: v.vendedor,
    observacao: v.observacao,
    data: v.data,
    canceladaEm: v.canceladaEm,
    motivoCancelada: v.motivoCancelada,
    itens,
    pagamentos: v.pagamentos.map((p) => ({
      id: p.id,
      forma: p.forma,
      valor: num(p.valor),
      parcelas: p.parcelas,
      temComprovante: !!p.comprovanteId,
      precisaComprovante: PEDE_COMPROVANTE.includes(p.forma),
      data: p.data,
    })),
    parcelas: v.parcelas.map((c) => ({
      id: c.id,
      valor: num(c.valor),
      vencimento: c.vencimento,
      paga: c.status === "PAGA",
      numero: c.parcela,
      de: c.deParcelas,
    })),
    subtotal,
    desconto,
    devolvido,
    total,
    pago,
    saldo,
    quitada: saldo <= EPS,
    comprovantesPendentes: semComprovante.length,
  };

  if (!veFinanceiro) return base;
  const custo = custoDe(itens);
  return { ...base, custo, margem: margemDe(total, custo) };
}

export const FILTROS_VENDA = [
  ["todas", "Todas"],
  ["aberto", "A receber"],
  ["quitadas", "Quitadas"],
  ["semcomprovante", "Sem comprovante"],
  ["hoje", "Hoje"],
  ["canceladas", "Canceladas"],
] as const;

export type FiltroVenda = (typeof FILTROS_VENDA)[number][0];

export async function listarVendas(opcoes: {
  busca?: string;
  filtro?: FiltroVenda;
  veFinanceiro: boolean;
}) {
  const { busca, filtro = "todas", veFinanceiro } = opcoes;

  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);

  const q = busca?.trim();
  const numeroBuscado = q && /^\d+$/.test(q) ? Number(q) : undefined;

  const where: Prisma.VendaWhereInput = {
    // Canceladas só aparecem quando explicitamente pedidas.
    ...(filtro === "canceladas" ? { status: "CANCELADA" } : VIVA),
    ...(filtro === "hoje" ? { data: { gte: hoje0 } } : {}),
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

  const cruas = await prisma.venda.findMany({
    where,
    select: SELECAO_VENDA,
    orderBy: { data: "desc" },
    take: 200,
  });

  let vendas = cruas.map((v) => montar(v, veFinanceiro));

  if (filtro === "aberto") vendas = vendas.filter((v) => v.saldo > EPS);
  else if (filtro === "quitadas") vendas = vendas.filter((v) => v.quitada);
  else if (filtro === "semcomprovante") vendas = vendas.filter((v) => v.comprovantesPendentes > 0);

  return vendas;
}

export async function buscarVenda(id: string, veFinanceiro: boolean) {
  const v = await prisma.venda.findUnique({ where: { id }, select: SELECAO_VENDA });
  if (!v) throw new NaoEncontrado("Venda");
  return montar(v, veFinanceiro);
}

/** Indicadores do Portal de vendas. Só vendas VIVAS entram. */
export async function indicadoresVendas(veFinanceiro: boolean) {
  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);
  const mes0 = new Date(hoje0.getFullYear(), hoje0.getMonth(), 1);

  const cruas = await prisma.venda.findMany({
    where: { ...VIVA, data: { gte: mes0 } },
    select: SELECAO_VENDA,
  });
  const vendas = cruas.map((v) => montar(v, true));

  const doDia = vendas.filter((v) => v.data >= hoje0);

  // "A receber" olha todas as vendas vivas, não só as do mês.
  const todas = await prisma.venda.findMany({ where: VIVA, select: SELECAO_VENDA });
  const abertas = todas.map((v) => montar(v, true)).filter((v) => v.saldo > EPS);
  const pendentes = todas.map((v) => montar(v, true)).filter((v) => v.comprovantesPendentes > 0);

  const faturadoMes = r2(vendas.reduce((s, v) => s + v.total, 0));
  const custoMes = r2(vendas.reduce((s, v) => s + ("custo" in v ? v.custo : 0), 0));

  return {
    veFinanceiro,
    vendidoHoje: r2(doDia.reduce((s, v) => s + v.total, 0)),
    vendasHoje: doDia.length,
    faturadoMes,
    vendasMes: vendas.length,
    ticketMes: vendas.length ? r2(faturadoMes / vendas.length) : 0,
    margemMes: veFinanceiro ? margemDe(faturadoMes, custoMes) : null,
    aReceber: r2(abertas.reduce((s, v) => s + v.saldo, 0)),
    vendasAbertas: abertas.length,
    semComprovante: pendentes.length,
  };
}
