"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

export function BuscaCompras({ valor, filtro }: { valor?: string; filtro: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action={(fd) => {
        const q = String(fd.get("busca") ?? "").trim();
        const p = new URLSearchParams();
        if (filtro !== "todas") p.set("filtro", filtro);
        if (q) p.set("busca", q);
        const s = p.toString();
        iniciar(() => router.push(s ? `/compras?${s}` : "/compras"));
      }}
    >
      <Input
        name="busca"
        type="search"
        defaultValue={valor ?? ""}
        placeholder="Buscar por número, fornecedor ou peça…"
        aria-label="Buscar compras"
        disabled={pendente}
        className="text-base"
      />
    </form>
  );
}
