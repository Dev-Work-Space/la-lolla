"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretDownIcon, SignOutIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { LinhaTema } from "./tema";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { AJUSTES_NAV, categoriasVisiveis, fixosVisiveis, opcaoAtual, veAjustes, type CategoriaNav } from "./navegacao";
import { OpcoesDaCategoria, useMenuAberto } from "./menu-arvore";
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
 * 3. CATEGORIAS E OPÇÕES (08/10/2026).
 *    As abas de dentro das telas viraram opções do menu, e o menu ganhou
 *    categorias por cima delas (ver navegacao.ts). Início e IA são botões
 *    fixos no topo, sem lista. Categoria aberta fica aberta até a pessoa
 *    fechar (ver menu-arvore.tsx). Com a barra fechada as opções somem: no
 *    trilho de 68px não há onde escrever, e o título da tela diz onde se está.
 *
 * A ordem segue o caminho do negócio, não a ordem em que as telas nasceram:
 * vende e compra → guarda no estoque → olha o dinheiro → consulta cadastros.
 * Ajustes é configuração, não trabalho: fica embaixo, com o tema e o "Sair".
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
  temIA,
}: {
  permissoes: Permissoes;
  papel: Papel;
  nome: string;
  temIA: boolean;
}) {
  const pathname = usePathname();
  const params = useSearchParams();
  const fixos = fixosVisiveis(temIA);
  const categorias = categoriasVisiveis(permissoes, papel);
  const ativa = categorias.find((c) => opcaoAtual(c, pathname, params))?.id ?? null;
  const { abertas, alternar } = useMenuAberto(ativa);

  /*
   * BUSCAR ANTES DO CLIQUE.
   * O Next só busca a tela de um link quando ele aparece na tela, e as
   * opções das categorias fechadas nem existem na página. Então, ao montar,
   * a barra pede a primeira opção de cada categoria e todas as das
   * categorias abertas; passar o mouse (ou o foco) numa categoria pede as
   * dela. Quando o
   * clique vem, a tela já está aqui. Esta barra existe também no celular
   * (escondida), então o pedido vale para os dois.
   */
  const router = useRouter();
  const antecipar = categorias
    .flatMap((c) => (abertas.includes(c.id) ? c.opcoes : c.opcoes.slice(0, 1)))
    .map((o) => o.href)
    .join(" ");
  useEffect(() => {
    for (const href of antecipar.split(" ")) if (href) router.prefetch(href);
  }, [antecipar, router]);
  const buscarOpcoes = (c: CategoriaNav) => {
    for (const o of c.opcoes) router.prefetch(o.href);
  };
  const ajustesAtual = pathname === AJUSTES_NAV.href || pathname.startsWith(AJUSTES_NAV.href + "/");

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
        {fixos.map((f) => {
          const Icone = f.icone;
          const atual = f.atual(pathname);
          return (
            <Link
              key={f.href}
              href={f.href}
              /* prefetch: o Next busca a tela ANTES do clique. Como a barra
                 abre no hover, quando o mouse chega no item a tela já está
                 vindo — ao clicar, está pronta. */
              prefetch
              aria-current={atual ? "page" : undefined}
              title={f.nome}
              className={cn(
                LINHA,
                "w-full",
                atual
                  ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
                  : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
              )}
            >
              {/* trilho de largura fixa: é ele que mantém o ícone parado */}
              <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
                <Icone weight={atual ? "fill" : "regular"} className="size-[19px] shrink-0" aria-hidden />
              </span>
              {/* opacidade + max-width, nunca display:none */}
              <span data-rotulo className={ROTULO}>{f.nome}</span>
            </Link>
          );
        })}

        {/* Separa os botões fixos das categorias. */}
        <span aria-hidden className="mx-3 my-2 h-px shrink-0 bg-border" />

        {categorias.map((c) => {
          const Icone = c.icone;
          const atual = c.id === ativa;
          const classe = cn(
            LINHA,
            "w-full",
            atual
              ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
              : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
          );
          const icone = (
            <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
              <Icone weight={atual ? "fill" : "regular"} className="size-[19px] shrink-0" aria-hidden />
            </span>
          );

          /* Categoria de uma opção só (um perfil que só vê Vendas, por
             exemplo) é um link direto: abrir uma lista de um item é clique
             à toa. */
          if (c.opcoes.length === 1)
            return (
              <Link
                key={c.id}
                href={c.opcoes[0].href}
                /* prefetch: o Next busca a tela ANTES do clique. Como a barra
                   abre no hover, quando o mouse chega no item a tela já está
                   vindo — ao clicar, está pronta. */
                prefetch
                aria-current={atual ? "page" : undefined}
                title={c.nome}
                className={classe}
              >
                {icone}
                <span data-rotulo className={ROTULO}>{c.nome}</span>
              </Link>
            );

          const mostra = abertas.includes(c.id);
          return (
            <div key={c.id} className="flex shrink-0 flex-col">
              <button
                type="button"
                onClick={() => alternar(c.id)}
                onPointerEnter={() => buscarOpcoes(c)}
                onFocus={() => buscarOpcoes(c)}
                aria-expanded={mostra}
                title={c.nome}
                className={cn(classe, "text-left")}
              >
                {icone}
                <span data-rotulo className={ROTULO}>{c.nome}</span>
                <CaretDownIcon
                  weight="bold"
                  aria-hidden
                  className={cn(
                    "mr-3 ml-auto size-3.5 shrink-0 opacity-0 transition-[opacity,rotate] duration-200",
                    "group-hover:opacity-60 group-has-[:focus-visible]:opacity-60",
                    mostra && "rotate-180",
                  )}
                />
              </button>
              {mostra && <OpcoesDaCategoria categoria={c} pathname={pathname} params={params} modo="lateral" />}
            </div>
          );
        })}
      </div>

      {veAjustes(permissoes, papel) && (
        <Link
          href={AJUSTES_NAV.href}
          prefetch
          aria-current={ajustesAtual ? "page" : undefined}
          title={AJUSTES_NAV.nome}
          className={cn(
            LINHA,
            "mt-4 w-full",
            ajustesAtual
              ? "bg-(--ll-accent-soft) font-bold text-(--ll-accent)"
              : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
          )}
        >
          <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
            <AJUSTES_NAV.icone weight={ajustesAtual ? "fill" : "regular"} className="size-[19px] shrink-0" aria-hidden />
          </span>
          <span data-rotulo className={ROTULO}>{AJUSTES_NAV.nome}</span>
        </Link>
      )}

      {/*
        Claro/escuro fica junto do "Sair": são as duas coisas que não são
        navegação. Usa a mesma linha dos itens, então o ícone cai na mesma
        coluna que os outros — antes ficava 7,5px fora com a barra aberta.
      */}
      <LinhaTema
        className={cn(LINHA, "mt-1 w-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground")}
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
