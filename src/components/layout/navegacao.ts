import type { Icon } from "@phosphor-icons/react";
import {
  ArchiveIcon,
  CalendarBlankIcon,
  ChartLineUpIcon,
  ChartPieSliceIcon,
  CreditCardIcon,
  DiamondIcon,
  FileTextIcon,
  GearIcon,
  HandCoinsIcon,
  HouseIcon,
  InvoiceIcon,
  ListBulletsIcon,
  PackageIcon,
  ShoppingBagIcon,
  ShoppingCartIcon,
  SparkleIcon,
  StorefrontIcon,
  TagIcon,
  TrendUpIcon,
  TruckIcon,
  UserGearIcon,
  UserIcon,
  UsersIcon,
  WalletIcon,
} from "@phosphor-icons/react/ssr";
import type { Papel } from "@prisma/client";
import type { Area, Permissoes } from "@/modules/usuarios/permissoes";
import { abaDaUrl } from "@/modules/financeiro/abas";

/*
 * A lista de navegação mora AQUI, num módulo sem "use client", e não dentro
 * do componente da barra.
 *
 * O motivo é uma regra do App Router que custou um 500 em produção: quando um
 * Server Component importa algo de um módulo marcado com "use client", ele
 * não recebe o valor — recebe uma REFERÊNCIA para o cliente. Na prática o
 * array virava um objeto opaco e `ITENS.filter` estourava
 * "is not a function".
 *
 * Módulo neutro como este pode ser importado pelos dois lados.
 */

/*
 * O menu em CATEGORIAS, e cada categoria com as suas opções.
 *
 * Pedidos do João: em 08/10/2026 as abas de dentro das telas viraram opções
 * do menu ("não quero abas dentro das abas"); no mesmo dia ele pediu que o
 * menu tivesse categorias antes de mostrar tudo — "compra/venda, e aí as
 * opções de portal de vendas e de compras". A categoria agrupa pelo que se
 * está fazendo, não pela tela em que o código mora: Compras saiu de item
 * solto e foi para junto das vendas, Usuários foi para Cadastros.
 *
 * O endereço de cada opção é o mesmo de antes, então link salvo e aviso do
 * Início continuam abrindo o lugar certo.
 */
export type OpcaoNav = {
  href: string;
  nome: string;
  icone: Icon;
  /** Uma frase do que tem lá — o painel do PC mostra embaixo do nome. */
  desc: string;
  /** Título pequeno que junta opções vizinhas: "Contas", "Fluxo de caixa". */
  grupo?: string;
  /** Quem pode ver a TELA — a opção some para quem não pode. */
  area?: Area;
  /** Regra extra além da área (ex.: categorias exigem editar os ajustes). */
  pode?: (permissoes: Permissoes) => boolean;
  /** É a opção da tela aberta? */
  atual: (pathname: string, params: URLSearchParams) => boolean;
};

/** Atalho de criar no topo do painel da categoria: "Nova venda", mostrado
    curto ("Venda") num quadradinho com o "+". */
export type AcaoNav = { href: string; nome: string; curto: string; area: Area };

export type CategoriaNav = {
  id: string;
  nome: string;
  /** Rótulo embaixo do ícone no trilho do PC: ~10 letras por linha, até 2. */
  curto: string;
  desc: string;
  icone: Icon;
  opcoes: OpcaoNav[];
  acoes?: AcaoNav[];
};

const dentro = (pathname: string, href: string) => pathname === href || pathname.startsWith(href + "/");
const editaAjustes = (p: Permissoes) => p.ajustes?.editar === true;

/* O Financeiro lê a URL com a MESMA função da página, inclusive os endereços
   antigos (?aba=pagar, ?aba=caixa…): menu e tela não podem discordar. */
const fin = (qual: string, tipoOuVer?: string) => (pathname: string, params: URLSearchParams) => {
  if (pathname !== "/financeiro") return false;
  const a = abaDaUrl(params.get("aba") ?? undefined, params.get("tipo") ?? undefined, params.get("ver") ?? undefined);
  if (a.qual !== qual) return false;
  if (!tipoOuVer) return true;
  return qual === "contas" ? a.tipo === tipoOuVer : a.ver === tipoOuVer;
};

/*
 * Início e IA ficam FIXOS no topo, fora das categorias — pedido do João: são
 * botões de um toque só, sem lista para abrir. A IA era um robô flutuando
 * em toda tela; virou lugar próprio no menu.
 */
export type FixoNav = { href: string; nome: string; icone: Icon; ia?: boolean; atual: (pathname: string) => boolean };

export const FIXOS_NAV: FixoNav[] = [
  { href: "/", nome: "Início", icone: HouseIcon, atual: (p) => p === "/" },
  { href: "/ia", nome: "IA", icone: SparkleIcon, ia: true, atual: (p) => dentro(p, "/ia") },
];

export function fixosVisiveis(temIA: boolean): FixoNav[] {
  return FIXOS_NAV.filter((f) => !f.ia || temIA);
}

export const CATEGORIAS_NAV: CategoriaNav[] = [
  {
    id: "comercio",
    nome: "Compra e venda",
    curto: "Compra e venda",
    desc: "O que sai da loja e o que chega nela",
    icone: StorefrontIcon,
    acoes: [
      { href: "/vendas/nova", nome: "Nova venda", curto: "Venda", area: "vendas" },
      { href: "/orcamentos/novo", nome: "Novo orçamento", curto: "Orçamento", area: "vendas" },
      { href: "/compras/nova", nome: "Nova compra", curto: "Compra", area: "pecas" },
    ],
    opcoes: [
      { href: "/vendas", nome: "Vendas", icone: ShoppingBagIcon, desc: "Fechadas, a prazo e devolvidas", area: "vendas", atual: (p, q) => dentro(p, "/vendas") && q.get("aba") !== "orcamentos" },
      {
        href: "/vendas?aba=orcamentos",
        nome: "Orçamentos",
        icone: FileTextIcon,
        desc: "Propostas antes de fechar",
        area: "vendas",
        atual: (p, q) => (p === "/vendas" && q.get("aba") === "orcamentos") || dentro(p, "/orcamentos"),
      },
      { href: "/compras", nome: "Compras", icone: ShoppingCartIcon, desc: "Pedidos aos fornecedores", area: "pecas", atual: (p) => dentro(p, "/compras") },
    ],
  },
  {
    id: "estoque",
    nome: "Estoque",
    curto: "Estoque",
    desc: "As peças e o que se usa para vender",
    icone: PackageIcon,
    opcoes: [
      {
        href: "/estoque",
        nome: "Peças",
        icone: DiamondIcon,
        desc: "Catálogo, preço e saldo",
        area: "pecas",
        atual: (p, q) =>
          (p === "/estoque" && q.get("aba") !== "insumos") || (dentro(p, "/estoque") && p !== "/estoque" && !dentro(p, "/estoque/categorias")),
      },
      { href: "/estoque?aba=insumos", nome: "Insumos", icone: ArchiveIcon, desc: "Embalagens e materiais", area: "pecas", atual: (p, q) => p === "/estoque" && q.get("aba") === "insumos" },
      /* Mesma permissão da tela: a lista de categorias é ajuste da loja. */
      { href: "/estoque/categorias", nome: "Categorias", icone: TagIcon, desc: "Os grupos do catálogo", area: "pecas", pode: editaAjustes, atual: (p) => dentro(p, "/estoque/categorias") },
    ],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    curto: "Financeiro",
    desc: "Caixa, contas e o que vem pela frente",
    icone: WalletIcon,
    opcoes: [
      { href: "/financeiro", nome: "Visão geral", icone: ChartPieSliceIcon, desc: "Resultado e o que vence", area: "financeiro", atual: fin("geral") },
      { href: "/financeiro?aba=contas&tipo=receber", nome: "A receber", icone: HandCoinsIcon, desc: "Parcelas e recebimentos", grupo: "Contas", area: "financeiro", atual: fin("contas", "receber") },
      { href: "/financeiro?aba=contas&tipo=pagar", nome: "A pagar", icone: InvoiceIcon, desc: "O que vence e quando", grupo: "Contas", area: "financeiro", atual: fin("contas", "pagar") },
      { href: "/financeiro?aba=contas&tipo=calendario", nome: "Calendário", icone: CalendarBlankIcon, desc: "As contas no mês", grupo: "Contas", area: "financeiro", atual: fin("contas", "calendario") },
      { href: "/financeiro?aba=fluxo", nome: "Extrato", icone: ListBulletsIcon, desc: "O que entrou e saiu", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "realizado") },
      { href: "/financeiro?aba=fluxo&ver=entrar", nome: "Vai entrar", icone: TrendUpIcon, desc: "Tudo que a loja vai receber", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "entrar") },
      { href: "/financeiro?aba=fluxo&ver=previsto", nome: "Previsão", icone: ChartLineUpIcon, desc: "O caixa nas próximas semanas", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "previsto") },
      { href: "/financeiro?aba=carteiras", nome: "Carteiras e cartões", icone: CreditCardIcon, desc: "Onde o dinheiro está", area: "financeiro", atual: fin("carteiras") },
    ],
  },
  {
    id: "cadastros",
    nome: "Cadastros",
    curto: "Cadastros",
    desc: "As pessoas da loja",
    icone: UsersIcon,
    opcoes: [
      { href: "/cadastros", nome: "Clientes", icone: UserIcon, desc: "Quem compra, quem deve, quem sumiu", area: "pessoas", atual: (p, q) => p === "/cadastros" && q.get("aba") !== "fornecedores" },
      { href: "/cadastros?aba=fornecedores", nome: "Fornecedores", icone: TruckIcon, desc: "Quem vende para a loja", area: "pessoas", atual: (p, q) => p === "/cadastros" && q.get("aba") === "fornecedores" },
      { href: "/usuarios", nome: "Usuários", icone: UserGearIcon, desc: "A equipe e o acesso de cada um", area: "usuarios", atual: (p) => dentro(p, "/usuarios") },
    ],
  },
];

/*
 * Ajustes fica FORA das categorias, lá embaixo junto do tema e do "Sair"
 * (pedido do João): é configuração, não lugar de trabalho. E só aparece para
 * quem pode — o ponto de atenção 5 da documentação diz que o Vendedor via
 * campos que não conseguia salvar; aqui ele nem vê o caminho.
 */
export const AJUSTES_NAV = { href: "/ajustes", nome: "Ajustes", icone: GearIcon } as const;

const ehAdmin = (papel: Papel) => papel === "ADMIN" || papel === "SUPER_ADMIN";

export function veAjustes(permissoes: Permissoes, papel: Papel): boolean {
  return ehAdmin(papel) || permissoes.ajustes?.ver === true;
}

/**
 * As categorias que esta pessoa vê, cada uma só com as opções que ela pode
 * abrir. Categoria sem nenhuma opção some.
 */
export function categoriasVisiveis(permissoes: Permissoes, papel: Papel): CategoriaNav[] {
  const admin = ehAdmin(papel);
  return CATEGORIAS_NAV.map((c) => ({
    ...c,
    opcoes: c.opcoes.filter(
      (o) => admin || ((!o.area || permissoes[o.area]?.ver === true) && (!o.pode || o.pode(permissoes))),
    ),
    /* O atalho de criar só aparece para quem pode criar ali — a tela de
       destino confere de novo, mas não se oferece porta que não abre. */
    acoes: c.acoes?.filter((a) => admin || permissoes[a.area]?.criar === true),
  })).filter((c) => c.opcoes.length > 0);
}

/** A opção acesa dentro da categoria, ou nenhuma. */
export function opcaoAtual(c: CategoriaNav, pathname: string, params: URLSearchParams): OpcaoNav | undefined {
  return c.opcoes.find((o) => o.atual(pathname, params));
}
