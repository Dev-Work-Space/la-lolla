import { EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Editor: barra do modelo em cima, paleta, palco e propriedades. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <EsqueletoTitulo />
      <div aria-hidden className="mb-4 h-16 animate-pulse rounded-xl border bg-card" />
      <div aria-hidden className="grid gap-4 lg:grid-cols-[13rem_1fr_17rem]">
        <div className="h-96 animate-pulse rounded-xl border bg-card" />
        <div className="h-96 animate-pulse rounded-xl border bg-card" />
        <div className="h-96 animate-pulse rounded-xl border bg-card" />
      </div>
    </main>
  );
}
