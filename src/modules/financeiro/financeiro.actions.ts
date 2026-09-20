"use server";

import { recarregar as recarregarTelas } from "@/lib/recarregar";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPermissao } from "@/lib/auth/guard";
import { ErroDominio, tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";

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

/*
 * O dia em que o dinheiro se moveu, que não é o dia do registro.
 *
 * O frete de ontem lançado hoje tem de entrar no caixa de ontem — senão o
 * fechamento do dia nunca bate, e é o fechamento do dia que faz alguém
 * confiar no app. Vazio vale como hoje.
 */
const dataDoFato = z
  .union([z.literal(""), z.coerce.date()])
  .optional()
  .transform((v) => (v === "" || v === undefined ? new Date() : (v as Date)));

/* ─────────────── lançamento (entrada e saída de dinheiro) ─────────────── */

const lancamentoSchema = z.object({
  tipo: z.enum(["entrada", "saida"]),
  descricao: z.string().trim().min(2, "Diga o que foi").max(160),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero"),
  categoria: z.string().trim().max(40).optional(),
  carteiraId: z.string().optional(),
  data: dataDoFato,
});

export async function lancarAction(formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "criar");
  if (!sessao.ok) return sessao;

  const parsed = lancamentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    // Saída é gravada com valor NEGATIVO. Assim somar a coluna dá o saldo,
    // sem precisar de um campo "tipo" que possa discordar do sinal.
    const l = await prisma.lancamento.create({
      data: {
        descricao: d.descricao,
        valor: dec(d.tipo === "saida" ? -d.valor : d.valor),
        categoria: d.categoria || null,
        carteiraId: d.carteiraId || null,
        data: d.data,
      },
      select: { id: true },
    });
    recarregar();
    return ok(l);
  } catch (e) {
    return tratarErro(e, "lancarAction");
  }
}

export async function excluirLancamentoAction(id: string): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const l = await prisma.lancamento.delete({ where: { id }, select: { id: true } });
    recarregar();
    return ok(l);
  } catch (e) {
    return tratarErro(e, "excluirLancamentoAction");
  }
}

/* ─────────────── contas a pagar e a receber ─────────────── */

const contaSchema = z.object({
  tipo: z.enum(["PAGAR", "RECEBER"]),
  descricao: z.string().trim().min(2, "Diga do que se trata").max(160),
  valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero"),
  vencimento: z.coerce.date(),
  fornecedorId: z.string().optional(),
  parcelas: z.coerce.number().int().min(1).max(36).default(1),
});

export async function criarContaAction(formData: FormData): Promise<Result<{ quantas: number }>> {
  const sessao = await exigirPermissao("financeiro", "criar");
  if (!sessao.ok) return sessao;

  const parsed = contaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const base = Math.floor((d.valor / d.parcelas) * 100) / 100;
    const sobra = Math.round((d.valor - base * d.parcelas) * 100) / 100;

    await prisma.$transaction(
      Array.from({ length: d.parcelas }, (_, k) => {
        const venc = new Date(d.vencimento);
        venc.setMonth(venc.getMonth() + k);
        return prisma.conta.create({
          data: {
            tipo: d.tipo,
            descricao:
              d.parcelas > 1 ? `${d.descricao} · ${k + 1}/${d.parcelas}` : d.descricao,
            // Sobra de centavos na ÚLTIMA parcela (documentação, seção 15).
            valor: dec(k === d.parcelas - 1 ? base + sobra : base),
            vencimento: venc,
            fornecedorId: d.fornecedorId || null,
            ...(d.parcelas > 1 ? { parcela: k + 1, deParcelas: d.parcelas } : {}),
          },
        });
      }),
    );

    recarregar();
    return ok({ quantas: d.parcelas });
  } catch (e) {
    return tratarErro(e, "criarContaAction");
  }
}

const baixaSchema = z.object({
  contaId: z.string().min(1),
  carteiraId: z.string().min(1, "Escolha de qual carteira saiu (ou entrou) o dinheiro"),
  comprovanteId: z.string().optional(),
  /*
   * Só vale quando a conta é parcela de uma venda: aí a baixa vira pagamento
   * da venda, e pagamento tem forma. Nas outras contas o campo é ignorado.
   */
  forma: z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO"]).optional(),
  data: dataDoFato,
});

/*
 * BAIXA DE VENCIMENTO. Aqui o comprovante é OBRIGATÓRIO.
 *
 * É a única regra de comprovante que o João fez questão de manter rígida:
 * na venda o comprovante vira pendência (a cliente está esperando), mas dar
 * baixa numa conta é ato de conferência — sem o papel, não se confere nada
 * depois.
 *
 * Enquanto o upload de arquivo não existir, a baixa exige pelo menos a
 * carteira, e o comprovante fica registrado como pendência visível.
 */
export async function baixarContaAction(formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "editar");
  if (!sessao.ok) return sessao;

  const parsed = baixaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const conta = await prisma.conta.findUnique({
      where: { id: d.contaId },
      select: {
        id: true,
        tipo: true,
        status: true,
        descricao: true,
        valor: true,
        vendaId: true,
      },
    });
    if (!conta) throw new ErroDominio("NAO_ENCONTRADO", "Essa conta não existe mais.");
    if (conta.status !== "ABERTA") {
      throw new ErroDominio("REGRA_NEGOCIO", "Essa conta já foi baixada ou cancelada.");
    }

    /*
     * Parcela de VENDA é caso à parte, e não era tratada — este é o defeito
     * que o João descreveu como "as telas não se comunicam", na sua forma
     * mais cara:
     *
     * A cliente pagava a parcela, a moça dava baixa aqui no Financeiro, o
     * dinheiro entrava na carteira e a conta ficava PAGA — mas a VENDA
     * continuava dizendo "a receber R$ 40", para sempre. O saldo da venda sai
     * de `total − pagamentos`, e a baixa nunca criava o pagamento.
     *
     * Resultado: o Financeiro dizia que não havia nada a receber e o Portal de
     * vendas dizia que havia. Duas telas, duas verdades.
     *
     * Aqui o dinheiro entra COMO PAGAMENTO DA VENDA, não como lançamento
     * avulso — e é importante que seja um ou outro: o saldo da carteira soma
     * os lançamentos E os pagamentos de venda, então gravar os dois contaria
     * o mesmo dinheiro duas vezes.
     */
    const deVenda = conta.tipo === "RECEBER" && Boolean(conta.vendaId);

    await prisma.$transaction(async (tx) => {
      const valor = Number(conta.valor);

      if (deVenda) {
        await tx.pagamento.create({
          data: {
            vendaId: conta.vendaId!,
            forma: d.forma ?? "DINHEIRO",
            valor: dec(valor),
            carteiraId: d.carteiraId,
            comprovanteId: d.comprovanteId || null,
            data: d.data,
          },
          select: { id: true },
        });
        await tx.conta.update({
          where: { id: conta.id },
          data: { status: "PAGA", pagoEm: d.data },
        });
        return;
      }

      // A baixa move dinheiro de verdade: vira lançamento na carteira.
      const lanc = await tx.lancamento.create({
        data: {
          carteiraId: d.carteiraId,
          descricao: conta.descricao,
          valor: dec(conta.tipo === "PAGAR" ? -valor : valor),
          categoria: conta.tipo === "PAGAR" ? "Conta paga" : "Recebimento",
          comprovanteId: d.comprovanteId || null,
          data: d.data,
        },
        select: { id: true },
      });

      await tx.conta.update({
        where: { id: conta.id },
        data: { status: "PAGA", pagoEm: new Date(), lancamentoId: lanc.id },
      });
    });

    recarregar();
    return ok({ id: conta.id });
  } catch (e) {
    return tratarErro(e, "baixarContaAction");
  }
}

export async function cancelarContaAction(id: string): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const c = await prisma.conta.update({
      where: { id },
      data: { status: "CANCELADA" },
      select: { id: true },
    });
    recarregar();
    return ok(c);
  } catch (e) {
    return tratarErro(e, "cancelarContaAction");
  }
}

/* ─────────────── carteiras ─────────────── */

const carteiraSchema = z.object({
  nome: z.string().trim().min(2, "Dê um nome à carteira").max(40),
  saldoInicial: z.union([z.literal(""), dinheiro]).transform((v) => (v === "" ? 0 : (v as number))),
  /* CARTAO fica de fora: cartão não guarda dinheiro e pede limite,
     fechamento e vencimento — tem formulário próprio. Recusar aqui impede
     que alguém crie um cartão sem limite mexendo no HTML da página. */
  tipo: z.enum(["ESPECIE", "CONTA", "RESERVA", "OUTRA"]).default("CONTA"),
});

export async function salvarCarteiraAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = carteiraSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;
  const dados = {
    nome: d.nome,
    saldoInicial: dec(d.saldoInicial),
    tipo: d.tipo,
  };

  try {
    const c = id
      ? await prisma.carteira.update({ where: { id }, data: dados, select: { id: true } })
      : await prisma.carteira.create({ data: dados, select: { id: true } });
    recarregar();
    return ok(c);
  } catch (e) {
    return tratarErro(e, "salvarCarteiraAction");
  }
}

const transferenciaSchema = z
  .object({
    origemId: z.string().min(1, "De onde sai"),
    destinoId: z.string().min(1, "Para onde vai"),
    valor: dinheiro.refine((n) => n > 0, "Informe um valor maior que zero"),
    data: dataDoFato,
  })
  .refine((v) => v.origemId !== v.destinoId, {
    path: ["destinoId"],
    message: "Escolha uma carteira diferente da origem",
  });

export async function transferirAction(formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "criar");
  if (!sessao.ok) return sessao;

  const parsed = transferenciaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    const t = await prisma.transferencia.create({
      data: {
        origemId: d.origemId,
        destinoId: d.destinoId,
        valor: dec(d.valor),
        data: d.data,
      },
      select: { id: true },
    });
    recarregar();
    return ok(t);
  } catch (e) {
    return tratarErro(e, "transferirAction");
  }
}

export async function removerTransferenciaAction(id: string): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("financeiro", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const t = await prisma.transferencia.delete({ where: { id }, select: { id: true } });
    recarregar();
    return ok(t);
  } catch (e) {
    return tratarErro(e, "removerTransferenciaAction");
  }
}
