"use client";

import { startTransition, useCallback, useEffect, useRef, useState } from "react";
import { FileTextIcon, TrashIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { enviarMensagemAction } from "../assistente.actions";
import { ChatMensagens } from "./chat-mensagens";
import { ChatInput } from "./chat-input";
import { MAX_HISTORICO, MAX_RESPOSTA, MAX_TEXTO_HISTORICO, type EntradaAssistente, type Mensagem, type Tela } from "../assistente.schemas";

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

function historicoLimitado(mensagens: Mensagem[]): Mensagem[] {
  const recentes: Mensagem[] = [];
  let tamanho = 0;
  for (const m of mensagens.slice(-MAX_HISTORICO).reverse()) {
    const texto = m.texto.slice(0, MAX_RESPOSTA);
    if (tamanho + texto.length > MAX_TEXTO_HISTORICO) break;
    recentes.unshift({ ...m, texto });
    tamanho += texto.length;
  }
  return recentes;
}

export function ChatPagina({ telas }: { telas: Tela[] }) {
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [valor, setValor] = useState("");
  const [digitando, setDigitando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const geracao = useRef(0);
  const ocupado = useRef(false);
  const telasVisiveis = TELAS.filter(([tela]) => telas.includes(tela));

  const limpar = useCallback(() => {
    geracao.current++;
    ocupado.current = false;
    setMensagens([]);
    setValor("");
    setErro(null);
    setDigitando(false);
  }, []);

  // React Activity pode preservar a página no cache do Next. A limpeza dos
  // efeitos também ocorre quando ela sai de vista: a conversa não reaparece.
  useEffect(() => () => limpar(), [limpar]);

  const enviar = useCallback((entrada: EntradaAssistente, texto: string) => {
    if (ocupado.current) return;
    ocupado.current = true;
    const requisicao = ++geracao.current;
    setMensagens((m) => historicoLimitado([...m, { papel: "user", texto }]));
    setValor("");
    setDigitando(true);
    setErro(null);
    startTransition(async () => {
      try {
        const r = await enviarMensagemAction(entrada);
        if (requisicao !== geracao.current) return;
        if (!r.ok) setErro(r.error.message);
        else setMensagens((m) => historicoLimitado([...m, { papel: "model", texto: r.data.resposta }]));
      } catch {
        if (requisicao === geracao.current) setErro("Não foi possível enviar a mensagem. Tente novamente.");
      } finally {
        if (requisicao === geracao.current) {
          ocupado.current = false;
          setDigitando(false);
        }
      }
    });
  }, []);

  const perguntar = useCallback((texto: string) => {
    const mensagem = texto.trim();
    if (!mensagem) return;
    enviar({ modo: "chat", mensagem, historico: historicoLimitado(mensagens) }, mensagem);
  }, [enviar, mensagens]);

  const resumir = useCallback((tela: Tela, nome: string) => {
    enviar({ modo: "resumo", tela }, `\u{1F4C4} Resumo: ${nome}`);
  }, [enviar]);

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
            {telasVisiveis.map(([tela, nome]) => (
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
              {telasVisiveis.map(([tela, nome]) => (
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
              onClick={limpar}
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
