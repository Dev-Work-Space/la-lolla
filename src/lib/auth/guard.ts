import "server-only";

import { sessaoAtual, type Sessao } from "./sessao";
import { podeFazer, type Acao, type Area } from "@/modules/usuarios/permissoes";
import { ok, fail, type Result } from "@/lib/result";

/*
 * O porteiro. Toda Server Action e toda página protegida começa por aqui.
 *
 * IMPORTANTE: Server Action é um endpoint HTTP público. O fato de só o nosso
 * botão chamá-la não protege nada — qualquer pessoa pode disparar a mesma
 * requisição. É por isso que a checagem vive aqui, no servidor, e não em
 * "esconder o botão".
 */

export async function exigirSessao(): Promise<Result<Sessao>> {
  const s = await sessaoAtual();
  if (!s) return fail("NAO_AUTENTICADO", "Faça login para continuar.");
  return ok(s);
}

export async function exigirPermissao(area: Area, acao: Acao): Promise<Result<Sessao>> {
  const s = await sessaoAtual();
  if (!s) return fail("NAO_AUTENTICADO", "Faça login para continuar.");

  // Admin tem tudo, sempre — não depende do que está gravado no Json.
  const liberado =
    s.papel === "SUPER_ADMIN" || s.papel === "ADMIN" || podeFazer(s.permissoes, area, acao);

  if (!liberado) {
    return fail("SEM_PERMISSAO", "Você não tem acesso a essa função.");
  }
  return ok(s);
}

/** Atalho de leitura: quem não vê financeiro nunca recebe custo nem margem. */
export function veFinanceiro(s: Sessao): boolean {
  return s.papel === "SUPER_ADMIN" || s.papel === "ADMIN" || s.permissoes.financeiro.ver;
}
