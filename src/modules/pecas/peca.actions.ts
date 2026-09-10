"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { criarPecaSchema } from "./peca.schema";
import { criarPeca, editarPeca } from "./peca.service";

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
    revalidatePath("/estoque");
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
    revalidatePath("/estoque");
    revalidatePath(`/estoque/${id}`);
    return ok({ id: peca.id });
  } catch (e) {
    return tratarErro(e, "editarPecaAction");
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
