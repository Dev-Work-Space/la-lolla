"use server";

import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { recarregar } from "@/lib/recarregar";
import { ok, fail, type Result } from "@/lib/result";
import { promocaoSchema, tirarPromocaoSchema, type PromocaoInput } from "./promocao.schemas";
import { aplicarPromocao, previaPromocao, tirarPromocao } from "./promocao.service";

/* Promoção mexe no preço do produto: a mesma permissão de editar produto. */

const primeira = (e: { issues: Array<{ message: string }> }) => e.issues[0]?.message ?? "Confira os campos da promoção.";
// O catálogo das clientes e a central mostram a promoção; o resto vem do fluxo de estoque.
const atualizar = () => recarregar("estoque", "/estoque/promocoes", "/catalogo");

export async function previaPromocaoAction(
  entrada: PromocaoInput,
): Promise<Result<{ quantos: number; ficam: number; exemplos: Array<{ id: string; sku: string; nome: string; de: number; por: number }> }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;
  const parsed = promocaoSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeira(parsed.error));
  try {
    return ok(await previaPromocao(parsed.data));
  } catch (e) {
    return tratarErro(e, "previaPromocaoAction");
  }
}

export async function aplicarPromocaoAction(entrada: PromocaoInput): Promise<Result<{ aplicados: number; ficam: number }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;
  const parsed = promocaoSchema.safeParse(entrada);
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeira(parsed.error));
  try {
    const r = await aplicarPromocao(parsed.data);
    atualizar();
    return ok(r);
  } catch (e) {
    return tratarErro(e, "aplicarPromocaoAction");
  }
}

export async function tirarPromocaoAction(ids: string[]): Promise<Result<{ quantos: number }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;
  const parsed = tirarPromocaoSchema.safeParse({ ids });
  if (!parsed.success) return fail("DADOS_INVALIDOS", primeira(parsed.error));
  try {
    const quantos = await tirarPromocao(parsed.data.ids);
    atualizar();
    return ok({ quantos });
  } catch (e) {
    return tratarErro(e, "tirarPromocaoAction");
  }
}
