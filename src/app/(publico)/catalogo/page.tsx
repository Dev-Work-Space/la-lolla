import { Suspense } from "react";
import Image from "next/image";
import type { Metadata } from "next";
import { EsqueletoVitrine, Vitrine } from "@/modules/pecas/components/vitrine";

/*
 * Fora do Google por enquanto, decisão do João: o catálogo vai para quem
 * recebe o link. Abrir para busca é trocar o `robots` aqui.
 */
export const metadata: Metadata = {
  title: "Catálogo · LaLolla Semijoias e Perfumaria",
  description: "Semijoias e perfumes da LaLolla. Escolha e peça pelo WhatsApp.",
  robots: { index: false, follow: false },
};

/*
 * Tela PÚBLICA: sem login, sem menu. A logo sai na hora; o catálogo chega
 * por dentro do <Suspense>, como nas telas internas.
 */
export default function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; categoria?: string }>;
}) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 pt-8 pb-16">
      <header className="flex flex-col items-center gap-2">
        <Image src="/logo-lalolla.png" alt="LaLolla" width={353} height={90} priority className="h-12 w-auto sm:h-14" />
        <span className="text-[10px] font-bold tracking-[0.3em] text-(--ll-brand) uppercase">
          <span className="-mr-[0.3em] pl-[0.3em]">semijoias e perfumaria</span>
        </span>
      </header>

      <Suspense fallback={<EsqueletoVitrine />}>
        <Vitrine searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
