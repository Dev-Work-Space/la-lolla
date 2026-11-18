import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import { TituloTela } from "@/components/padrao/indicadores";
import { quadroCrm } from "@/modules/vendas/crm.service";
import { QuadroCrm } from "@/modules/vendas/components/quadro-crm";

export const metadata = { title: "Quadro de pedidos · LaLolla" };

/*
 * Quadro de pedidos (CRM em kanban), pedido pelo João em 18/11. Opcional:
 * quem não quiser organizar por aqui nunca precisa abrir.
 */
export default async function QuadroPage() {
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-[1600px] px-4 py-5">
      <TituloTela secao="Compra e venda" titulo="Quadro de pedidos" ajuda="quadro" />
      <div className="mt-5">
        <Suspense
          fallback={
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
                {[0, 1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-20 animate-pulse rounded-xl bg-muted" />
                ))}
              </div>
              <div className="flex gap-3 overflow-hidden">
                {[0, 1, 2, 3, 4].map((i) => (
                  <div key={i} className="h-80 w-72 shrink-0 animate-pulse rounded-2xl bg-muted" />
                ))}
              </div>
            </div>
          }
        >
          <Quadro financeiro={veFinanceiro(sessao.data)} />
        </Suspense>
      </div>
    </main>
  );
}

async function Quadro({ financeiro }: { financeiro: boolean }) {
  return <QuadroCrm cartoes={await quadroCrm(financeiro)} veFinanceiro={financeiro} />;
}
