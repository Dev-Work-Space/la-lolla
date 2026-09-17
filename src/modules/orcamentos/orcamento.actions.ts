"use server";

import { z } from "zod";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { recarregar as recarregarTelas } from "@/lib/recarregar";
import { exigirPermissao } from "@/lib/auth/guard";
import { ErroDominio, tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { calcularValidoAte, numeroOrc } from "./orcamento.service";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const recarregar = (id?: string) => recarregarTelas("orcamento", id && `/orcamentos/${id}`);

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const r2 = (n: number) => Math.round(n * 100) / 100;

const salvarSchema = z.object({
  clienteId: z.string().optional().nullable(),
  data: z.coerce.date(),
  validadeDias: z.coerce.number().int().min(1).max(365).default(7),
  desconto: z.coerce.number().min(0, "O desconto não pode ser negativo").default(0),
  observacao: z.string().trim().max(600).optional().nullable(),
  itens: z
    .array(
      z.object({
        pecaId: z.string().min(1),
        quantidade: z.coerce.number().int().positive(),
        precoUnit: z.coerce.number().min(0),
      }),
    )
    .min(1, "Adicione ao menos uma peça ao orçamento"),
  modoPagamento: z.enum(["A_COMBINAR", "A_VISTA", "PARCELADO"]).default("A_COMBINAR"),
  formaPagamento: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO"]).optional().nullable(),
  parcelas: z.coerce.number().int().min(1).max(120).optional().nullable(),
  primeiroVencimento: z.coerce.date().optional().nullable(),
});

export type SalvarOrcamentoInput = z.input<typeof salvarSchema>;

/*
 * Cria, ou reescreve um orçamento que AINDA NÃO foi enviado para frente.
 *
 * Aprovado e substituído não se editam: o primeiro já virou venda, o segundo
 * já foi aposentado por uma revisão. Nos dois casos o caminho é outro — abrir
 * a venda, ou revisar a versão que vale.
 */
export async function salvarOrcamentoAction(
  id: string | null,
  entrada: SalvarOrcamentoInput,
): Promise<Result<{ id: string; numero: number }>> {
  const sessao = await exigirPermissao("vendas", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = salvarSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os dados do orçamento.", campos(parsed.error));
  }
  const d = parsed.data;

  const subtotal = r2(d.itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0));
  if (d.desconto > subtotal + 0.005) {
    return fail("REGRA_NEGOCIO", "O desconto é maior que o total das peças.");
  }
  const total = Math.max(0, r2(subtotal - d.desconto));

  const comum = {
    clienteId: d.clienteId || null,
    data: d.data,
    validadeDias: d.validadeDias,
    validoAte: calcularValidoAte(d.data, d.validadeDias),
    subtotal: dec(subtotal),
    desconto: dec(d.desconto),
    total: dec(total),
    observacao: d.observacao || null,
    modoPagamento: d.modoPagamento,
    /* Condição só faz sentido quando existe: em "A combinar" o PDF sai sem
       falar de pagamento, para negociar. Guardar sobra de uma escolha
       anterior faria o PDF prometer parcelamento que ninguém combinou. */
    formaPagamento: d.modoPagamento === "A_COMBINAR" ? null : (d.formaPagamento ?? null),
    parcelas: d.modoPagamento === "PARCELADO" ? (d.parcelas ?? 2) : null,
    primeiroVencimento: d.modoPagamento === "PARCELADO" ? (d.primeiroVencimento ?? null) : null,
  };

  try {
    const o = await prisma.$transaction(async (tx) => {
      if (!id) {
        return tx.orcamento.create({
          data: {
            ...comum,
            itens: {
              create: d.itens.map((i) => ({
                pecaId: i.pecaId,
                quantidade: i.quantidade,
                precoUnit: dec(i.precoUnit),
              })),
            },
          },
          select: { id: true, numero: true },
        });
      }

      const atual = await tx.orcamento.findUnique({
        where: { id },
        select: { id: true, numero: true, status: true },
      });
      if (!atual) throw new ErroDominio("NAO_ENCONTRADO", "Esse orçamento não existe mais.");
      if (atual.status === "CONVERTIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          `O ${numeroOrc(atual.numero)} já virou venda e não se edita. Para mudar algo, edite a venda.`,
        );
      }
      if (atual.status === "SUBSTITUIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          "Esse orçamento foi substituído por uma revisão. Edite a revisão, que é a que vale.",
        );
      }

      /* Os itens são trocados por inteiro: comparar linha a linha para
         descobrir o que mudou custaria mais código e daria o mesmo resultado
         — e o orçamento não tem histórico preso ao item, como a venda tem. */
      await tx.itemOrcamento.deleteMany({ where: { orcamentoId: id } });
      return tx.orcamento.update({
        where: { id },
        data: {
          ...comum,
          itens: {
            create: d.itens.map((i) => ({
              pecaId: i.pecaId,
              quantidade: i.quantidade,
              precoUnit: dec(i.precoUnit),
            })),
          },
        },
        select: { id: true, numero: true },
      });
    });

    recarregar(o.id);
    return ok(o);
  } catch (e) {
    return tratarErro(e, "salvarOrcamentoAction");
  }
}

/*
 * REVISÃO. Nasce um orçamento novo com os mesmos itens e número novo; o
 * anterior fica SUBSTITUIDO e para de reservar peça.
 *
 * Por que não editar no lugar: o cliente já está com o PDF do Nº 0007 na mão.
 * Se o 0007 mudar de conteúdo, os dois passam a discutir papéis diferentes
 * com o mesmo número. Com a revisão, o 0007 continua sendo o que foi enviado
 * e o 0008 é o que vale agora.
 */
export async function revisarOrcamentoAction(id: string): Promise<Result<{ id: string; numero: number }>> {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;

  try {
    const novo = await prisma.$transaction(async (tx) => {
      const o = await tx.orcamento.findUnique({
        where: { id },
        select: {
          id: true,
          numero: true,
          status: true,
          clienteId: true,
          validadeDias: true,
          subtotal: true,
          desconto: true,
          total: true,
          observacao: true,
          modoPagamento: true,
          formaPagamento: true,
          parcelas: true,
          primeiroVencimento: true,
          itens: { select: { pecaId: true, quantidade: true, precoUnit: true } },
        },
      });
      if (!o) throw new ErroDominio("NAO_ENCONTRADO", "Esse orçamento não existe mais.");
      if (o.status === "CONVERTIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          `O ${numeroOrc(o.numero)} já virou venda. Revisar não se aplica — o que existe agora é a venda.`,
        );
      }
      if (o.status === "SUBSTITUIDO") {
        throw new ErroDominio(
          "REGRA_NEGOCIO",
          "Esse orçamento já foi substituído. Revise a versão mais nova.",
        );
      }

      const hoje = new Date();
      const criado = await tx.orcamento.create({
        data: {
          clienteId: o.clienteId,
          data: hoje,
          validadeDias: o.validadeDias,
          validoAte: calcularValidoAte(hoje, o.validadeDias),
          subtotal: o.subtotal,
          desconto: o.desconto,
          total: o.total,
          observacao: o.observacao,
          modoPagamento: o.modoPagamento,
          formaPagamento: o.formaPagamento,
          parcelas: o.parcelas,
          primeiroVencimento: o.primeiroVencimento,
          revisaoDeId: o.id,
          itens: {
            create: o.itens.map((i) => ({
              pecaId: i.pecaId,
              quantidade: i.quantidade,
              precoUnit: i.precoUnit,
            })),
          },
        },
        select: { id: true, numero: true },
      });

      await tx.orcamento.update({ where: { id: o.id }, data: { status: "SUBSTITUIDO" } });
      return criado;
    });

    recarregar(novo.id);
    recarregarTelas("orcamento", `/orcamentos/${id}`);
    return ok(novo);
  } catch (e) {
    return tratarErro(e, "revisarOrcamentoAction");
  }
}

/** Recusado / reaberto. É a resposta do cliente, e ela pode mudar de ideia. */
export async function mudarStatusOrcamentoAction(
  id: string,
  novo: "RECUSADO" | "ABERTO",
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) return sessao;

  try {
    const o = await prisma.orcamento.findUnique({
      where: { id },
      select: { id: true, numero: true, status: true },
    });
    if (!o) return fail("NAO_ENCONTRADO", "Esse orçamento não existe mais.");
    if (o.status === "CONVERTIDO") {
      return fail(
        "REGRA_NEGOCIO",
        `O ${numeroOrc(o.numero)} já virou venda. Para desfazer, cancele a venda.`,
      );
    }
    if (o.status === "SUBSTITUIDO") {
      return fail("REGRA_NEGOCIO", "Esse orçamento foi substituído por uma revisão.");
    }

    await prisma.orcamento.update({ where: { id }, data: { status: novo } });
    recarregar(id);
    return ok({ id });
  } catch (e) {
    return tratarErro(e, "mudarStatusOrcamentoAction");
  }
}

/*
 * Excluir. Orçamento PODE ser apagado — diferente da venda, ele não é
 * histórico de dinheiro, é papel de negociação. O que não pode sumir é o que
 * virou venda: ali existe dinheiro e estoque do outro lado.
 */
export async function excluirOrcamentoAction(id: string): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("vendas", "excluir");
  if (!sessao.ok) return sessao;

  try {
    const o = await prisma.orcamento.findUnique({
      where: { id },
      select: {
        id: true,
        numero: true,
        status: true,
        substituidoPor: { select: { numero: true } },
      },
    });
    if (!o) return fail("NAO_ENCONTRADO", "Esse orçamento não existe mais.");
    if (o.status === "CONVERTIDO") {
      return fail(
        "REGRA_NEGOCIO",
        `O ${numeroOrc(o.numero)} virou venda e não pode ser excluído. Se a venda não vale, cancele a venda.`,
      );
    }

    await prisma.orcamento.delete({ where: { id } });
    recarregar();
    return ok({ id });
  } catch (e) {
    return tratarErro(e, "excluirOrcamentoAction");
  }
}
