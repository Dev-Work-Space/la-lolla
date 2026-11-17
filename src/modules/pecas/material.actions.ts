"use server";

import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { recarregar } from "@/lib/recarregar";
import { ok, fail, type Result } from "@/lib/result";
import { nomeMaterialSchema, renomearMaterialSchema, type RenomearMaterial } from "./material.schemas";
import { criarMaterial, excluirMaterial, renomearMaterial, restaurarMateriais } from "./material.service";

/* Como as categorias: a lista de materiais é ajuste da loja, e pede a permissão de Ajustes. */

const primeiraMensagem = (erro: { issues: Array<{ message: string }> }) =>
  erro.issues[0]?.message ?? "Confira o nome do material.";

export async function criarMaterialAction(nome: string): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = nomeMaterialSchema.safeParse(nome);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    await criarMaterial(parsed.data);
    recarregar("ajustes");
    return ok({ nome: parsed.data });
  } catch (e) {
    return tratarErro(e, "criarMaterialAction");
  }
}

export async function renomearMaterialAction(entrada: RenomearMaterial): Promise<Result<{ pecas: number }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = renomearMaterialSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    const pecas = await renomearMaterial(parsed.data.de, parsed.data.para);
    recarregar("ajustes");
    return ok({ pecas });
  } catch (e) {
    return tratarErro(e, "renomearMaterialAction");
  }
}

export async function excluirMaterialAction(nome: string): Promise<Result<{ pecas: number }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = nomeMaterialSchema.safeParse(nome);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    const pecas = await excluirMaterial(parsed.data);
    recarregar("ajustes");
    return ok({ pecas });
  } catch (e) {
    return tratarErro(e, "excluirMaterialAction");
  }
}

export async function restaurarMateriaisAction(): Promise<Result<{ ok: true }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  try {
    await restaurarMateriais();
    recarregar("ajustes");
    return ok({ ok: true as const });
  } catch (e) {
    return tratarErro(e, "restaurarMateriaisAction");
  }
}
