"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { categoriasVisiveis, fixosVisiveis, opcaoAtual, type CategoriaNav } from "./navegacao";
import { AtalhosDeCriar, ListaDeOpcoes, useArrastarParaFechar } from "./menu-arvore";

/*
 * Barra fixa de baixo, só no celular. No PC a navegação vive na barra
 * lateral. A LISTA não mora aqui — está em ./navegacao.ts, que não é módulo
 * cliente e por isso pode ser lido também pelo servidor. Ver o comentário lá.
 *
 * O MESMO MENU DO PC, do jeito do celular (pedido do João, 08/10/2026):
 * Início e IA são botões fixos, de um toque; "Menu" sobe uma gaveta com as
 * categorias; cada uma abre as mesmas opções do painel do PC (ícone, nome e
 * frase, mais os atalhos de criar). A gaveta abre SEMPRE com tudo fechado
 * (pedido do João: as categorias que ficaram abertas da última vez
 * atrapalhavam), e fecha no X, deslizando para baixo, tocando fora ou no Esc.
 * Aberta, ela TRAVA a tela de trás: escurece, não rola e não recebe toque.
 * Ajustes não está aqui — mora no cabeçalho, ao lado do tema, que é o "lá
 * embaixo" do celular.
 */
export function BarraNavegacao({ permissoes, papel, temIA }: { permissoes: Permissoes; papel: Papel; temIA: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const fixos = fixosVisiveis(temIA);
  const categorias = categoriasVisiveis(permissoes, papel);
  const ativa = categorias.find((c) => opcaoAtual(c, pathname, params))?.id ?? null;
  const [menu, setMenu] = useState(false);
  const fechar = () => setMenu(false);

  /*
   * Gaveta aberta = tela de trás travada. O véu já recebe os toques, mas não
   * impede a página de rolar por baixo nem o Tab de entrar nela: então a
   * página e o cabeçalho ficam `inert` e a rolagem do <html> é desligada.
   * Tudo volta ao fechar, inclusive se a barra sumir do ar.
   */
  useEffect(() => {
    if (!menu) return;
    const html = document.documentElement;
    const antes = html.style.overflow;
    html.style.overflow = "hidden";
    const trancados = document.querySelectorAll("[data-conteudo], header");
    trancados.forEach((el) => el.setAttribute("inert", ""));
    return () => {
      html.style.overflow = antes;
      trancados.forEach((el) => el.removeAttribute("inert"));
    };
  }, [menu]);

  const botao = (acesa: boolean) =>
    cn(
      "flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-center",
      "transition-colors duration-150",
      acesa ? "text-(--ll-accent)" : "text-muted-foreground",
    );

  return (
    <>
      {/* O véu fica FORA da <nav>: o `backdrop-blur` dela faz de qualquer
          `fixed` lá dentro um filho preso à barra, e o véu não cobriria a
          tela. Fica POR CIMA do cabeçalho (z-50) para escurecer a tela
          inteira, e a barra sobe acima dele enquanto a gaveta está aberta. */}
      {menu && (
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
          menu && "z-60",
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
          style={{ gridTemplateColumns: `repeat(${fixos.length + 1}, minmax(0, 1fr))` }}
        >
          {fixos.map((f) => {
            const Icone = f.icone;
            const atual = f.atual(pathname) && !menu;
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
                <span className="w-full truncate text-[10px] leading-none font-medium">{f.nome}</span>
              </Link>
            );
          })}
          <button
            type="button"
            onClick={() => setMenu((m) => !m)}
            /* O dedo encostou: começa a buscar a tela principal de cada
               categoria já, antes de a gaveta subir. As demais opções são
               buscadas quando a categoria abre (ver `ListaDeOpcoes`). */
            onPointerDown={() => {
              for (const c of categorias) router.prefetch(c.opcoes[0].href);
            }}
            aria-expanded={menu}
            aria-haspopup="dialog"
            className={botao(menu || ativa !== null)}
          >
            {menu ? (
              <XIcon weight="bold" className="size-5 shrink-0" aria-hidden />
            ) : (
              <ListIcon weight={ativa ? "bold" : "regular"} className="size-5 shrink-0" aria-hidden />
            )}
            <span className="w-full truncate text-[10px] leading-none font-medium">Menu</span>
          </button>
        </div>
        {menu && (
          <Gaveta
            categorias={categorias}
            ativa={ativa}
            pathname={pathname}
            params={params}
            fechar={fechar}
          />
        )}
      </nav>
    </>
  );
}

/*
 * A gaveta que sobe da barra com as categorias. Fecha ao escolher uma opção,
 * no X, deslizando para baixo, ao tocar fora e no Esc; abrir e fechar
 * categoria NÃO fecha a gaveta. O foco entra nela ao abrir, para quem usa
 * leitor de tela ouvir o menu.
 *
 * Quais categorias estão abertas mora AQUI e não na barra: a gaveta é
 * desmontada ao fechar, então cada abertura começa com tudo fechado.
 */
function Gaveta({
  categorias,
  ativa,
  pathname,
  params,
  fechar,
}: {
  categorias: CategoriaNav[];
  ativa: string | null;
  pathname: string;
  params: URLSearchParams;
  fechar: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);
  const [abertas, setAbertas] = useState<string[]>([]);
  const alternar = (id: string) =>
    setAbertas((a) => (a.includes(id) ? a.filter((x) => x !== id) : [...a, id]));
  const { zona, estilo } = useArrastarParaFechar("baixo", fechar);

  /* Só ao abrir: abrir e fechar categoria redesenha a gaveta, e o foco não
     pode pular de volta para o topo a cada toque. */
  useEffect(() => {
    painel.current?.querySelector<HTMLElement>("button, a")?.focus({ preventScroll: true });
  }, []);

  return (
    <div
      ref={painel}
      role="dialog"
      aria-label="Menu"
      onKeyDown={(e) => e.key === "Escape" && fechar()}
      style={estilo}
      className={cn(
        "ll-gaveta-sobe absolute inset-x-0 bottom-full mx-auto max-w-3xl rounded-t-2xl border border-b-0 bg-card px-3 pt-2 pb-3",
        "shadow-[0_-8px_30px_-12px_rgba(22,21,26,.35)]",
        "max-h-[75dvh] overflow-y-auto overscroll-contain",
      )}
    >
      {/* A zona de puxar: a alcinha (que diz "isto é uma gaveta") e o título
          com o X. Arrastar daqui para baixo fecha; a lista abaixo só rola. */}
      {/* `sticky`: com uma categoria grande aberta a gaveta rola, e sem isto o
          X e a alcinha sumiam lá em cima. */}
      <div {...zona} className="sticky top-0 z-10 -mx-3 -mt-2 mb-1 touch-none bg-card px-3 pt-2">
        <span aria-hidden className="mx-auto mb-1 block h-1.5 w-12 rounded-full bg-border" />
        <div className="flex items-center justify-between pb-1 pl-1">
          <p className="text-sm font-bold">Menu</p>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar o menu"
            className="grid size-10 place-items-center rounded-full text-muted-foreground hover:bg-(--ll-surface-2) hover:text-foreground"
          >
            <XIcon weight="bold" className="size-5" aria-hidden />
          </button>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {categorias.map((c) => {
          const Icone = c.icone;
          const atual = c.id === ativa;
          const classe = cn(
            "flex min-h-14 w-full items-center rounded-xl py-1.5 text-left transition-colors",
            atual ? "bg-(--ll-accent-soft) text-(--ll-accent)" : "text-foreground hover:bg-(--ll-surface-2)",
          );
          const icone = (
            <span className="grid w-12 shrink-0 place-items-center">
              <Icone weight={atual ? "fill" : "regular"} className="size-5" aria-hidden />
            </span>
          );
          const nome = (
            <span className="min-w-0 flex-1">
              <span className="block text-[15px] font-semibold">{c.nome}</span>
              <span className="block truncate text-xs font-normal text-muted-foreground">{c.desc}</span>
            </span>
          );
          if (c.opcoes.length === 1)
            return (
              <Link key={c.id} href={c.opcoes[0].href} onClick={fechar} className={classe}>
                {icone}
                {nome}
              </Link>
            );
          const mostra = abertas.includes(c.id);
          return (
            <div key={c.id} className="flex flex-col">
              <button type="button" onClick={() => alternar(c.id)} aria-expanded={mostra} className={classe}>
                {icone}
                {nome}
                <CaretDownIcon
                  weight="bold"
                  aria-hidden
                  className={cn("mr-4 ml-auto size-4 opacity-50 transition-transform duration-200", mostra && "rotate-180")}
                />
              </button>
              {mostra && (
                <div className="flex flex-col gap-2 pt-1 pb-2 pl-3">
                  {(c.acoes?.length ?? 0) > 0 && (
                    <div className="px-2.5">
                      <AtalhosDeCriar acoes={c.acoes ?? []} aoEscolher={fechar} />
                    </div>
                  )}
                  <ListaDeOpcoes categoria={c} pathname={pathname} params={params} aoEscolher={fechar} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
