import Image from "next/image";
import Link from "next/link";
import { logoutAction } from "@/modules/auth/auth.actions";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { BotaoTema } from "./tema";
import type { Sessao } from "@/lib/auth/sessao";

/*
 * Cabeçalho do CELULAR. No monitor ele não existe: lá a navegação inteira
 * mora na barra lateral expansiva, como no app antigo.
 *
 * Server Component: só a logo e um formulário de logout, que é Server Action.
 */
export function Cabecalho({ sessao }: { sessao: Sessao }) {
  return (
    /*
     * FIXO no celular, não só "sticky" — pedido do João: "quando for pra
     * baixo ou pra cima ela continua aparecendo".
     *
     * E `pt-[env(safe-area-inset-top)]`: instalado como app, não existe barra
     * do Safari por cima, e o cabeçalho precisa ocupar também a faixa do
     * relógio e da bateria. Sem isso sobra uma tira de fundo diferente no
     * topo, que é justamente o "não completa até lá em cima".
     */
    <header
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b bg-card/95 backdrop-blur md:hidden",
        "pt-[env(safe-area-inset-top)]",
      )}
    >
      {/*
        Alvo de dedo em tudo que se toca aqui.
        A sonda de celular pegou: a logo tinha 20px de altura clicável e o
        "Sair" 28px. No balcão, com a mão ocupada, 20px é errar.
      */}
      <div className="flex items-center gap-2 px-3 py-1.5">
        <Link href="/" aria-label="Início" className="grid h-10 shrink-0 place-items-center px-1">
          <Image
            src="/logo-lalolla.png"
            alt="LaLolla"
            width={353}
            height={90}
            priority
            className="h-5 w-auto"
          />
        </Link>
        <div className="ml-auto flex items-center gap-0.5">
          <span className="max-w-20 truncate text-xs text-muted-foreground">{sessao.nome}</span>
          <BotaoTema className="size-10" />
          <form action={logoutAction}>
            <Button type="submit" variant="ghost" className="h-10 px-3">
              Sair
            </Button>
          </form>
        </div>
      </div>
    </header>
  );
}
