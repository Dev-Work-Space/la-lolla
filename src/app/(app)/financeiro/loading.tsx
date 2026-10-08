import { EsqueletoIndicadores, EsqueletoLista, EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Financeiro: título, indicadores e a tela da opção. As abas moram no menu
   desde 08/10/2026, então o esqueleto não reserva mais o lugar delas. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <EsqueletoTitulo />
      <EsqueletoIndicadores quantos={4} />
      <div className="mt-5 space-y-4">
        <div className="h-10 w-full animate-pulse rounded bg-muted" />
        <EsqueletoLista linhas={6} />
      </div>
    </main>
  );
}
