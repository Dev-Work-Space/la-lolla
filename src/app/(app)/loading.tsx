import { EsqueletoIndicadores, EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Início: título + painel de widgets (grade de 12 colunas). */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <EsqueletoTitulo />
      <div className="grid grid-cols-1 items-start gap-3 lg:grid-cols-12">
        <div className="lg:col-span-8">
          <div className="h-56 animate-pulse rounded-xl border bg-card" />
        </div>
        <div className="lg:col-span-4">
          <div className="h-32 animate-pulse rounded-xl border bg-card" />
        </div>
        <div className="lg:col-span-12">
          <EsqueletoIndicadores quantos={3} />
        </div>
        <div className="lg:col-span-8">
          <div className="h-44 animate-pulse rounded-xl border bg-card" />
        </div>
      </div>
    </main>
  );
}
