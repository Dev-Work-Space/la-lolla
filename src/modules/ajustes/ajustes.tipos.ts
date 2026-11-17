import type { Linha } from "@prisma/client";
import type { Precificacao } from "@/modules/pecas/linha";

/*
 * Ajustes do sistema — módulo NEUTRO (sem `server-only`, sem Prisma), porque
 * os formulários são Client Components e precisam dos padrões e dos rótulos.
 * Mesma razão de `financeiro.tipos.ts`.
 *
 * Os valores de fábrica vêm da documentação funcional, seção 15.
 */

export type Ajustes = {
  /** Custo e preço sugerido de cada linha (semijoia, perfumaria, outros). */
  precificacao: Record<Linha, Precificacao>;
  /** Meta de faturamento do mês. 0 = sem meta, e o bloco some do Início. */
  meta: number;
  /** Dias sem comprar a partir dos quais o cliente entra em "Parados". */
  diasParado: number;
  /** Desconto oferecido à vista, em percentual. */
  descontoVista: number;
  /** Endereço público do app. O QR da etiqueta NÃO usa: guarda só o código da peça. */
  urlApp: string;
  /** Categorias de cada linha: perfume não aparece entre as de anel, e vice-versa. */
  categorias: Record<Linha, string[]>;
  /** Materiais da semijoia (Prata 925, Banhado a ouro…). Opcional no cadastro. */
  materiais: string[];
};

export const AJUSTES_PADRAO: Ajustes = {
  precificacao: {
    // O 2,9 de sempre. Preço sugerido desligado até o João escolher a regra.
    SEMIJOIA: { fator: 2.9, modoPreco: "MULTIPLICADOR", valorPreco: 0 },
    // Perfume não vem com código de fornecedor: o custo é o valor pago.
    PERFUMARIA: { fator: 0, modoPreco: "PERCENTUAL", valorPreco: 0 },
    OUTROS: { fator: 0, modoPreco: "PERCENTUAL", valorPreco: 0 },
  },
  meta: 0,
  diasParado: 60,
  descontoVista: 5,
  urlApp: "",
  categorias: {
    /* A lista de fábrica do app antigo (CATEGORIAS_PADRAO). É o que volta no
       "Restaurar lista de fábrica" da tela de Categorias. */
    SEMIJOIA: ["Anéis", "Brincos", "Colares", "Pulseiras", "Conjuntos", "Tornozeleiras", "Piercings", "Berloques", "Outros"],
    PERFUMARIA: ["Perfumes femininos", "Perfumes masculinos", "Unissex", "Decants", "Kits"],
    OUTROS: ["Bolsas", "Acessórios", "Outros"],
  },
  // A lista que o João pediu (17/11), mais as variações que a loja usa.
  materiais: [
    "Prata pura",
    "Prata 925",
    "Ouro",
    "Ouro 18k",
    "Banhado a ouro",
    "Ródio",
    "Banhado a ródio",
    "Aço inoxidável",
    "Latão",
  ],
};

/** Uma chave por ajuste na tabela Config — assim um não sobrescreve o outro. */
export const CHAVES = {
  fator: "fator",
  meta: "meta",
  diasParado: "diasParado",
  descontoVista: "descontoVista",
  urlApp: "urlApp",
  categorias: "categorias",
  materiais: "materiais",
} as const;

/*
 * Semijoia continua nas chaves de antes ("fator", "categorias"): o 2,9 e a
 * lista que a loja já ajustou valem sem gravar nada no banco. As outras
 * linhas ganham chaves próprias.
 */
export const chaveFator = (l: Linha) => (l === "SEMIJOIA" ? CHAVES.fator : `fator.${l}`);
export const chavePreco = (l: Linha) => `preco.${l}`;
export const chaveCategorias = (l: Linha) => (l === "SEMIJOIA" ? CHAVES.categorias : `categorias.${l}`);

export const ROTULOS = {
  fator: {
    nome: "Multiplicador do custo",
    ajuda: "Código do fornecedor × este número = custo. Deixe 0 quando a linha não vem com código: aí o custo é o valor pago, digitado no cadastro. Mudar aqui não recalcula produtos já cadastrados.",
  },
  preco: {
    nome: "Preço sugerido",
    ajuda: "Como o cadastro sugere o preço a partir do custo: multiplicando (× 2,5) ou somando um percentual (+ 60%). Deixe 0 para digitar o preço à mão. Mudar aqui não recalcula produtos já cadastrados.",
  },
  meta: {
    nome: "Meta do mês",
    ajuda: "Quanto a loja quer faturar no mês. Deixe zerado para esconder o bloco de meta no Início.",
  },
  diasParado: {
    nome: "Cliente parado depois de",
    ajuda: "Dias sem comprar a partir dos quais o cliente aparece em “Parados”.",
  },
  descontoVista: {
    nome: "Desconto à vista",
    ajuda: "Percentual oferecido na venda à vista. Aparece como atalho no fechamento.",
  },
  urlApp: {
    nome: "Endereço do app",
    ajuda: "O endereço público do app. O QR da etiqueta não usa este endereço: ele guarda só o código do produto, que a NIIMBOT imprime nítido; para consultar, use “Ler etiqueta” no Estoque.",
  },
  categorias: {
    nome: "Categorias de produto",
    ajuda: "As opções que aparecem no cadastro, separadas por linha. Ficam em Estoque › Categorias.",
  },
  materiais: {
    nome: "Materiais",
    ajuda: "As opções de material no cadastro da semijoia: Prata 925, Banhado a ouro…",
  },
} satisfies Record<string, { nome: string; ajuda: string }>;
