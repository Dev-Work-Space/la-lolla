import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { Segmentado } from "@/components/padrao/indicadores";
import { EsqueletoIndicadores, EsqueletoLista } from "@/components/padrao/esqueleto";
import { PainelCatalogo } from "@/modules/pecas/components/painel-catalogo";
import { PainelInsumos } from "@/modules/pecas/components/painel-insumos";
import type { FiltroPeca } from "@/modules/pecas/catalogo.service";

export const runtime = "nodejs";

export const metadata = { title: "Estoque · LaLolla" };

/*
 * Tela "Estoque" (`viewProdutos`): duas sub-abas, Peças e Insumos.
 * Comprar saiu daqui e virou o Portal de compras — decisão do João. Aqui
 * fica só o cadastro do modelo e o que já está na prateleira.
 *
 * A PÁGINA NÃO ESPERA O BANCO. Ela devolve a casca — as abas — assim que a
 * sessão é conferida, e o painel de dados chega depois, por dentro do
 * <Suspense>. Antes a função inteira ficava parada no `await` do catálogo e
 * NADA ia para a tela enquanto isso; o `loading.tsx` tapava o buraco
 * trocando a página inteira por blocos cinzas, que é o que a pessoa sente
 * como travado.
 *
 * A `key` no Suspense é o que faz filtrar responder no toque: sem ela, mudar
 * de aba ou de filtro segura o painel antigo na tela até o novo chegar.
 */
export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    busca?: string;
    filtro?: string;
    fornecedor?: string;
    categoria?: string;
  }>;
}) {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();

  const { aba, busca, filtro, fornecedor, categoria } = await searchParams;
  const qual = aba === "insumos" ? "insumos" : "catalogo";

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.pecas.criar,
    editar: admin || sessao.data.permissoes.pecas.editar,
  };

  return (
    <main className="ll-entra-tela mx-auto w-full max-w-7xl px-4 py-5">
      <Segmentado
        opcoes={[
          ["catalogo", "Peças"],
          ["insumos", "Insumos"],
        ]}
        atual={qual}
        href={(v) => `/estoque?aba=${v}`}
      />

      <div className="mt-5">
        <Suspense
          key={`${qual}:${busca ?? ""}:${filtro ?? ""}:${fornecedor ?? ""}:${categoria ?? ""}`}
          fallback={<EsqueletoPainelEstoque catalogo={qual === "catalogo"} />}
        >
          {qual === "catalogo" ? (
            <PainelCatalogo
              busca={busca}
              filtro={(filtro as FiltroPeca) ?? "todos"}
              fornecedorId={fornecedor}
              categoria={categoria}
              veFinanceiro={veFinanceiro(sessao.data)}
              pode={pode}
            />
          ) : (
            <PainelInsumos busca={busca} pode={pode} />
          )}
        </Suspense>
      </div>
    </main>
  );
}

/** Imita a forma do painel que vem: indicadores, busca, filtros e lista. */
function EsqueletoPainelEstoque({ catalogo }: { catalogo: boolean }) {
  return (
    <div className="space-y-4">
      <EsqueletoIndicadores quantos={catalogo ? 4 : 3} />
      <div className="h-10 animate-pulse rounded bg-muted" />
      {catalogo && (
        <div className="flex gap-2">
          {["w-16", "w-24", "w-20", "w-32", "w-24"].map((w, i) => (
            <div key={i} className={`h-8 shrink-0 animate-pulse rounded-full bg-muted ${w}`} />
          ))}
        </div>
      )}
      <EsqueletoLista linhas={8} />
    </div>
  );
}
