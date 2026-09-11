/*
 * Ajustes do sistema — módulo NEUTRO (sem `server-only`, sem Prisma), porque
 * os formulários são Client Components e precisam dos padrões e dos rótulos.
 * Mesma razão de `financeiro.tipos.ts`.
 *
 * Os valores de fábrica vêm da documentação funcional, seção 15.
 */

export type Ajustes = {
  /** Multiplica o código do fornecedor para chegar ao custo. Padrão 2,9. */
  fator: number;
  /** Meta de faturamento do mês. 0 = sem meta, e o bloco some do Início. */
  meta: number;
  /** Dias sem comprar a partir dos quais o cliente entra em "Parados". */
  diasParado: number;
  /** Desconto oferecido à vista, em percentual. */
  descontoVista: number;
  /** Endereço público do app — vira o QR da etiqueta. */
  urlApp: string;
  /** Categorias de peça disponíveis no cadastro. */
  categorias: string[];
};

export const AJUSTES_PADRAO: Ajustes = {
  fator: 2.9,
  meta: 0,
  diasParado: 60,
  descontoVista: 5,
  urlApp: "",
  categorias: ["Anéis", "Brincos", "Colares", "Pulseiras", "Correntes", "Pingentes", "Conjuntos"],
};

/** Uma chave por ajuste na tabela Config — assim um não sobrescreve o outro. */
export const CHAVES = {
  fator: "fator",
  meta: "meta",
  diasParado: "diasParado",
  descontoVista: "descontoVista",
  urlApp: "urlApp",
  categorias: "categorias",
} as const;

export const ROTULOS: Record<keyof Ajustes, { nome: string; ajuda: string }> = {
  fator: {
    nome: "Multiplicador do custo",
    ajuda: "Multiplica o código do fornecedor para chegar ao custo da peça. Mudar aqui não recalcula peças já cadastradas.",
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
    ajuda: "Usado no QR da etiqueta, para ler a peça com a câmera e cair direto nela.",
  },
  categorias: {
    nome: "Categorias de peça",
    ajuda: "As opções que aparecem no cadastro. Uma por linha.",
  },
};
