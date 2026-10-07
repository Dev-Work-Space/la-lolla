import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fimDoDia, fimDoMes, inicioDoDia, inicioDoMes, somaDias } from "@/lib/dia";
import { carteirasComSaldo } from "./financeiro.service";
import type { CompromissoAgenda, EntradaPrevista, SemanaPrevista } from "./financeiro.tipos";

/*
 * AGENDA e PREVISÃO.
 *
 * As duas respondem à mesma pergunta em escalas diferentes: "o que vem por
 * aí?". A agenda mostra o mês dia a dia; a previsão mostra 12 semanas e diz
 * se o caixa fica negativo em alguma delas.
 *
 * As duas leem a MESMA fonte das outras telas: contas a pagar e a receber em
 * aberto. Não existe uma segunda lista de compromissos para sair do lugar —
 * era assim no app antigo e é a razão de a agenda dele nunca ter mentido.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: Prisma.Decimal | null | undefined) => (v == null ? 0 : Number(v));

/**
 * Tudo que vence num mês, mais o que ficou para trás.
 *
 * Atrasado de mês passado sobe junto quando se olha o mês corrente: esconder
 * uma conta vencida porque "ela é de agosto" seria o pior serviço que este
 * app poderia prestar.
 */
export async function compromissosDoMes(mes: Date): Promise<CompromissoAgenda[]> {
  return compromissosEntre(inicioDoMes(mes), fimDoMes(mes));
}

/**
 * O mesmo para qualquer período — a visão de semana usa. Se o período inclui
 * hoje, tudo que venceu antes dele sobe junto; olhando outro período, só a
 * janela dele.
 */
export async function compromissosEntre(inicio: Date, fim: Date): Promise<CompromissoAgenda[]> {
  const hoje = inicioDoDia(new Date());
  const incluiHoje = inicio <= hoje && fim >= hoje;

  const contas = await prisma.conta.findMany({
    where: {
      status: "ABERTA",
      vencimento: incluiHoje ? { lte: fim } : { gte: inicio, lte: fim },
    },
    orderBy: [{ vencimento: "asc" }],
    select: {
      id: true,
      tipo: true,
      descricao: true,
      valor: true,
      vencimento: true,
      vendaId: true,
      cartaoId: true,
      cartao: { select: { nome: true } },
      fornecedor: { select: { nome: true } },
      venda: { select: { cliente: { select: { nome: true } } } },
    },
    take: 500,
  });

  return contas.map((c) => ({
    id: c.id,
    tipo: c.tipo === "PAGAR" ? "pagar" : "receber",
    titulo: c.cartaoId ? `Fatura · ${c.cartao?.nome ?? "cartão"}` : c.descricao,
    quem: c.venda?.cliente?.nome ?? c.fornecedor?.nome ?? null,
    valor: num(c.valor),
    vencimento: c.vencimento,
    atrasado: c.vencimento < hoje,
    href: c.vendaId ? `/vendas/${c.vendaId}` : null,
  }));
}

/**
 * TUDO o que vai entrar num período, de qualquer fonte:
 *   - parcelas de venda no crediário e recebimentos lançados em contas a
 *     receber, ainda em aberto;
 *   - entradas lançadas no caixa com data FUTURA — elas não contam no saldo
 *     de hoje (ainda não aconteceram) e antes não apareciam em lugar nenhum.
 *
 * O atrasado (conta a receber vencida e em aberto) entra quando o período
 * inclui hoje, marcado: é o dinheiro que já devia estar no caixa.
 */
export async function entradasPrevistas(de: Date | null, ate: Date | null): Promise<EntradaPrevista[]> {
  const agora = new Date();
  const hoje = inicioDoDia(agora);
  const incluiHoje = (!de || de <= agora) && (!ate || ate >= hoje);
  const janela = { ...(de ? { gte: de } : {}), ...(ate ? { lte: ate } : {}) };
  /* Lançamento de HOJE já está no saldo de hoje (o saldo vai até o fim do
     dia); aqui entra só o que está marcado de amanhã em diante — senão a
     mesma entrada contaria duas vezes. */
  const amanha = fimDoDia(hoje);
  const futuro = { ...janela, gt: de && de > amanha ? de : amanha };

  const [contas, lancs] = await Promise.all([
    prisma.conta.findMany({
      where: {
        tipo: "RECEBER",
        status: "ABERTA",
        /* Sem data inicial, o vencido já está dentro (não há piso). Com data
           inicial e o período incluindo hoje, o vencido de antes dela entra
           pelo "ou". Cuidado: um filtro vazio dentro do "ou" é DESCARTADO
           pelo banco — com "Ver tudo" sobrava só o vencido. */
        ...(de && incluiHoje
          ? { OR: [{ vencimento: janela }, { vencimento: { lt: hoje } }] }
          : de || ate
            ? { vencimento: janela }
            : {}),
      },
      orderBy: { vencimento: "asc" },
      select: {
        id: true,
        descricao: true,
        valor: true,
        vencimento: true,
        vendaId: true,
        parcela: true,
        deParcelas: true,
        venda: { select: { cliente: { select: { nome: true } } } },
        fornecedor: { select: { nome: true } },
      },
      take: 1000,
    }),
    prisma.lancamento.findMany({
      where: { valor: { gt: 0 }, data: futuro },
      orderBy: { data: "asc" },
      select: { id: true, descricao: true, valor: true, data: true, categoria: true, carteira: { select: { nome: true } } },
      take: 500,
    }),
  ]);

  const saida: EntradaPrevista[] = [
    ...contas.map<EntradaPrevista>((c) => ({
      id: c.id,
      origem: c.vendaId ? "crediario" : "recebimento",
      titulo: c.descricao,
      quem: c.venda?.cliente?.nome ?? c.fornecedor?.nome ?? null,
      valor: num(c.valor),
      quando: c.vencimento,
      atrasado: c.vencimento < hoje,
      href: c.vendaId ? `/vendas/${c.vendaId}` : null,
      contaId: c.id,
      deVenda: Boolean(c.vendaId),
    })),
    ...lancs.map<EntradaPrevista>((l) => ({
      id: l.id,
      origem: "lancamento",
      titulo: l.descricao,
      quem: [l.categoria, l.carteira?.nome].filter(Boolean).join(" · ") || null,
      valor: num(l.valor),
      quando: l.data,
      atrasado: false,
      href: null,
      contaId: null,
      deVenda: false,
    })),
  ];
  return saida.sort((a, b) => a.quando.getTime() - b.quando.getTime());
}

/**
 * O caixa daqui para frente: parte do saldo de hoje e vai somando o que entra
 * e tirando o que sai, semana a semana (ou mês a mês). Venda futura NÃO entra:
 * prever venda é chute, e um chute no meio de um número de caixa contamina a
 * decisão que ele deveria ajudar a tomar.
 *
 * Cada pedaço é [início, início do próximo) — fim EXCLUSIVO. Antes o fim era a
 * meia-noite do 7º dia, e uma conta que vencia nele ao meio-dia caía fora das
 * duas semanas: sumia da previsão.
 */
export async function previsao(
  opcoes: number | { semanas?: number; meses?: number; agrupar?: "semana" | "mes" } = 12,
): Promise<{
  saldoHoje: number;
  linhas: SemanaPrevista[];
  totalEntra: number;
  totalSai: number;
  atrasadoReceber: number;
  atrasadoPagar: number;
  pior: SemanaPrevista | null;
}> {
  const o = typeof opcoes === "number" ? { semanas: opcoes } : opcoes;
  const agrupar = o.agrupar ?? "semana";
  const hoje = inicioDoDia(new Date());

  /* Os cortes: de hoje em diante, semanas de 7 dias ou meses de calendário
     (o primeiro mês começa hoje e vai até o dia 1º do seguinte). */
  const cortes: Date[] = [hoje];
  if (agrupar === "mes") {
    const meses = o.meses ?? Math.max(1, Math.round((o.semanas ?? 12) / 4.345));
    for (let i = 1; i <= meses; i++) cortes.push(new Date(hoje.getFullYear(), hoje.getMonth() + i, 1));
  } else {
    const semanas = o.semanas ?? Math.max(1, Math.round((o.meses ?? 3) * 4.345));
    for (let i = 1; i <= semanas; i++) cortes.push(somaDias(hoje, i * 7));
  }
  const fim = cortes[cortes.length - 1];

  /* Lançamento com data futura também é dinheiro combinado: não está no saldo
     de hoje (ainda não aconteceu) e ficava fora da previsão — sumia. Agora
     entra na semana dele, dos dois lados. */
  const [carteiras, aReceber, aPagar, atrasadas, lancsFuturos] = await Promise.all([
    carteirasComSaldo(),
    prisma.conta.findMany({
      where: { tipo: "RECEBER", status: "ABERTA", vencimento: { gte: hoje, lt: fim } },
      select: { valor: true, vencimento: true },
    }),
    prisma.conta.findMany({
      where: { tipo: "PAGAR", status: "ABERTA", vencimento: { gte: hoje, lt: fim } },
      select: { valor: true, vencimento: true },
    }),
    prisma.conta.findMany({
      where: { status: "ABERTA", vencimento: { lt: hoje } },
      select: { tipo: true, valor: true },
    }),
    prisma.lancamento.findMany({
      where: { data: { gt: fimDoDia(hoje), lt: fim } },
      select: { valor: true, data: true },
    }),
  ]);
  const entradasLancadas = lancsFuturos.filter((l) => num(l.valor) > 0).map((l) => ({ valor: l.valor, vencimento: l.data }));
  const saidasLancadas = lancsFuturos
    .filter((l) => num(l.valor) < 0)
    .map((l) => ({ valor: new Prisma.Decimal(Math.abs(num(l.valor))), vencimento: l.data }));

  const saldoHoje = r2(carteiras.reduce((s, c) => s + c.saldo, 0));

  let acumulado = saldoHoje;
  const linhas: SemanaPrevista[] = [];
  for (let i = 0; i < cortes.length - 1; i++) {
    const ini = cortes[i];
    const prox = cortes[i + 1];
    const dentro = (c: { vencimento: Date }) => c.vencimento >= ini && c.vencimento < prox;
    const entra = r2([...aReceber, ...entradasLancadas].filter(dentro).reduce((s, c) => s + num(c.valor), 0));
    const sai = r2([...aPagar, ...saidasLancadas].filter(dentro).reduce((s, c) => s + num(c.valor), 0));
    acumulado = r2(acumulado + entra - sai);
    linhas.push({ inicio: ini, fim: somaDias(prox, -1), entra, sai, saldo: acumulado });
  }

  const pior = linhas.reduce<SemanaPrevista | null>(
    (a, l) => (a === null || l.saldo < a.saldo ? l : a),
    null,
  );

  return {
    saldoHoje,
    linhas,
    totalEntra: r2(linhas.reduce((s, l) => s + l.entra, 0)),
    totalSai: r2(linhas.reduce((s, l) => s + l.sai, 0)),
    /* Vencido não entra na projeção: ele já devia ter acontecido, e somá-lo a
       uma semana futura inventaria uma data que ninguém combinou. Aparece à
       parte, como aviso. */
    atrasadoReceber: r2(
      atrasadas.filter((c) => c.tipo === "RECEBER").reduce((s, c) => s + num(c.valor), 0),
    ),
    atrasadoPagar: r2(
      atrasadas.filter((c) => c.tipo === "PAGAR").reduce((s, c) => s + num(c.valor), 0),
    ),
    pior: pior && pior.saldo < 0 ? pior : null,
  };
}

/** O mês pedido pela URL ("AAAA-MM"), ou o corrente. */
export function mesDaUrl(valor: string | undefined): Date {
  if (valor && /^\d{4}-\d{2}$/.test(valor)) {
    const [a, m] = valor.split("-").map(Number);
    return new Date(a, m - 1, 1);
  }
  return inicioDoMes(new Date());
}

/** "AAAA-MM", para montar o link do mês vizinho. */
export function urlDoMes(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}
