import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/modules/auth/auth.actions";
import { Button } from "@/components/ui/button";
import type { Sessao } from "@/lib/auth/sessao";

/*
 * Cabeçalho do CELULAR. No monitor ele não existe: lá a navegação inteira
 * mora na barra lateral expansiva, como no app antigo.
 *
 * Server Component: só a logo e um formulário de logout, que é Server Action.
 */
export function Cabecalho({ sessao }: { sessao: Sessao }) {
  return (
    <header className="sticky top-0 z-40 border-b bg-card/95 backdrop-blur md:hidden">
      <div className="flex items-center gap-3 px-4 py-2">
        <Link href="/" className="shrink-0">
          <Image
            src="/logo-lalolla.png"
            alt="LaLolla"
            width={353}
            height={90}
            priority
            className="h-5 w-auto"
          />
        </Link>
        <div className="ml-auto flex items-center gap-2">
          <span className="max-w-28 truncate text-xs text-muted-foreground">{sessao.nome}</span>
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
