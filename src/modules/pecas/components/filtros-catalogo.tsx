"use client";

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
      <select
        aria-label="Filtrar por fornecedor"
        className={estilo}
        value={fornecedorId ?? ""}
        disabled={pendente}
        onChange={(e) => navegar("fornecedor", e.target.value)}
      >
        <option value="">Todos os fornecedores</option>
        {opcoes.fornecedores.map((f) => (
          <option key={f.id} value={f.id}>
            {f.nome} ({f.qtd})
          </option>
        ))}
        {opcoes.semFornecedor > 0 && (
          <option value="__sem">Sem fornecedor ({opcoes.semFornecedor})</option>
        )}
      </select>

      <select
        aria-label="Filtrar por categoria"
        className={estilo}
        value={categoria ?? ""}
        disabled={pendente}
        onChange={(e) => navegar("categoria", e.target.value)}
      >
        <option value="">Todas as categorias</option>
        {opcoes.categorias.map((c) => (
          <option key={c.nome} value={c.nome}>
            {c.nome} ({c.qtd})
          </option>
        ))}
      </select>
    </div>
  );
}
