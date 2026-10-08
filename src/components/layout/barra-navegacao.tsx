"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { CaretDownIcon, ListIcon, XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { categoriasVisiveis, fixosVisiveis, opcaoAtual, type CategoriaNav } from "./navegacao";
import { AtalhosDeCriar, ListaDeOpcoes, useMenuAberto } from "./menu-arvore";

/*
 * Barra fixa de baixo, só no celular. No PC a navegação vive na barra
 * lateral. A LISTA não mora aqui — está em ./navegacao.ts, que não é módulo
 * cliente e por isso pode ser lido também pelo servidor. Ver o comentário lá.
 *
 * O MESMO MENU DO PC, do jeito do celular (pedido do João, 08/10/2026):
 * Início e IA são botões fixos, de um toque; "Menu" sobe uma gaveta com as
 * categorias; cada uma abre as mesmas opções do painel do PC (ícone, nome e
 * frase, mais os atalhos de criar), e a categoria aberta continua aberta até
 * a pessoa fechar. Ajustes não está
 * aqui — mora no cabeçalho, ao lado do tema, que é o "lá embaixo" do celular.
 */
export function BarraNavegacao({ permissoes, papel, temIA }: { permissoes: Permissoes; papel: Papel; temIA: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const router = useRouter();
  const fixos = fixosVisiveis(temIA);
  const categorias = categoriasVisiveis(permissoes, papel);
  const ativa = categorias.find((c) => opcaoAtual(c, pathname, params))?.id ?? null;
  const { abertas, alternar } = useMenuAberto(ativa);
  const [menu, setMenu] = useState(false);
  const fechar = () => setMenu(false);

  const botao = (acesa: boolean) =>
    cn(
      "flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-center",
      "transition-colors duration-150",
      acesa ? "text-(--ll-accent)" : "text-muted-foreground",
    );

  return (
    <>
      {/* O véu fica FORA da <nav>: o `backdrop-blur` dela faz de qualquer
          `fixed` lá dentro um filho preso à barra, e o véu não cobriria a tela. */}
      {menu && (
        <button
          type="button"
          aria-label="Fechar o menu"
          tabIndex={-1}
          onClick={fechar}
          className="fixed inset-0 z-30 bg-black/25 md:hidden"
        />
      )}
      <nav
        className={cn(
          "fixed inset-x-0 bottom-0 z-40 border-t bg-background/95 backdrop-blur md:hidden",
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
            /* O dedo encostou: começa a buscar as telas das categorias abertas
               já, antes de a gaveta subir e de a pessoa escolher. */
            onPointerDown={() => {
              for (const c of categorias)
                for (const o of abertas.includes(c.id) ? c.opcoes : c.opcoes.slice(0, 1)) router.prefetch(o.href);
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
            abertas={abertas}
            alternar={alternar}
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
 * ao tocar fora, no X ou no Esc; abrir e fechar categoria NÃO fecha a gaveta.
 * O foco entra nela ao abrir, para quem usa leitor de tela ouvir o menu.
 */
function Gaveta({
  categorias,
  ativa,
  abertas,
  alternar,
  pathname,
  params,
  fechar,
}: {
  categorias: CategoriaNav[];
  ativa: string | null;
  abertas: string[];
  alternar: (id: string) => void;
  pathname: string;
  params: URLSearchParams;
  fechar: () => void;
}) {
  const painel = useRef<HTMLDivElement>(null);

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
      className={cn(
        "absolute inset-x-0 bottom-full mx-auto max-w-3xl rounded-t-2xl border border-b-0 bg-card px-3 pt-2 pb-3",
        "shadow-[0_-8px_30px_-12px_rgba(22,21,26,.35)]",
        "max-h-[75dvh] overflow-y-auto overscroll-contain",
      )}
    >
      {/* a alcinha diz "isto é uma gaveta" */}
      <span aria-hidden className="mx-auto mb-2 block h-1 w-10 rounded-full bg-border" />
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
