"use server";

import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth/guard";
import { ErroDominio, tratarErro } from "@/lib/errors";
import { recarregar as recarregarTelas } from "@/lib/recarregar";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { proximoDiaMensal, somaDias, somaMeses } from "@/lib/dia";
import { vencimentoDaFatura } from "./cartao.regras";
import { buscarCartao, faturaDoCartao } from "./cartao.service";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const recarregar = () => recarregarTelas("financeiro");

const dinheiro = z
  .union([z.string(), z.number()])
  .transform((v) =>
    typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")),
  )
  .refine((n) => Number.isFinite(n), { message: "Valor inválido" });

const dec = (n: number) => new Prisma.Decimal(n.toFixed(2));
const r2 = (n: number) => Math.round(n * 100) / 100;

/* ─────────────── cadastro do cartão ─────────────── */

const cartaoSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome ao cartão").max(40),
  limite: dinheiro.refine((n) => n >= 0, "O limite não pode ser negativo"),
  /* Quanto do limite já estava comprometido antes de a loja usar o app. Sem
     ele o limite apareceria inteiro no primeiro dia. */
  usadoInicial: z
    .union([z.literal(""), dinheiro])
    .optional()
    .transform((v) => (v === "" || v === undefined ? 0 : (v as number))),
  diaVencimento: z.coerce.number().int().min(1).max(31).default(10),
  diaFechamento: z
    .union([z.literal(""), z.coerce.number().int().min(1).max(31)])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as number))),
  /** "AAAA-MM", como vem do <input type="month">. */
  validade: z
    .union([z.literal(""), z.string().regex(/^\d{4}-\d{2}$/, "Use mês e ano")])
    .optional()
    .transform((v) => (v ? (v as string) : null)),
});

export async function salvarCartaoAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = cartaoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const dados = {
      nome: d.nome,
      tipo: "CARTAO" as const,
      limite: dec(d.limite),
      usadoInicial: dec(d.usadoInicial),
      diaVencimento: d.diaVencimento,
      diaFechamento: d.diaFechamento,
      validade: d.validade,
    };
    const c = id
      ? await prisma.carteira.update({ where: { id }, data: dados, select: { id: true } })
      : await prisma.carteira.create({ data: dados, select: { id: true } });
    recarregar();
    return ok(c);
  } catch (e) {
    return tratarErro(e, "salvarCartaoAction");
  }
}

/**
 * Arquivar o cartão. Não apaga: as compras dele continuam no histórico do
 * caixa, e uma fatura em aberto continua sendo dívida de alguém.
 */
export async function arquivarCartaoAction(id: string): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "excluir");
  if (!sessao.ok) return sessao;

  try {
    const abertas = await prisma.conta.count({ where: { cartaoId: id, status: "ABERTA" } });
    if (abertas > 0) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `Este cartão tem ${abertas} compra${abertas === 1 ? "" : "s"} em aberto. Pague a fatura antes de arquivar.`,
      );
    }
    const c = await prisma.carteira.update({
      where: { id },
      data: { arquivada: true },
      select: { id: true },
    });
    recarregar();
    return ok(c);
  } catch (e) {
    return tratarErro(e, "arquivarCartaoAction");
  }
}

/* ─────────────── compra no crédito ─────────────── */

const compraSchema = z.object({
  cartaoId: z.string().min(1, "Escolha o cartão"),
  descricao: z.string().trim().min(2, "Diga do que é a compra").max(160),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero"),
  categoria: z.string().trim().max(40).optional(),
  parcelas: z.coerce.number().int().min(1).max(36).default(1),
  dataCompra: z
    .union([z.literal(""), z.coerce.date()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? new Date() : (v as Date))),
});

/**
 * Compra no crédito não passa pelo caixa hoje: vira parcela na fatura.
 *
 * Por isso não pede carteira nem comprovante — não saiu dinheiro de lugar
 * nenhum ainda. Cada parcela é uma conta a pagar do cartão, e é a soma delas
 * que dá o limite usado.
 */
export async function comprarNoCartaoAction(
  formData: FormData,
): Promise<Result<{ parcelas: number; primeiroVencimento: Date }>> {
  const sessao = await exigirPermissao("financeiro", "criar");
  if (!sessao.ok) return sessao;

  const parsed = compraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const cartao = await buscarCartao(d.cartaoId);
    if (!cartao) throw new ErroDominio("NAO_ENCONTRADO", "Esse cartão não existe mais.");

    const primeiro = vencimentoDaFatura(cartao, d.dataCompra);
    const base = Math.floor((d.valor / d.parcelas) * 100) / 100;
    const sobra = r2(d.valor - base * d.parcelas);

    await prisma.$transaction(
      Array.from({ length: d.parcelas }, (_, k) => {
        const ultima = k === d.parcelas - 1;
        return prisma.conta.create({
          data: {
            tipo: "PAGAR",
            status: "ABERTA",
            descricao:
              d.parcelas > 1 ? `${d.descricao} · ${k + 1}/${d.parcelas}` : d.descricao,
            // Sobra de centavos na ÚLTIMA parcela, como em toda parcela do app.
            valor: dec(ultima ? base + sobra : base),
            /* Parcela de cartão anda de fatura em fatura: uma por mês, sempre
               no dia do vencimento — não é "30 dias depois". */
            vencimento: k === 0 ? primeiro : somaMeses(primeiro, k),
            cartaoId: d.cartaoId,
            dataCompra: d.dataCompra,
            ...(d.parcelas > 1 ? { parcela: k + 1, deParcelas: d.parcelas } : {}),
          },
        });
      }),
    );

    recarregar();
    return ok({ parcelas: d.parcelas, primeiroVencimento: primeiro });
  } catch (e) {
    return tratarErro(e, "comprarNoCartaoAction");
  }
}

/* ─────────────── pagar a fatura ─────────────── */

const faturaSchema = z.object({
  cartaoId: z.string().min(1),
  vencimento: z.coerce.date(),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero"),
  carteiraId: z.string().min(1, "Escolha de qual carteira saiu o dinheiro"),
  data: z
    .union([z.literal(""), z.coerce.date()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? new Date() : (v as Date))),
});

/**
 * Pagar a fatura: aqui, sim, o dinheiro sai do caixa.
 *
 * Três coisas acontecem juntas — a saída na carteira, a baixa de todas as
 * compras daquela fatura e a liberação do limite (que é consequência da
 * baixa, não um contador à parte).
 */
export async function pagarFaturaAction(
  formData: FormData,
): Promise<Result<{ pago: number; resto: number }>> {
  const sessao = await exigirPermissao("financeiro", "editar");
  if (!sessao.ok) return sessao;

  const parsed = faturaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const cartao = await buscarCartao(d.cartaoId);
    if (!cartao) throw new ErroDominio("NAO_ENCONTRADO", "Esse cartão não existe mais.");

    const itens = await faturaDoCartao(d.cartaoId, d.vencimento);
    if (itens.length === 0) {
      throw new ErroDominio("NAO_ENCONTRADO", "Essa fatura já foi paga ou não existe mais.");
    }

    const total = r2(itens.reduce((s, i) => s + i.valor, 0));
    if (d.valor > total + 0.005) {
      throw new ErroDominio(
        "REGRA_NEGOCIO",
        `A fatura é de ${total.toFixed(2)} e o valor informado é ${d.valor.toFixed(2)}. ` +
          `Pagar a mais viraria crédito no cartão, que o app não controla.`,
      );
    }

    const resto = r2(total - d.valor);

    await prisma.$transaction(async (tx) => {
      await tx.lancamento.create({
        data: {
          carteiraId: d.carteiraId,
          descricao: `Fatura do cartão · ${cartao.nome}`,
          // Saída: negativo, a mesma convenção do resto do caixa.
          valor: dec(-d.valor),
          categoria: "Cartão de crédito",
          data: d.data,
        },
      });

      await tx.conta.updateMany({
        where: { id: { in: itens.map((i) => i.id) } },
        data: { status: "PAGA", pagoEm: d.data },
      });

      /* Pagou menos que a fatura? O que sobrou CONTINUA ocupando limite — vira
         uma conta do próprio cartão na fatura seguinte, em vez de sumir junto
         com a baixa. */
      if (resto > 0.005) {
        await tx.conta.create({
          data: {
            tipo: "PAGAR",
            status: "ABERTA",
            descricao: `Fatura de ${d.vencimento.toLocaleDateString("pt-BR")} · saldo`,
            valor: dec(resto),
            vencimento: proximoDiaMensal(
              somaDias(d.vencimento, 1),
              cartao.diaVencimento ?? 10,
            ),
            cartaoId: d.cartaoId,
            dataCompra: d.data,
          },
        });
      }
    });

    recarregar();
    return ok({ pago: d.valor, resto });
  } catch (e) {
    return tratarErro(e, "pagarFaturaAction");
  }
}
