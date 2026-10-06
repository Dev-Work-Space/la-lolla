import { EsqueletoTitulo } from "@/components/padrao/esqueleto";

/* Ajustes: título e as seções do formulário, uma embaixo da outra. */
export default function Carregando() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-5">
      <EsqueletoTitulo />
      <div className="space-y-5">
        {["h-56", "h-40", "h-72", "h-48"].map((h, i) => (
          <div key={i} aria-hidden className={`animate-pulse rounded-xl border bg-card ${h}`} />
        ))}
      </div>
    </main>
  );
}
