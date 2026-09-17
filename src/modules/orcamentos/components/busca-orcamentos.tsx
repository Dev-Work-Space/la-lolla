"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/* Igual à busca de vendas, com uma diferença que importa: preserva `aba` na
   URL. Sem isso, buscar dentro de Orçamentos jogava a pessoa de volta na aba
   de Vendas com o termo digitado. */
export function BuscaOrcamentos({ valor, filtro }: { valor?: string; filtro: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action={(fd) => {
        const q = String(fd.get("busca") ?? "").trim();
        const p = new URLSearchParams({ aba: "orcamentos" });
        if (filtro !== "todos") p.set("filtro", filtro);
        if (q) p.set("busca", q);
        iniciar(() => router.push(`/vendas?${p.toString()}`));
      }}
    >
      <Input
        name="busca"
        type="search"
        defaultValue={valor ?? ""}
        placeholder="Buscar por número, cliente ou peça…"
        aria-label="Buscar orçamentos"
        disabled={pendente}
        className="text-base"
      />
    </form>
  );
}
