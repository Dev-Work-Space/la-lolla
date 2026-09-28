"use client";

import { useEffect, useRef } from "react";
import type { Mensagem } from "../assistente.schemas";

interface ChatMensagensProps {
  mensagens: Mensagem[];
  digitando: boolean;
  erro: string | null;
}

export function ChatMensagens({ mensagens, digitando, erro }: ChatMensagensProps) {
  const fimRef = useRef<HTMLDivElement>(null);

  // Scroll automático para a última mensagem.
  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [mensagens, digitando]);

  if (mensagens.length === 0 && !digitando) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 text-center">
        <div className="flex flex-col gap-2">
          <p className="text-sm font-medium text-foreground">
            Olá! Sou o assistente da LaLolla.
          </p>
          <p className="text-xs text-muted-foreground">
            Posso ajudar com estoque, vendas, orçamentos e financeiro da loja.
          </p>
          <div className="mt-2 flex flex-wrap gap-1.5 justify-center">
            {[
              "Quais peças estão zeradas?",
              "Como foram as vendas este mês?",
              "Há contas vencidas?",
            ].map((sugestao) => (
              <span
                key={sugestao}
                className="rounded-full border bg-muted px-2.5 py-1 text-xs text-muted-foreground"
              >
                {sugestao}
              </span>
            ))}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-y-auto p-4">
      {mensagens.map((msg, i) => (
        <div
          key={i}
          className={`flex ${msg.papel === "user" ? "justify-end" : "justify-start"}`}
        >
          <div
            className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed whitespace-pre-wrap ${
              msg.papel === "user"
                ? "bg-primary text-primary-foreground rounded-br-sm"
                : "bg-muted text-foreground rounded-bl-sm"
            }`}
          >
            {msg.texto}
          </div>
        </div>
      ))}

      {digitando && (
        <div className="flex justify-start">
          <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3">
            <span className="flex gap-1 items-center">
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.3s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce [animation-delay:-0.15s]" />
              <span className="h-1.5 w-1.5 rounded-full bg-muted-foreground animate-bounce" />
            </span>
          </div>
        </div>
      )}

      {erro && (
        <div className="flex justify-start">
          <div className="max-w-[85%] rounded-2xl rounded-bl-sm bg-destructive/10 border border-destructive/20 px-3.5 py-2.5 text-sm text-destructive">
            {erro}
          </div>
        </div>
      )}

      <div ref={fimRef} />
    </div>
  );
}
