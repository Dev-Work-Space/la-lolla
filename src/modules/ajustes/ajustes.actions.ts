"use server";

import { recarregar } from "@/lib/recarregar";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { LINHAS } from "@/modules/pecas/linha";
import { CHAVES, chaveFator, chavePreco, gravarAjuste } from "./ajustes.service";
import { ajustesSchema } from "./ajustes.schemas";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  // Caminho inteiro ("precificacao.PERFUMARIA.valorPreco"): são três linhas com os mesmos campos.
  for (const i of erro.issues) (out[i.path.map(String).join(".") || "_"] ??= []).push(i.message);
  return out;
}

export async function salvarAjustesAction(formData: FormData): Promise<Result<{ ok: true }>> {
  // Ajustes mexem em regra de cálculo do app inteiro: exige a permissão da
  // área "ajustes", que o Vendedor não tem.
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const precificacao = Object.fromEntries(
    LINHAS.map((l) => [
      l,
      {
        fator: formData.get(`precificacao.${l}.fator`) ?? "",
        modoPreco: formData.get(`precificacao.${l}.modoPreco`) ?? "",
        valorPreco: formData.get(`precificacao.${l}.valorPreco`) ?? "",
      },
    ]),
  );
  const parsed = ajustesSchema.safeParse({ ...Object.fromEntries(formData), precificacao });
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));
  }
  const d = parsed.data;

  try {
    await Promise.all([
      ...LINHAS.flatMap((l) => [
        gravarAjuste(chaveFator(l), d.precificacao[l].fator),
        gravarAjuste(chavePreco(l), { modo: d.precificacao[l].modoPreco, valor: d.precificacao[l].valorPreco }),
      ]),
      gravarAjuste(CHAVES.meta, d.meta),
      gravarAjuste(CHAVES.diasParado, d.diasParado),
      gravarAjuste(CHAVES.descontoVista, d.descontoVista),
      gravarAjuste(CHAVES.urlApp, d.urlApp),
    ]);

    // Os ajustes entram em quase toda conta do app.
    recarregar("ajustes");
    return ok({ ok: true as const });
  } catch (e) {
    return tratarErro(e, "salvarAjustesAction");
  }
}
