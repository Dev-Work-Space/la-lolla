"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { CaretDownIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { LinhaTema } from "./tema";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { itensVisiveis, opcaoAtual, secaoAtiva, type ItemNav } from "./navegacao";
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
 * 3. AS ABAS DAS TELAS MORAM AQUI (08/10/2026).
 *    "Não quero abas dentro das abas": Peças/Insumos, Clientes/Fornecedores,
 *    as abas do Financeiro… viraram opções embaixo da seção. A seção da tela
 *    aberta já vem com as opções à mostra; as outras abrem na setinha.
 *    Fechada, a barra esconde as opções — no trilho de 68px não há onde
 *    escrever, e a tela diz no título onde se está.
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
  const params = useSearchParams();
  const itens = itensVisiveis(permissoes, papel);
  /* Aberta ou fechada pela setinha. Sem escolha, vale "aberta se é a seção
     da tela" — e trocar de seção não deixa a anterior pendurada aberta. */
  const [escolha, setEscolha] = useState<Record<string, boolean>>({});

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

      {/* `shrink-0` e não `min-h-0`: com as opções abertas a lista fica mais
          alta que a tela, e encolhida ela passava por cima do "Sair". Assim
          quem rola é a barra. */}
      <div className="flex flex-1 shrink-0 flex-col gap-1">
        {itens.map((i) => {
          const Icone = i.icone;
          const atual = secaoAtiva(i, pathname);
          const temOpcoes = (i.sub?.length ?? 0) > 1;
          const mostra = temOpcoes && (escolha[i.href] ?? atual);
          return (
            <div key={i.href} className="flex shrink-0 flex-col">
              <div className="relative">
                <Link
                  href={i.href}
                  /* prefetch: o Next busca a tela ANTES do clique. Como a barra
                     abre no hover, quando o mouse chega no item a tela já está
                     vindo — ao clicar, está pronta. */
                  prefetch
                  aria-current={atual ? "page" : undefined}
                  title={i.nome}
                  className={cn(
                    LINHA,
                    temOpcoes && "pr-9",
                    atual
                      ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
                      : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
                  )}
                >
                  {/* trilho de largura fixa: é ele que mantém o ícone parado */}
                  <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
                    <Icone weight="regular" className="size-[19px] shrink-0" aria-hidden />
                  </span>
                  {/* opacidade + max-width, nunca display:none */}
                  <span data-rotulo className={ROTULO}>{i.nome}</span>
                </Link>
                {temOpcoes && (
                  <button
                    type="button"
                    onClick={() => setEscolha((e) => ({ ...e, [i.href]: !mostra }))}
                    aria-expanded={mostra}
                    aria-label={`${mostra ? "Esconder" : "Mostrar"} as opções de ${i.nome}`}
                    className={cn(
                      "absolute top-1/2 right-1 grid size-8 -translate-y-1/2 place-items-center rounded-lg text-muted-foreground outline-none",
                      "hover:bg-card hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--ll-accent)",
                      /* Some com a barra fechada, como o rótulo — mas continua no
                         Tab, e o foco do teclado abre a barra. */
                      "pointer-events-none opacity-0 transition-opacity duration-200",
                      "group-hover:pointer-events-auto group-hover:opacity-100",
                      "group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100",
                    )}
                  >
                    <CaretDownIcon weight="bold" className={cn("size-3.5 transition-transform duration-200", mostra && "rotate-180")} aria-hidden />
                  </button>
                )}
              </div>
              {mostra && <Opcoes item={i} pathname={pathname} params={params} />}
            </div>
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
        <Button
          variant="ghost"
          type="submit"
          title={`Sair (${nome})`}
          className={cn("h-auto justify-start gap-0 border-0 p-0 font-normal whitespace-normal", LINHA, "w-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground")}
        >
          <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
            <SignOutIcon weight="regular" className="size-[19px] shrink-0" aria-hidden />
          </span>
          <span data-rotulo className={ROTULO}>Sair</span>
        </Button>
      </form>
    </nav>
  );
}

/*
 * As opções de uma seção, penduradas num trilho fino que desce da coluna dos
 * ícones: dá para ver de relance de quem elas são. Só aparecem com a barra
 * aberta.
 */
function Opcoes({ item, pathname, params }: { item: ItemNav; pathname: string; params: URLSearchParams }) {
  const acesa = opcaoAtual(item, pathname, params);
  return (
    <ul
      aria-label={`Opções de ${item.nome}`}
      className={cn(
        "relative hidden flex-col gap-0.5 pt-0.5 pb-1.5",
        "group-hover:flex group-has-[:focus-visible]:flex",
        "before:absolute before:top-1 before:bottom-2 before:left-[calc(var(--nav-trilho)/2)] before:w-px before:bg-border",
      )}
    >
      {item.sub?.map((s, k) => {
        const on = s === acesa;
        const novoGrupo = s.grupo && s.grupo !== item.sub?.[k - 1]?.grupo;
        return (
          <li key={s.href} className="flex flex-col">
            {novoGrupo && (
              <span className="pt-1.5 pb-0.5 pl-(--nav-trilho) text-[10px] font-bold tracking-wide whitespace-nowrap text-muted-foreground/80 uppercase">
                {s.grupo}
              </span>
            )}
            <Link
              href={s.href}
              prefetch
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center rounded-lg pr-3 pl-(--nav-trilho) text-[13px] whitespace-nowrap outline-none",
                "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--ll-accent)",
                on
                  ? "font-semibold text-(--ll-accent)"
                  : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
              )}
            >
              {/* o pontinho no trilho marca a opção da tela */}
              <span
                aria-hidden
                className={cn(
                  "absolute top-1/2 left-[calc(var(--nav-trilho)/2)] -translate-x-1/2 -translate-y-1/2 rounded-full",
                  on ? "size-2 bg-(--ll-accent)" : "size-1 bg-border",
                )}
              />
              {s.nome}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
