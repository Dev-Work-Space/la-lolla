import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { NovaCompra } from "@/modules/compras/components/nova-compra";

export const metadata = { title: "Nova compra · LaLolla" };

export default async function NovaCompraPage() {
  // Comprar mexe em estoque E em dinheiro: exige as duas permissões.
  const pecas = await exigirPermissao("pecas", "criar");
  if (!pecas.ok) notFound();
  const financeiro = await exigirPermissao("financeiro", "criar");
  if (!financeiro.ok) notFound();

  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-5">
      <Link
        href="/compras"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Portal de compras
      </Link>
      <h1 className="ll-entra-cabecalho mb-5 mt-3 text-xl font-bold tracking-tight">Nova compra</h1>
      <NovaCompra />
    </main>
  );
}
