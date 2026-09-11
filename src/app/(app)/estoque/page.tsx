import { notFound } from "next/navigation";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { Segmentado } from "@/components/padrao/indicadores";
import { PainelCatalogo } from "@/modules/pecas/components/painel-catalogo";
import { PainelInsumos } from "@/modules/pecas/components/painel-insumos";
import type { FiltroPeca } from "@/modules/pecas/catalogo.service";

export const runtime = "nodejs";
export const metadata = { title: "Estoque · LaLolla" };

/*
 * Tela "Estoque" (`viewProdutos`): duas sub-abas, Peças e Insumos.
 * Comprar saiu daqui e virou o Portal de compras — decisão do João. Aqui
 * fica só o cadastro do modelo e o que já está na prateleira.
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
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <Segmentado
        opcoes={[
          ["catalogo", "Peças"],
          ["insumos", "Insumos"],
        ]}
        atual={qual}
        href={(v) => `/estoque?aba=${v}`}
      />

      <div className="mt-5">
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
      </div>
    </main>
  );
}
