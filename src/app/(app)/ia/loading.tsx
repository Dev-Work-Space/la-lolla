import { EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* A conversa: título e o quadro do chat. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EsqueletoTitulo />
      <div aria-hidden className="h-[60dvh] animate-pulse rounded-xl border bg-card" />
    </main>
  );
}
