"use client";

import { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link, { useLinkStatus } from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { SignOutIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { TemaNoTrilho } from "./tema";
import type { Papel } from "@prisma/client";
import type { Icon } from "@phosphor-icons/react";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { AJUSTES_NAV, categoriasVisiveis, fixosVisiveis, opcaoAtual, veAjustes, type CategoriaNav } from "./navegacao";
import { logoutAction } from "@/modules/auth/auth.actions";
import { AtalhosDeCriar, ListaDeOpcoes } from "./menu-arvore";

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
 *   - parar o mouse numa categoria desliza o PAINEL dela ao lado: nome, uma
 *     frase, os atalhos de criar ("+ Nova venda") e as opções, cada uma com
 *     ícone e uma frase do que tem lá. O painel some quando o mouse sai;
 *   - clicar na categoria já abre a tela principal dela — o painel é para as
 *     outras opções, não um passo a mais no caminho comum;
 *   - pelo teclado, o foco numa categoria abre o painel, o Tab entra nele e
 *     o Esc fecha.
 *
 * O painel mora DENTRO da <nav> (posição absoluta, colado à direita dela):
 * assim sair do trilho para o painel não é "sair do menu", e a demora para
 * fechar perdoa o mouse que escorrega na diagonal.
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
  const router = useRouter();
  const fixos = fixosVisiveis(temIA);
  const categorias = categoriasVisiveis(permissoes, papel);
  const ativa = categorias.find((c) => opcaoAtual(c, pathname, params))?.id ?? null;
  const ajustesAtual = pathname === AJUSTES_NAV.href || pathname.startsWith(AJUSTES_NAV.href + "/");

  /* Qual painel está aberto. Muda com um pequeno atraso: o mouse que só
     passa pelo trilho a caminho da tela não abre nada, e o que escorrega do
     painel por um instante não o fecha. */
  const [aberta, setAberta] = useState<string | null>(null);
  const espera = useRef<number | undefined>(undefined);
  const abrirDepois = (id: string | null, ms: number) => {
    window.clearTimeout(espera.current);
    espera.current = window.setTimeout(() => setAberta(id), ms);
  };
  const fecharJa = () => {
    window.clearTimeout(espera.current);
    setAberta(null);
  };
  useEffect(() => () => window.clearTimeout(espera.current), []);

  /* Trocou de tela: o painel fecha. */
  const rota = `${pathname}?${params.toString()}`;
  const [ultimaRota, setUltimaRota] = useState(rota);
  if (ultimaRota !== rota) {
    setUltimaRota(rota);
    setAberta(null);
  }

  /*
   * BUSCAR ANTES DO CLIQUE.
   * O Next só busca a tela de um link visível, e as opções moram num painel
   * que nem existe até abrir. Os itens do trilho estão sempre à vista e já se
   * buscam sozinhos; parar numa categoria pede também todas as opções e
   * atalhos dela. Quando o clique vem, a tela já está aqui.
   */
  const buscar = (c: CategoriaNav) => {
    for (const o of c.opcoes) router.prefetch(o.href);
    for (const a of c.acoes ?? []) router.prefetch(a.href);
  };

  return (
    <nav
      aria-label="Navegação principal"
      data-nav="lateral"
      onPointerEnter={() => window.clearTimeout(espera.current)}
      onPointerLeave={() => abrirDepois(null, 220)}
      onKeyDown={(e) => e.key === "Escape" && fecharJa()}
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
        onPointerEnter={() => abrirDepois(null, 120)}
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
            onPointerEnter={() => abrirDepois(null, 120)}
          />
        ))}

        <span aria-hidden className="my-1.5 h-px w-8 shrink-0 bg-border" />

        {categorias.map((c) => {
          const aberto = aberta === c.id;
          return (
            <div key={c.id} className="w-full">
              <ItemTrilho
                href={c.opcoes[0].href}
                nome={c.curto}
                titulo={c.nome}
                icone={c.icone}
                atual={c.id === ativa}
                aberto={aberto}
                controla={`painel-${c.id}`}
                onPointerEnter={() => {
                  buscar(c);
                  /* Com um painel já aberto, trocar de categoria é na hora:
                     a pessoa está explorando, não passando. */
                  abrirDepois(c.id, aberta ? 0 : 110);
                }}
                onFocus={() => {
                  buscar(c);
                  window.clearTimeout(espera.current);
                  setAberta(c.id);
                }}
              />
              {aberto && <Painel categoria={c} pathname={pathname} params={params} fechar={fecharJa} />}
            </div>
          );
        })}
      </div>

      {/* Ajustes, tema e sair: o que não é lugar de trabalho fica embaixo. */}
      <div className="mt-2 flex shrink-0 flex-col items-center gap-1 px-1.5" onPointerEnter={() => abrirDepois(null, 120)}>
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

function ItemTrilho({
  href,
  nome,
  titulo,
  icone,
  atual,
  aberto = false,
  controla,
  onPointerEnter,
  onFocus,
}: {
  href: string;
  nome: string;
  titulo?: string;
  icone: Icon;
  atual: boolean;
  aberto?: boolean;
  controla?: string;
  onPointerEnter?: () => void;
  onFocus?: () => void;
}) {
  return (
    <Link
      href={href}
      /* prefetch: o Next busca a tela antes do clique; o trilho está sempre
         à vista, então todas as telas principais chegam logo depois do app. */
      prefetch
      title={titulo ?? nome}
      aria-current={atual ? "page" : undefined}
      aria-expanded={controla ? aberto : undefined}
      aria-controls={controla && aberto ? controla : undefined}
      onPointerEnter={onPointerEnter}
      onFocus={onFocus}
      className="group/item flex w-full flex-col items-center gap-1 rounded-xl py-1"
    >
      <PastilhaDoItem icone={icone} atual={atual} aberto={aberto} />
      <span className={cn(ROTULO, atual && "text-(--ll-accent)", aberto && !atual && "text-foreground")}>{nome}</span>
    </Link>
  );
}

/* A pastilha pulsa enquanto a tela clicada não chega: o clique responde na
   hora, mesmo com o servidor demorando. */
function PastilhaDoItem({ icone: Icone, atual, aberto }: { icone: Icon; atual: boolean; aberto: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      className={cn(
        PASTILHA,
        aberto && "bg-(--ll-surface-2) text-foreground",
        atual && "bg-(--ll-accent-soft) text-(--ll-accent) group-hover/item:bg-(--ll-accent-soft) group-hover/item:text-(--ll-accent)",
        pending && "animate-pulse",
      )}
    >
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
  return (
    <div
      id={`painel-${c.id}`}
      role="group"
      aria-label={`Opções de ${c.nome}`}
      className={cn(
        "ll-painel-entra absolute inset-y-0 left-full flex w-(--nav-painel) flex-col overflow-y-auto border-r bg-card px-3 py-5",
        "shadow-[12px_0_32px_-16px_rgba(22,21,26,.28)]",
      )}
    >
      <div className="flex items-center gap-3 px-1.5">
        <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--ll-accent-soft) text-(--ll-accent)">
          <Icone weight="duotone" className="size-5" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] leading-tight font-bold">{c.nome}</span>
          <span className="block text-xs text-muted-foreground">{c.desc}</span>
        </span>
      </div>

      <div className="mt-5 px-1.5">
        <AtalhosDeCriar acoes={c.acoes ?? []} aoEscolher={fechar} />
      </div>
      <div className="mt-3">
        <ListaDeOpcoes categoria={c} pathname={pathname} params={params} aoEscolher={fechar} />
      </div>
    </div>
  );
}
