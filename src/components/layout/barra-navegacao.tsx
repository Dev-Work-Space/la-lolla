"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { itensVisiveis } from "./navegacao";

/*
 * Barra fixa de baixo, só no celular. No PC a navegação vive no cabeçalho.
 * A LISTA não mora aqui — está em ./navegacao.ts, que não é módulo cliente e
 * por isso pode ser lido também pelo servidor. Ver o comentário lá.
 *
 * Este componente precisa ser cliente por um motivo só: `usePathname`, para
 * saber qual aba acender.
 */
export function BarraNavegacao({ permissoes, papel }: { permissoes: Permissoes; papel: Papel }) {
  const pathname = usePathname();
  const visiveis = itensVisiveis(permissoes, papel);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden",
        // No iPhone a barra de gestos come o rodapé; isto devolve o espaço.
        "pb-[env(safe-area-inset-bottom)]",
      )}
      aria-label="Navegação principal"
    >
      <div
        className="mx-auto grid w-full max-w-3xl"
        // minmax(0,1fr) e não 1fr: `1fr` é minmax(auto,1fr) e não encolhe
        // abaixo do conteúdo — foi assim que a barra estourou no app antigo.
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
