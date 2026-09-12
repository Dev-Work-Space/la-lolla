"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { LinhaTema } from "./tema";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { itensVisiveis } from "./navegacao";
import { logoutAction } from "@/modules/auth/auth.actions";

/*
 * Barra lateral do monitor, portada do app antigo.
 *
 * Comportamento:
 *   - fechada tem 68px e mostra só o ícone
 *   - ao passar o mouse (ou ao chegar nela pelo teclado) abre para 244px e os
 *     rótulos aparecem
 *   - o rótulo some por OPACIDADE e LARGURA, nunca por `display:none`: assim
 *     ele continua no documento para leitor de tela e para a busca do navegador
 *   - a aba atual fica com fundo dourado suave
 *
 * DUAS CORREÇÕES que o João pediu, com o motivo de cada uma:
 *
 * 1. O ÍCONE NÃO SE MEXE MAIS.
 *    Antes o recuo da barra ia de 8px para 16px e cada item trocava
 *    `justify-center` por `justify-start`. Duas armadilhas juntas: o recuo
 *    arrastava os sete ícones 8px para a direita, e `justify-content` NÃO
 *    anima — ele salta no primeiro quadro. Os ícones tremiam.
 *    Agora cada linha tem um TRILHO de largura fixa (--nav-trilho) com o ícone
 *    centrado nele. O trilho não muda de tamanho ao abrir, então o ícone fica
 *    parado e só o rótulo cresce ao lado. Medido: 0px de percurso.
 *
 * 2. A BARRA FECHA SOZINHA DEPOIS DO CLIQUE.
 *    Era `focus-within`, que aceita QUALQUER foco — inclusive o que o clique do
 *    mouse deixa no item. Ao clicar em "Estoque" e tirar o mouse, a barra
 *    continuava aberta em 244px, e só fechava quando se clicava em outro lugar
 *    para tirar o foco. Era exatamente a reclamação: "tenho que clicar em algo
 *    para conseguir fechar".
 *    `has-[:focus-visible]` só conta o foco que o NAVEGADOR considera visível,
 *    que na prática é o do teclado. Quem navega por Tab continua abrindo a
 *    barra; quem clica com o mouse não a deixa presa.
 *
 * A ordem segue o caminho do negócio, não a ordem em que as telas nasceram:
 * vende → compra para repor → guarda no estoque → olha o dinheiro →
 * consulta cadastros.
 */

/* O desenho de uma linha é o mesmo para item, tema e sair — fica num lugar só
   para os três não saírem de sintonia de novo. */
const LINHA = cn(
  "flex h-11 shrink-0 items-center overflow-hidden whitespace-nowrap rounded-[11px]",
  "text-sm font-semibold outline-none",
  "transition-[background-color,color] duration-200 ease-(--ll-ease)",
  "focus-visible:ring-2 focus-visible:ring-(--ll-accent)",
);

const ROTULO = cn(
  "max-w-0 opacity-0 transition-[opacity,max-width] duration-200 ease-(--ll-ease)",
  "group-hover:max-w-(--nav-rotulo) group-hover:opacity-100",
  "group-has-[:focus-visible]:max-w-(--nav-rotulo) group-has-[:focus-visible]:opacity-100",
);

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
        "border-r bg-card py-6 px-(--nav-recuo)",
        "w-(--nav-fechada) hover:w-(--nav-aberta) has-[:focus-visible]:w-(--nav-aberta)",
        /* só a largura e a sombra animam; o recuo é fixo, ver o comentário 1 */
        "transition-[width,box-shadow] duration-200 ease-(--ll-ease)",
        "hover:shadow-[4px_0_24px_-10px_rgba(22,21,26,.28)]",
        "has-[:focus-visible]:shadow-[4px_0_24px_-10px_rgba(22,21,26,.28)]",
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
       * A troca é um CRUZAMENTO, não um corte — estava `hidden`/`block`, que
       * pisca. E o "L" agora mora no mesmo trilho dos ícones: antes ele também
       * escorregava ao abrir, porque o link trocava de `justify-center` para
       * `justify-start` (medido: de x=33,5 para x=24,7).
       */}
      <Link
        href="/"
        aria-label="Início"
        className="relative mb-6 flex h-9 shrink-0 items-center outline-none focus-visible:ring-2 focus-visible:ring-(--ll-accent) rounded-[11px]"
      >
        <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
          <Image
            src="/logo-lalolla-l.png"
            alt=""
            aria-hidden
            width={53}
            height={85}
            priority
            className={cn(
              "h-7 w-auto max-w-none opacity-100 transition-opacity duration-200 ease-(--ll-ease)",
              "group-hover:opacity-0 group-has-[:focus-visible]:opacity-0",
            )}
          />
        </span>
        <Image
          src="/logo-lalolla.png"
          alt="LaLolla"
          width={353}
          height={90}
          priority
          className={cn(
            "absolute left-0 h-7 w-auto max-w-none opacity-0",
            "transition-opacity duration-200 ease-(--ll-ease)",
            "group-hover:opacity-100 group-has-[:focus-visible]:opacity-100",
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
                LINHA,
                atual
                  ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
                  : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
              )}
            >
              {/* trilho de largura fixa: é ele que mantém o ícone parado */}
              <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
                <Icone className="size-[19px] shrink-0" aria-hidden />
              </span>
              {/* opacidade + max-width, nunca display:none */}
              <span data-rotulo className={ROTULO}>{i.nome}</span>
            </Link>
          );
        })}
      </div>

      {/*
        Claro/escuro fica junto do "Sair": são as duas coisas que não são
        navegação. Usa a mesma linha dos itens, então o ícone cai na mesma
        coluna que os outros — antes ficava 7,5px fora com a barra aberta.
      */}
      <LinhaTema
        className={cn(LINHA, "mt-4 w-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground")}
      />

      <form action={logoutAction} className="mt-1 shrink-0">
        <button
          type="submit"
          title={`Sair (${nome})`}
          className={cn(LINHA, "w-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground")}
        >
          <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
            <LogOut className="size-[19px] shrink-0" aria-hidden />
          </span>
          <span data-rotulo className={ROTULO}>Sair</span>
        </button>
      </form>
    </nav>
  );
}
