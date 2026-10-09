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

/*
 * "Outros" é sempre a ÚLTIMA: quando ela é escolhida, a tela abre um campo
 * para escrever a categoria de verdade. Sem isso, tudo que não cabia na lista
 * virava "Outros" e o relatório de para-onde-foi-o-dinheiro perdia a metade
 * mais interessante.
 */
export const CATEGORIAS_ENTRADA = ["Venda", "Aporte", "Depósito", "Outros"];

/** A opção que destrava o campo livre, nas duas listas. */
export const CATEGORIA_LIVRE = "Outros";

/* "Esta semana" saiu daqui e virou atalho da barra de período — era um
   período disfarçado de situação. O valor continua aceito no serviço, para os
   links antigos não quebrarem. */
export const FILTROS_CONTA = [
  ["abertas", "Em aberto"],
  ["vencidas", "Vencidas"],
  ["pagas", "Baixadas"],
  ["todas", "Todas"],
] as const;

export type OrdemConta = "vencimento" | "vencimento-desc" | "valor-desc" | "valor";

export const ORDENS_CONTA: ReadonlyArray<readonly [OrdemConta, string]> = [
  ["vencimento", "Vencimento (mais perto primeiro)"],
  ["vencimento-desc", "Vencimento (mais longe primeiro)"],
  ["valor-desc", "Maior valor primeiro"],
  ["valor", "Menor valor primeiro"],
];

export type FiltroConta = (typeof FILTROS_CONTA)[number][0] | "semana";

/* Onde o dinheiro está. Espelha o enum do banco; fica aqui repetido porque
   este módulo é neutro e o formulário é Client Component — importar o enum
   gerado do Prisma arrastaria o driver do Postgres para o navegador. */
export const TIPOS_CARTEIRA = [
  ["ESPECIE", "Espécie"],
  ["CONTA", "Conta do banco"],
  ["RESERVA", "Reserva guardada"],
  ["CARTAO", "Cartão de crédito"],
  ["OUTRA", "Outra"],
] as const;

export type TipoCarteira = (typeof TIPOS_CARTEIRA)[number][0];

export function nomeTipoCarteira(t: TipoCarteira): string {
  return TIPOS_CARTEIRA.find(([id]) => id === t)?.[1] ?? "Outra";
}

export type CarteiraSaldo = {
  id: string;
  nome: string;
  tipo: TipoCarteira;
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
  /** O comprovante anexado, para abrir pelo extrato. */
  comprovanteId: string | null;
  /** As carteiras da linha — duas na transferência — para o filtro por carteira. */
  carteiraIds: string[];
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
  /** Quem deve, na conta a receber de venda — a busca e a planilha usam. */
  cliente: string | null;
  vendaId: string | null;
  parcela: string | null;
  /* Compra no crédito: a conta pertence a uma FATURA, e fatura se paga
     inteira. Sem estes dois campos a tela lista três compras onde existe uma
     dívida só, e o botão "Pagar" fica em cima da coisa errada. */
  cartaoId: string | null;
  cartaoNome: string | null;
};

/*
 * O cartão de crédito, do jeito que a tela precisa.
 *
 * Fica no módulo neutro porque o formulário de compra é Client Component e
 * precisa do tipo — importar do serviço arrastaria o Prisma para o navegador.
 */
export type CartaoResumo = {
  id: string;
  nome: string;
  limite: number;
  /** O que estava comprometido ANTES do app — o campo guardado. */
  usadoInicial: number;
  usado: number;
  disponivel: number;
  /** 0 a 100, para a barra. */
  pct: number;
  diaFechamento: number | null;
  diaVencimento: number | null;
  validade: string | null;
  validadeBR: string | null;
  vencido: boolean;
  proximaFatura: { vencimento: Date; total: number; compras: number } | null;
};

export type FaturaLinha = {
  id: string;
  descricao: string;
  valor: number;
  dataCompra: Date | null;
  parcela: string | null;
};

/** Uma linha da agenda: uma conta a pagar ou a receber, com dia e valor. */
export type CompromissoAgenda = {
  id: string;
  tipo: "pagar" | "receber";
  titulo: string;
  quem: string | null;
  valor: number;
  vencimento: Date;
  atrasado: boolean;
  href: string | null;
};

/**
 * Uma entrada que ainda vai acontecer, de qualquer fonte: parcela de venda no
 * crediário, recebimento lançado à mão em contas a receber, ou entrada lançada
 * no caixa com data futura.
 */
export type EntradaPrevista = {
  id: string;
  origem: "crediario" | "recebimento" | "lancamento";
  titulo: string;
  quem: string | null;
  valor: number;
  quando: Date;
  /** Já devia ter entrado: venceu e continua em aberto. */
  atrasado: boolean;
  href: string | null;
  /** Conta a receber pode ser baixada; lançamento futuro entra sozinho no dia. */
  contaId: string | null;
  deVenda: boolean;
};

export const ORIGENS_ENTRADA: ReadonlyArray<readonly [EntradaPrevista["origem"], string]> = [
  ["crediario", "Crediário (parcelas de venda)"],
  ["recebimento", "Recebimentos lançados"],
  ["lancamento", "Entradas com data marcada"],
];

/** Uma semana da previsão de caixa. */
export type SemanaPrevista = {
  inicio: Date;
  fim: Date;
  entra: number;
  sai: number;
  /** Saldo projetado ao fim da semana. */
  saldo: number;
};

/** Um mês no gráfico do caixa. */
export type MesResumo = {
  /** "AAAA-MM" */
  mes: string;
  /** "set", "out" — o rótulo curto embaixo da barra. */
  rotulo: string;
  entradas: number;
  saidas: number;
  saldo: number;
};

/** Uma fatia de "para onde o dinheiro foi". */
export type CategoriaGasto = { categoria: string; valor: number; pct: number };
