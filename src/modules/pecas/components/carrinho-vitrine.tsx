"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { MinusIcon, PlusIcon, ShoppingBagIcon, TrashIcon, WhatsappLogoIcon } from "@phosphor-icons/react/ssr";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";

/*
 * O carrinho do catálogo público. Não grava nada no banco: ele só junta os
 * produtos para virar UMA mensagem de WhatsApp, e a loja confirma por lá.
 *
 * Mora no localStorage do aparelho da cliente, que pode fechar o link e
 * voltar depois. Vence em 7 dias: preço guardado há um mês já pode ter
 * mudado, e a mensagem sairia com o valor velho.
 */

export type ItemCarrinho = {
  id: string;
  sku: string;
  nome: string;
  tamanho: string | null;
  preco: number;
  quantidade: number;
};

type Guardado = { em: number; itens: ItemCarrinho[] };

const CHAVE = "lalolla-carrinho";
const VALIDADE_MS = 7 * 24 * 60 * 60 * 1000;

type Carrinho = {
  itens: ItemCarrinho[];
  adicionar: (item: Omit<ItemCarrinho, "quantidade">) => void;
  mudar: (id: string, delta: number) => void;
  remover: (id: string) => void;
  limpar: () => void;
  numero: string | null;
};

const ContextoCarrinho = createContext<Carrinho | null>(null);

export function useCarrinho(): Carrinho {
  const c = useContext(ContextoCarrinho);
  if (!c) throw new Error("useCarrinho fora do CarrinhoProvider");
  return c;
}

function ler(): ItemCarrinho[] {
  try {
    const bruto = localStorage.getItem(CHAVE);
    if (!bruto) return [];
    const g = JSON.parse(bruto) as Guardado;
    if (!Array.isArray(g.itens) || Date.now() - g.em > VALIDADE_MS) return [];
    return g.itens;
  } catch {
    return [];
  }
}

function gravar(itens: ItemCarrinho[]) {
  try {
    if (itens.length === 0) localStorage.removeItem(CHAVE);
    else localStorage.setItem(CHAVE, JSON.stringify({ em: Date.now(), itens } satisfies Guardado));
  } catch {
    // Aba anônima ou armazenamento bloqueado: o carrinho vale só enquanto a página estiver aberta.
  }
}

export function CarrinhoProvider({ numero, children }: { numero: string | null; children: ReactNode }) {
  // `null` = ainda não lido. Sem essa marca, o primeiro gravar apagaria o carrinho salvo antes de lê-lo.
  const [guardados, setItens] = useState<ItemCarrinho[] | null>(null);
  const itens = guardados ?? [];

  // Lido depois de montar: no servidor não há localStorage, e ler na primeira pintura daria divergência de hidratação.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItens(ler());
  }, []);

  useEffect(() => {
    if (guardados) gravar(guardados);
  }, [guardados]);

  const valor: Carrinho = {
    itens,
    numero,
    adicionar: (item) => {
      setItens((salvo) => {
        const atual = salvo ?? [];
        const ja = atual.find((i) => i.id === item.id);
        if (ja) return atual.map((i) => (i.id === item.id ? { ...i, quantidade: i.quantidade + 1 } : i));
        return [...atual, { ...item, quantidade: 1 }];
      });
      toast.success(`${item.nome} no carrinho`);
    },
    mudar: (id, delta) =>
      setItens((atual) =>
        (atual ?? []).flatMap((i) => {
          if (i.id !== id) return [i];
          const q = i.quantidade + delta;
          return q > 0 ? [{ ...i, quantidade: q }] : [];
        }),
      ),
    remover: (id) => setItens((atual) => (atual ?? []).filter((i) => i.id !== id)),
    limpar: () => setItens([]),
  };

  return <ContextoCarrinho.Provider value={valor}>{children}</ContextoCarrinho.Provider>;
}

function mensagemPedido(itens: ItemCarrinho[], total: number): string {
  const linhas = itens.map((i) => {
    const tam = i.tamanho ? `, ${i.tamanho}` : "";
    const cada = i.quantidade > 1 ? ` (${brl(i.preco)} cada)` : "";
    return `• ${i.quantidade}× ${i.nome}${tam} (${i.sku}): ${brl(i.preco * i.quantidade)}${cada}`;
  });
  return ["Oi! Quero fazer este pedido pelo catálogo:", "", ...linhas, "", `Total: ${brl(total)}`].join("\n");
}

export function BotaoAdicionar({ item, className }: { item: Omit<ItemCarrinho, "quantidade">; className?: string }) {
  const { itens, adicionar, mudar } = useCarrinho();
  const noCarrinho = itens.find((i) => i.id === item.id)?.quantidade ?? 0;

  if (noCarrinho === 0) {
    return (
      <button
        type="button"
        onClick={() => adicionar(item)}
        className={cn(
          // Contorno: o botão cheio do card é o "Comprar agora", que é o caminho de quem quer um só.
          "inline-flex h-10 items-center justify-center gap-1.5 rounded-full border border-(--ll-accent-line) text-sm font-semibold text-(--ll-brand) transition-colors hover:bg-(--ll-accent-soft)",
          className,
        )}
      >
        <ShoppingBagIcon aria-hidden className="size-4.5" />
        Adicionar
      </button>
    );
  }

  return (
    <div className={cn("flex h-10 items-center justify-between rounded-full border border-(--ll-accent-line) px-1", className)}>
      <button
        type="button"
        onClick={() => mudar(item.id, -1)}
        aria-label={`Tirar um ${item.nome}`}
        className="grid size-8 place-items-center rounded-full hover:bg-(--ll-accent-soft)"
      >
        <MinusIcon aria-hidden className="size-4" />
      </button>
      <span className="text-sm font-semibold tabular-nums" aria-live="polite">
        {noCarrinho} no carrinho
      </span>
      <button
        type="button"
        onClick={() => mudar(item.id, 1)}
        aria-label={`Mais um ${item.nome}`}
        className="grid size-8 place-items-center rounded-full hover:bg-(--ll-accent-soft)"
      >
        <PlusIcon aria-hidden className="size-4" />
      </button>
    </div>
  );
}

export function BotaoCarrinho() {
  const { itens, mudar, remover, limpar, numero } = useCarrinho();
  const quantos = itens.reduce((s, i) => s + i.quantidade, 0);
  const total = itens.reduce((s, i) => s + i.preco * i.quantidade, 0);
  const link = numero
    ? `https://wa.me/${numero}?text=${encodeURIComponent(mensagemPedido(itens, total))}`
    : null;

  return (
    <Dialog>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={quantos ? `Carrinho, ${quantos} ${quantos === 1 ? "item" : "itens"}` : "Carrinho vazio"}
            className="relative grid size-9 shrink-0 place-items-center rounded-lg text-muted-foreground outline-none hover:bg-(--ll-surface-2) hover:text-foreground focus-visible:ring-2 focus-visible:ring-(--ll-accent)"
          />
        }
      >
        <ShoppingBagIcon aria-hidden className="size-5" />
        {quantos > 0 && (
          <span className="absolute -top-0.5 -right-0.5 grid min-w-4.5 place-items-center rounded-full bg-(--ll-brand) px-1 text-[10px] leading-4.5 font-bold text-(--ll-accent-ink) tabular-nums">
            {quantos}
          </span>
        )}
      </DialogTrigger>

      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Seu pedido</DialogTitle>
          <DialogDescription>
            {quantos
              ? "Confira e envie. A loja responde no WhatsApp para combinar pagamento e entrega."
              : "Seu carrinho está vazio. Toque em “Adicionar” nos produtos que gostar."}
          </DialogDescription>
        </DialogHeader>

        {quantos > 0 && (
          <>
            <ul className="divide-y rounded-xl border">
              {itens.map((i) => (
                <li key={i.id} className="flex items-center gap-2 px-3 py-2.5">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{i.nome}</p>
                    <p className="text-xs text-muted-foreground">
                      {i.tamanho ? `${i.tamanho} · ` : ""}
                      {brl(i.preco)}
                    </p>
                  </div>
                  <div className="flex items-center">
                    <button
                      type="button"
                      onClick={() => mudar(i.id, -1)}
                      aria-label={`Tirar um ${i.nome}`}
                      className="grid size-8 place-items-center rounded-full hover:bg-(--ll-accent-soft)"
                    >
                      <MinusIcon aria-hidden className="size-4" />
                    </button>
                    <span className="w-6 text-center text-sm font-semibold tabular-nums">{i.quantidade}</span>
                    <button
                      type="button"
                      onClick={() => mudar(i.id, 1)}
                      aria-label={`Mais um ${i.nome}`}
                      className="grid size-8 place-items-center rounded-full hover:bg-(--ll-accent-soft)"
                    >
                      <PlusIcon aria-hidden className="size-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => remover(i.id)}
                      aria-label={`Remover ${i.nome}`}
                      className="ml-1 grid size-8 place-items-center rounded-full text-muted-foreground hover:bg-(--ll-accent-soft) hover:text-foreground"
                    >
                      <TrashIcon aria-hidden className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
            </ul>

            <div className="flex items-baseline justify-between px-1">
              <span className="text-sm text-muted-foreground">Total</span>
              <span className="text-lg font-bold text-(--ll-brand)">{brl(total)}</span>
            </div>

            {link ? (
              <a
                href={link}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-(--ll-brand) font-semibold text-(--ll-accent-ink) transition-colors hover:bg-(--ll-accent-hover)"
              >
                <WhatsappLogoIcon aria-hidden className="size-5" />
                Enviar pedido pelo WhatsApp
              </a>
            ) : (
              <p className="rounded-lg border border-dashed px-3 py-2 text-sm text-muted-foreground">
                O WhatsApp da loja ainda não foi configurado. Fale com a loja para fazer o pedido.
              </p>
            )}
            <Button variant="ghost" type="button" onClick={limpar} className="text-muted-foreground">
              Esvaziar carrinho
            </Button>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
