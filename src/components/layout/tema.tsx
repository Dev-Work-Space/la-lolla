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

/**
 * Botão único que gira claro → escuro → claro. Para a barra e o cabeçalho,
 * onde não cabem três botões.
 */
export function BotaoTema({ className }: { className?: string }) {
  const [escuro, setEscuro] = useState(false);

  useEffect(() => {
    const salvo = (() => {
      try {
        return localStorage.getItem(CHAVE_TEMA);
      } catch {
        return null;
      }
    })();
    const estaEscuro =
      salvo === "escuro" ||
      (salvo !== "claro" && window.matchMedia("(prefers-color-scheme: dark)").matches);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setEscuro(estaEscuro);
  }, []);

  return (
    <button
      type="button"
      aria-label={escuro ? "Mudar para o tema claro" : "Mudar para o tema escuro"}
      title={escuro ? "Tema claro" : "Tema escuro"}
      onClick={() => {
        const novo = !escuro;
        setEscuro(novo);
        aplicar(novo ? "escuro" : "claro");
      }}
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground",
        "transition-colors hover:bg-(--ll-surface-2) hover:text-foreground",
        className,
      )}
    >
      {escuro ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
