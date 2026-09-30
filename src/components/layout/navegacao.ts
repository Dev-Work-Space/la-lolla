import type { Icon } from "@phosphor-icons/react";
import { HouseIcon, ShoppingBagIcon, ShoppingCartIcon, PackageIcon, WalletIcon, UsersIcon, GearIcon } from "@phosphor-icons/react/ssr";
import type { Papel } from "@prisma/client";
import type { Area, Permissoes } from "@/modules/usuarios/permissoes";

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

export type ItemNav = {
  href: string;
  nome: string;
  curto: string;
  icone: Icon;
  area: Area;
};

export const ITENS_NAV: ItemNav[] = [
  { href: "/", nome: "Início", curto: "Início", icone: HouseIcon, area: "pecas" },
  { href: "/vendas", nome: "Portal de vendas", curto: "Vendas", icone: ShoppingBagIcon, area: "vendas" },
  { href: "/compras", nome: "Portal de compras", curto: "Compras", icone: ShoppingCartIcon, area: "pecas" },
  { href: "/estoque", nome: "Estoque", curto: "Estoque", icone: PackageIcon, area: "pecas" },
  { href: "/financeiro", nome: "Financeiro", curto: "Caixa", icone: WalletIcon, area: "financeiro" },
  { href: "/cadastros", nome: "Cadastros", curto: "Clientes", icone: UsersIcon, area: "pessoas" },
  /*
   * Ajustes fica por último e só aparece para quem pode editá-lo. O ponto de
   * atenção 5 da documentação diz que hoje a engrenagem abre para qualquer
   * perfil e o Vendedor vê campos que não consegue salvar — aqui ele nem vê o
   * caminho.
   */
  { href: "/ajustes", nome: "Ajustes", curto: "Ajustes", icone: GearIcon, area: "ajustes" },
];

/** Início é sempre visível; o resto depende de poder ver a área. */
export function itensVisiveis(permissoes: Permissoes, papel: Papel): ItemNav[] {
  const admin = papel === "ADMIN" || papel === "SUPER_ADMIN";
  return ITENS_NAV.filter((i) => i.href === "/" || admin || permissoes[i.area]?.ver);
}
