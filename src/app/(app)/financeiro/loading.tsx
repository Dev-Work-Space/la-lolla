import { EsqueletoIndicadores, EsqueletoLista, EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Financeiro: os indicadores ficam FORA das abas, então o esqueleto tem de
   mostrar o grupo de abas entre eles e a lista. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <EsqueletoTitulo />
      <EsqueletoIndicadores quantos={4} />
      <div className="mt-5 h-11 w-72 animate-pulse rounded-lg border bg-card" />
      <div className="mt-5 space-y-4">
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        <EsqueletoLista linhas={6} />
      </div>
    </main>
  );
}
