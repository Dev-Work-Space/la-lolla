import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { AJUSTES_PADRAO } from "@/modules/ajustes/ajustes.service";
import { painelCategorias } from "@/modules/pecas/categoria.service";
import { CategoriasPecas } from "@/modules/pecas/components/categorias-pecas";

export const metadata = { title: "Categorias de peça · LaLolla" };

/*
 * No app antigo era "Mais › Categorias", ao lado do Inventário e das
 * Etiquetas: é ferramenta do estoque, não ajuste do sistema. A permissão
 * continua a de Ajustes — quem não pode mexer nem vê a tela.
 */
export default async function CategoriasPage() {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) notFound();

  const dados = await painelCategorias();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link
        href="/estoque"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Estoque
      </Link>
      <h1 className="ll-entra-cabecalho mt-3 text-xl font-bold tracking-tight">Categorias de peça</h1>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">
        Servem para filtrar o catálogo e agrupar os relatórios. Renomear aqui renomeia em todas as peças
        que usam a categoria.
      </p>
      <CategoriasPecas {...dados} padrao={[...AJUSTES_PADRAO.categorias]} />
    </main>
  );
}
