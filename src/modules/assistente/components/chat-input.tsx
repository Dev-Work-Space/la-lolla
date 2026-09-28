"use client";

import { useRef, type KeyboardEvent } from "react";
import { Loader2Icon, SendIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ChatInputProps {
  valor: string;
  onChange: (v: string) => void;
  onEnviar: () => void;
  digitando: boolean;
  disabled?: boolean;
}

export function ChatInput({ valor, onChange, onEnviar, digitando, disabled }: ChatInputProps) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  function handleKeyDown(e: KeyboardEvent<HTMLTextAreaElement>) {
    // Enter envia; Shift+Enter quebra linha.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!digitando && valor.trim()) onEnviar();
    }
  }

  function handleChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    onChange(e.target.value);
    // Auto-resize.
    const el = textareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
    }
  }

  return (
    <div className="flex items-end gap-2 border-t bg-background p-3">
      <textarea
        ref={textareaRef}
        id="chat-input"
        value={valor}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        placeholder="Pergunte sobre a loja…"
        disabled={disabled || digitando}
        rows={1}
        className="flex-1 resize-none rounded-xl border bg-muted/50 px-3.5 py-2.5 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring disabled:opacity-50 leading-relaxed"
        style={{ minHeight: "42px", maxHeight: "120px" }}
        aria-label="Campo de mensagem para o assistente"
      />
      <Button
        size="icon"
        onClick={onEnviar}
        disabled={disabled || digitando || !valor.trim()}
        className="shrink-0 rounded-xl h-[42px] w-[42px]"
        aria-label="Enviar mensagem"
      >
        {digitando ? (
          <Loader2Icon className="h-4 w-4 animate-spin" />
        ) : (
          <SendIcon className="h-4 w-4" />
        )}
      </Button>
    </div>
  );
}
