import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { EditorOrcamento } from "@/modules/orcamentos/components/editor-orcamento";
import { BotaoAjuda } from "@/modules/ajuda/components/botao-ajuda";

export const metadata = { title: "Novo orçamento · LaLolla" };

export default async function NovoOrcamentoPage() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href="/vendas?aba=orcamentos"
        className="-my-2 inline-flex items-center gap-1.5 py-2 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Orçamentos
      </Link>
      <h1 className="ll-entra-cabecalho mb-1 mt-3 text-xl font-bold tracking-tight">Novo orçamento
            <BotaoAjuda guia="orcamento" className="ml-2" />
          </h1>
      <p className="mb-5 text-sm text-muted-foreground">
        A proposta reserva os produtos enquanto vale, mas não baixa o estoque. O número sai ao salvar.
      </p>
      <EditorOrcamento />
    </main>
  );
}
