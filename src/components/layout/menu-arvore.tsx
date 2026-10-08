"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { cn } from "@/lib/utils";
import { opcaoAtual, type CategoriaNav } from "./navegacao";

/*
 * O que o menu do PC (barra lateral) e o do celular (gaveta do "Menu")
 * dividem: quais categorias estão abertas e o desenho das opções.
 *
 * CATEGORIA ABERTA FICA ABERTA ATÉ FECHAR — pedido do João (08/10/2026).
 * Abrir outra não fecha a anterior, trocar de tela não fecha nada, e a
 * escolha vale também depois de recarregar (fica neste aparelho). Entrar
 * numa tela de categoria fechada abre essa categoria, para a opção acesa
 * não ficar escondida; fechar, só a pessoa fecha.
 */

const CHAVE = "lalolla-menu-abertas";

function salvar(abertas: string[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(abertas));
  } catch {
    /* navegador com armazenamento bloqueado: vale só até recarregar */
  }
}

export function useMenuAberto(ativa: string | null) {
  const [abertas, setAbertas] = useState<string[]>(() => (ativa ? [ativa] : []));

  useEffect(() => {
    // Leitura única de uma fonte que só existe no navegador. Ler no render
    // faria servidor e navegador desenharem menus diferentes.
    try {
      const salvo: unknown = JSON.parse(localStorage.getItem(CHAVE) ?? "null");
      if (Array.isArray(salvo))
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setAbertas(salvo.filter((x): x is string => typeof x === "string"));
    } catch {
      /* idem */
    }
  }, []);

  const [ultimaAtiva, setUltimaAtiva] = useState(ativa);
  if (ultimaAtiva !== ativa) {
    setUltimaAtiva(ativa);
    if (ativa && !abertas.includes(ativa)) setAbertas([...abertas, ativa]);
  }

  const alternar = (id: string) => {
    const novas = abertas.includes(id) ? abertas.filter((x) => x !== id) : [...abertas, id];
    setAbertas(novas);
    salvar(novas);
  };

  return { abertas, alternar };
}

/*
 * As opções de uma categoria, penduradas num trilho fino que desce da coluna
 * dos ícones: dá para ver de relance de quem elas são.
 *
 * Na barra do PC só aparecem com a barra aberta (no trilho de 68px não há
 * onde escrever); na gaveta do celular, sempre.
 */
export function OpcoesDaCategoria({
  categoria,
  pathname,
  params,
  modo,
  aoEscolher,
}: {
  categoria: CategoriaNav;
  pathname: string;
  params: URLSearchParams;
  modo: "lateral" | "gaveta";
  aoEscolher?: () => void;
}) {
  const acesa = opcaoAtual(categoria, pathname, params);
  const gaveta = modo === "gaveta";
  return (
    <ul
      aria-label={`Opções de ${categoria.nome}`}
      className={cn(
        "relative flex-col gap-0.5 pt-0.5 pb-1.5",
        gaveta ? "flex" : "hidden group-hover:flex group-has-[:focus-visible]:flex",
        "before:absolute before:top-1 before:bottom-2 before:left-[calc(var(--nav-trilho)/2)] before:w-px before:bg-border",
      )}
    >
      {categoria.opcoes.map((s, k) => {
        const on = s === acesa;
        const novoGrupo = s.grupo && s.grupo !== categoria.opcoes[k - 1]?.grupo;
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
              onClick={aoEscolher}
              aria-current={on ? "page" : undefined}
              className={cn(
                "relative flex items-center rounded-lg pr-3 pl-(--nav-trilho) whitespace-nowrap outline-none",
                gaveta ? "h-11 text-[15px]" : "h-8 text-[13px]",
                "transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-(--ll-accent)",
                on
                  ? "font-semibold text-(--ll-accent)"
                  : "text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground",
              )}
            >
              <Ponto on={on} />
              {s.nome}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

/*
 * O pontinho no trilho marca a opção da tela. Clicada e ainda chegando, ela
 * já acende e pulsa — o clique responde na hora, mesmo com o servidor
 * demorando.
 */
function Ponto({ on }: { on: boolean }) {
  const { pending } = useLinkStatus();
  return (
    <span
      aria-hidden
      className={cn(
        "absolute top-1/2 left-[calc(var(--nav-trilho)/2)] -translate-x-1/2 -translate-y-1/2 rounded-full",
        on || pending ? "size-2 bg-(--ll-accent)" : "size-1 bg-border",
        pending && "animate-pulse",
      )}
    />
  );
}
