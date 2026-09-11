"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/* Busca do Estoque: escreve na URL, mantendo a aba atual. */
export function BuscaEstoque({
  aba,
  valor,
  placeholder,
}: {
  aba: "catalogo" | "insumos";
  valor?: string;
  placeholder: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  return (
    <form
      action={(fd) => {
        const q = String(fd.get("busca") ?? "").trim();
        const p = new URLSearchParams({ aba });
        if (q) p.set("busca", q);
        iniciar(() => router.push(`/estoque?${p.toString()}`));
      }}
    >
      <Input
        name="busca"
        type="search"
        defaultValue={valor ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={pendente}
        className="text-base"
      />
    </form>
  );
}
