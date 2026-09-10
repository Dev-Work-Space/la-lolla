import Link from "next/link";
import { cn } from "@/lib/utils";
import { logoutAction } from "@/modules/auth/auth.actions";
import { Button } from "@/components/ui/button";
import { ITENS_NAV } from "./barra-navegacao";
import type { Sessao } from "@/lib/auth/sessao";

/*
 * Server Component: o cabeçalho não tem estado nem evento, só um formulário
 * de logout que é uma Server Action. Nada disto precisa ir para o navegador.
 */
export function Cabecalho({ sessao }: { sessao: Sessao }) {
  const admin = sessao.papel === "ADMIN" || sessao.papel === "SUPER_ADMIN";
  const visiveis = ITENS_NAV.filter(
    (i) => i.href === "/" || admin || sessao.permissoes[i.area]?.ver,
  );

  return (
    <header className="sticky top-0 z-40 border-b bg-background/95 backdrop-blur">
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3">
        <Link href="/" className="flex shrink-0 items-baseline gap-1.5">
          <span className="font-serif text-lg font-bold tracking-tight">LaLolla</span>
          <span className="hidden text-[8px] font-bold uppercase tracking-[0.35em] text-amber-700 sm:inline dark:text-amber-500">
            semijoias
          </span>
        </Link>

        {/* No PC a navegação vive aqui em cima; no celular, na barra de baixo */}
        <nav className="hidden min-w-0 flex-1 items-center gap-1 md:flex">
          {visiveis.map((i) => (
            <Link
              key={i.href}
              href={i.href}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm font-medium text-muted-foreground",
                "transition-colors hover:bg-accent hover:text-foreground",
              )}
            >
              {i.nome}
            </Link>
          ))}
        </nav>

        <div className="ml-auto flex items-center gap-3">
          <span className="hidden text-sm text-muted-foreground sm:inline">{sessao.nome}</span>
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" size="sm">
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
