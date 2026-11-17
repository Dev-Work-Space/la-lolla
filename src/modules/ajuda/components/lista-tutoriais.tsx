"use client";

import { CaretRightIcon } from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/card";
import { DialogTrigger } from "@/components/ui/dialog";
import { GRUPOS, GUIAS } from "../ajuda.guias";
import { JanelaGuia } from "./botao-ajuda";

/* A tela de Tutoriais: os guias em três grupos, como no app antigo. */
export function ListaTutoriais() {
  return (
    <div className="space-y-6">
      {GRUPOS.map((gr) => (
        <section key={gr.id} aria-labelledby={`grupo-${gr.id}`}>
          <h2 id={`grupo-${gr.id}`} className="text-[11px] font-bold tracking-wide text-(--ll-accent) uppercase">
            {gr.nome}
          </h2>
          <p className="mb-2 text-sm text-muted-foreground">{gr.desc}</p>
          <Card className="block overflow-hidden py-0">
            <ul className="divide-y">
            {GUIAS.filter((g) => g.grupo === gr.id).map((g) => (
              <li key={g.id}>
                <JanelaGuia guia={g}>
                  <DialogTrigger
                    render={
                      <button
                        type="button"
                        className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/40"
                      />
                    }
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block text-sm font-semibold">{g.titulo}</span>
                      <span className="mt-0.5 block truncate text-xs text-muted-foreground">
                        {g.resumo} · {g.passos.length} passos
                      </span>
                    </span>
                    <CaretRightIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </DialogTrigger>
                </JanelaGuia>
              </li>
            ))}
            </ul>
          </Card>
        </section>
      ))}
    </div>
  );
}
