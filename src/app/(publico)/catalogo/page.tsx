import { Suspense } from "react";
import Image from "next/image";
import Link from "next/link";
import type { Metadata } from "next";
import { BotaoTema } from "@/components/layout/tema";
import { BotaoCarrinho, CarrinhoProvider } from "@/modules/pecas/components/carrinho-vitrine";
import { EsqueletoVitrine, Vitrine, numeroWhatsapp } from "@/modules/pecas/components/vitrine";

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
 * Tela PÚBLICA: sem login, sem menu. O cabeçalho sai na hora; o catálogo
 * chega por dentro do <Suspense>, como nas telas internas.
 *
 * Logo e assinatura LADO A LADO, a pedido do João: uma embaixo da outra
 * empurrava o catálogo para baixo e não parecia marca. No celular a
 * assinatura quebra em duas linhas ao lado da logo, para caber o tema e o
 * carrinho.
 */
export default function CatalogoPage({
  searchParams,
}: {
  searchParams: Promise<{ busca?: string; categoria?: string }>;
}) {
  return (
    <CarrinhoProvider numero={numeroWhatsapp()}>
      <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur">
        <div className="mx-auto flex h-14 w-full max-w-6xl items-center gap-3 px-4 sm:h-16">
          <Link
            href="/catalogo"
            aria-label="LaLolla Semijoias e Perfumaria, voltar ao início do catálogo"
            className="flex min-w-0 items-center gap-2.5 sm:gap-3"
          >
            <Image
              src="/logo-lalolla.png"
              alt=""
              width={353}
              height={90}
              priority
              className="h-5 w-auto shrink-0 sm:h-6"
            />
            <span aria-hidden className="h-6 w-px shrink-0 bg-(--ll-accent-line)" />
            <span className="max-w-[6.5rem] text-[9px] leading-tight font-semibold tracking-[0.18em] text-(--ll-brand) uppercase sm:max-w-none sm:text-[11px] sm:whitespace-nowrap">
              Semijoias e Perfumaria
            </span>
          </Link>
          <div className="ml-auto flex items-center gap-1">
            <BotaoTema />
            <BotaoCarrinho />
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pt-2 pb-16">
        <Suspense fallback={<EsqueletoVitrine />}>
          <Vitrine searchParams={searchParams} />
        </Suspense>
      </main>
    </CarrinhoProvider>
  );
}
