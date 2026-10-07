import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeftIcon } from "@phosphor-icons/react/ssr";
import { exigirPermissao } from "@/lib/auth/guard";
import { lerDesenhos } from "@/modules/pecas/etiqueta.service";
import { CriadorEtiquetas } from "@/modules/pecas/components/criador-etiquetas";

export const metadata = { title: "Criação de etiquetas · LaLolla" };

/*
 * O editor de modelos de etiqueta. Mora nos Ajustes porque o modelo é da
 * loja: quem salva é quem tem a permissão de Ajustes, e todo mundo imprime
 * com ele (o modelo aparece na lista da impressão).
 */
export default async function CriacaoDeEtiquetasPage() {
  const sessao = await exigirPermissao("ajustes", "editar");
  if (!sessao.ok) notFound();

  const desenhos = await lerDesenhos();

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <Link
        href="/ajustes"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeftIcon weight="regular" className="size-4" aria-hidden />
        Ajustes
      </Link>
      <h1 className="ll-entra-cabecalho mt-3 text-xl font-bold tracking-tight">Criação de etiquetas</h1>
      <p className="mb-5 mt-0.5 text-sm text-muted-foreground">
        Monte o seu modelo arrastando cada peça para a etiqueta. Salvo, ele aparece na hora de imprimir, junto dos
        outros modelos.
      </p>
      <CriadorEtiquetas desenhos={desenhos} />
    </main>
  );
}
