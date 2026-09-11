import "server-only";

import { prisma } from "@/lib/prisma";

/*
 * Portado de `ctxInicio()`: as contas pesadas do Início acontecem UMA VEZ e
 * o resultado é passado para todos os widgets. No app antigo cada widget que
 * chamasse `vendasMes()` refazia o filtro na base inteira.
 */

const r2 = (n: number) => Math.round(n * 100) / 100;

function inicioDoMes(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function inicioDoAno(d = new Date()) {
  return new Date(d.getFullYear(), 0, 1);
}
function inicioDoDia(d = new Date()) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

export type ContextoInicio = Awaited<ReturnType<typeof contextoInicio>>;

export async function contextoInicio(nome: string) {
  const agora = new Date();
  const dia0 = inicioDoDia(agora);
  const mes0 = inicioDoMes(agora);
  const ano0 = inicioDoAno(agora);
  const mesAnt0 = new Date(agora.getFullYear(), agora.getMonth() - 1, 1);

  const vendida = { status: { not: "CANCELADA" as const } };

  const [hoje, mes, mesAnterior, ano, carteiras, meta] = await Promise.all([
    prisma.venda.aggregate({ where: { ...vendida, criadoEm: { gte: dia0 } }, _sum: { total: true }, _count: true }),
    prisma.venda.aggregate({ where: { ...vendida, criadoEm: { gte: mes0 } }, _sum: { total: true }, _count: true }),
    prisma.venda.aggregate({
      where: { ...vendida, criadoEm: { gte: mesAnt0, lt: mes0 } },
      _sum: { total: true },
      _count: true,
    }),
    prisma.venda.aggregate({ where: { ...vendida, criadoEm: { gte: ano0 } }, _sum: { total: true }, _count: true }),
    prisma.lancamento.aggregate({ _sum: { valor: true } }),
    prisma.config.findUnique({ where: { chave: "meta" } }),
  ]);

  const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));

  const fatAno = num(ano._sum.total);
  const fatMes = num(mes._sum.total);

  // Margem do ano: faturado menos o custo das peças vendidas.
  const itens = await prisma.itemVenda.findMany({
    where: { venda: { ...vendida, criadoEm: { gte: ano0 } } },
    select: { quantidade: true, precoUnit: true, peca: { select: { custo: true } } },
  });
  const custoAno = itens.reduce((s, i) => s + Number(i.peca.custo ?? 0) * i.quantidade, 0);
  const margemAno = r2(fatAno - custoAno);

  return {
    nome,
    agora,
    ano: agora.getFullYear(),
    mes0,
    mesAnt0,
    vendasHoje: hoje._count,
    fatHoje: num(hoje._sum.total),
    vendasMes: mes._count,
    fatMes,
    fatMesAnterior: num(mesAnterior._sum.total),
    vendasAno: ano._count,
    fatAno,
    margemAno,
    margemPct: fatAno > 0 ? Math.round((margemAno / fatAno) * 100) : 0,
    ticketAno: ano._count ? r2(fatAno / ano._count) : 0,
    emCaixa: num(carteiras._sum.valor),
    meta: Number(meta?.valor) > 0 ? Number(meta?.valor) : 0,
  };
}

/** Faturamento dos últimos 6 meses — o mini-gráfico do cabeçalho. */
export async function serie6Meses(): Promise<Array<{ rotulo: string; valor: number }>> {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth() - 5, 1);

  const vendas = await prisma.venda.findMany({
    where: { status: { not: "CANCELADA" }, criadoEm: { gte: inicio } },
    select: { criadoEm: true, total: true },
  });

  const meses: Array<{ rotulo: string; valor: number }> = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date(agora.getFullYear(), agora.getMonth() - i, 1);
    const fim = new Date(agora.getFullYear(), agora.getMonth() - i + 1, 1);
    const total = vendas
      .filter((v) => v.criadoEm >= d && v.criadoEm < fim)
      .reduce((s, v) => s + Number(v.total), 0);
    meses.push({
      rotulo: d.toLocaleDateString("pt-BR", { month: "short" }).replace(".", ""),
      valor: total,
    });
  }
  return meses;
}

/** Ritmo dos últimos 14 dias — uma barra por dia. */
export async function ritmo14(): Promise<Array<{ dia: string; data: string; valor: number; vendas: number }>> {
  const agora = new Date();
  const inicio = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - 13);

  const vendas = await prisma.venda.findMany({
    where: { status: { not: "CANCELADA" }, criadoEm: { gte: inicio } },
    select: { criadoEm: true, total: true },
  });

  const saida = [];
  for (let k = 13; k >= 0; k--) {
    const d = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() - k);
    const fim = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
    const doDia = vendas.filter((v) => v.criadoEm >= d && v.criadoEm < fim);
    saida.push({
      dia: String(d.getDate()).padStart(2, "0"),
      data: d.toLocaleDateString("pt-BR"),
      valor: doDia.reduce((s, v) => s + Number(v.total), 0),
      vendas: doDia.length,
    });
  }
  return saida;
}

/** Peças mais vendidas no mês. */
export async function maisVendidasNoMes(limite = 5) {
  const mes0 = inicioDoMes();
  const itens = await prisma.itemVenda.findMany({
    where: { venda: { status: { not: "CANCELADA" }, criadoEm: { gte: mes0 } } },
    select: {
      quantidade: true,
      precoUnit: true,
      peca: { select: { id: true, nome: true, sku: true } },
    },
  });

  const mapa = new Map<string, { nome: string; sku: string; qtd: number; valor: number }>();
  for (const i of itens) {
    const a = mapa.get(i.peca.id) ?? { nome: i.peca.nome, sku: i.peca.sku, qtd: 0, valor: 0 };
    a.qtd += i.quantidade;
    a.valor += Number(i.precoUnit) * i.quantidade;
    mapa.set(i.peca.id, a);
  }

  return [...mapa.entries()]
    .map(([id, v]) => ({ id, ...v }))
    .sort((a, b) => b.qtd - a.qtd)
    .slice(0, limite);
}

/*
 * "Precisa de você": contas vencendo, peças zeradas e orçamentos expirando.
 * `p` é a prioridade — 0 e 1 são urgentes e acendem o cartão em vermelho,
 * igual ao app antigo.
 */
export type Pendencia = {
  p: number;
  nome: string;
  sub: string;
  valor: string;
  cor: string;
  href: string;
};

export async function pendencias(): Promise<Pendencia[]> {
  const hoje = inicioDoDia();
  const em7 = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7);

  const [vencidas, aVencer, orcamentos, zeradas] = await Promise.all([
    prisma.conta.count({ where: { status: "ABERTA", vencimento: { lt: hoje } } }),
    prisma.conta.count({ where: { status: "ABERTA", vencimento: { gte: hoje, lte: em7 } } }),
    prisma.orcamento.count({ where: { status: "ABERTO", validoAte: { lt: em7 } } }),
    prisma.peca.findMany({
      where: { arquivada: false },
      select: { id: true, movimentos: { select: { delta: true } } },
    }),
  ]);

  const semEstoque = zeradas.filter(
    (p) => p.movimentos.reduce((s, m) => s + m.delta, 0) <= 0,
  ).length;

  const lista: Pendencia[] = [];
  if (vencidas > 0) {
    lista.push({
      p: 0,
      nome: "Contas vencidas",
      sub: "passaram do vencimento",
      valor: String(vencidas),
      cor: "var(--cor-perigo)",
      href: "/financeiro?aba=pagar",
    });
  }
  if (aVencer > 0) {
    lista.push({
      p: 1,
      nome: "Vencendo esta semana",
      sub: "próximos 7 dias",
      valor: String(aVencer),
      cor: "var(--cor-aviso)",
      href: "/financeiro?aba=pagar",
    });
  }
  if (semEstoque > 0) {
    lista.push({
      p: 2,
      nome: "Peças zeradas",
      sub: "sem saldo em estoque",
      valor: String(semEstoque),
      cor: "var(--cor-aviso)",
      href: "/estoque?filtro=zerado",
    });
  }
  if (orcamentos > 0) {
    lista.push({
      p: 2,
      nome: "Orçamentos expirando",
      sub: "ainda em aberto",
      valor: String(orcamentos),
      cor: "var(--cor-aviso)",
      href: "/vendas?aba=orcamentos",
    });
  }
  return lista.sort((a, b) => a.p - b.p);
}
