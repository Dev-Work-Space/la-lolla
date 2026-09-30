"use client";

import { Seletor } from "@/components/padrao/seletor";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

/*
 * Os dois seletores do catálogo: fornecedor e categoria, ambos com a
 * CONTAGEM ao lado. Só entram opções que de fato têm peça — a lista inteira
 * encheria o seletor de escolhas que não filtram nada (era assim no antigo).
 */
export function FiltrosCatalogo({
  opcoes,
  fornecedorId,
  categoria,
  busca,
  filtro,
}: {
  opcoes: {
    fornecedores: Array<{ id: string; nome: string; qtd: number }>;
    semFornecedor: number;
    categorias: Array<{ nome: string; qtd: number }>;
  };
  fornecedorId?: string;
  categoria?: string;
  busca?: string;
  filtro: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function navegar(campo: "fornecedor" | "categoria", valor: string) {
    const p = new URLSearchParams({ aba: "catalogo" });
    if (busca) p.set("busca", busca);
    if (filtro !== "todos") p.set("filtro", filtro);
    if (campo === "fornecedor") {
      if (valor) p.set("fornecedor", valor);
      if (categoria) p.set("categoria", categoria);
    } else {
      if (fornecedorId) p.set("fornecedor", fornecedorId);
      if (valor) p.set("categoria", valor);
    }
    iniciar(() => router.push(`/estoque?${p.toString()}`));
  }

  const estilo =
    "h-10 w-full min-w-0 rounded-lg border bg-card px-3 text-sm text-foreground disabled:opacity-60";

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      <Seletor
        aria-label="Filtrar por fornecedor"
        className={estilo}
        value={fornecedorId ?? ""}
        disabled={pendente}
        onValueChange={(valor) => navegar("fornecedor", valor)}
        opcoes={[
          { value: "", label: "Todos os fornecedores" },
          ...opcoes.fornecedores.map((f) => ({ value: f.id, label: <>{f.nome} ({f.qtd})</> })),
          ...(opcoes.semFornecedor > 0 ? [{ value: "__sem", label: <>Sem fornecedor ({opcoes.semFornecedor})</> }] : [])
        ]}
      />

      <Seletor
        aria-label="Filtrar por categoria"
        className={estilo}
        value={categoria ?? ""}
        disabled={pendente}
        onValueChange={(valor) => navegar("categoria", valor)}
        opcoes={[
          { value: "", label: "Todas as categorias" },
          ...opcoes.categorias.map((c) => ({ value: c.nome, label: <>{c.nome} ({c.qtd})</> }))
        ]}
      />
    </div>
  );
}
