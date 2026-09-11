"use server";

import { z } from "zod";
import { recarregar as recarregarTelas } from "@/lib/recarregar";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { cancelarVenda, devolverItem, fecharVenda, receberPagamento } from "./venda.fechar";
import { listarVendas, type FiltroVenda } from "./venda.service";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const recarregar = (id?: string) => recarregarTelas("venda", id && `/vendas/${id}`);

const FORMA = z.enum(["DINHEIRO", "PIX", "DEBITO", "CREDITO"]);

const fecharSchema = z.object({
  clienteId: z.string().optional().nullable(),
  observacao: z.string().trim().max(400).optional().nullable(),
  desconto: z.coerce.number().min(0, "Desconto não pode ser negativo").default(0),
  itens: z
    .array(
      z.object({
        pecaId: z.string().min(1),
        quantidade: z.coerce.number().int().positive(),
        precoUnit: z.coerce.number().min(0),
      }),
    )
    .min(1, "Adicione ao menos uma peça"),
  pagamentos: z
    .array(z.object({ forma: FORMA, valor: z.coerce.number().positive(), parcelas: z.coerce.number().int().min(1).optional() }))
    .default([]),
  aPrazo: z
    .object({
      parcelas: z.coerce.number().int().min(1).max(36),
      intervalo: z.enum(["mes", "quinzena", "semana"]),
      primeiroVencimento: z.coerce.date(),
    })
    .optional()
    .nullable(),
});

export type FecharVendaInput = z.input<typeof fecharSchema>;

export async function fecharVendaAction(
  entrada: FecharVendaInput,
): Promise<Result<{ id: string; numero: number }>> {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;

  const parsed = fecharSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os dados da venda.", campos(parsed.error));
  }

  try {
    const v = await fecharVenda({
      ...parsed.data,
      // Quem fechou a venda fica registrado; serve para comissão e para saber
      // quem atendeu quando a cliente voltar.
      vendedorId: sessao.data.usuarioId,
    });
    recarregar(v.id);
    return ok(v);
  } catch (e) {
    return tratarErro(e, "fecharVendaAction");
  }
}

const cancelarSchema = z.object({
  id: z.string().min(1),
  motivo: z.string().trim().min(3, "Diga o motivo — fica no histórico").max(200),
});

export async function cancelarVendaAction(
  id: string,
  motivo: string,
): Promise<Result<{ numero: number }>> {
  const sessao = await exigirPermissao("vendas", "excluir");
  if (!sessao.ok) return sessao;

  const parsed = cancelarSchema.safeParse({ id, motivo });
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira o motivo.", campos(parsed.error));
  }

  try {
    const v = await cancelarVenda(parsed.data.id, parsed.data.motivo);
    recarregar(id);
    return ok({ numero: v.numero });
  } catch (e) {
    return tratarErro(e, "cancelarVendaAction");
  }
}

const receberSchema = z.object({
  vendaId: z.string().min(1),
  forma: FORMA,
  valor: z.coerce.number().positive("Informe um valor maior que zero"),
  contaId: z.string().optional().nullable(),
});

export async function receberAction(formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) return sessao;

  const bruto = Object.fromEntries(formData);
  const parsed = receberSchema.safeParse({
    ...bruto,
    valor: String(bruto.valor ?? "").replace(/\./g, "").replace(",", "."),
  });
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos.", campos(parsed.error));
  }

  try {
    const p = await receberPagamento(parsed.data);
    recarregar(parsed.data.vendaId);
    return ok({ id: p.id });
  } catch (e) {
    return tratarErro(e, "receberAction");
  }
}

export async function devolverAction(
  itemId: string,
  quantidade: number,
): Promise<Result<{ vendaId: string }>> {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) return sessao;

  try {
    const r = await devolverItem(itemId, Math.trunc(quantidade));
    recarregar(r.vendaId);
    return ok(r);
  } catch (e) {
    return tratarErro(e, "devolverAction");
  }
}

/** Busca de peça para o carrinho, direto do servidor. */
export async function buscarPecasAction(termo: string) {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;

  const q = termo.trim();
  if (q.length < 2) return ok([]);

  try {
    const { prisma } = await import("@/lib/prisma");
    const pecas = await prisma.peca.findMany({
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
        tamanho: true,
        tipo: true,
        precoTabela: true,
        movimentos: { select: { delta: true } },
      },
      orderBy: { nome: "asc" },
      take: 20,
    });

    return ok(
      pecas.map((p) => ({
        id: p.id,
        sku: p.sku,
        nome: p.nome,
        tamanho: p.tamanho,
        insumo: p.tipo === "INSUMO",
        preco: p.precoTabela ? Number(p.precoTabela) : 0,
        saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
      })),
    );
  } catch (e) {
    return tratarErro(e, "buscarPecasAction");
  }
}

/** Clientes para o seletor da venda. */
export async function buscarClientesAction(termo: string) {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;

  try {
    const { prisma } = await import("@/lib/prisma");
    const q = termo.trim();
    const clientes = await prisma.cliente.findMany({
      where: q ? { nome: { contains: q, mode: "insensitive" } } : {},
      select: { id: true, nome: true, telefone: true },
      orderBy: { nome: "asc" },
      take: 20,
    });
    return ok(clientes);
  } catch (e) {
    return tratarErro(e, "buscarClientesAction");
  }
}

export async function listarVendasAction(filtro: FiltroVenda, busca?: string) {
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) return sessao;
  try {
    return ok(await listarVendas({ filtro, busca, veFinanceiro: veFinanceiro(sessao.data) }));
  } catch (e) {
    return tratarErro(e, "listarVendasAction");
  }
}
