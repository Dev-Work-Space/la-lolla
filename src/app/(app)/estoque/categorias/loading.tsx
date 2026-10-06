import { EsqueletoLista, EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Categorias: título, o campo de criar e a lista. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-5">
      <EsqueletoTitulo />
      <div aria-hidden className="mb-4 h-16 animate-pulse rounded-xl border bg-card" />
      <EsqueletoLista linhas={9} />
    </main>
  );
}
