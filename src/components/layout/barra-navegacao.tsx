"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { categoriasVisiveis, fixosVisiveis, opcaoAtual, type CategoriaNav } from "./navegacao";
import { Aquecer, AtalhosDeCriar, ListaDeOpcoes, useArrastarParaFechar } from "./menu-arvore";

/*
 * Barra fixa de baixo, só no celular. No PC a navegação vive na barra
 * lateral. A LISTA não mora aqui — está em ./navegacao.ts, que não é módulo
 * cliente e por isso pode ser lido também pelo servidor. Ver o comentário lá.
 *
 * O MESMO MENU DO PC, do jeito do celular (pedido do João, 08/10/2026):
 * "no celular, em vez de um botão Menu, deixe tudo na barra de baixo e, ao
 * clicar, abre as abas". Início e IA são botões de um toque; cada categoria
 * (Compra e venda, Estoque, Financeiro, Cadastros) é um botão que sobe o
 * mesmo painel do PC — nome, frase, atalhos de criar e as opções com ícone e
 * frase. Ajustes mora no cabeçalho, ao lado do tema.
 *
 * O painel abre sobre a tela e TRAVA a de trás: escurece, não rola e não
 * recebe toque. Fecha no X, deslizando para baixo, tocando fora, no Esc ou
 * ao escolher uma opção. Tocar noutra categoria troca o painel.
 */
export function BarraNavegacao({ permissoes, papel, temIA }: { permissoes: Permissoes; papel: Papel; temIA: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const fixos = fixosVisiveis(temIA);
  const categorias = categoriasVisiveis(permissoes, papel);
  const ativa = categorias.find((c) => opcaoAtual(c, pathname, params))?.id ?? null;
  const [aberta, setAberta] = useState<string | null>(null);
  const [quente, setQuente] = useState<string | null>(null);
  const fechar = () => setAberta(null);
  const categoriaAberta = categorias.find((c) => c.id === aberta) ?? null;

  /*
   * Painel aberto = tela de trás travada. O véu já recebe os toques, mas não
   * impede a página de rolar por baixo nem o Tab de entrar nela: então a
   * página e o cabeçalho ficam `inert` e a rolagem do <html> é desligada.
   * Tudo volta ao fechar, inclusive se a barra sumir do ar.
   */
  const aberto = categoriaAberta !== null;
  useEffect(() => {
    if (!aberto) return;
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    const trancados = document.querySelectorAll("[data-conteudo], header");
    trancados.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      html.style.overflow = antes;
      trancados.forEach((el) => el.removeAttribute("inert"));
    };
  }, [aberto]);

  const botao = (acesa: boolean) =>
    cn(
      "flex h-full min-w-0 flex-col items-center justify-center gap-1 px-0.5 text-center",
      "transition-colors duration-150",
      acesa ? "text-(--ll-accent)" : "text-muted-foreground",
    );
  /* Até duas linhas: "Compra e venda" não cabe numa só em 1/6 da tela. */
  const rotulo = "line-clamp-2 w-full text-[10px] leading-[1.1] font-medium";

  return (
    <>
      {/* O véu fica FORA da <nav>: o `backdrop-blur` dela faz de qualquer
          `fixed` lá dentro um filho preso à barra, e o véu não cobriria a
          tela. Fica POR CIMA do cabeçalho (z-50) para escurecer a tela
          inteira, e a barra sobe acima dele enquanto o painel está aberto. */}
      {aberto && (
        <button
          type="button"
          aria-label="Fechar o menu"
          tabIndex={-1}
          onClick={fechar}
          className="ll-veu-entra fixed inset-0 z-55 touch-none bg-black/55 backdrop-blur-[2px] md:hidden"
        />
      )}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden",
          aberto && "z-60",
          // No iPhone a barra de gestos come o rodapé; isto devolve o espaço.
          "pb-[env(safe-area-inset-bottom)]",
        )}
        aria-label="Navegação do rodapé"
        data-nav="inferior"
      >
        <div
          // A altura vem do mesmo token que o conteúdo usa para reservar o
          // espaço, senão os dois discordam e a barra come o fim da página.
          className="mx-auto grid h-(--nav-inferior) w-full max-w-3xl items-center"
          // minmax(0,1fr) e não 1fr: `1fr` é minmax(auto,1fr) e não encolhe
          // abaixo do conteúdo — foi assim que a barra estourou no app antigo.
          style={{ gridTemplateColumns: `repeat(${fixos.length + categorias.length}, minmax(0, 1fr))` }}
        >
          {fixos.map((f) => {
            const Icone = f.icone;
            const atual = f.atual(pathname) && !aberto;
            return (
              <Link
                key={f.href}
                href={f.href}
                /* No celular não existe hover: o Next busca quando o link entra
                   na tela — e esta barra está sempre na tela. */
                prefetch
                onClick={fechar}
                aria-current={f.atual(pathname) ? "page" : undefined}
                className={botao(atual)}
              >
                <Icone weight={atual ? "fill" : "regular"} className="size-5 shrink-0" aria-hidden />
                <span className={rotulo}>{f.nome}</span>
              </Link>
            );
          })}
          {categorias.map((c) => {
            const Icone = c.icone;
            const dela = c.id === aberta;
            const acesa = dela || (c.id === ativa && !aberto);
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => setAberta(dela ? null : c.id)}
                /* O dedo encostou: as telas da categoria já começam a ser
                   buscadas, antes de o painel subir. Ver `Aquecer`. */
                onPointerDown={() => setQuente(c.id)}
                aria-expanded={dela}
                aria-haspopup="dialog"
                aria-current={c.id === ativa ? "page" : undefined}
                className={botao(acesa)}
              >
                <Icone weight={acesa ? "fill" : "regular"} className="size-5 shrink-0" aria-hidden />
                <span className={rotulo}>{c.curto}</span>
              </button>
            );
          })}
        </div>
        {quente && !aberto && <AquecerDe id={quente} categorias={categorias} />}
        {categoriaAberta && (
          <Painel key={categoriaAberta.id} categoria={categoriaAberta} pathname={pathname} params={params} fechar={fechar} />
        )}
      </nav>
    </>
  );
}

function AquecerDe({ id, categorias }: { id: string; categorias: CategoriaNav[] }) {
  const c = categorias.find((x) => x.id === id);
  return c ? <Aquecer categoria={c} /> : null;
}

/*
 * O painel que sobe da barra com as opções da categoria — o mesmo conteúdo
 * do painel do PC. Fecha ao escolher uma opção, no X, deslizando para baixo,
 * ao tocar fora e no Esc. O foco entra nele ao abrir, para quem usa leitor
 * de tela ouvir as opções.
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
  const painel = useRef<HTMLDivElement>(null);
  const { zona, estilo } = useArrastarParaFechar("baixo", fechar);
  const Icone = c.icone;

  useEffect(() => {
    painel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={painel}
      role="dialog"
      aria-label={`Opções de ${c.nome}`}
      onKeyDown={(e) => e.key === "Escape" && fechar()}
      style={estilo}
      className={cn(
        "ll-gaveta-sobe absolute inset-x-0 bottom-full mx-auto max-w-3xl rounded-t-2xl border border-b-0 bg-card px-3 pt-2 pb-3",
        "shadow-[0_-8px_30px_-12px_rgba(22,21,26,.35)]",
        "max-h-[75dvh] overflow-y-auto overscroll-contain",
      )}
    >
      {/* A zona de puxar: a alcinha (que diz "isto é um painel") e o título
          com o X. Arrastar daqui para baixo fecha; a lista abaixo só rola.
          `sticky`: com uma categoria grande o painel rola, e sem isto o X e a
          alcinha sumiam lá em cima. */}
      <div {...zona} className="sticky top-0 z-10 -mx-3 -mt-2 mb-2 touch-none bg-card px-3 pt-2">
        <span aria-hidden className="mx-auto mb-1 block h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center gap-3 pb-1 pl-1">
          <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-(--ll-accent-soft) text-(--ll-accent)">
            <Icone weight="duotone" className="size-5" aria-hidden />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[15px] leading-tight font-bold">{c.nome}</span>
            <span className="block truncate text-xs text-muted-foreground">{c.desc}</span>
          </span>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar o menu"
            className="grid size-10 shrink-0 place-items-center rounded-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground"
          >
            <XIcon weight="bold" className="size-5" aria-hidden />
          </button>
        </div>
      </div>

      {(c.acoes?.length ?? 0) > 0 && (
        <div className="mb-3 px-1">
          <AtalhosDeCriar acoes={c.acoes ?? []} aoEscolher={fechar} />
        </div>
      )}
      <ListaDeOpcoes categoria={c} pathname={pathname} params={params} aoEscolher={fechar} />
    </div>
  );
}
