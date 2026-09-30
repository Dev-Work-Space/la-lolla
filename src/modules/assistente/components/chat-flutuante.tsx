"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { usePathname } from "next/navigation";
import {
  RobotIcon,
  XIcon,
  TrashIcon,
  FileTextIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { enviarMensagemAction, resumirTelaAction } from "../assistente.actions";
import { ChatMensagens } from "./chat-mensagens";
import { ChatInput } from "./chat-input";
import type { Mensagem, Tela } from "../assistente.schemas";

/* ─── Mapa de rota → tela suportada ─────────────────────────── */

const ROTAS_SUPORTADAS: Record<string, Tela> = {
  "/": "inicio",
  "/vendas": "vendas",
  "/orcamentos": "orcamentos",
  "/financeiro": "financeiro",
  "/estoque": "estoque",
  "/compras": "compras",
};

function telaAtual(pathname: string): Tela | null {
  for (const [rota, tela] of Object.entries(ROTAS_SUPORTADAS)) {
    if (rota === "/" ? pathname === "/" : pathname === rota || pathname.startsWith(rota + "/")) {
      return tela;
    }
  }
  return null;
}

/* ─── Componente principal ───────────────────────────────────── */

interface ChatFlutuanteProps {
  /** Se falso, a GEMINI_API_KEY não está configurada: o botão não aparece. */
  configurado: boolean;
}

export function ChatFlutuante({ configurado }: ChatFlutuanteProps) {
  const [aberto, setAberto] = useState(false);
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [inputValor, setInputValor] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const tela = telaAtual(pathname);

  // Foca o campo de texto ao abrir.
  useEffect(() => {
    if (aberto) {
      const el = document.getElementById("chat-input");
      el?.focus();
    }
  }, [aberto]);

  // ESC fecha a janela.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && aberto) setAberto(false);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [aberto]);

  const enviar = useCallback(async () => {
    const texto = inputValor.trim();
    if (!texto || digitando) return;

    const novaMensagem: Mensagem = { papel: "user", texto };
    const novasMensagens = [...mensagens, novaMensagem];

    setMensagens(novasMensagens);
    setInputValor("");
    setDigitando(true);
    setErro(null);

    const result = await enviarMensagemAction({
      mensagem: texto,
      // Envia apenas o histórico anterior (sem a mensagem atual que já foi adicionada).
      historico: mensagens,
    });

    setDigitando(false);

    if (!result.ok) {
      setErro(result.error.message);
      return;
    }

    setMensagens([
      ...novasMensagens,
      { papel: "model", texto: result.data.resposta },
    ]);
  }, [inputValor, digitando, mensagens]);

  const resumir = useCallback(async () => {
    if (!tela || digitando) return;

    setDigitando(true);
    setErro(null);

    const result = await resumirTelaAction({ tela });

    setDigitando(false);

    if (!result.ok) {
      setErro(result.error.message);
      return;
    }

    setMensagens((prev) => [
      ...prev,
      {
        papel: "user" as const,
        texto: `\u{1F4C4} Resumo: ${nomeDaTela(tela)}`,
      },
      { papel: "model" as const, texto: result.data.resposta },
    ]);
  }, [tela, digitando]);

  const limpar = useCallback(() => {
    setMensagens([]);
    setErro(null);
    setInputValor("");
  }, []);

  if (!configurado) return null;

  return (
    <>
      {/* Botão flutuante */}
      <div
        className={cn(
          "fixed bottom-[calc(var(--nav-inferior,0px)+env(safe-area-inset-bottom)+1rem)] right-4 z-50",
          "md:bottom-6",
        )}
      >
        <Button
          id="btn-assistente"
          onClick={() => setAberto((v) => !v)}
          size="icon"
          className={cn(
            "h-12 w-12 rounded-full shadow-lg transition-transform",
            aberto ? "rotate-90 scale-90" : "hover:scale-110",
          )}
          aria-label={aberto ? "Fechar assistente" : "Abrir assistente de chat"}
          aria-expanded={aberto}
        >
          {aberto ? (
            <XIcon weight="regular" className="h-5 w-5" />
          ) : (
            <RobotIcon weight="bold" className="h-5 w-5" />
          )}
        </Button>
      </div>

      {/* Janela de chat */}
      {aberto && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Assistente LaLolla"
          className={cn(
            "fixed z-50 flex flex-col overflow-hidden",
            "shadow-2xl border bg-background",
            // Celular: tela inteira
            "inset-0",
            // Desktop: canto inferior direito
            "md:inset-auto md:bottom-24 md:right-4 md:w-[380px] md:h-[560px] md:rounded-2xl",
          )}
        >
          {/* Cabeçalho */}
          <div className="flex items-center gap-2 border-b bg-muted/50 px-4 py-3 shrink-0">
            <RobotIcon weight="regular" className="h-4 w-4 text-muted-foreground" />
            <span className="flex-1 text-sm font-medium">Assistente LaLolla</span>

            {/* Botão de resumo da página */}
            <Button
              id="btn-resumir-pagina"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={resumir}
              disabled={!tela || digitando}
              title={
                tela
                  ? `Resumir: ${nomeDaTela(tela)}`
                  : "Resumo não disponível nesta página"
              }
              aria-label={
                tela
                  ? `Resumir página ${nomeDaTela(tela)}`
                  : "Resumo não disponível nesta página"
              }
            >
              <FileTextIcon weight="regular" className="h-4 w-4" />
            </Button>

            {/* Limpar conversa */}
            <Button
              id="btn-limpar-chat"
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={limpar}
              disabled={mensagens.length === 0 && !erro}
              title="Limpar conversa"
              aria-label="Limpar conversa"
            >
              <TrashIcon weight="regular" className="h-4 w-4" />
            </Button>

            {/* Fechar */}
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-muted-foreground"
              onClick={() => setAberto(false)}
              aria-label="Fechar assistente"
            >
              <XIcon weight="regular" className="h-4 w-4" />
            </Button>
          </div>

          {/* Mensagens */}
          <ChatMensagens
            mensagens={mensagens}
            digitando={digitando}
            erro={erro}
          />

          {/* Input */}
          <ChatInput
            valor={inputValor}
            onChange={setInputValor}
            onEnviar={enviar}
            digitando={digitando}
          />
        </div>
      )}
    </>
  );
}

/* ─── Helper ─────────────────────────────────────────────────── */

function nomeDaTela(tela: Tela): string {
  const nomes: Record<Tela, string> = {
    inicio: "Início",
    vendas: "Vendas",
    orcamentos: "Orçamentos",
    financeiro: "Financeiro",
    estoque: "Estoque",
    compras: "Compras",
  };
  return nomes[tela];
}
