import { z } from "zod";
import type { Papel } from "@prisma/client";

/*
 * O modelo de permissão do LaLolla: 6 áreas × 4 ações.
 * ADMIN e SUPER_ADMIN ignoram o mapa — têm tudo, sempre.
 *
 * Esta é a fonte da verdade. O front esconder um botão é conveniência;
 * a checagem que vale acontece no servidor, antes de qualquer escrita.
 */

export const AREAS = ["pecas", "vendas", "pessoas", "financeiro", "ajustes", "usuarios"] as const;
export const ACOES = ["ver", "criar", "editar", "excluir"] as const;

export type Area = (typeof AREAS)[number];
export type Acao = (typeof ACOES)[number];

/** Rótulos em português para a tela de usuários. */
export const ROTULO_AREA: Record<Area, string> = {
  pecas: "Estoque (peças e insumos)",
  vendas: "Vendas e orçamentos",
  pessoas: "Clientes e fornecedores",
  financeiro: "Financeiro (caixa, contas, faturamento)",
  ajustes: "Ajustes do sistema",
  usuarios: "Usuários e permissões",
};

export const ROTULO_ACAO: Record<Acao, string> = {
  ver: "Ver",
  criar: "Criar",
  editar: "Editar",
  excluir: "Excluir",
};

const acoesSchema = z.object({
  ver: z.boolean().default(false),
  criar: z.boolean().default(false),
  editar: z.boolean().default(false),
  excluir: z.boolean().default(false),
});

export const permissoesSchema = z.object({
  pecas: acoesSchema,
  vendas: acoesSchema,
  pessoas: acoesSchema,
  financeiro: acoesSchema,
  ajustes: acoesSchema,
  usuarios: acoesSchema,
});

export type Permissoes = z.infer<typeof permissoesSchema>;

function mapa(valor: boolean): Permissoes {
  return Object.fromEntries(
    AREAS.map((a) => [a, Object.fromEntries(ACOES.map((c) => [c, valor]))]),
  ) as Permissoes;
}

export const TUDO_LIBERADO = (): Permissoes => mapa(true);
export const NADA_LIBERADO = (): Permissoes => mapa(false);

/** Perfil inicial de um vendedor: vende e cadastra cliente, não vê custo. */
export function permissoesVendedor(): Permissoes {
  const p = NADA_LIBERADO();
  p.pecas.ver = true;
  p.vendas.ver = p.vendas.criar = p.vendas.editar = true;
  p.pessoas.ver = p.pessoas.criar = p.pessoas.editar = true;
  return p;
}

/**
 * Normaliza o Json vindo do banco. Um campo Json pode conter qualquer coisa
 * (inclusive de uma versão antiga do app), então nunca confiamos no formato:
 * o que não casar com o schema vira `false`, que é o padrão seguro.
 */
export function lerPermissoes(bruto: unknown, papel: Papel): Permissoes {
  if (papel === "ADMIN" || papel === "SUPER_ADMIN") return TUDO_LIBERADO();

  const r = permissoesSchema.safeParse(bruto);
  if (r.success) return r.data;

  // Merge parcial: aproveita o que for válido, o resto fica negado.
  const base = NADA_LIBERADO();
  if (bruto && typeof bruto === "object") {
    for (const area of AREAS) {
      const v = (bruto as Record<string, unknown>)[area];
      if (v && typeof v === "object") {
        for (const acao of ACOES) {
          if ((v as Record<string, unknown>)[acao] === true) base[area][acao] = true;
        }
      }
    }
  }
  return base;
}

export function podeFazer(p: Permissoes, area: Area, acao: Acao): boolean {
  return p[area]?.[acao] === true;
}

/** Super admin não pode ser rebaixado nem excluído — nem por outro admin. */
export const EMAILS_SUPER_ADMIN = ["joao", "hemily"] as const;
