import type { Icon } from "@phosphor-icons/react";
import { HouseIcon, StorefrontIcon, PackageIcon, WalletIcon, UsersIcon, GearIcon } from "@phosphor-icons/react/ssr";
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
  /** Título pequeno que junta opções vizinhas: "Contas", "Fluxo de caixa". */
  grupo?: string;
  /** Quem pode ver a TELA — a opção some para quem não pode. */
  area?: Area;
  /** Regra extra além da área (ex.: categorias exigem editar os ajustes). */
  pode?: (permissoes: Permissoes) => boolean;
  /** Só com o assistente ligado (a chave do Gemini existe no servidor). */
  ia?: boolean;
  /** É a opção da tela aberta? */
  atual: (pathname: string, params: URLSearchParams) => boolean;
};

export type CategoriaNav = {
  id: string;
  nome: string;
  /** Rótulo da barra de baixo do celular, onde cabem ~12 letras. */
  curto: string;
  icone: Icon;
  opcoes: OpcaoNav[];
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

export const CATEGORIAS_NAV: CategoriaNav[] = [
  {
    id: "inicio",
    nome: "Início",
    curto: "Início",
    icone: HouseIcon,
    opcoes: [
      { href: "/", nome: "Início", atual: (p) => p === "/" },
      /* O assistente era um robô flutuando em toda tela; o João pediu que
         virasse opção do Início, sem o ícone. */
      { href: "/ia", nome: "IA", ia: true, atual: (p) => dentro(p, "/ia") },
    ],
  },
  {
    id: "comercio",
    nome: "Compra e venda",
    curto: "Compra/venda",
    icone: StorefrontIcon,
    opcoes: [
      { href: "/vendas", nome: "Vendas", area: "vendas", atual: (p, q) => dentro(p, "/vendas") && q.get("aba") !== "orcamentos" },
      {
        href: "/vendas?aba=orcamentos",
        nome: "Orçamentos",
        area: "vendas",
        atual: (p, q) => (p === "/vendas" && q.get("aba") === "orcamentos") || dentro(p, "/orcamentos"),
      },
      { href: "/compras", nome: "Compras", area: "pecas", atual: (p) => dentro(p, "/compras") },
    ],
  },
  {
    id: "estoque",
    nome: "Estoque",
    curto: "Estoque",
    icone: PackageIcon,
    opcoes: [
      {
        href: "/estoque",
        nome: "Peças",
        area: "pecas",
        atual: (p, q) =>
          (p === "/estoque" && q.get("aba") !== "insumos") || (dentro(p, "/estoque") && p !== "/estoque" && !dentro(p, "/estoque/categorias")),
      },
      { href: "/estoque?aba=insumos", nome: "Insumos", area: "pecas", atual: (p, q) => p === "/estoque" && q.get("aba") === "insumos" },
      /* Mesma permissão da tela: a lista de categorias é ajuste da loja. */
      { href: "/estoque/categorias", nome: "Categorias", area: "pecas", pode: editaAjustes, atual: (p) => dentro(p, "/estoque/categorias") },
    ],
  },
  {
    id: "financeiro",
    nome: "Financeiro",
    curto: "Caixa",
    icone: WalletIcon,
    opcoes: [
      { href: "/financeiro", nome: "Visão geral", area: "financeiro", atual: fin("geral") },
      { href: "/financeiro?aba=contas&tipo=receber", nome: "A receber", grupo: "Contas", area: "financeiro", atual: fin("contas", "receber") },
      { href: "/financeiro?aba=contas&tipo=pagar", nome: "A pagar", grupo: "Contas", area: "financeiro", atual: fin("contas", "pagar") },
      { href: "/financeiro?aba=contas&tipo=calendario", nome: "Calendário", grupo: "Contas", area: "financeiro", atual: fin("contas", "calendario") },
      { href: "/financeiro?aba=fluxo", nome: "Extrato", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "realizado") },
      { href: "/financeiro?aba=fluxo&ver=entrar", nome: "Vai entrar", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "entrar") },
      { href: "/financeiro?aba=fluxo&ver=previsto", nome: "Previsão", grupo: "Fluxo de caixa", area: "financeiro", atual: fin("fluxo", "previsto") },
      { href: "/financeiro?aba=carteiras", nome: "Carteiras e cartões", area: "financeiro", atual: fin("carteiras") },
    ],
  },
  {
    id: "cadastros",
    nome: "Cadastros",
    curto: "Cadastros",
    icone: UsersIcon,
    opcoes: [
      { href: "/cadastros", nome: "Clientes", area: "pessoas", atual: (p, q) => p === "/cadastros" && q.get("aba") !== "fornecedores" },
      { href: "/cadastros?aba=fornecedores", nome: "Fornecedores", area: "pessoas", atual: (p, q) => p === "/cadastros" && q.get("aba") === "fornecedores" },
      { href: "/usuarios", nome: "Usuários", area: "usuarios", atual: (p) => dentro(p, "/usuarios") },
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
export function categoriasVisiveis(permissoes: Permissoes, papel: Papel, temIA: boolean): CategoriaNav[] {
  const admin = ehAdmin(papel);
  return CATEGORIAS_NAV.map((c) => ({
    ...c,
    opcoes: c.opcoes.filter(
      (o) =>
        (!o.ia || temIA) &&
        (admin || ((!o.area || permissoes[o.area]?.ver === true) && (!o.pode || o.pode(permissoes)))),
    ),
  })).filter((c) => c.opcoes.length > 0);
}

/** A opção acesa dentro da categoria, ou nenhuma. */
export function opcaoAtual(c: CategoriaNav, pathname: string, params: URLSearchParams): OpcaoNav | undefined {
  return c.opcoes.find((o) => o.atual(pathname, params));
}
