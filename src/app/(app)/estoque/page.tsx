import { notFound } from "next/navigation";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { listarPecas } from "@/modules/pecas/peca.service";
import { PecaLista } from "@/modules/pecas/components/peca-lista";
import { NovaPeca } from "@/modules/pecas/components/nova-peca";
import { BuscaPecas } from "@/modules/pecas/components/busca-pecas";

// Prisma e sharp exigem runtime Node — não rodam no Edge.
export const runtime = "nodejs";

export const metadata = { title: "Estoque · LaLolla" };

export default async function EstoquePage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; tipo?: string }>;
}) {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();

  const { busca, tipo } = await searchParams;
  const filtroTipo = tipo === "INSUMO" ? "INSUMO" : tipo === "PECA" ? "PECA" : undefined;

  // O service já devolve a peça SEM os campos de custo quando a sessão não
  // pode vê-los — não existe caminho em que eles cheguem por engano.
  const pecas = await listarPecas({
    busca,
    tipo: filtroTipo,
    veFinanceiro: veFinanceiro(sessao.data),
  });

  const podeCriar =
    sessao.data.papel !== "VENDEDOR" || sessao.data.permissoes.pecas.criar;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Estoque</h1>
          <p className="text-sm text-muted-foreground">
            {pecas.length} {pecas.length === 1 ? "item" : "itens"}
            {busca ? ` para “${busca}”` : ""}
          </p>
        </div>
        {podeCriar && <NovaPeca veFinanceiro={veFinanceiro(sessao.data)} />}
      </div>

      <BuscaPecas busca={busca} tipo={filtroTipo} />

      <div className="mt-5">
        <PecaLista pecas={pecas} />
      </div>
    </main>
  );
}
