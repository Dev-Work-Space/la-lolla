"use server";

import { recarregar } from "@/lib/recarregar";
import { z } from "zod";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { gravarAjuste } from "./ajustes.service";
import { AJUSTES_PADRAO } from "./ajustes.tipos";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const numeroBr = z
  .union([z.string(), z.number()])
  .transform((v) =>
    typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")),
  )
  .refine((n) => Number.isFinite(n), { message: "Valor inválido" });

const schema = z.object({
  fator: numeroBr.refine((n) => n > 0, "O multiplicador precisa ser maior que zero"),
  meta: numeroBr.refine((n) => n >= 0, "A meta não pode ser negativa"),
  diasParado: z.coerce.number().int().min(1, "Informe pelo menos 1 dia").max(3650),
  descontoVista: numeroBr.refine((n) => n >= 0 && n <= 100, "O desconto vai de 0 a 100"),
  urlApp: z.union([z.literal(""), z.string().trim().url("Endereço inválido")]),
  categorias: z.string().trim().max(2000),
});

export async function salvarAjustesAction(formData: FormData): Promise<Result<{ ok: true }>> {
  // Ajustes mexem em regra de cálculo do app inteiro: exige a permissão da
  // área "ajustes", que o Vendedor não tem.
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) return sessao;

  const parsed = schema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));
  }
  const d = parsed.data;

  // Uma categoria por linha, sem vazias e sem repetidas.
  const categorias = [
    ...new Set(
      d.categorias
        .split(/\r?\n/)
        .map((c) => c.trim())
        .filter(Boolean),
    ),
  ];

  try {
    await Promise.all([
      gravarAjuste("fator", d.fator),
      gravarAjuste("meta", d.meta),
      gravarAjuste("diasParado", d.diasParado),
      gravarAjuste("descontoVista", d.descontoVista),
      gravarAjuste("urlApp", d.urlApp),
      gravarAjuste("categorias", categorias.length > 0 ? categorias : AJUSTES_PADRAO.categorias),
    ]);

    // Os ajustes entram em quase toda conta do app.
    recarregar("ajustes");
    return ok({ ok: true as const });
  } catch (e) {
    return tratarErro(e, "salvarAjustesAction");
  }
}
