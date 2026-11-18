/*
 * O quadro de pedidos (CRM em kanban) — MODELO para o João ver, 18/11.
 *
 * As etapas que o João pediu. O pagamento se mexe no Financeiro, não
 * aqui: no quadro ele é etiqueta no cartão. Por isso a venda anda até
 * "Entregue" mesmo devendo — no crediário a cliente leva a peça antes de pagar.
 *
 * Módulo neutro (sem "use client" nem "server-only"): o servidor monta os
 * cartões e a tela arrasta, e os dois precisam das mesmas etapas.
 */

/* "Recusado" vem por último e separado: é desvio, não passo do caminho (João, 18/11). */
export const ETAPAS_CRM = ["orcamento", "vendido", "entregar", "entregue", "recusado"] as const;

export type EtapaCrm = (typeof ETAPAS_CRM)[number];

export const ROTULO_ETAPA: Record<EtapaCrm, string> = {
  orcamento: "Em orçamento",
  recusado: "Recusado",
  vendido: "Vendido",
  entregar: "Separação / A entregar",
  entregue: "Entregue",
};

export const DICA_ETAPA: Record<EtapaCrm, string> = {
  orcamento: "Esperando a cliente aprovar",
  recusado: "A cliente não fechou",
  vendido: "Venda fechada",
  entregar: "Separando e embalando para entregar",
  entregue: "Já está com a cliente",
};

/* A etapa que a VENDA grava no banco (enum EtapaVenda), e a coluna do quadro
   de cada uma. Repetida aqui porque o @prisma/client não entra no navegador. */
export const ETAPAS_VENDA = ["VENDIDO", "A_ENTREGAR", "ENTREGUE"] as const;
export type EtapaVenda = (typeof ETAPAS_VENDA)[number];

export const ROTULO_ETAPA_VENDA: Record<EtapaVenda, string> = {
  VENDIDO: "Vendido",
  A_ENTREGAR: "A entregar",
  ENTREGUE: "Entregue",
};

export const COLUNA_DA_ETAPA: Record<EtapaVenda, EtapaCrm> = {
  VENDIDO: "vendido",
  A_ENTREGAR: "entregar",
  ENTREGUE: "entregue",
};

export const ETAPA_DA_COLUNA: Partial<Record<EtapaCrm, EtapaVenda>> = {
  vendido: "VENDIDO",
  entregar: "A_ENTREGAR",
  entregue: "ENTREGUE",
};

/** O que abre ao clicar no cartão: os produtos e, na venda, tudo que falta receber. */
export type DetalheCrm = {
  itens: Array<{ nome: string; quantidade: number; total: number }>;
  pago: number;
  recebimentos: Array<{ forma: string; valor: number; data: string }>;
  parcelas: Array<{ rotulo: string; valor: number; vencimento: string; atrasada: boolean }>;
  semComprovante: number;
};

export type CartaoCrm = {
  /** "orc:<id>" ou "venda:<id>": orçamento e venda vivem em tabelas diferentes. */
  chave: string;
  id: string;
  tipo: "orcamento" | "venda";
  href: string;
  rotulo: string;
  cliente: string | null;
  itens: string;
  total: number;
  /** O que falta receber (venda). Orçamento não deve nada ainda. */
  falta: number;
  /** Onde o cartão nasce, calculado do que o sistema já sabe. */
  etapa: EtapaCrm;
  aviso: { texto: string; tom: "neutro" | "due" | "accent" } | null;
  /** ISO; vazio nos exemplos. */
  data: string;
  detalhe: DetalheCrm;
};
