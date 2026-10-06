"use server";

import { recarregar } from "@/lib/recarregar";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { gravarAjuste } from "./ajustes.service";
import { ajustesSchema } from "./ajustes.schemas";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

export async function salvarAjustesAction(formData: FormData): Promise<Result<{ ok: true }>> {
  // Ajustes mexem em regra de cálculo do app inteiro: exige a permissão da
  // área "ajustes", que o Vendedor não tem.
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = ajustesSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    await Promise.all([
      gravarAjuste("fator", d.fator),
      gravarAjuste("meta", d.meta),
      gravarAjuste("diasParado", d.diasParado),
      gravarAjuste("descontoVista", d.descontoVista),
      gravarAjuste("urlApp", d.urlApp),
      gravarAjuste("etiquetaLargura", d.etiquetaLargura),
      gravarAjuste("etiquetaAltura", d.etiquetaAltura),
      gravarAjuste("etiquetaDobrada", d.etiquetaDobrada),
    ]);

    // Os ajustes entram em quase toda conta do app.
    recarregar("ajustes");
    return ok({ ok: true as const });
  } catch (e) {
    return tratarErro(e, "salvarAjustesAction");
  }
}
