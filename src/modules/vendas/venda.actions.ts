"use server";

import { z } from "zod";
import { recarregar as recarregarTelas } from "@/lib/recarregar";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import {
  cancelarVenda,
  editarVenda,
  fecharVenda,
  receberPagamento,
  registrarDevolucao,
  removerPagamento,
} from "./venda.fechar";
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
  /* Embalagem consumida. Sem preço: insumo não se cobra, se gasta. */
  insumos: z
    .array(
      z.object({
        pecaId: z.string().min(1),
        quantidade: z.coerce.number().int().positive(),
      }),
    )
    .default([]),
  pagamentos: z
    .array(
      z.object({
        forma: FORMA,
        valor: z.coerce.number().positive(),
        parcelas: z.coerce.number().int().min(1).optional(),
        carteiraId: z.string().optional().nullable(),
      }),
    )
    .default([]),
  /** A data da venda. Vem da tela; sem ela, hoje. */
  data: z.coerce.date().optional().nullable(),
  aPrazo: z
    .object({
      /* Até 60: o app antigo parava em 36 e o João já vendeu em mais vezes
         para cliente antiga. O limite existe só para barrar digitação
         absurda, não para dizer como a loja vende. */
      parcelas: z.coerce.number().int().min(1).max(60),
      intervalo: z.enum(["mes", "quinzena", "semana"]),
      primeiroVencimento: z.coerce.date(),
      /** Uma data por parcela, quando a pessoa escolheu uma a uma. */
      vencimentos: z.array(z.coerce.date()).optional().nullable(),
    })
    .optional()
    .nullable(),
  /** Veio de um orçamento aprovado; ele é marcado na mesma transação. */
  orcamentoId: z.string().optional().nullable(),
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
    /* Veio de orçamento: a proposta mudou de status e parou de reservar peça,
       então as telas dela também envelheceram. */
    if (parsed.data.orcamentoId) {
      recarregarTelas("orcamento", `/orcamentos/${parsed.data.orcamentoId}`);
    }
    return ok(v);
  } catch (e) {
    return tratarErro(e, "fecharVendaAction");
  }
}

/*
 * Editar a venda.
 *
 * Mesmos campos do fechamento, menos os pagamentos: dinheiro que entrou não se
 * edita por aqui. Para desfazer um recebimento existe o botão próprio, na
 * ficha da venda.
 */
const editarSchema = fecharSchema
  .omit({ pagamentos: true, orcamentoId: true })
  .extend({ vendaId: z.string().min(1) });

export type EditarVendaInput = z.input<typeof editarSchema>;

export async function editarVendaAction(
  entrada: EditarVendaInput,
): Promise<Result<{ id: string; numero: number }>> {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = editarSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os dados da venda.", campos(parsed.error));
  }

  try {
    const v = await editarVenda(parsed.data);
    recarregar(v.id);
    return ok(v);
  } catch (e) {
    return tratarErro(e, "editarVendaAction");
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
  /* Vazio vira null, e não string vazia: o banco recusaria "" como id de
     carteira, e a mensagem que chegaria à tela seria de erro de chave
     estrangeira — técnica e inútil para quem está no balcão. */
  carteiraId: z
    .union([z.literal(""), z.string()])
    .optional()
    .transform((v) => (v ? v : null)),
  data: z
    .union([z.literal(""), z.coerce.date()])
    .optional()
    .transform((v) => (v === "" || v === undefined ? null : (v as Date))),
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

/**
 * Desfazer um recebimento lançado errado.
 *
 * Exige permissão de EXCLUIR, não de editar: o dinheiro sai da carteira e a
 * cobrança volta a existir — é desfazer, não corrigir.
 */
export async function removerPagamentoAction(
  pagamentoId: string,
): Promise<Result<{ vendaId: string; valor: number }>> {
  const sessao = await exigirPermissao("vendas", "excluir");
  if (!sessao.ok) return sessao;

  if (!pagamentoId) return fail("DADOS_INVALIDOS", "Recebimento não informado.");

  try {
    const r = await removerPagamento(pagamentoId);
    recarregar(r.vendaId);
    return ok(r);
  } catch (e) {
    return tratarErro(e, "removerPagamentoAction");
  }
}

const devolucaoSchema = z.object({
  vendaId: z.string().min(1),
  itens: z
    .array(
      z.object({
        itemVendaId: z.string().min(1),
        quantidade: z.coerce.number().int().positive(),
      }),
    )
    .min(1, "Escolha ao menos uma peça para devolver"),
  data: z.coerce.date().optional().nullable(),
  motivo: z.string().trim().max(200).optional().nullable(),
  resolucao: z.enum(["ABATER", "DEVOLVER"]),
  carteiraId: z
    .union([z.literal(""), z.string()])
    .optional()
    .transform((v) => (v ? v : null)),
});

export type DevolucaoInput = z.input<typeof devolucaoSchema>;

export async function registrarDevolucaoAction(
  entrada: DevolucaoInput,
): Promise<Result<{ vendaId: string; total: number; abatido: number; emDinheiro: number }>> {
  const sessao = await exigirPermissao("vendas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = devolucaoSchema.safeParse(entrada);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os dados da devolução.", campos(parsed.error));
  }

  try {
    const r = await registrarDevolucao(parsed.data);
    recarregar(r.vendaId);
    /* O fluxo "venda" já recarrega o Financeiro: a devolução pode ter tirado
       dinheiro do caixa e encolhido as parcelas a receber. */
    return ok(r);
  } catch (e) {
    return tratarErro(e, "registrarDevolucaoAction");
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

/**
 * As carteiras que a tela da venda pode oferecer.
 *
 * Quem NÃO vê financeiro recebe lista vazia — e a tela nem mostra o seletor.
 * O pagamento dela cai em "sem carteira", como no app antigo, e o João
 * atribui depois. Devolver a lista para a vendedora seria vazar saldo de
 * caixa por um caminho lateral.
 */
export async function buscarCarteirasDaVendaAction() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;
  if (!veFinanceiro(sessao.data)) return ok([]);
  try {
    const { carteirasComSaldo } = await import("@/modules/financeiro/financeiro.service");
    const lista = await carteirasComSaldo();
    return ok(lista.map((c) => ({ id: c.id, nome: c.nome, saldo: c.saldo })));
  } catch (e) {
    return tratarErro(e, "buscarCarteirasDaVendaAction");
  }
}

/**
 * Os insumos que a venda pode consumir.
 *
 * O CUSTO só vai para quem vê financeiro. A vendedora continua podendo
 * registrar o saquinho que saiu — que é o que importa para o estoque e para a
 * margem — sem ver quanto ele custou. É a mesma regra do catálogo, aplicada a
 * um lugar novo.
 */
export async function buscarInsumosDaVendaAction() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;
  const podeVerCusto = veFinanceiro(sessao.data);

  try {
    const { prisma } = await import("@/lib/prisma");
    const lista = await prisma.peca.findMany({
      where: { tipo: "INSUMO", arquivada: false },
      select: {
        id: true,
        nome: true,
        unidade: true,
        custo: true,
        movimentos: { select: { delta: true } },
      },
      orderBy: { nome: "asc" },
    });
    return ok(
      lista.map((p) => ({
        id: p.id,
        nome: p.nome,
        unidade: p.unidade ?? "un",
        custo: podeVerCusto ? Number(p.custo ?? 0) : null,
        saldo: p.movimentos.reduce((s, m) => s + m.delta, 0),
      })),
    );
  } catch (e) {
    return tratarErro(e, "buscarInsumosDaVendaAction");
  }
}

/**
 * A embalagem da última venda que registrou alguma.
 *
 * Existe por um motivo prático que veio do app antigo: o uso é quase sempre o
 * mesmo, e redigitar saquinho e caixinha a cada venda é o que faz qualquer
 * controle de insumo ser abandonado na segunda semana.
 */
export async function ultimosInsumosAction() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) return sessao;

  try {
    const { prisma } = await import("@/lib/prisma");
    const ultima = await prisma.venda.findFirst({
      where: { status: { not: "CANCELADA" }, insumos: { some: {} } },
      orderBy: { data: "desc" },
      select: { insumos: { select: { pecaId: true, quantidade: true } } },
    });
    return ok(ultima?.insumos ?? []);
  } catch (e) {
    return tratarErro(e, "ultimosInsumosAction");
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
