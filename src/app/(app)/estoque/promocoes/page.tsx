import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { TituloTela } from "@/components/padrao/indicadores";
import { painelPromocoes } from "@/modules/pecas/promocao.service";
import { CentralPromocoes } from "@/modules/pecas/components/central-promocoes";

export const metadata = { title: "Promoções · LaLolla" };

/* Central de promoções (João, 18/11): grupo em promoção com % ou preço fixo e data para acabar. */
export default async function PromocoesPage() {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();
  const podeEditar = sessao.data.papel !== "VENDEDOR" || sessao.data.permissoes.pecas.editar;
  const dados = await painelPromocoes();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <TituloTela secao="Estoque" titulo="Promoções" ajuda="promocoes" />
      <div className="mt-5">
        <CentralPromocoes dados={dados} podeEditar={podeEditar} />
      </div>
    </main>
  );
}
