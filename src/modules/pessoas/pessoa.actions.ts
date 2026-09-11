"use server";

import { revalidatePath } from "next/cache";
import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type ErrosDeCampo, type Result } from "@/lib/result";
import { clienteSchema, fornecedorSchema } from "./pessoa.schema";
import * as servico from "./pessoa.service";

/* Zod 4 devolve `issues`; o formulário consome erro por campo. */
function campos(erro: { issues: Array<{ path: PropertyKey[]; message: string }> }): ErrosDeCampo {
  const out: ErrosDeCampo = {};
  for (const i of erro.issues) (out[String(i.path[0] ?? "_")] ??= []).push(i.message);
  return out;
}

const recarregar = () => revalidatePath("/cadastros");

/* ── Clientes ───────────────────────────────────────────────── */

export async function salvarClienteAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pessoas", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = clienteSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));
  }

  try {
    const c = id
      ? await servico.editarCliente(id, parsed.data)
      : await servico.criarCliente(parsed.data);
    recarregar();
    return ok({ id: c.id });
  } catch (e) {
    return tratarErro(e, "salvarClienteAction");
  }
}

export async function excluirClienteAction(id: string): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("pessoas", "excluir");
  if (!sessao.ok) return sessao;

  try {
    const c = await servico.excluirCliente(id);
    recarregar();
    return ok({ nome: c.nome });
  } catch (e) {
    return tratarErro(e, "excluirClienteAction");
  }
}

/* ── Fornecedores ───────────────────────────────────────────── */

export async function salvarFornecedorAction(
  id: string | null,
  formData: FormData,
): Promise<Result<{ id: string }>> {
  const sessao = await exigirPermissao("pessoas", id ? "editar" : "criar");
  if (!sessao.ok) return sessao;

  const parsed = fornecedorSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return fail("DADOS_INVALIDOS", "Confira os campos destacados.", campos(parsed.error));
  }

  try {
    const f = id
      ? await servico.editarFornecedor(id, parsed.data)
      : await servico.criarFornecedor(parsed.data);
    recarregar();
    return ok({ id: f.id });
  } catch (e) {
    return tratarErro(e, "salvarFornecedorAction");
  }
}

export async function excluirFornecedorAction(id: string): Promise<Result<{ nome: string }>> {
  const sessao = await exigirPermissao("pessoas", "excluir");
  if (!sessao.ok) return sessao;

  try {
    const f = await servico.excluirFornecedor(id);
    recarregar();
    return ok({ nome: f.nome });
  } catch (e) {
    return tratarErro(e, "excluirFornecedorAction");
  }
}

/*
 * Consulta de CNPJ na base pública (BrasilAPI), como o botão "Buscar" do
 * app antigo. Fica numa Server Action e não no navegador por dois motivos:
 * a política de segurança do app bloqueia chamada externa pelo cliente, e
 * assim a chave/limite da API fica do nosso lado.
 */
export type DadosCNPJ = {
  razao?: string;
  fantasia?: string;
  email?: string;
  telefone?: string;
  cep?: string;
  logradouro?: string;
  numero?: string;
  bairro?: string;
  cidade?: string;
  uf?: string;
};

export async function consultarCnpjAction(doc: string): Promise<Result<DadosCNPJ>> {
  const sessao = await exigirPermissao("pessoas", "ver");
  if (!sessao.ok) return sessao;

  const d = String(doc).replace(/\D/g, "");
  if (d.length !== 14) return fail("DADOS_INVALIDOS", "Digite um CNPJ válido para buscar.");

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cnpj/v1/${d}`, {
      headers: { accept: "application/json" },
      // A base pública muda pouco; um dia de cache evita repetir consulta.
      next: { revalidate: 86_400 },
    });

    if (r.status === 404) return fail("NAO_ENCONTRADO", "CNPJ não encontrado na base pública.");
    if (!r.ok) return fail("ERRO_INTERNO", "Sem resposta da consulta. Preencha à mão.");

    const j = (await r.json()) as Record<string, unknown>;
    const txt = (k: string) => {
      const v = j[k];
      return typeof v === "string" && v.trim() ? v.trim() : undefined;
    };

    const ddd = txt("ddd_telefone_1");
    return ok({
      razao: txt("razao_social"),
      fantasia: txt("nome_fantasia"),
      email: txt("email"),
      telefone: ddd?.replace(/\D/g, ""),
      cep: txt("cep")?.replace(/\D/g, ""),
      logradouro: [txt("descricao_tipo_de_logradouro"), txt("logradouro")].filter(Boolean).join(" "),
      numero: txt("numero"),
      bairro: txt("bairro"),
      cidade: txt("municipio"),
      uf: txt("uf"),
    });
  } catch (e) {
    return tratarErro(e, "consultarCnpjAction");
  }
}

/** Preenche endereço pelo CEP — mesma ideia do app antigo. */
export async function consultarCepAction(cep: string): Promise<
  Result<{ logradouro?: string; bairro?: string; cidade?: string; uf?: string }>
> {
  const sessao = await exigirPermissao("pessoas", "ver");
  if (!sessao.ok) return sessao;

  const d = String(cep).replace(/\D/g, "");
  if (d.length !== 8) return fail("DADOS_INVALIDOS", "CEP precisa ter 8 dígitos.");

  try {
    const r = await fetch(`https://brasilapi.com.br/api/cep/v1/${d}`, {
      headers: { accept: "application/json" },
      next: { revalidate: 86_400 },
    });
    if (r.status === 404) return fail("NAO_ENCONTRADO", "CEP não encontrado.");
    if (!r.ok) return fail("ERRO_INTERNO", "Sem resposta da consulta. Preencha à mão.");

    const j = (await r.json()) as Record<string, unknown>;
    const txt = (k: string) => (typeof j[k] === "string" ? (j[k] as string) : undefined);
    return ok({
      logradouro: txt("street"),
      bairro: txt("neighborhood"),
      cidade: txt("city"),
      uf: txt("state"),
    });
  } catch (e) {
    return tratarErro(e, "consultarCepAction");
  }
}
