"use client";

import { useCallback, useState } from "react";
import { FileTextIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { enviarMensagemAction, resumirTelaAction } from "../assistente.actions";
import { ChatMensagens } from "./chat-mensagens";
import { ChatInput } from "./chat-input";
import type { Mensagem, Tela } from "../assistente.schemas";

/*
 * O assistente numa tela própria (Início › IA).
 *
 * Antes ele era um robô flutuando no canto de todas as telas, com um botão
 * "resumir esta página". O João pediu o assistente como opção do menu e sem o
 * ícone (08/10/2026). Sem página por baixo, o "resumir" virou uma fileira:
 * escolhe-se QUAL tela resumir.
 *
 * As peças são as mesmas do chat flutuante (mensagens, campo e as duas
 * actions), só o arranjo muda.
 */

const TELAS: ReadonlyArray<readonly [Tela, string]> = [
  ["inicio", "Início"],
  ["vendas", "Vendas"],
  ["orcamentos", "Orçamentos"],
  ["financeiro", "Financeiro"],
  ["estoque", "Estoque"],
  ["compras", "Compras"],
];

const SUGESTOES = [
  "Quais peças estão zeradas?",
  "Como foram as vendas este mês?",
  "Há contas vencidas?",
  "Qual peça mais vendeu este ano?",
];

export function ChatPagina() {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [valor, setValor] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  const perguntar = useCallback(
    async (texto: string) => {
      const pergunta = texto.trim();
      if (!pergunta || digitando) return;
      const antes = mensagens;
      setMensagens([...antes, { papel: "user", texto: pergunta }]);
      setValor("");
      setDigitando(true);
      setErro(null);
      // Vai só o histórico ANTERIOR: a pergunta de agora segue à parte.
      const r = await enviarMensagemAction({ mensagem: pergunta, historico: antes });
      setDigitando(false);
      if (!r.ok) return setErro(r.error.message);
      setMensagens((m) => [...m, { papel: "model", texto: r.data.resposta }]);
    },
    [digitando, mensagens],
  );

  const resumir = useCallback(
    async (tela: Tela, nome: string) => {
      if (digitando) return;
      setDigitando(true);
      setErro(null);
      const r = await resumirTelaAction({ tela });
      setDigitando(false);
      if (!r.ok) return setErro(r.error.message);
      setMensagens((m) => [
        ...m,
        { papel: "user", texto: `\u{1F4C4} Resumo: ${nome}` },
        { papel: "model", texto: r.data.resposta },
      ]);
    },
    [digitando],
  );

  const vazio = mensagens.length === 0 && !digitando;

  return (
    <Card as="section" className="flex min-h-0 flex-1 flex-col gap-0 overflow-hidden p-0 text-base">
      {vazio ? (
        <div className="flex-1 overflow-y-auto p-5">
          <p className="font-semibold">O que você quer saber da loja?</p>
          <p className="mt-0.5 text-sm text-muted-foreground">
            Ela lê vendas, estoque, orçamentos e caixa para responder. Não muda nada no sistema.
          </p>

          <p className="mt-5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Pergunte</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {SUGESTOES.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => perguntar(s)}
                className="rounded-full border px-3 py-1.5 text-sm transition-colors hover:border-(--ll-accent-line) hover:bg-(--ll-accent-soft) hover:text-(--ll-accent)"
              >
                {s}
              </button>
            ))}
          </div>

          <p className="mt-5 text-[11px] font-bold tracking-wide text-muted-foreground uppercase">Resumir uma tela</p>
          <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {TELAS.map(([tela, nome]) => (
              <button
                key={tela}
                type="button"
                onClick={() => resumir(tela, nome)}
                className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-medium transition-colors hover:bg-(--ll-surface-2)"
              >
                <FileTextIcon className="size-4 shrink-0 text-(--ll-accent)" aria-hidden />
                {nome}
              </button>
            ))}
          </div>

          {erro && (
            <p role="alert" className="mt-4 text-sm text-destructive">
              {erro}
            </p>
          )}
        </div>
      ) : (
        <>
          <div className="flex shrink-0 items-center justify-between gap-2 border-b px-4 py-2">
            {/* Com a conversa andando, os resumos continuam à mão: fileira
                que rola de lado em vez de ocupar a tela. */}
            <div className="-mx-1 flex min-w-0 gap-1.5 overflow-x-auto px-1 py-0.5">
              {TELAS.map(([tela, nome]) => (
                <button
                  key={tela}
                  type="button"
                  disabled={digitando}
                  onClick={() => resumir(tela, nome)}
                  className="shrink-0 rounded-full border px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:bg-(--ll-surface-2) hover:text-foreground disabled:opacity-50"
                >
                  Resumir {nome}
                </button>
              ))}
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="shrink-0 text-muted-foreground"
              onClick={() => {
                setMensagens([]);
                setErro(null);
                setValor("");
              }}
            >
              <TrashIcon className="size-4" aria-hidden />
              Limpar
            </Button>
          </div>
          <ChatMensagens mensagens={mensagens} digitando={digitando} erro={erro} />
        </>
      )}
      <ChatInput valor={valor} onChange={setValor} onEnviar={() => perguntar(valor)} digitando={digitando} />
    </Card>
  );
}
