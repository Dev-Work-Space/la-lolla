"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Area, Permissoes } from "@/modules/usuarios/permissoes";
import {
  Home,
  ShoppingBag,
  ShoppingCart,
  Boxes,
  Wallet,
  Users,
  type LucideIcon,
} from "lucide-react";

/*
 * A navegação que o João desenhou no app antigo, mantida de propósito:
 * Início · Portal de vendas · Portal de compras · Estoque · Financeiro · Cadastros
 *
 * Mesma lista no celular (barra fixa embaixo) e no PC (barra no topo) — uma
 * fonte só, para as duas não divergirem com o tempo.
 */
type Item = { href: string; nome: string; curto: string; icone: LucideIcon; area: Area };

const ITENS: Item[] = [
  { href: "/", nome: "Início", curto: "Início", icone: Home, area: "pecas" },
  { href: "/vendas", nome: "Portal de vendas", curto: "Vendas", icone: ShoppingBag, area: "vendas" },
  { href: "/compras", nome: "Portal de compras", curto: "Compras", icone: ShoppingCart, area: "pecas" },
  { href: "/estoque", nome: "Estoque", curto: "Estoque", icone: Boxes, area: "pecas" },
  { href: "/financeiro", nome: "Financeiro", curto: "Caixa", icone: Wallet, area: "financeiro" },
  { href: "/cadastros", nome: "Cadastros", curto: "Clientes", icone: Users, area: "pessoas" },
];

export function BarraNavegacao({ permissoes, papel }: { permissoes: Permissoes; papel: Papel }) {
  const pathname = usePathname();
  const admin = papel === "ADMIN" || papel === "SUPER_ADMIN";

  // Início é sempre visível; o resto depende da permissão de ver a área.
  const visiveis = ITENS.filter((i) => i.href === "/" || admin || permissoes[i.area]?.ver);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur",
        "md:static md:border-t-0 md:bg-transparent md:backdrop-blur-none",
        // pb com safe-area: no iPhone a barra de gestos come o rodapé
        "pb-[env(safe-area-inset-bottom)] md:pb-0",
      )}
    >
      <div
        className="mx-auto grid w-full max-w-7xl md:hidden"
        style={{ gridTemplateColumns: `repeat(${visiveis.length}, minmax(0, 1fr))` }}
      >
        {visiveis.map((i) => {
          const Icone = i.icone;
          return (
            <Link
              key={i.href}
              href={i.href}
              aria-current={ativo(i.href) ? "page" : undefined}
              className={cn(
                "flex min-w-0 flex-col items-center gap-1 px-1 py-2.5 text-center",
                ativo(i.href) ? "text-foreground" : "text-muted-foreground",
              )}
            >
              <Icone className="size-5 shrink-0" aria-hidden />
              <span className="w-full truncate text-[10px] font-medium leading-none">{i.curto}</span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}

export { ITENS as ITENS_NAV };
