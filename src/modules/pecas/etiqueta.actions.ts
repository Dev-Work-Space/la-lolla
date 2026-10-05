"use server";

import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { recarregar } from "@/lib/recarregar";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { codigoEtiquetaSchema, pedidoEtiquetasSchema, type PedidoEtiquetas } from "./etiqueta.schemas";
import { montarEtiquetas, pecaPorCodigo } from "./etiqueta.service";
import type { Etiqueta } from "./etiqueta.regras";

function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

export async function gerarEtiquetasAction(
  entrada: PedidoEtiquetas,
): Promise<Result<{ etiquetas: Etiqueta[] }>> {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return sessao;

  const parsed = pedidoEtiquetasSchema.safeParse(entrada);
  if (!parsed.success) {
    const fields = campos(parsed.error);
    return fail("DADOS_INVALIDOS", fields.itens?.[0] ?? "Confira as quantidades.", fields);
  }

  /* Numerar reserva números na peça — é escrita, e pede a permissão de editar
     estoque. Sem numerar, imprimir é só leitura: quem vê a peça pode etiquetar. */
  if (parsed.data.numerar) {
    const podeEditar = await exigirPermissao("pecas", "editar");
    if (!podeEditar.ok) return podeEditar;
  }

  try {
    const etiquetas = await montarEtiquetas(parsed.data.itens, parsed.data.numerar);
    if (parsed.data.numerar) recarregar("estoque");
    return ok({ etiquetas });
  } catch (e) {
    return tratarErro(e, "gerarEtiquetasAction");
  }
}

export async function pecaPorCodigoAction(codigo: string): Promise<Result<{ id: string; nome: string }>> {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) return sessao;

  const parsed = codigoEtiquetaSchema.safeParse(codigo);
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", parsed.error.issues[0]?.message ?? "Código inválido.");
  }

  try {
    return ok(await pecaPorCodigo(parsed.data));
  } catch (e) {
    return tratarErro(e, "pecaPorCodigoAction");
  }
}
