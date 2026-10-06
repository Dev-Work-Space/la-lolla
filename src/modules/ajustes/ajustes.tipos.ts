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
  /** Endereço público do app. O QR da etiqueta NÃO usa: guarda só o código da peça. */
  urlApp: string;
  /** Categorias de peça disponíveis no cadastro. */
  categorias: string[];
  /** Etiqueta da NIIMBOT: comprimento da área impressa, em mm. */
  etiquetaLargura: number;
  /** Etiqueta da NIIMBOT: altura da área impressa, em mm. */
  etiquetaAltura: number;
  /** Etiqueta de joia que dobra ao meio (frente numa metade, QR na outra). */
  etiquetaDobrada: boolean;
};

export const AJUSTES_PADRAO: Ajustes = {
  fator: 2.9,
  meta: 0,
  diasParado: 60,
  descontoVista: 5,
  urlApp: "",
  /* A lista de fábrica do app antigo (CATEGORIAS_PADRAO). É o que volta no
     "Restaurar lista de fábrica" da tela de Categorias. */
  categorias: ["Anéis", "Brincos", "Colares", "Pulseiras", "Conjuntos", "Tornozeleiras", "Piercings", "Berloques", "Outros"],
  /* As medidas da etiqueta do app antigo não ficaram registradas. Estes são
     os de uma etiqueta de joia comum da D110 (30 × 15 mm, dobrada ao meio);
     o João confere na primeira impressão e acerta aqui. */
  etiquetaLargura: 30,
  etiquetaAltura: 15,
  etiquetaDobrada: true,
};

/** Uma chave por ajuste na tabela Config — assim um não sobrescreve o outro. */
export const CHAVES = {
  fator: "fator",
  meta: "meta",
  diasParado: "diasParado",
  descontoVista: "descontoVista",
  urlApp: "urlApp",
  categorias: "categorias",
  etiquetaLargura: "etiquetaLargura",
  etiquetaAltura: "etiquetaAltura",
  etiquetaDobrada: "etiquetaDobrada",
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
    ajuda: "O endereço público do app. O QR da etiqueta não usa este endereço: ele guarda só o código da peça, que a NIIMBOT imprime nítido; para consultar, use “Ler etiqueta” no Estoque.",
  },
  categorias: {
    nome: "Categorias de peça",
    ajuda: "As opções que aparecem no cadastro. Ficam em Estoque › Categorias.",
  },
  etiquetaLargura: {
    nome: "Comprimento",
    ajuda: "O lado comprido da área que imprime, em milímetros (está na caixa do rolo).",
  },
  etiquetaAltura: {
    nome: "Altura",
    ajuda: "O lado curto da área que imprime, em milímetros.",
  },
  etiquetaDobrada: {
    nome: "Etiqueta de joia, dobrada ao meio",
    ajuda: "Frente (loja, nome e preço) numa metade e o QR na outra — ao dobrar em volta da peça, uma de cada lado. Desligado, tudo sai num lado só.",
  },
};
