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
  /* O trilho de verdade: pastilha com o nome embaixo, Início e IA, a linha,
     as quatro categorias e, no pé, ajustes, tema e sair. */
  const item = (k: number) => (
    <span key={k} className="flex shrink-0 flex-col items-center gap-1.5 py-1">
      <span className={cn(BLOCO, "h-8 w-12 rounded-full")} />
      <span className={cn(BLOCO, "h-2 w-10")} />
    </span>
  );
  return (
    <nav
      aria-hidden
      className="fixed inset-y-0 left-0 z-60 hidden w-(--nav-fechada) flex-col items-center border-r bg-card py-4 md:flex"
    >
      <span className="mb-4 grid h-10 w-12 shrink-0 place-items-center">
        <Image src="/logo-lalolla-l.png" alt="" width={53} height={85} priority className="h-7 w-auto" />
      </span>
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1">
        {[0, 1].map(item)}
        <span className="my-1.5 h-px w-8 shrink-0 bg-border" />
        {[2, 3, 4, 5].map(item)}
      </div>
      <div className="mt-2 flex flex-col items-center gap-1">{[6, 7, 8].map(item)}</div>
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
      {/* Início, IA e as quatro categorias — os seis botões da barra de verdade. */}
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
