import type { Linha } from "@prisma/client";

/*
 * As linhas da loja — módulo NEUTRO (sem `server-only`, sem Prisma em tempo
 * de execução), porque o cadastro, os ajustes e o catálogo são Client
 * Components e precisam dos rótulos. Mesma razão de `ajustes.tipos.ts`.
 *
 * A loja era só semijoia; em 10/2026 virou "Semijoias e Perfumaria". OUTROS é
 * o que não é nenhum dos dois (bolsa, acessório).
 */

export const LINHAS = ["SEMIJOIA", "PERFUMARIA", "OUTROS"] as const satisfies readonly Linha[];

export const ROTULO_LINHA: Record<Linha, string> = {
  SEMIJOIA: "Semijoias",
  PERFUMARIA: "Perfumaria",
  OUTROS: "Outros",
};

/** A palavra sob a logo na etiqueta. Outros fica só com a logo: não há palavra que sirva para tudo. */
export const ASSINATURA_LINHA: Record<Linha, string | null> = {
  SEMIJOIA: "SEMIJOIAS",
  PERFUMARIA: "PERFUMARIA",
  OUTROS: null,
};

export function ehLinha(v: unknown): v is Linha {
  return typeof v === "string" && (LINHAS as readonly string[]).includes(v);
}

export type ModoPreco = "MULTIPLICADOR" | "PERCENTUAL";

/**
 * Como cada linha chega no custo e no preço. Duas etapas, como o João pediu
 * (17/11):
 *   1. custo = código do fornecedor × `fator` — ou, com `fator` 0, o valor
 *      pago digitado (perfume não vem com código);
 *   2. preço sugerido = custo × `valorPreco` ou custo + `valorPreco` %.
 */
export type Precificacao = {
  fator: number;
  modoPreco: ModoPreco;
  /** 0 = a linha não sugere preço: quem cadastra digita. */
  valorPreco: number;
};

export function precoSugerido(custo: number, p: Precificacao): number | null {
  if (!(custo > 0) || !(p.valorPreco > 0)) return null;
  const preco = p.modoPreco === "PERCENTUAL" ? custo * (1 + p.valorPreco / 100) : custo * p.valorPreco;
  return Math.round(preco * 100) / 100;
}

/** "× 2,5" ou "+ 60%": como a regra aparece ao lado do preço no cadastro. */
export function descreverRegra(p: Precificacao): string | null {
  if (!(p.valorPreco > 0)) return null;
  const n = String(p.valorPreco).replace(".", ",");
  return p.modoPreco === "PERCENTUAL" ? `custo + ${n}%` : `custo × ${n}`;
}
