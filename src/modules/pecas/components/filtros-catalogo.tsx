"use client";

import { Seletor } from "@/components/padrao/seletor";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { cn } from "@/lib/utils";

/*
 * Os seletores do catálogo: fornecedor, categoria e material, todos com a
 * CONTAGEM ao lado. Só entram opções que de fato têm peça — a lista inteira
 * encheria o seletor de escolhas que não filtram nada (era assim no antigo).
 */
export function FiltrosCatalogo({
  opcoes,
  fornecedorId,
  categoria,
  material,
  linha,
  busca,
  filtro,
}: {
  opcoes: {
    fornecedores: Array<{ id: string; nome: string; qtd: number }>;
    semFornecedor: number;
    categorias: Array<{ nome: string; qtd: number }>;
    materiais: Array<{ nome: string; qtd: number }>;
    semMaterial: number;
  };
  fornecedorId?: string;
  categoria?: string;
  material?: string;
  linha?: string;
  busca?: string;
  filtro: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function navegar(campo: "fornecedor" | "categoria" | "material", valor: string) {
    const atual = { fornecedor: fornecedorId, categoria, material, [campo]: valor };
    const p = new URLSearchParams({ aba: "catalogo" });
    if (busca) p.set("busca", busca);
    if (filtro !== "todos") p.set("filtro", filtro);
    if (linha) p.set("linha", linha);
    for (const [k, v] of Object.entries(atual)) if (v) p.set(k, v);
    iniciar(() => router.push(`/estoque?${p.toString()}`));
  }

  // Perfume e "Outros" não têm material: o seletor ali só confundiria.
  const comMaterial =
    (!linha || linha === "SEMIJOIA") && (opcoes.materiais.length > 0 || opcoes.semMaterial > 0 || Boolean(material));

  const estilo =
    "h-10 w-full min-w-0 rounded-lg border bg-card px-3 text-sm text-foreground disabled:opacity-60";

  return (
    <div className={cn("grid grid-cols-1 gap-2 sm:grid-cols-2", comMaterial && "lg:grid-cols-3")}>
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

      {comMaterial && (
        <Seletor
          aria-label="Filtrar por material"
          className={estilo}
          value={material ?? ""}
          disabled={pendente}
          onValueChange={(valor) => navegar("material", valor)}
          opcoes={[
            { value: "", label: "Todos os materiais" },
            ...opcoes.materiais.map((m) => ({ value: m.nome, label: <>{m.nome} ({m.qtd})</> })),
            ...(opcoes.semMaterial > 0 ? [{ value: "__sem", label: <>Sem material ({opcoes.semMaterial})</> }] : []),
          ]}
        />
      )}
    </div>
  );
}
