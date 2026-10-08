import type { Icon } from "@phosphor-icons/react";
import { HouseIcon, ShoppingBagIcon, ShoppingCartIcon, PackageIcon, WalletIcon, UsersIcon, UserGearIcon, GearIcon } from "@phosphor-icons/react/ssr";
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
 * As OPÇÕES de cada seção — o que antes eram abas dentro da tela (Peças e
 * Insumos, Clientes e Fornecedores, as abas do Financeiro…). Pedido do João
 * (08/10/2026): "não quero mais abas dentro das abas; ao clicar no botão do
 * menu, aparecem as opções". O endereço de cada opção é o mesmo de antes,
 * então link salvo e aviso do Início continuam abrindo o lugar certo.
 */
export type SubItemNav = {
  href: string;
  nome: string;
  /** Título pequeno que junta opções vizinhas: "Contas", "Fluxo de caixa". */
  grupo?: string;
  /** É a opção da tela aberta? */
  atual: (pathname: string, params: URLSearchParams) => boolean;
  /** Quem vê esta opção, quando não basta ver a seção. */
  pode?: (permissoes: Permissoes) => boolean;
};

export type ItemNav = {
  href: string;
  nome: string;
  curto: string;
  icone: Icon;
  area: Area;
  sub?: SubItemNav[];
  /** Outras rotas que também são desta seção (o orçamento mora em /orcamentos). */
  tambem?: string[];
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

export const ITENS_NAV: ItemNav[] = [
  { href: "/", nome: "Início", curto: "Início", icone: HouseIcon, area: "pecas" },
  {
    href: "/vendas",
    nome: "Portal de vendas",
    curto: "Vendas",
    icone: ShoppingBagIcon,
    area: "vendas",
    tambem: ["/orcamentos"],
    sub: [
      { href: "/vendas", nome: "Vendas", atual: (p, q) => dentro(p, "/vendas") && q.get("aba") !== "orcamentos" },
      {
        href: "/vendas?aba=orcamentos",
        nome: "Orçamentos",
        atual: (p, q) => (p === "/vendas" && q.get("aba") === "orcamentos") || dentro(p, "/orcamentos"),
      },
    ],
  },
  { href: "/compras", nome: "Portal de compras", curto: "Compras", icone: ShoppingCartIcon, area: "pecas" },
  {
    href: "/estoque",
    nome: "Estoque",
    curto: "Estoque",
    icone: PackageIcon,
    area: "pecas",
    sub: [
      {
        href: "/estoque",
        nome: "Peças",
        atual: (p, q) =>
          (p === "/estoque" && q.get("aba") !== "insumos") || (dentro(p, "/estoque") && p !== "/estoque" && !dentro(p, "/estoque/categorias")),
      },
      { href: "/estoque?aba=insumos", nome: "Insumos", atual: (p, q) => p === "/estoque" && q.get("aba") === "insumos" },
      /* Mesma permissão da tela: a lista de categorias é ajuste da loja. */
      { href: "/estoque/categorias", nome: "Categorias", atual: (p) => dentro(p, "/estoque/categorias"), pode: editaAjustes },
    ],
  },
  {
    href: "/financeiro",
    nome: "Financeiro",
    curto: "Caixa",
    icone: WalletIcon,
    area: "financeiro",
    sub: [
      { href: "/financeiro", nome: "Visão geral", atual: fin("geral") },
      { href: "/financeiro?aba=contas&tipo=receber", nome: "A receber", grupo: "Contas", atual: fin("contas", "receber") },
      { href: "/financeiro?aba=contas&tipo=pagar", nome: "A pagar", grupo: "Contas", atual: fin("contas", "pagar") },
      { href: "/financeiro?aba=contas&tipo=calendario", nome: "Calendário", grupo: "Contas", atual: fin("contas", "calendario") },
      { href: "/financeiro?aba=fluxo", nome: "Extrato", grupo: "Fluxo de caixa", atual: fin("fluxo", "realizado") },
      { href: "/financeiro?aba=fluxo&ver=entrar", nome: "Vai entrar", grupo: "Fluxo de caixa", atual: fin("fluxo", "entrar") },
      { href: "/financeiro?aba=fluxo&ver=previsto", nome: "Previsão", grupo: "Fluxo de caixa", atual: fin("fluxo", "previsto") },
      { href: "/financeiro?aba=carteiras", nome: "Carteiras e cartões", atual: fin("carteiras") },
    ],
  },
  {
    href: "/cadastros",
    nome: "Cadastros",
    curto: "Clientes",
    icone: UsersIcon,
    area: "pessoas",
    sub: [
      { href: "/cadastros", nome: "Clientes", atual: (p, q) => p === "/cadastros" && q.get("aba") !== "fornecedores" },
      { href: "/cadastros?aba=fornecedores", nome: "Fornecedores", atual: (p, q) => p === "/cadastros" && q.get("aba") === "fornecedores" },
    ],
  },
  { href: "/usuarios", nome: "Usuários", curto: "Usuários", icone: UserGearIcon, area: "usuarios" },
  /*
   * Ajustes fica por último e só aparece para quem pode editá-lo. O ponto de
   * atenção 5 da documentação diz que hoje a engrenagem abre para qualquer
   * perfil e o Vendedor vê campos que não consegue salvar — aqui ele nem vê o
   * caminho.
   */
  {
    href: "/ajustes",
    nome: "Ajustes",
    curto: "Ajustes",
    icone: GearIcon,
    area: "ajustes",
    sub: [
      { href: "/ajustes", nome: "Da loja", atual: (p) => p === "/ajustes" },
      { href: "/ajustes/etiquetas", nome: "Criação de etiquetas", atual: (p) => dentro(p, "/ajustes/etiquetas") },
    ],
  },
];

/** Início é sempre visível; o resto depende de poder ver a área. */
export function itensVisiveis(permissoes: Permissoes, papel: Papel): ItemNav[] {
  const admin = papel === "ADMIN" || papel === "SUPER_ADMIN";
  return ITENS_NAV.filter((i) => i.href === "/" || admin || permissoes[i.area]?.ver).map((i) =>
    i.sub ? { ...i, sub: i.sub.filter((s) => admin || !s.pode || s.pode(permissoes)) } : i,
  );
}

/** A seção está aberta? Conta as rotas de `tambem`. */
export function secaoAtiva(item: ItemNav, pathname: string): boolean {
  if (item.href === "/") return pathname === "/";
  return [item.href, ...(item.tambem ?? [])].some((h) => dentro(pathname, h));
}

/** A opção acesa dentro da seção, ou nenhuma. */
export function opcaoAtual(item: ItemNav, pathname: string, params: URLSearchParams): SubItemNav | undefined {
  return item.sub?.find((s) => s.atual(pathname, params));
}
