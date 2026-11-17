"use client";

import Link from "next/link";
import { useState } from "react";
import { QuestionIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { guia, type Guia, type IdGuia } from "../ajuda.guias";

/*
 * O "?" ao lado do título de cada tela, como no app antigo. Cada tela diz
 * qual guia é o dela (a mesma tela muda de assunto pela aba: A receber,
 * A pagar…) — por isso o id vem de fora, e não da URL.
 */
export function BotaoAjuda({ guia: id, className }: { guia: IdGuia; className?: string }) {
  const g = guia(id);
  return (
    <JanelaGuia guia={g}>
      <DialogTrigger
        render={
          <button
            type="button"
            aria-label={`Como funciona: ${g.titulo}`}
            title="Como funciona esta tela"
            className={cn(
              "inline-grid size-6 shrink-0 place-items-center rounded-full border border-(--ll-accent-line) align-middle text-(--ll-accent) transition-colors",
              "hover:bg-(--ll-accent-soft) focus-visible:ring-2 focus-visible:ring-(--ll-accent) focus-visible:outline-none",
              className,
            )}
          />
        }
      >
        <QuestionIcon weight="bold" className="size-3.5" aria-hidden />
      </DialogTrigger>
    </JanelaGuia>
  );
}

/** O guia aberto: passos numerados e, quando há destino, o botão que leva até a tela. */
export function JanelaGuia({ guia: g, children }: { guia: Guia; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {children}
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{g.titulo}</DialogTitle>
          <DialogDescription>{g.resumo}</DialogDescription>
        </DialogHeader>

        <ol className="space-y-3">
          {g.passos.map((p, i) => (
            <li key={i} className="flex gap-3 text-sm leading-relaxed">
              <span className="grid size-6 shrink-0 place-items-center rounded-full bg-(--ll-accent-soft) text-xs font-bold text-(--ll-brand) tabular-nums">
                {i + 1}
              </span>
              <span className="pt-0.5">{p}</span>
            </li>
          ))}
        </ol>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3">
          <Link
            href="/tutoriais"
            onClick={() => setAberto(false)}
            className="text-sm text-muted-foreground hover:text-foreground hover:underline"
          >
            Todos os tutoriais
          </Link>
          {g.ir && (
            <Button
              nativeButton={false}
              render={<Link href={g.ir.href} onClick={() => setAberto(false)} />}
            >
              {g.ir.rotulo}
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
