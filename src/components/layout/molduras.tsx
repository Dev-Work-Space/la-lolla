import Image from "next/image";
import { cn } from "@/lib/utils";

/*
 * Os esqueletos das três barras — o que aparece NA HORA, antes de a sessão
 * chegar do banco.
 *
 * Com o Cache Components a moldura do app é montada de antemão e sai sem
 * esperar ninguém; quem depende da sessão (o nome, os itens que cada perfil
 * pode ver) entra logo depois, no lugar destes blocos. Cada esqueleto usa as
 * MESMAS classes de tamanho e posição da barra de verdade: se um medir
 * diferente do outro, a tela pula quando a sessão chega.
 *
 * Servidor puro, sem "use client" e sem hook: precisa caber na moldura que é
 * montada antes de existir qualquer pedido.
 */

const BLOCO = "animate-pulse rounded-md bg-muted";

export function CabecalhoEsqueleto() {
  return (
    <header
      aria-hidden
      className={cn(
        "fixed inset-x-0 top-0 z-50 border-b bg-card/95 backdrop-blur md:hidden",
        "pt-[env(safe-area-inset-top)]",
      )}
    >
      <div className="flex items-center gap-2 px-3 py-1.5">
        <span className="grid h-10 shrink-0 place-items-center px-1">
          <Image src="/logo-lalolla.png" alt="" width={353} height={90} priority className="h-5 w-auto" />
        </span>
        <div className="ml-auto flex items-center gap-2">
          <span className={cn(BLOCO, "h-3 w-14")} />
          <span className={cn(BLOCO, "size-8 rounded-full")} />
          <span className={cn(BLOCO, "h-8 w-12")} />
        </div>
      </div>
    </header>
  );
}

export function BarraLateralEsqueleto() {
  return (
    <nav
      aria-hidden
      className={cn(
        "fixed inset-y-0 left-0 z-60 hidden flex-col overflow-hidden md:flex",
        "w-(--nav-fechada) border-r bg-card py-6 px-(--nav-recuo)",
      )}
    >
      <span className="mb-6 flex h-9 shrink-0 items-center">
        <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
          <Image src="/logo-lalolla-l.png" alt="" width={53} height={85} priority className="h-7 w-auto max-w-none" />
        </span>
      </span>
      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {Array.from({ length: 7 }, (_, i) => (
          <span key={i} className="flex h-11 shrink-0 items-center">
            <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
              <span className={cn(BLOCO, "size-[19px] rounded-full")} />
            </span>
          </span>
        ))}
      </div>
      {Array.from({ length: 2 }, (_, i) => (
        <span key={i} className={cn("flex h-11 shrink-0 items-center", i === 0 ? "mt-4" : "mt-1")}>
          <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
            <span className={cn(BLOCO, "size-[19px] rounded-full")} />
          </span>
        </span>
      ))}
    </nav>
  );
}

export function BarraNavegacaoEsqueleto() {
  return (
    <nav
      aria-hidden
      className={cn(
        "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden",
        "pb-[env(safe-area-inset-bottom)]",
      )}
    >
      <div className="mx-auto grid h-(--nav-inferior) w-full max-w-3xl grid-cols-6 items-center">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className="flex flex-col items-center justify-center gap-1.5">
            <span className={cn(BLOCO, "size-5 rounded-full")} />
            <span className={cn(BLOCO, "h-2 w-9")} />
          </span>
        ))}
      </div>
    </nav>
  );
}
