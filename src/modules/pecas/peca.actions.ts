"use server";

import { recarregar } from "@/lib/recarregar";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { z } from "zod";
import { criarPecaSchema, insumoSchema } from "./peca.schema";
import { criarPeca, criarInsumo, editarPeca, editarInsumo } from "./peca.service";

/*
 * Toda action segue os MESMOS TRÊS PASSOS, nesta ordem:
 *
 *   1. permissão   — Server Action é endpoint público; "só a minha tela
 *                    chama" não protege nada
 *   2. validação   — safeParse, nunca parse (parse lança e vira 500 genérico)
 *   3. domínio     — delega ao service; nenhuma regra mora aqui
 *
 * E termina sempre com tratarErro(), para que nenhuma exceção escape para o
 * cliente sem virar uma mensagem que a pessoa entenda.
 */

type PecaCriada = { id: string; sku: string; nome: string };

export async function criarPecaAction(formData: FormData): Promise<Result<PecaCriada>> {
  const sessao = await exigirPermissao("pecas", "criar");
  if (!sessao.ok) return sessao;

  const parsed = criarPecaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail(
      "DADOS_INVALIDOS",
      "Confira os campos destacados.",
      z4Fields(parsed.error),
    );
  }

  try {
    const peca = await criarPeca(parsed.data, veFinanceiro(sessao.data));
    recarregar("estoque");
    return ok(peca);
  } catch (e) {
    return tratarErro(e, "criarPecaAction");
  }
}

export async function editarPecaAction(id: string, formData: FormData): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = criarPecaSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }

  try {
    const peca = await editarPeca(id, parsed.data, veFinanceiro(sessao.data));
    recarregar("estoque", `/estoque/${id}`);
    return ok({ id: peca.id });
  } catch (e) {
    return tratarErro(e, "editarPecaAction");
  }
}

export async function salvarInsumoAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pecas", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = insumoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }

  try {
    const i = id ? await editarInsumo(id, parsed.data) : await criarInsumo(parsed.data);
    recarregar("estoque");
    return ok({ id: i.id });
  } catch (e) {
    return tratarErro(e, "salvarInsumoAction");
  }
}

/*
 * Movimento de estoque. Regra 2.4: não existe "editar o saldo" — existe
 * registrar entrada ou saída, e o saldo é consequência. Por isso o formulário
 * pergunta QUANTAS unidades e POR QUÊ, nunca "qual é o novo saldo".
 *
 * A exceção é o inventário: aí a pessoa conta a prateleira e informa o total.
 * Mesmo assim o que é gravado é a DIFERENÇA, com motivo INVENTARIO — o
 * histórico continua explicando de onde veio cada unidade.
 */
const movimentoSchema = z.object({
  pecaId: z.string().min(1),
  tipo: z.enum(["entrada", "saida", "inventario"]),
  quantidade: z.coerce.number().int().positive("Informe uma quantidade maior que zero"),
  motivo: z.enum(["COMPRA", "VENDA", "DEVOLUCAO", "AJUSTE", "INVENTARIO", "PERDA"]),
  observacao: z.union([z.literal(""), z.string().trim().max(200)]).optional(),
});

export async function movimentarAction(formData: FormData): Promise<Result<{ saldo: number }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = movimentoSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", z4Fields(parsed.error));
  }
  const d = parsed.data;

  try {
    const { movimentarEstoque, saldoDe } = await import("./peca.service");
    const atual = await saldoDe(d.pecaId);

    // No inventário o número digitado é o TOTAL contado; gravamos a diferença.
    const delta =
      d.tipo === "inventario"
        ? d.quantidade - atual
        : d.tipo === "entrada"
          ? d.quantidade
          : -d.quantidade;

    if (delta === 0) {
      return fail("REGRA_NEGOCIO", "A contagem bate com o saldo atual. Nada a ajustar.");
    }

    await movimentarEstoque({
      pecaId: d.pecaId,
      delta,
      motivo: d.tipo === "inventario" ? "INVENTARIO" : d.motivo,
      observacao: d.observacao || undefined,
    });

    recarregar("estoque", `/estoque/${d.pecaId}`);
    return ok({ saldo: atual + delta });
  } catch (e) {
    return tratarErro(e, "movimentarAction");
  }
}

/**
 * Saldo de agora. O formulário chama isto ao ABRIR, em vez de confiar no
 * número que veio na prop: se a página ainda não tinha recarregado, a prévia
 * mostraria uma diferença calculada sobre um saldo velho — e no inventário
 * isso engana de verdade.
 *
 * A gravação nunca dependeu disso (o servidor relê o saldo antes de gravar);
 * o que estava errado era só o que a pessoa via antes de confirmar.
 */
export async function saldoAtualAction(pecaId: string): Promise<Result<{ saldo: number }>> {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return sessao;
  try {
    const { saldoDe } = await import("./peca.service");
    return ok({ saldo: await saldoDe(pecaId) });
  } catch (e) {
    return tratarErro(e, "saldoAtualAction");
  }
}

/*
 * Excluir peça — documentação, "Editar peça".
 *
 * São duas actions de propósito: a primeira só LÊ e alimenta o aviso ("o app
 * avisa o que está em jogo"), a segunda executa. Montar o aviso no servidor
 * da página o deixaria velho entre abrir a tela e confirmar — justo o número
 * que a pessoa está usando para decidir.
 *
 * Exige a permissão de EXCLUIR, não a de editar: na grade de permissões da
 * documentação elas são caixas separadas.
 */
export async function impactoExcluirAction(
  pecaId: string,
): Promise<Result<import("./peca.service").ImpactoExcluir>> {
  const sessao = await exigirPermissao("pecas", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const { impactoDeExcluir } = await import("./peca.service");
    return ok(await impactoDeExcluir(pecaId));
  } catch (e) {
    return tratarErro(e, "impactoExcluirAction");
  }
}

export async function excluirPecaAction(pecaId: string): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("pecas", "excluir");
  if (!sessao.ok) return sessao;
  try {
    const { excluirPeca } = await import("./peca.service");
    const p = await excluirPeca(pecaId);
    recarregar("estoque", `/estoque/${pecaId}`);
    return ok({ nome: p.nome });
  } catch (e) {
    return tratarErro(e, "excluirPecaAction");
  }
}

/** Zod 4 devolve `issues`; convertemos para o formato que o formulário usa. */
function z4Fields(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string[]> = {};
  for (const i of erro.issues) {
    const chave = String(i.path[0] ?? "_");
    (out[chave] ??= []).push(i.message);
  }
  return out;
}
