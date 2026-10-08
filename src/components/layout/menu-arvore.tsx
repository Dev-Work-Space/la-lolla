"use client";

import { useEffect, useState } from "react";
import Link, { useLinkStatus } from "next/link";
import { CaretRightIcon, PlusIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import { opcaoAtual, type AcaoNav, type CategoriaNav } from "./navegacao";

/*
 * O que o menu do PC (painel da barra lateral) e o do celular (gaveta do
 * "Menu") dividem: o desenho das opções e dos atalhos de criar, e — só no
 * celular — quais categorias estão abertas. Um desenho só, para os dois
 * menus não saírem de sintonia.
 */

const CHAVE = "lalolla-menu-abertas";

function salvar(abertas: string[]) {
  try {
    localStorage.setItem(CHAVE, JSON.stringify(abertas));
  } catch {
    /* navegador com armazenamento bloqueado: vale só até recarregar */
  }
}

/*
 * Na gaveta do celular, CATEGORIA ABERTA FICA ABERTA ATÉ FECHAR — pedido do
 * João (08/10/2026). Abrir outra não fecha a anterior, trocar de tela não
 * fecha nada, e a escolha vale também depois de recarregar (fica neste
 * aparelho). Entrar numa tela de categoria fechada abre essa categoria, para
 * a opção acesa não ficar escondida; fechar, só a pessoa fecha.
 */
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
