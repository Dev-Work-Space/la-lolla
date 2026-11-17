"use server";

import { recarregar } from "@/lib/recarregar";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { envaseSchema } from "./decant.schemas";
import { envasarDecants } from "./decant.service";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }) {
  const out: Record<string, string[]> = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

/*
 * Mesma permissão do ajuste de estoque: envasar é pôr produto na prateleira
 * sem compra, e baixar o frasco é tirar.
 */
export async function envasarDecantsAction(
  formData: FormData,
): Promise<Result<{ decantId: string; quantidade: number; volumeMl: number | null }>> {
  const sessao = await exigirPermissao("pecas", "editar");
  if (!sessao.ok) return sessao;

  const parsed = envaseSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));

  try {
    const r = await envasarDecants(parsed.data);
    recarregar("estoque", `/estoque/${parsed.data.perfumeId}`, `/estoque/${r.decantId}`);
    return ok({ decantId: r.decantId, quantidade: r.quantidade, volumeMl: r.volumeMl });
  } catch (e) {
    return tratarErro(e, "envasarDecantsAction");
  }
}
