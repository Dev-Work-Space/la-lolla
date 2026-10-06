"use server";

import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { recarregar } from "@/lib/recarregar";
import { administrador } from "./usuario.regras";
import { usuarioSchema, editarUsuarioSchema, situacaoUsuarioSchema, senhaUsuarioSchema } from "./usuario.schemas";
import { criarUsuario, editarUsuario, mudarSituacaoUsuario, redefinirSenhaUsuario } from "./usuario.service";

async function executar<S extends z.ZodType>(
  acao: "criar" | "editar", schema: S, entrada: unknown,
  operacao: (autorId: string, dados: z.output<S>) => Promise<{ id: string }>, contexto: string,
): Promise<Result<{ id: string }>> {
  try {
    const sessao = await exigirPermissao("usuarios", acao);
    if (!sessao.ok) return sessao;
    // Permissão personalizada nunca substitui o papel administrativo.
    if (!administrador(sessao.data.papel)) return fail("SEM_PERMISSAO", "Somente administradores podem gerenciar usuários.");
    const dados = schema.safeParse(entrada);
    if (!dados.success) return fail("DADOS_INVALIDOS", dados.error.issues[0]?.message ?? "Confira os campos.");
    const resultado = await operacao(sessao.data.usuarioId, dados.data);
    recarregar("usuarios");
    return ok(resultado);
  } catch (e) {
    return tratarErro(e, contexto);
  }
}
export async function criarUsuarioAction(entrada: unknown) {
  return executar("criar", usuarioSchema, entrada, criarUsuario, "criarUsuarioAction");
}
export async function editarUsuarioAction(entrada: unknown) {
  return executar("editar", editarUsuarioSchema, entrada, editarUsuario, "editarUsuarioAction");
}
export async function mudarSituacaoUsuarioAction(entrada: unknown) {
  return executar("editar", situacaoUsuarioSchema, entrada, mudarSituacaoUsuario, "mudarSituacaoUsuarioAction");
}
export async function redefinirSenhaUsuarioAction(entrada: unknown) {
  return executar("editar", senhaUsuarioSchema, entrada, redefinirSenhaUsuario, "redefinirSenhaUsuarioAction");
}
