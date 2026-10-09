"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { SignOutIcon, XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { TemaNoTrilho } from "./tema";
import type { Papel } from "@prisma/client";
import type { Icon } from "@phosphor-icons/react";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { AJUSTES_NAV, categoriasVisiveis, fixosVisiveis, opcaoAtual, veAjustes, type CategoriaNav } from "./navegacao";
import { logoutAction } from "@/modules/auth/auth.actions";
import { Aquecer, AtalhosDeCriar, ListaDeOpcoes, useArrastarParaFechar } from "./menu-arvore";

/*
 * Barra lateral do monitor: TRILHO + PAINEL.
 *
 * Redesenho de 08/10/2026 ("usa sua criatividade, tô achando uma bosta
 * minhas ideias"). O que havia antes e por que saiu:
 *   - a barra ABRIA no hover, de 68px para 244px, e só então mostrava os
 *     nomes. Fechada, eram ícones soltos que ninguém lia; aberta, cobria a
 *     tela a cada passada do mouse a caminho de outra coisa;
 *   - as opções viviam num acordeão que abria e fechava, e a lista crescia
 *     até rolar.
 *
 * Agora:
 *   - o TRILHO é fixo e estreito, com o ícone numa pastilha e o nome sempre
 *     escrito embaixo (como a barra de baixo de um celular). A pastilha
 *     dourada diz em que categoria a tela está;
 *   - CLICAR numa categoria desliza o PAINEL dela ao lado: nome, uma frase,
 *     os atalhos de criar e as opções, cada uma com ícone e uma frase do que
 *     tem lá. Só no clique — o João testou abrindo no hover e pediu assim:
 *     o mouse passando a caminho da tela não pode cobrir nada;
 *   - o painel fica aberto até a pessoa fechar: no X, clicando de novo na
 *     categoria ou apertando Esc. Escolher opções, trocar de tela e mexer na
 *     página NÃO o fecham, e ele empurra a página em vez de cobri-la.
 *     Pelo teclado, Enter abre e o Tab entra nele.
 */

const PASTILHA = cn(
  "grid h-8 w-12 place-items-center rounded-full transition-colors duration-150",
  "text-muted-foreground group-hover/item:bg-(--ll-surface-2) group-hover/item:text-foreground",
);
/* Até duas linhas, centradas: "Compra e venda" não cabe numa só em 76px, e
   cortar o nome do lugar é pior que uma linha a mais. */
const ROTULO = "line-clamp-2 max-w-full px-0.5 text-center text-[10px] leading-[1.15] font-semibold tracking-tight text-muted-foreground";

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
  const ajustesAtual = pathname === AJUSTES_NAV.href || pathname.startsWith(AJUSTES_NAV.href + "/");

  /*
   * Qual painel está aberto — só o clique abre, e SÓ O CLIQUE FECHA (no X ou
   * na categoria de novo). Escolher uma opção, trocar de tela ou clicar na
   * página não fecham: pedido do João (08/10/2026), que navega por várias
   * opções da mesma categoria em sequência.
   *
   * Como ele fica aberto enquanto se trabalha, o painel não pode cobrir a
   * página: avisamos o layout pelo <html>, e ele empurra o conteúdo (ver
   * `--nav-largura` no globals.css).
   */
  const [aberta, setAberta] = useState<string | null>(null);
  const fechar = () => setAberta(null);

  useEffect(() => {
    const html = document.documentElement;
    if (aberta) html.dataset.painel = "aberto";
    else delete html.dataset.painel;
    return () => {
      delete html.dataset.painel;
    };
  }, [aberta]);

  /* A categoria que o mouse (ou o foco) alcançou: as telas dela começam a
     ser buscadas antes do clique. Ver `Aquecer`. */
  const [quente, setQuente] = useState<string | null>(null);

  return (
    <nav
      aria-label="Navegação principal"
      data-nav="lateral"
      onKeyDown={(e) => e.key === "Escape" && fechar()}
      className="fixed inset-y-0 left-0 z-60 hidden w-(--nav-fechada) flex-col border-r bg-card py-4 md:flex"
    >
      {/*
       * O "L" é RECORTADO da logo oficial (scripts/recortar-l-da-logo.mjs),
       * não digitado numa fonte serifada qualquer: antes eram dois desenhos
       * diferentes e dava para ver.
       */}
      <Link
        href="/"
        aria-label="Início"
        className="mx-auto mb-4 grid h-10 w-12 shrink-0 place-items-center rounded-xl"
      >
        <Image src="/logo-lalolla-l.png" alt="" aria-hidden width={53} height={85} priority className="h-7 w-auto" />
      </Link>

      {/* `overflow-y-auto` aqui e não na <nav>: numa tela baixa o trilho rola,
          e o painel (preso à <nav>) não é cortado junto. */}
      <div className="flex min-h-0 flex-1 flex-col items-center gap-1 overflow-y-auto px-1.5">
        {fixos.map((f) => (
          <ItemTrilho
            key={f.href}
            href={f.href}
            nome={f.nome}
            icone={f.icone}
            atual={f.atual(pathname)}
          />
        ))}

        <span aria-hidden className="my-1.5 h-px w-8 shrink-0 bg-border" />

        {categorias.map((c) => {
          const aberto = aberta === c.id;
          return (
            <div key={c.id} className="w-full">
              <button
                type="button"
                title={c.nome}
                aria-expanded={aberto}
                aria-controls={aberto ? `painel-${c.id}` : undefined}
                onClick={() => setAberta(aberto ? null : c.id)}
                onPointerEnter={() => setQuente(c.id)}
                onFocus={() => setQuente(c.id)}
                className="group/item flex w-full flex-col items-center gap-1 rounded-xl py-1"
              >
                <span className={classePastilha(c.id === ativa, aberto)}>
                  <c.icone weight={c.id === ativa ? "fill" : "regular"} className="size-5" aria-hidden />
                </span>
                <span className={classeRotulo(c.id === ativa, aberto)}>{c.curto}</span>
              </button>
              {quente === c.id && !aberto && <Aquecer categoria={c} />}
              {aberto && <Painel categoria={c} pathname={pathname} params={params} fechar={fechar} />}
            </div>
          );
        })}
      </div>

      {/* Ajustes, tema e sair: o que não é lugar de trabalho fica embaixo. */}
      <div className="mt-2 flex shrink-0 flex-col items-center gap-1 px-1.5">
        {veAjustes(permissoes, papel) && (
          <ItemTrilho href={AJUSTES_NAV.href} nome={AJUSTES_NAV.nome} icone={AJUSTES_NAV.icone} atual={ajustesAtual} />
        )}
        <TemaNoTrilho pastilha={PASTILHA} rotulo={ROTULO} />
        <form action={logoutAction} className="w-full">
          <button type="submit" title={`Sair (${nome})`} className="group/item flex w-full flex-col items-center gap-1 rounded-xl py-1">
            <span className={PASTILHA}>
              <SignOutIcon weight="regular" className="size-5" aria-hidden />
            </span>
            <span className={ROTULO}>Sair</span>
          </button>
        </form>
      </div>
    </nav>
  );
}

/* Dourada na categoria da tela; acinzentada com o painel dela aberto. */
const classePastilha = (atual: boolean, aberto: boolean) =>
  cn(
    PASTILHA,
    aberto && "bg-(--ll-surface-2) text-foreground",
    atual && "bg-(--ll-accent-soft) text-(--ll-accent) group-hover/item:bg-(--ll-accent-soft) group-hover/item:text-(--ll-accent)",
  );
const classeRotulo = (atual: boolean, aberto: boolean) =>
  cn(ROTULO, atual && "text-(--ll-accent)", aberto && !atual && "text-foreground");

/* Início, IA e Ajustes: links diretos, sem painel. */
function ItemTrilho({ href, nome, icone, atual }: { href: string; nome: string; icone: Icon; atual: boolean }) {
  return (
    <Link
      href={href}
      /* prefetch: o Next busca a tela antes do clique; o trilho está sempre
         à vista, então essas telas chegam logo depois do app. */
      prefetch
      title={nome}
      aria-current={atual ? "page" : undefined}
      className="group/item flex w-full flex-col items-center gap-1 rounded-xl py-1"
    >
      <PastilhaDoItem icone={icone} atual={atual} />
      <span className={classeRotulo(atual, false)}>{nome}</span>
    </Link>
  );
}

/* A pastilha pulsa enquanto a tela clicada não chega: o clique responde na
   hora, mesmo com o servidor demorando. */
function PastilhaDoItem({ icone: Icone, atual }: { icone: Icon; atual: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span className={cn(classePastilha(atual, false), pending && "animate-pulse")}>
      <Icone weight={atual ? "fill" : "regular"} className="size-5" aria-hidden />
    </span>
  );
}

/*
 * O painel de uma categoria: cabeçalho, atalhos de criar e as opções com
 * ícone e frase. Fica colado à direita do trilho, da altura da tela.
 */
function Painel({
  categoria: c,
  pathname,
  params,
  fechar,
}: {
  categoria: CategoriaNav;
  pathname: string;
  params: URLSearchParams;
  fechar: () => void;
}) {
  const Icone = c.icone;
  /* Fecha no X, deslizando o cabeçalho para a esquerda, clicando fora ou no
     Esc. A zona de arrastar é só o cabeçalho: a lista continua rolando. */
  const { zona, estilo } = useArrastarParaFechar("esquerda", fechar);
  return (
    <div
      id={`painel-${c.id}`}
      role="group"
      aria-label={`Opções de ${c.nome}`}
      style={estilo}
      className={cn(
        "ll-painel-entra absolute inset-y-0 left-full flex w-(--nav-painel) flex-col overflow-y-auto border-r bg-card px-3 py-5",
        "shadow-[12px_0_32px_-16px_rgba(22,21,26,.28)]",
      )}
    >
      <div {...zona} className="flex cursor-grab touch-none items-center gap-3 px-1.5 active:cursor-grabbing">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--ll-accent-soft) text-(--ll-accent)">
          <Icone weight="duotone" className="size-5" aria-hidden />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-[15px] leading-tight font-bold">{c.nome}</span>
          <span className="block text-xs text-muted-foreground">{c.desc}</span>
        </span>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar o menu"
          title="Fechar (Esc)"
          className="grid size-8 shrink-0 cursor-pointer place-items-center rounded-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground"
        >
          <XIcon weight="bold" className="size-4" aria-hidden />
        </button>
      </div>

      <div className="mt-5 px-1.5">
        <AtalhosDeCriar acoes={c.acoes ?? []} />
      </div>
      <div className="mt-3">
        <ListaDeOpcoes categoria={c} pathname={pathname} params={params} />
      </div>
    </div>
  );
}
