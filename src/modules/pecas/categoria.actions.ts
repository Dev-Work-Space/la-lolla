"use server";

import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { recarregar } from "@/lib/recarregar";
import { ok, fail, type Result } from "@/lib/result";
import {
  categoriaSchema,
  linhaSchema,
  renomearCategoriaSchema,
  type CategoriaEntrada,
  type RenomearCategoria,
} from "./categoria.schemas";
import {
  criarCategoria,
  excluirCategoria,
  renomearCategoria,
  restaurarCategorias,
} from "./categoria.service";

/*
 * A lista de categorias continua sendo um AJUSTE da loja: quem mexe nela é
 * quem tem a permissão de Ajustes, como era quando ela morava lá. Só a tela
 * mudou de lugar.
 */

const primeiraMensagem = (erro: { issues: Array<{ message: string }> }) =>
  erro.issues[0]?.message ?? "Confira o nome da categoria.";

export async function criarCategoriaAction(entrada: CategoriaEntrada): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = categoriaSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    await criarCategoria(parsed.data.linha, parsed.data.nome);
    recarregar("ajustes");
    return ok({ nome: parsed.data.nome });
  } catch (e) {
    return tratarErro(e, "criarCategoriaAction");
  }
}

export async function renomearCategoriaAction(
  entrada: RenomearCategoria,
): Promise<Result<{ pecas: number }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = renomearCategoriaSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    const pecas = await renomearCategoria(parsed.data.linha, parsed.data.de, parsed.data.para);
    recarregar("ajustes");
    return ok({ pecas });
  } catch (e) {
    return tratarErro(e, "renomearCategoriaAction");
  }
}

export async function excluirCategoriaAction(entrada: CategoriaEntrada): Promise<Result<{ pecas: number }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = categoriaSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    const pecas = await excluirCategoria(parsed.data.linha, parsed.data.nome);
    recarregar("ajustes");
    return ok({ pecas });
  } catch (e) {
    return tratarErro(e, "excluirCategoriaAction");
  }
}

export async function restaurarCategoriasAction(linha: unknown): Promise<Result<{ ok: true }>> {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = linhaSchema.safeParse(linha);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeiraMensagem(parsed.error));

  try {
    await restaurarCategorias(parsed.data);
    recarregar("ajustes");
    return ok({ ok: true as const });
  } catch (e) {
    return tratarErro(e, "restaurarCategoriasAction");
  }
}
