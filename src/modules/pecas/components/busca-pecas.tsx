"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/*
 * A busca vive na URL (?busca=anel), não em estado do React. Assim o
 * resultado é compartilhável, o botão voltar funciona e a página continua
 * sendo renderizada no servidor — o cliente só empurra a URL.
 */
const ABAS = [
  { valor: undefined, rotulo: "Tudo" },
  { valor: "PECA" as const, rotulo: "Peças" },
  { valor: "INSUMO" as const, rotulo: "Insumos" },
];

export function BuscaPecas({ busca, tipo }: { busca?: string; tipo?: "PECA" | "INSUMO" }) {
  const router = useRouter();
  const params = useSearchParams();
  const [pendente, iniciar] = useTransition();

  function navegar(mudanca: Record<string, string | undefined>) {
    const p = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    iniciar(() => router.push(`/estoque?${p.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <form
        className="min-w-0 flex-1"
        action={(fd) => navegar({ busca: String(fd.get("busca") ?? "").trim() || undefined })}
      >
        <Input
          name="busca"
          defaultValue={busca ?? ""}
          placeholder="Buscar por nome, código ou categoria…"
          className="text-base"
          aria-label="Buscar peças"
        />
      </form>

      <div className="flex shrink-0 gap-1 rounded-lg border p-1">
        {ABAS.map((a) => (
          <Button
            key={a.rotulo}
            type="button"
            size="sm"
            variant="ghost"
            disabled={pendente}
            onClick={() => navegar({ tipo: a.valor })}
            className={cn("h-7 px-3", tipo === a.valor && "bg-accent text-accent-foreground")}
          >
            {a.rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}
