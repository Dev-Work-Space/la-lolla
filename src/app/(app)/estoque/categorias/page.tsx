import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { AJUSTES_PADRAO } from "@/modules/ajustes/ajustes.service";
import { painelCategorias } from "@/modules/pecas/categoria.service";
import { CategoriasPecas } from "@/modules/pecas/components/categorias-pecas";
import { LINHAS, ROTULO_LINHA, ehLinha } from "@/modules/pecas/linha";
import { cn } from "@/lib/utils";
import { BotaoAjuda } from "@/modules/ajuda/components/botao-ajuda";

export const metadata = { title: "Categorias de produto · LaLolla" };

/*
 * No app antigo era "Mais › Categorias", ao lado do Inventário e das
 * Etiquetas: é ferramenta do estoque, não ajuste do sistema. A permissão
 * continua a de Ajustes — quem não pode mexer nem vê a tela.
 */
export default async function CategoriasPage({ searchParams }: { searchParams: Promise<{ linha?: string }> }) {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) notFound();

  const { linha: pedida } = await searchParams;
  const linha = ehLinha(pedida) ? pedida : "SEMIJOIA";
  const dados = await painelCategorias(linha);

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link
        href="/estoque"
        className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Estoque
      </Link>
      <h1 className="ll-entra-cabecalho mt-3 text-xl font-bold tracking-tight">Categorias de produto
            <BotaoAjuda guia="custo-preco" className="ml-2" />
          </h1>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">
        Servem para filtrar o catálogo e agrupar os relatórios. Renomear aqui renomeia em todos os produtos
        que usam a categoria.
      </p>
      {/* Uma lista por linha: perfume não aparece entre as categorias de anel. */}
      <nav aria-label="Linha" className="mb-4 flex gap-1 rounded-xl border bg-(--ll-surface-2) p-1">
        {LINHAS.map((l) => (
          <Link
            key={l}
            href={`/estoque/categorias?linha=${l}`}
            aria-current={l === linha ? "page" : undefined}
            className={cn(
              "flex-1 rounded-lg px-3 py-1.5 text-center text-sm font-medium transition-colors",
              l === linha ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {ROTULO_LINHA[l]}
          </Link>
        ))}
      </nav>
      <CategoriasPecas key={linha} linhaLoja={linha} {...dados} padrao={[...AJUSTES_PADRAO.categorias[linha]]} />
    </main>
  );
}
