"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { itensVisiveis } from "./navegacao";
import { logoutAction } from "@/modules/auth/auth.actions";

/*
 * Barra lateral do monitor, portada do app antigo.
 *
 * Comportamento exato de lá:
 *   - fechada tem 68px e mostra só o ícone, centralizado
 *   - ao passar o mouse (ou receber foco pelo teclado) abre para 244px
 *     e os rótulos aparecem
 *   - o rótulo some por OPACIDADE e LARGURA, nunca por `display:none`:
 *     assim ele continua no documento para leitor de tela e para a busca
 *     do navegador
 *   - a aba atual fica com fundo dourado suave
 *
 * `group-hover` + `focus-within` reproduzem `nav.tabs:hover` e
 * `nav.tabs:focus-within` do CSS antigo — abrir só no hover deixaria a barra
 * inacessível para quem navega por teclado.
 *
 * A ordem segue o caminho do negócio, não a ordem em que as telas nasceram:
 * vende → compra para repor → guarda no estoque → olha o dinheiro →
 * consulta cadastros.
 */
export function BarraLateral({
  permissoes,
  papel,
  nome,
}: {
  permissoes: Permissoes;
  papel: Papel;
  nome: string;
}) {
  const pathname = usePathname();
  const itens = itensVisiveis(permissoes, papel);

  const ativo = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");

  return (
    <nav
      aria-label="Navegação principal"
      data-nav="lateral"
      className={cn(
        "group fixed inset-y-0 left-0 z-60 hidden flex-col overflow-y-auto overflow-x-hidden md:flex",
        "border-r bg-card px-2 py-6",
        "w-(--nav-fechada) hover:w-(--nav-aberta) focus-within:w-(--nav-aberta)",
        "hover:px-4 focus-within:px-4",
        "transition-[width,padding,box-shadow] duration-200 ease-(--ll-ease)",
        "hover:shadow-[4px_0_24px_-10px_rgba(22,21,26,.28)]",
        "focus-within:shadow-[4px_0_24px_-10px_rgba(22,21,26,.28)]",
      )}
    >
      {/*
       * Marca: fechada mostra só o "L"; aberta, a logo inteira.
       *
       * O "L" é RECORTADO da logo oficial (scripts/recortar-l-da-logo.mjs),
       * não digitado numa fonte serifada qualquer. Antes eram dois desenhos
       * diferentes e dava para ver: a letra fechada tinha outro traço, outra
       * espessura e outra serifa que a da marca.
       *
       * E a troca é um CRUZAMENTO, não um corte. Estava `hidden`/`block`, que
       * pisca — a mesma armadilha que os rótulos dos itens já evitavam com
       * opacidade. Os dois ficam empilhados na mesma altura (h-7), então o
       * "L" some enquanto o "aLolla" nasce, sem salto de tamanho.
       */}
      <Link
        href="/"
        aria-label="Início"
        className={cn(
          "relative mb-6 flex h-9 shrink-0 items-center overflow-hidden",
          "justify-center group-hover:justify-start group-focus-within:justify-start",
          "transition-[justify-content] duration-200 ease-(--ll-ease)",
        )}
      >
        <Image
          src="/logo-lalolla-l.png"
          alt=""
          aria-hidden
          width={53}
          height={85}
          priority
          className={cn(
            "h-7 w-auto max-w-none opacity-100 transition-opacity duration-200 ease-(--ll-ease)",
            "group-hover:opacity-0 group-focus-within:opacity-0",
          )}
        />
        <Image
          src="/logo-lalolla.png"
          alt="LaLolla"
          width={353}
          height={90}
          priority
          className={cn(
            "absolute left-0 h-7 w-auto max-w-none opacity-0",
            "transition-opacity duration-200 ease-(--ll-ease)",
            "group-hover:opacity-100 group-focus-within:opacity-100",
          )}
        />
      </Link>

      <div className="flex min-h-0 flex-1 flex-col gap-1">
        {itens.map((i) => {
          const Icone = i.icone;
          const atual = ativo(i.href);
          return (
            <Link
              key={i.href}
              href={i.href}
              /* prefetch: o Next busca a tela ANTES do clique. Como a barra
                 abre no hover, quando o mouse chega no item a tela já está
                 vindo — ao clicar, está pronta. */
              prefetch
              aria-current={atual ? "page" : undefined}
              title={i.nome}
              className={cn(
                "flex items-center overflow-hidden whitespace-nowrap rounded-[11px] p-3 text-sm font-semibold",
                "justify-center gap-0",
                "group-hover:justify-start group-hover:gap-3 group-hover:px-4",
                "group-focus-within:justify-start group-focus-within:gap-3 group-focus-within:px-4",
                "transition-[background-color,color,padding,gap] duration-200 ease-(--ll-ease)",
                atual
                  ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
                  : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
              )}
            >
              <Icone className="size-[19px] shrink-0" aria-hidden />
              {/* opacidade + max-width, nunca display:none */}
              <span
                className={cn(
                  "max-w-0 opacity-0 transition-[opacity,max-width] duration-200 ease-(--ll-ease)",
                  "group-hover:max-w-40 group-hover:opacity-100",
                  "group-focus-within:max-w-40 group-focus-within:opacity-100",
                )}
              >
                {i.nome}
              </span>
            </Link>
          );
        })}
      </div>

      <form action={logoutAction} className="mt-4 shrink-0">
        <button
          type="submit"
          title={`Sair (${nome})`}
          className={cn(
            "flex w-full items-center overflow-hidden whitespace-nowrap rounded-[11px] p-3 text-sm font-semibold",
            "justify-center gap-0 text-muted-foreground",
            "group-hover:justify-start group-hover:gap-3 group-hover:px-4",
            "group-focus-within:justify-start group-focus-within:gap-3 group-focus-within:px-4",
            "transition-[background-color,color,padding,gap] duration-200 ease-(--ll-ease)",
            "hover:bg-(--ll-surface-2) hover:text-foreground",
          )}
        >
          <LogOut className="size-[19px] shrink-0" aria-hidden />
          <span
            className={cn(
              "max-w-0 opacity-0 transition-[opacity,max-width] duration-200 ease-(--ll-ease)",
              "group-hover:max-w-40 group-hover:opacity-100",
              "group-focus-within:max-w-40 group-focus-within:opacity-100",
            )}
          >
            Sair
          </span>
        </button>
      </form>
    </nav>
  );
}
