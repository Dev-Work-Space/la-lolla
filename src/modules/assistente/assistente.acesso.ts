import "server-only";
import { exigirPermissao } from "@/lib/auth/guard";
import type { Sessao } from "@/lib/auth/sessao";
import { fail } from "@/lib/result";
import type { Area } from "@/modules/usuarios/permissoes";
import { telaSchema, type Tela } from "./assistente.schemas";

export const areasAssistente = ["pecas", "vendas", "financeiro"] as const;
export const areaDaTela: Record<Tela, Area | null> = {
  inicio: null, vendas: "vendas", orcamentos: "vendas", financeiro: "financeiro", estoque: "pecas", compras: "pecas",
};
export function podeConsultar(sessao: Sessao, area: Area): boolean {
  return sessao.papel === "ADMIN" || sessao.papel === "SUPER_ADMIN" || sessao.permissoes[area].ver;
}
export function podeUsarAssistente(sessao: Sessao): boolean {
  return areasAssistente.some((area) => podeConsultar(sessao, area));
}
export function telasPermitidas(sessao: Sessao): Tela[] {
  return telaSchema.options.filter((tela) => {
    const area = areaDaTela[tela];
    return area ? podeConsultar(sessao, area) : podeUsarAssistente(sessao);
  });
}
export async function exigirAcessoAssistente() {
  for (const area of areasAssistente) {
    const resultado = await exigirPermissao(area, "ver");
    if (resultado.ok || resultado.error.code === "NAO_AUTENTICADO") return resultado;
  }
  return fail("SEM_PERMISSAO", "Você não tem acesso ao assistente.");
}
