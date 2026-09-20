import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { fimDoMes, inicioDoDia, inicioDoMes, somaDias } from "@/lib/dia";
import { carteirasComSaldo } from "./financeiro.service";
import type { CompromissoAgenda, SemanaPrevista } from "./financeiro.tipos";

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
  const inicio = inicioDoMes(mes);
  const fim = fimDoMes(mes);
  const hoje = inicioDoDia(new Date());
  const ehMesCorrente = inicio.getMonth() === hoje.getMonth() && inicio.getFullYear() === hoje.getFullYear();

  const contas = await prisma.conta.findMany({
    where: {
      status: "ABERTA",
      /* No mês corrente, tudo que vence até o fim do mês — inclusive o que
         venceu antes. Nos outros meses, só a janela do mês. */
      vencimento: ehMesCorrente ? { lte: fim } : { gte: inicio, lte: fim },
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
 * As próximas 12 semanas de caixa.
 *
 * Parte do saldo de hoje e vai somando o que entra e tirando o que sai, semana
 * a semana. Venda futura NÃO entra: prever venda é chute, e um chute no meio
 * de um número de caixa contamina a decisão que ele deveria ajudar a tomar.
 */
export async function previsao(semanas = 12): Promise<{
  saldoHoje: number;
  linhas: SemanaPrevista[];
  totalEntra: number;
  totalSai: number;
  atrasadoReceber: number;
  atrasadoPagar: number;
  pior: SemanaPrevista | null;
}> {
  const hoje = inicioDoDia(new Date());
  const fim = somaDias(hoje, semanas * 7);

  const [carteiras, aReceber, aPagar, atrasadas] = await Promise.all([
    carteirasComSaldo(),
    prisma.conta.findMany({
      where: { tipo: "RECEBER", status: "ABERTA", vencimento: { gte: hoje, lte: fim } },
      select: { valor: true, vencimento: true },
    }),
    prisma.conta.findMany({
      where: { tipo: "PAGAR", status: "ABERTA", vencimento: { gte: hoje, lte: fim } },
      select: { valor: true, vencimento: true },
    }),
    prisma.conta.findMany({
      where: { status: "ABERTA", vencimento: { lt: hoje } },
      select: { tipo: true, valor: true },
    }),
  ]);

  const saldoHoje = r2(carteiras.reduce((s, c) => s + c.saldo, 0));

  let acumulado = saldoHoje;
  const linhas: SemanaPrevista[] = [];
  for (let i = 0; i < semanas; i++) {
    const ini = somaDias(hoje, i * 7);
    const f = somaDias(hoje, i * 7 + 6);
    const entra = r2(
      aReceber.filter((c) => c.vencimento >= ini && c.vencimento <= f).reduce((s, c) => s + num(c.valor), 0),
    );
    const sai = r2(
      aPagar.filter((c) => c.vencimento >= ini && c.vencimento <= f).reduce((s, c) => s + num(c.valor), 0),
    );
    acumulado = r2(acumulado + entra - sai);
    linhas.push({ inicio: ini, fim: f, entra, sai, saldo: acumulado });
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
