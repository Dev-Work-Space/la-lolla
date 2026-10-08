"use server";

import { z } from "zod";
import { exigirSessao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { fail, ok, type Result } from "@/lib/result";
import { enderecoDoComprovante, guardarComprovante } from "./comprovante.service";

/*
 * Anexar e ver comprovante.
 *
 * Quem anexa é quem registra dinheiro: a vendedora na venda, quem cuida do
 * caixa na baixa, quem compra na compra. Por isso não é uma área só — vale
 * qualquer permissão de CRIAR ou EDITAR nessas áreas. Ver, vale para quem vê
 * vendas ou financeiro.
 */

export async function anexarComprovanteAction(
  formData: FormData,
): Promise<Result<{ id: string; tipo: string }>> {
  const s = await exigirSessao();
  if (!s.ok) return s;
  const p = s.data.permissoes;
  const admin = s.data.papel === "ADMIN" || s.data.papel === "SUPER_ADMIN";
  const pode =
    admin || p.vendas.criar || p.vendas.editar || p.financeiro.criar || p.financeiro.editar || p.pecas.criar;
  if (!pode) return fail("SEM_PERMISSAO", "Você não tem acesso a essa função.");

  const arquivo = formData.get("arquivo");
  if (!(arquivo instanceof File) || arquivo.size === 0) {
    return fail("DADOS_INVALIDOS", "Escolha uma foto ou um PDF do comprovante.");
  }
  try {
    return ok(await guardarComprovante(arquivo));
  } catch (e) {
    return tratarErro(e, "anexarComprovanteAction");
  }
}

export async function verComprovanteAction(id: unknown): Promise<Result<{ url: string; tipo: string }>> {
  const s = await exigirSessao();
  if (!s.ok) return s;
  const p = s.data.permissoes;
  const admin = s.data.papel === "ADMIN" || s.data.papel === "SUPER_ADMIN";
  if (!(admin || p.vendas.ver || p.financeiro.ver)) return fail("SEM_PERMISSAO", "Você não tem acesso a essa função.");

  const parsed = z.string().trim().min(1).max(40).safeParse(id);
  if (!parsed.success) return fail("DADOS_INVALIDOS", "Comprovante inválido.");
  try {
    const r = await enderecoDoComprovante(parsed.data);
    return r ? ok(r) : fail("NAO_ENCONTRADO", "Não achei esse comprovante. Ele pode ter sido apagado.");
  } catch (e) {
    return tratarErro(e, "verComprovanteAction");
  }
}
