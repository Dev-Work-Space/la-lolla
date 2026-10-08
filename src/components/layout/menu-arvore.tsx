"use client";

import { useRef, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { opcaoAtual, type AcaoNav, type CategoriaNav } from "./navegacao";

/*
 * O que o menu do PC (painel da barra lateral) e o do celular (gaveta do
 * "Menu") dividem: o desenho das opções e dos atalhos de criar e o gesto de
 * fechar. Um desenho só, para os dois menus não saírem de sintonia.
 */

/*
 * ARRASTAR PARA FECHAR (pedido do João, 08/10/2026): o menu fecha clicando no
 * X ou deslizando — para baixo na gaveta do celular, para a esquerda no
 * painel do PC. A tela acompanha o dedo (ou o mouse) e, soltando, fecha se
 * passou de um terço do caminho ou foi um puxão rápido; senão volta.
 *
 * Só a "zona" (a alcinha e o cabeçalho) arrasta, não a lista inteira: assim
 * rolar as opções continua rolando. Botões e links dentro da zona (o X)
 * seguem clicáveis — capturar o ponteiro neles engoliria o clique.
 */
export function useArrastarParaFechar(sentido: "baixo" | "esquerda", fechar: () => void) {
  const [desloc, setDesloc] = useState(0);
  const [arrastando, setArrastando] = useState(false);
  const inicio = useRef<{ p: number; t: number } | null>(null);

  const medida = (e: React.PointerEvent) =>
    inicio.current ? (sentido === "baixo" ? e.clientY : -e.clientX) - inicio.current.p : 0;

  const soltar = (e: React.PointerEvent, cancelou: boolean) => {
    if (!inicio.current) return;
    const d = Math.max(0, medida(e));
    const ms = Math.max(1, Date.now() - inicio.current.t);
    inicio.current = null;
    setArrastando(false);
    if (!cancelou && (d > 90 || (d > 30 && d / ms > 0.5))) fechar();
    else setDesloc(0);
  };

  return {
    zona: {
      onPointerDown: (e: React.PointerEvent) => {
        if (e.pointerType === "mouse" && e.button !== 0) return;
        if ((e.target as Element).closest("button, a")) return;
        inicio.current = { p: sentido === "baixo" ? e.clientY : -e.clientX, t: Date.now() };
        e.currentTarget.setPointerCapture(e.pointerId);
        setArrastando(true);
      },
      onPointerMove: (e: React.PointerEvent) => {
        if (inicio.current) setDesloc(Math.max(0, medida(e)));
      },
      onPointerUp: (e: React.PointerEvent) => soltar(e, false),
      onPointerCancel: (e: React.PointerEvent) => soltar(e, true),
    },
    estilo: {
      transform: desloc ? (sentido === "baixo" ? `translateY(${desloc}px)` : `translateX(${-desloc}px)`) : undefined,
      transition: arrastando ? "none" : "transform 180ms var(--ll-ease)",
    } as React.CSSProperties,
  };
}

/*
 * ESQUENTAR AS TELAS ANTES DO CLIQUE.
 *
 * O servidor responde uma tela em ~30 ms, mas o React segura a tela nova por
 * 300 ms depois de mostrar o "carregando" (para não piscar). Medido: 29 ms de
 * servidor, 315 ms até a tela. Escapa quem já tem os dados buscados. E o
 * Next só busca os dados completos de um <Link prefetch> que esteja na tela —
 * as opções moram num painel que nem existe até abrir.
 *
 * Por isso, quando o mouse chega numa categoria (ou o foco, ou o dedo), estes
 * links entram na página escondidos só para o Next buscá-los. Quando a
 * pessoa abre o painel e escolhe, a tela já está aqui. `aria-hidden` e
 * `tabIndex={-1}`: não existem para quem usa leitor de tela ou teclado.
 */
export function Aquecer({ categoria: c }: { categoria: CategoriaNav }) {
  const hrefs = [...c.opcoes.map((o) => o.href), ...(c.acoes ?? []).map((a) => a.href)];
  return (
    <div aria-hidden className="sr-only">
      {hrefs.map((href) => (
        <Link key={href} href={href} prefetch tabIndex={-1}>
          .
        </Link>
      ))}
    </div>
  );
}

/*
 * "Nova venda", "Novo orçamento"…: o caminho curto para o que mais se faz.
 * Quadradinhos lado a lado com o "+" e o nome curto — três botões cheios
 * empilhados pesavam mais que as opções embaixo deles. O nome inteiro vai
 * no `aria-label` e no `title`.
 */
export function AtalhosDeCriar({ acoes, aoEscolher }: { acoes: AcaoNav[]; aoEscolher?: () => void }) {
  if (acoes.length === 0) return null;
  return (
    <div>
      <p className="px-1 pb-1.5 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">Criar</p>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${acoes.length}, minmax(0, 1fr))` }}>
        {acoes.map((a) => (
          <Link
            key={a.href}
            href={a.href}
            onClick={aoEscolher}
            aria-label={a.nome}
            title={a.nome}
            className={cn(
              "flex min-w-0 flex-col items-center gap-1 rounded-xl px-1 py-2 text-xs font-semibold transition-colors",
              "bg-(--ll-accent-soft) text-(--ll-accent) hover:bg-(--ll-accent) hover:text-(--ll-accent-ink)",
            )}
          >
            <PlusIcon weight="bold" className="size-4" aria-hidden />
            <span className="max-w-full truncate">{a.curto}</span>
          </Link>
        ))}
      </div>
    </div>
  );
}

/*
 * As opções de uma categoria: cada uma com ícone, nome e uma frase do que
 * tem lá, agrupadas ("Contas", "Fluxo de caixa") quando a categoria pede.
 * A da tela aberta fica dourada.
 */
export function ListaDeOpcoes({
  categoria: c,
  pathname,
  params,
  aoEscolher,
}: {
  categoria: CategoriaNav;
  pathname: string;
  params: URLSearchParams;
  aoEscolher?: () => void;
}) {
  const acesa = opcaoAtual(c, pathname, params);
  return (
    <ul aria-label={`Opções de ${c.nome}`} className="flex flex-col gap-0.5">
      {c.opcoes.map((o, k) => {
        const on = o === acesa;
        const novoGrupo = o.grupo && o.grupo !== c.opcoes[k - 1]?.grupo;
        const Icone = o.icone;
        return (
          <li key={o.href} className="flex flex-col">
            {novoGrupo && (
              <span className="px-2.5 pt-3 pb-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                {o.grupo}
              </span>
            )}
            <Link
              href={o.href}
              prefetch
              onClick={aoEscolher}
              aria-current={on ? "page" : undefined}
              className={cn(
                "group/op flex items-center gap-3 rounded-xl px-2.5 py-2 transition-colors duration-150",
                on ? "bg-(--ll-accent-soft)" : "hover:bg-(--ll-surface-2)",
              )}
            >
              <span
                className={cn(
                  "grid size-8 shrink-0 place-items-center rounded-lg transition-colors",
                  on
                    ? "bg-(--ll-accent) text-(--ll-accent-ink)"
                    : "bg-(--ll-surface-2) text-muted-foreground group-hover/op:bg-card group-hover/op:text-foreground",
                )}
              >
                <Icone weight={on ? "fill" : "regular"} className="size-4" aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className={cn("block truncate text-sm", on ? "font-bold text-(--ll-accent)" : "font-medium")}>{o.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{o.desc}</span>
              </span>
              <Seta on={on} />
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/* A setinha aparece ao apontar a opção, e pulsa de espera depois do clique:
   o clique responde na hora, mesmo com o servidor demorando. */
function Seta({ on }: { on: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <CaretRightIcon
      weight="bold"
      aria-hidden
      className={cn(
        "size-3.5 shrink-0 transition-[opacity,translate] duration-150",
        on ? "text-(--ll-accent) opacity-100" : "-translate-x-1 opacity-0 group-hover/op:translate-x-0 group-hover/op:opacity-60",
        pending && "animate-pulse opacity-100",
      )}
    />
  );
}
