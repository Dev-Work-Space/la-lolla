"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";

/*
 * A busca escreve na URL. O formulário nativo já envia no Enter; a única
 * razão de ser componente cliente é usar `router.push` em vez de recarregar
 * a página inteira.
 */
export function BuscaPessoa({
  base,
  aba,
  valor,
  placeholder,
}: {
  base: string;
  aba: string;
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
        iniciar(() => router.push(`${base}?${p.toString()}`));
      }}
    >
      <Input
        name="busca"
        type="search"
        defaultValue={valor ?? ""}
        placeholder={placeholder}
        aria-label={placeholder}
        disabled={pendente}
        /* 16px: abaixo disso o Safari do iPhone dá zoom sozinho ao focar */
        className="text-base"
      />
    </form>
  );
}
