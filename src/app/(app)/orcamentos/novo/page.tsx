import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/guard";
import { EditorOrcamento } from "@/modules/orcamentos/components/editor-orcamento";

export const runtime = "nodejs";
export const metadata = { title: "Novo orçamento · LaLolla" };

export default async function NovoOrcamentoPage() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href="/vendas?aba=orcamentos"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Orçamentos
      </Link>
      <h1 className="mb-1 mt-3 text-xl font-bold tracking-tight">Novo orçamento</h1>
      <p className="mb-5 text-sm text-muted-foreground">
        A proposta reserva as peças enquanto vale, mas não baixa o estoque. O número sai ao salvar.
      </p>
      <EditorOrcamento />
    </main>
  );
}
