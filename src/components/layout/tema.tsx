"use client";

import { useEffect, useState } from "react";
import { Monitor, Moon, Sun } from "lucide-react";
import { cn } from "@/lib/utils";
import { CHAVE_TEMA, COR_BARRA_CLARA, COR_BARRA_ESCURA, type Tema } from "./tema.constantes";

/*
 * Claro, escuro ou o que o aparelho estiver usando.
 *
 * A escolha mora no localStorage, como o arranjo do painel: é do APARELHO, não
 * da conta. O celular do balcão pode ficar no claro e o computador da sala no
 * escuro, e nenhum dos dois manda no outro.
 *
 * O CSS já sabia fazer os dois temas desde o começo — o que faltava era alguém
 * dizer qual usar. `data-theme` no <html> é o que as regras leem.
 */

function prefereEscuro() {
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

/*
 * Pinta o tema. Quem manda é a CLASSE `dark` — é dela que dependem o
 * `@custom-variant dark` do globals.css e todas as utilidades `dark:` do app.
 * `data-theme` vai junto só para facilitar a depuração.
 *
 * "Do aparelho" não congela o que o sistema está usando AGORA: segue mudando
 * junto. Quem deixa o celular trocar sozinho ao anoitecer espera que o app
 * troque também.
 */
function aplicar(tema: Tema) {
  const raiz = document.documentElement;
  const escuro = tema === "escuro" || (tema === "sistema" && prefereEscuro());
  raiz.classList.toggle("dark", escuro);
  raiz.dataset.theme = escuro ? "dark" : "light";

  /*
   * A barra do sistema acompanha.
   *
   * Instalado como app, o iPhone pinta a faixa do relógio e da bateria com a
   * cor deste meta. Deixá-la fixa faria o app no escuro abrir com uma tira
   * clara em cima — a emenda apareceria justamente onde o João quer que não
   * apareça nada.
   */
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", escuro ? COR_BARRA_ESCURA : COR_BARRA_CLARA);
  try {
    if (tema === "sistema") localStorage.removeItem(CHAVE_TEMA);
    else localStorage.setItem(CHAVE_TEMA, tema);
  } catch {
    // Navegador com armazenamento bloqueado: o tema vale só nesta visita.
  }
}

/** Enquanto a escolha for "do aparelho", acompanha o sistema ao vivo. */
function seguirSistema(ativo: boolean) {
  const mq = window.matchMedia("(prefers-color-scheme: dark)");
  const aoMudar = () => aplicar("sistema");
  if (ativo) mq.addEventListener("change", aoMudar);
  return () => mq.removeEventListener("change", aoMudar);
}

const OPCOES: Array<[Tema, string, typeof Sun]> = [
  ["claro", "Claro", Sun],
  ["escuro", "Escuro", Moon],
  ["sistema", "Do aparelho", Monitor],
];

/** Três botões lado a lado, para a tela de Ajustes. */
export function EscolhaDeTema() {
  const [tema, setTema] = useState<Tema>("sistema");

  useEffect(() => {
    let salvo: string | null = null;
    try {
      salvo = localStorage.getItem(CHAVE_TEMA);
    } catch {
      // sem armazenamento: fica no "do aparelho"
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (salvo === "claro" || salvo === "escuro") setTema(salvo);
    return seguirSistema(salvo !== "claro" && salvo !== "escuro");
  }, []);

  return (
    <div className="inline-flex rounded-xl border bg-(--ll-surface-2) p-1">
      {OPCOES.map(([valor, rotulo, Icone]) => (
        <button
          key={valor}
          type="button"
          aria-pressed={tema === valor}
          onClick={() => {
            setTema(valor);
            aplicar(valor);
          }}
          className={cn(
            "inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm font-medium",
            "transition-all duration-200 ease-(--ll-ease)",
            tema === valor
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(26,24,20,.10)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          <Icone className="size-4" aria-hidden />
          {rotulo}
        </button>
      ))}
    </div>
  );
}

/*
 * Alterna claro ↔ escuro lendo o estado do PRÓPRIO documento, não de um
 * useState.
 *
 * Antes o botão guardava `escuro` num estado que nascia `false`. No servidor e
 * na primeira pintura ele desenhava a lua; o efeito rodava, via que o tema era
 * escuro e trocava para o sol. Resultado: uma piscada de ícone errado em toda
 * abertura no escuro — justamente o que o SCRIPT_TEMA existe para evitar no
 * resto da tela.
 *
 * Quem já sabe a resposta antes do React acordar é a classe `dark` no <html>,
 * posta pelo script do <head>. Então é dela que se pergunta.
 */
export function alternarTema() {
  const escuro = document.documentElement.classList.contains("dark");
  aplicar(escuro ? "claro" : "escuro");
}

/*
 * Sol e lua ficam os DOIS no documento e quem escolhe é o CSS, pela classe
 * `dark`. Sem estado, sem efeito, sem piscada: a primeira pintura já sai certa.
 *
 * O ícone que some encolhe e gira um pouco enquanto o outro cresce — a troca
 * vira um giro curto no lugar de um corte seco.
 */
function IconesTema({ tamanho = "size-[19px]" }: { tamanho?: string }) {
  return (
    <span className="relative grid place-items-center">
      <Sun
        aria-hidden
        className={cn(
          tamanho,
          "col-start-1 row-start-1 scale-50 rotate-90 opacity-0",
          "transition-[opacity,transform] duration-300 ease-(--ll-ease)",
          "dark:scale-100 dark:rotate-0 dark:opacity-100",
        )}
      />
      <Moon
        aria-hidden
        className={cn(
          tamanho,
          "col-start-1 row-start-1 scale-100 rotate-0 opacity-100",
          "transition-[opacity,transform] duration-300 ease-(--ll-ease)",
          "dark:scale-50 dark:-rotate-90 dark:opacity-0",
        )}
      />
    </span>
  );
}

/*
 * O texto também é decidido pelo CSS, pelo mesmo motivo dos ícones. Os dois
 * ficam no documento; no escuro aparece "Tema claro" (o que o clique FAZ), no
 * claro, "Tema escuro".
 */
function RotuloTema({ className }: { className?: string }) {
  return (
    <>
      <span className={cn("dark:hidden", className)}>Tema escuro</span>
      <span className={cn("hidden dark:inline", className)}>Tema claro</span>
    </>
  );
}

/**
 * Botão quadrado de ícone, para o cabeçalho do celular.
 *
 * O rótulo é fixo e verdadeiro nos dois estados: dizer "Mudar para o tema
 * escuro" no servidor e outra coisa no cliente daria divergência de hidratação.
 */
export function BotaoTema({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Alternar entre tema claro e escuro"
      title="Alternar tema"
      onClick={alternarTema}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground",
        "transition-colors hover:bg-(--ll-surface-2) hover:text-foreground",
        "outline-none focus-visible:ring-2 focus-visible:ring-(--ll-accent)",
        className,
      )}
    >
      <IconesTema tamanho="size-4" />
    </button>
  );
}

/**
 * Linha inteira, para a barra lateral: mesmo desenho dos itens de navegação.
 *
 * Ele ganhou a MESMA estrutura dos itens (trilho fixo do ícone + rótulo que
 * cresce) porque antes era um quadrado de 36px com ícone de 16px no meio de
 * linhas de 44px com ícone de 19px: com a barra aberta ele ficava 7,5px fora
 * da coluna dos outros ícones. Dava para ver.
 */
export function LinhaTema({ className }: { className?: string }) {
  return (
    <button
      type="button"
      aria-label="Alternar entre tema claro e escuro"
      onClick={alternarTema}
      className={className}
    >
      <span className="grid w-(--nav-trilho) shrink-0 place-items-center">
        <IconesTema />
      </span>
      <span
        data-rotulo
        className={cn(
          "max-w-0 overflow-hidden opacity-0",
          "transition-[opacity,max-width] duration-200 ease-(--ll-ease)",
          "group-hover:max-w-(--nav-rotulo) group-hover:opacity-100",
          "group-has-[:focus-visible]:max-w-(--nav-rotulo) group-has-[:focus-visible]:opacity-100",
        )}
      >
        <RotuloTema className="whitespace-nowrap" />
      </span>
    </button>
  );
}
