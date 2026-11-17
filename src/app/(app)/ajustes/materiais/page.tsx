import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { AJUSTES_PADRAO } from "@/modules/ajustes/ajustes.service";
import { painelMateriais } from "@/modules/pecas/material.service";
import { MateriaisPecas } from "@/modules/pecas/components/categorias-pecas";
import { BotaoAjuda } from "@/modules/ajuda/components/botao-ajuda";

export const metadata = { title: "Materiais · LaLolla" };

/*
 * Os materiais da semijoia (Prata 925, Banhado a ouro…), pedido do João em
 * 17/11: a mesma tela das categorias, com a lista nos Ajustes.
 */
export default async function MateriaisPage() {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) notFound();

  const dados = await painelMateriais();

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <Link
        href="/ajustes"
        className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Ajustes
      </Link>
      <h1 className="ll-entra-cabecalho mt-3 text-xl font-bold tracking-tight">
        Materiais
        <BotaoAjuda guia="primeiro-produto" className="ml-2" />
      </h1>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">
        As opções de material no cadastro da semijoia. Não é obrigatório escolher. Renomear aqui renomeia em todos os
        produtos que usam o material.
      </p>
      <MateriaisPecas {...dados} padrao={[...AJUSTES_PADRAO.materiais]} />
    </main>
  );
}
