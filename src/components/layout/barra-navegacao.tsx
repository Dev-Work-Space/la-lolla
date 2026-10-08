"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { XIcon } from "@phosphor-icons/react/ssr";
import { cn } from "@/lib/utils";
import type { Papel } from "@prisma/client";
import type { Permissoes } from "@/modules/usuarios/permissoes";
import { categoriasVisiveis, opcaoAtual, type CategoriaNav } from "./navegacao";

/*
 * Barra fixa de baixo, só no celular. No PC a navegação vive no cabeçalho.
 * A LISTA não mora aqui — está em ./navegacao.ts, que não é módulo cliente e
 * por isso pode ser lido também pelo servidor. Ver o comentário lá.
 *
 * É cliente pela URL (qual botão acender) e pelo painel de opções.
 *
 * Os botões são as CATEGORIAS do menu (navegacao.ts), as mesmas do PC.
 * Tocar numa categoria com opções abre o painel logo acima da barra, em vez
 * de ir direto: é ali que se escolhe para onde ir. Ajustes não está aqui —
 * mora no cabeçalho, ao lado do tema, que é o "lá embaixo" do celular.
 */
export function BarraNavegacao({ permissoes, papel, temIA }: { permissoes: Permissoes; papel: Papel; temIA: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const visiveis = categoriasVisiveis(permissoes, papel, temIA);
  const [aberto, setAberto] = useState<CategoriaNav | null>(null);
  const fechar = useCallback(() => setAberto(null), []);
  const router = useRouter();

  return (
    <>
      {/* O véu fica FORA da <nav>: o `backdrop-blur` dela faz de qualquer
          `fixed` lá dentro um filho preso à barra, e o véu não cobriria a tela. */}
      {aberto && (
        <button
          type="button"
          aria-label="Fechar as opções"
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
          style={{ gridTemplateColumns: `repeat(${visiveis.length}, minmax(0, 1fr))` }}
        >
          {visiveis.map((i) => {
            const Icone = i.icone;
            const atual = Boolean(opcaoAtual(i, pathname, params));
            const classe = cn(
              "flex h-full min-w-0 flex-col items-center justify-center gap-1 px-1 text-center",
              "transition-colors duration-150",
              atual || aberto?.id === i.id ? "text-(--ll-accent)" : "text-muted-foreground",
            );
            const conteudo = (
              <>
                <Icone weight={aberto?.id === i.id ? "fill" : "regular"} className="size-5 shrink-0" aria-hidden />
                <span className="w-full truncate text-[10px] font-medium leading-none">{i.curto}</span>
              </>
            );
            if (i.opcoes.length > 1)
              return (
                <button
                  key={i.id}
                  type="button"
                  onClick={() => setAberto((a) => (a?.id === i.id ? null : i))}
                  /* O dedo encostou: começa a buscar as opções já, antes de o
                     painel abrir e de a pessoa escolher. */
                  onPointerDown={() => i.opcoes.forEach((o) => router.prefetch(o.href))}
                  aria-expanded={aberto?.id === i.id}
                  aria-haspopup="dialog"
                  aria-current={atual ? "page" : undefined}
                  className={classe}
                >
                  {conteudo}
                </button>
              );
            return (
              <Link
                key={i.id}
                href={i.opcoes[0].href}
                /* No celular não existe hover: o Next busca quando o link entra
                   na tela — e esta barra está sempre na tela. Na prática, todas
                   as telas ficam prontas logo depois que o app abre. */
                prefetch
                onClick={fechar}
                aria-current={atual ? "page" : undefined}
                className={classe}
              >
                {conteudo}
              </Link>
            );
          })}
        </div>
        {aberto && <PainelOpcoes categoria={aberto} pathname={pathname} params={params} fechar={fechar} />}
      </nav>
    </>
  );
}

/*
 * O painel que sobe da barra com as opções da seção. Fecha ao escolher, ao
 * tocar fora, no X ou no Esc. O foco entra no painel ao abrir, para quem usa
 * leitor de tela ouvir as opções em seguida.
 */
function PainelOpcoes({
  categoria,
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
  const acesa = opcaoAtual(categoria, pathname, params);

  useEffect(() => {
    painel.current?.querySelector<HTMLElement>("a")?.focus({ preventScroll: true });
    const tecla = (e: KeyboardEvent) => e.key === "Escape" && fechar();
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [categoria, fechar]);

  return (
    <div
      ref={painel}
      role="dialog"
      aria-label={`Opções de ${categoria.nome}`}
      className={cn(
        "absolute inset-x-0 bottom-full mx-auto max-w-3xl rounded-t-2xl border border-b-0 bg-card px-4 pt-3 pb-3",
        "shadow-[0_-8px_30px_-12px_rgba(22,21,26,.35)]",
        "max-h-[70dvh] overflow-y-auto",
      )}
    >
      <div className="mb-2 flex items-center justify-between">
        <p className="text-sm font-bold">{categoria.nome}</p>
        <button
          type="button"
          onClick={fechar}
          aria-label="Fechar"
          className="grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-(--ll-surface-2)"
        >
          <XIcon className="size-4" aria-hidden />
        </button>
      </div>
      <ul className="grid grid-cols-2 gap-2">
        {categoria.opcoes.map((s, k) => {
          const on = s === acesa;
          const novoGrupo = s.grupo && s.grupo !== categoria.opcoes[k - 1]?.grupo;
          return (
            <li key={s.href} className="contents">
              {novoGrupo && (
                <span className="col-span-2 pt-1 text-[10px] font-bold tracking-wide text-muted-foreground uppercase">
                  {s.grupo}
                </span>
              )}
              <Link
                href={s.href}
                onClick={fechar}
                aria-current={on ? "page" : undefined}
                className={cn(
                  "flex min-h-12 items-center rounded-xl border px-3 py-2 text-sm font-medium transition-colors",
                  on
                    ? "border-(--ll-accent) bg-(--ll-accent-soft) font-semibold text-(--ll-accent)"
                    : "hover:bg-(--ll-surface-2)",
                )}
              >
                {s.nome}
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
