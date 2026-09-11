import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { exigirPermissao } from "@/lib/auth/guard";
import { NovaVenda } from "@/modules/vendas/components/nova-venda";

export const runtime = "nodejs";
export const metadata = { title: "Nova venda · LaLolla" };

export default async function NovaVendaPage() {
  const sessao = await exigirPermissao("vendas", "criar");
  if (!sessao.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href="/vendas"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="size-4" aria-hidden />
        Portal de vendas
      </Link>
      <h1 className="mb-5 mt-3 text-xl font-bold tracking-tight">Nova venda</h1>
      <NovaVenda />
    </main>
  );
}
