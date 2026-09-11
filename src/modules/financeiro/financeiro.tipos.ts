/*
 * Tipos e listas do Financeiro — SEM nenhuma dependência de servidor.
 *
 * Por que existe este arquivo separado: os formulários são Client Components
 * e precisam das categorias e do tipo CarteiraSaldo. Importar isso de
 * `financeiro.service.ts` (que tem `server-only` e o Prisma) fazia o bundler
 * tentar levar o driver do Postgres para o NAVEGADOR — e a tela morria com
 * "Can't resolve 'util/types'".
 *
 * É a mesma armadilha de `components/layout/navegacao.ts`: valor compartilhado
 * entre cliente e servidor mora num módulo neutro, nunca no módulo do servidor.
 */

/* Categorias que NÃO contam como despesa do negócio: uma é o custo da
   mercadoria (já entra na margem) e a outra é dinheiro do dono saindo. */
export const CATEGORIAS_FORA_DA_DESPESA = ["Mercadoria", "Retirada"];

export const CATEGORIAS_SAIDA = [
  "Mercadoria",
  "Retirada",
  "Aluguel",
  "Energia",
  "Internet",
  "Embalagem",
  "Marketing",
  "Imposto",
  "Taxa de cartão",
  "Outros",
];

export const CATEGORIAS_ENTRADA = ["Venda", "Aporte", "Outros"];

export const FILTROS_CONTA = [
  ["abertas", "Em aberto"],
  ["vencidas", "Vencidas"],
  ["semana", "Esta semana"],
  ["pagas", "Baixadas"],
  ["todas", "Todas"],
] as const;

export type FiltroConta = (typeof FILTROS_CONTA)[number][0];

export type CarteiraSaldo = {
  id: string;
  nome: string;
  cofrinho: boolean;
  ordem: number;
  saldoInicial: number;
  entradas: number;
  saidas: number;
  saldo: number;
};

export type MovimentoCaixa = {
  id: string;
  tipo: "entrada" | "saida";
  descricao: string;
  categoria: string | null;
  valor: number;
  carteira: string | null;
  quando: Date;
  origem: "lancamento" | "venda" | "transferencia";
  href?: string;
  temComprovante: boolean;
};

export type ContaLinha = {
  id: string;
  tipo: "PAGAR" | "RECEBER";
  descricao: string;
  valor: number;
  vencimento: Date;
  paga: boolean;
  cancelada: boolean;
  vencida: boolean;
  diasAteVencer: number;
  fornecedor: string | null;
  vendaId: string | null;
  parcela: string | null;
};
