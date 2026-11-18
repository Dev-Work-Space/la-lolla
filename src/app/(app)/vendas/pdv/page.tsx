import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { TituloTela } from "@/components/padrao/indicadores";
import { Pdv } from "@/modules/vendas/components/pdv";

export const metadata = { title: "PDV · LaLolla" };

/* O caixa (João, 18/11): passar as etiquetas na câmera e cobrar de uma vez. */
export default async function PdvPage() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <TituloTela secao="Compra e venda" titulo="PDV" ajuda="pdv" />
      <div className="mt-5">
        {/* `useSearchParams` no caixa pede o limite de Suspense. */}
        <Suspense>
          <Pdv />
        </Suspense>
      </div>
    </main>
  );
}
