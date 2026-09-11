"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { registrarCompra } from "./compra.service";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const recarregar = (id?: string) => {
  revalidatePath("/compras");
  revalidatePath("/estoque");
  revalidatePath("/financeiro");
  revalidatePath("/");
  if (id) revalidatePath(`/compras/${id}`);
};

const compraSchema = z.object({
  fornecedorId: z.string().min(1, "Escolha o fornecedor"),
  observacao: z.string().trim().max(400).optional().nullable(),
  itens: z
    .array(
      z.object({
        pecaId: z.string().min(1),
        quantidade: z.coerce.number().int().positive(),
        custoUnit: z.coerce.number().min(0),
      }),
    )
    .min(1, "Adicione ao menos um item"),
  pagamento: z.discriminatedUnion("tipo", [
    z.object({ tipo: z.literal("avista"), carteiraId: z.string().min(1, "Escolha a carteira") }),
    z.object({
      tipo: z.literal("prazo"),
      parcelas: z.coerce.number().int().min(1).max(36),
      intervalo: z.enum(["mes", "quinzena", "semana"]),
      primeiroVencimento: z.coerce.date(),
    }),
  ]),
});

export type CompraInput = z.input<typeof compraSchema>;

export async function registrarCompraAction(
  entrada: CompraInput,
): Promise<Result<{ id: string; numero: number }>> {
  // Comprar mexe em estoque E em dinheiro. Exijo as duas permissões: um
  // vendedor que só pode criar peça não deveria conseguir lançar despesa.
  const podePeca = await exigirPermissao("pecas", "criar");
  if (!podePeca.ok) return podePeca;
  const podeDinheiro = await exigirPermissao("financeiro", "criar");
  if (!podeDinheiro.ok) return podeDinheiro;

  const parsed = compraSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os dados da compra.", campos(parsed.error));
  }

  try {
    const c = await registrarCompra(parsed.data);
    recarregar(c.id);
    return ok(c);
  } catch (e) {
    return tratarErro(e, "registrarCompraAction");
  }
}

/** Fornecedores para o seletor da compra. */
export async function buscarFornecedoresAction() {
  const sessao = await exigirPermissao("pecas", "criar");
  if (!sessao.ok) return sessao;
  try {
    const { prisma } = await import("@/lib/prisma");
    return ok(
      await prisma.fornecedor.findMany({
        select: { id: true, nome: true },
        orderBy: { nome: "asc" },
        take: 200,
      }),
    );
  } catch (e) {
    return tratarErro(e, "buscarFornecedoresAction");
  }
}

/** Carteiras para o pagamento à vista. */
export async function buscarCarteirasAction() {
  const sessao = await exigirPermissao("financeiro", "ver");
  if (!sessao.ok) return sessao;
  try {
    const { carteirasComSaldo } = await import("@/modules/financeiro/financeiro.service");
    return ok(await carteirasComSaldo());
  } catch (e) {
    return tratarErro(e, "buscarCarteirasAction");
  }
}

/**
 * Busca peça OU insumo para o carrinho da compra — os dois entram pelo mesmo
 * fluxo, como o João pediu.
 */
export async function buscarItensAction(termo: string) {
  const sessao = await exigirPermissao("pecas", "criar");
  if (!sessao.ok) return sessao;

  const q = termo.trim();
  if (q.length < 2) return ok([]);

  try {
    const { prisma } = await import("@/lib/prisma");
    const itens = await prisma.peca.findMany({
      where: {
        arquivada: false,
        OR: [
          { nome: { contains: q, mode: "insensitive" } },
          { sku: { contains: q, mode: "insensitive" } },
          { categoria: { contains: q, mode: "insensitive" } },
        ],
      },
      select: {
        id: true,
        sku: true,
        nome: true,
        tipo: true,
        unidade: true,
        custo: true,
        codigoFornecedor: true,
        fator: true,
        movimentos: { select: { delta: true } },
      },
      orderBy: { nome: "asc" },
      take: 20,
    });

    return ok(
      itens.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        insumo: p.tipo === "INSUMO",
        unidade: p.unidade ?? "un",
        // Sugere o último custo pago; a pessoa corrige se o fornecedor mudou.
        custo: p.custo ? Number(p.custo) : 0,
        codigoFornecedor: p.codigoFornecedor ? Number(p.codigoFornecedor) : null,
        fator: p.fator ? Number(p.fator) : null,
        saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
      })),
    );
  } catch (e) {
    return tratarErro(e, "buscarItensAction");
  }
}
