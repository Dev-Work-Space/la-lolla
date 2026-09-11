import { EsqueletoIndicadores, EsqueletoLista, EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Ficha: título, 4 indicadores e duas colunas de detalhe. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-5">
      <EsqueletoTitulo />
      <EsqueletoIndicadores quantos={4} />
      <div className="mt-5 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
        <EsqueletoLista linhas={4} />
        <EsqueletoLista linhas={3} />
      </div>
    </main>
  );
}
