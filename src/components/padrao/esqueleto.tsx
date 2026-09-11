/*
 * Esqueletos de carregamento.
 *
 * Aparecem INSTANTANEAMENTE quando a pessoa troca de tela, enquanto o
 * servidor monta o conteúdo. O ganho não é de milissegundos — é de sensação:
 * a tela responde no toque, em vez de ficar parada na anterior enquanto o
 * dado chega.
 *
 * Cada esqueleto imita a FORMA da tela que vem: mesma quantidade de cartões,
 * mesma altura de linha. Um esqueleto genérico faria o conteúdo "pular"
 * quando chegasse, que é pior do que não ter esqueleto nenhum.
 */

function Bloco({ className = "" }: { className?: string }) {
  return <div aria-hidden className={`animate-pulse rounded bg-muted ${className}`} />;
}

export function EsqueletoIndicadores({ quantos = 4 }: { quantos?: number }) {
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
      {Array.from({ length: quantos }, (_, i) => (
        <div key={i} className="min-w-0 rounded-lg border bg-card p-3">
          <Bloco className="h-3 w-24" />
          <Bloco className="mt-2 h-6 w-28" />
          <Bloco className="mt-1.5 h-3 w-20" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoLista({ linhas = 6 }: { linhas?: number }) {
  return (
    <div className="divide-y overflow-hidden rounded-lg border bg-card">
      {Array.from({ length: linhas }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-3 py-3">
          <div className="min-w-0 flex-1">
            <Bloco className="h-4 w-2/5" />
            <Bloco className="mt-1.5 h-3 w-3/5" />
          </div>
          <Bloco className="h-4 w-16 shrink-0" />
        </div>
      ))}
    </div>
  );
}

export function EsqueletoTitulo() {
  return (
    <div className="mb-5">
      <Bloco className="h-6 w-48" />
      <Bloco className="mt-2 h-3 w-32" />
    </div>
  );
}

export function EsqueletoBarraFiltros() {
  return (
    <div className="space-y-3">
      <Bloco className="h-10 w-full" />
      <div className="flex gap-2">
        {["w-16", "w-20", "w-24", "w-20"].map((w, i) => (
          <Bloco key={i} className={`h-8 shrink-0 rounded-full ${w}`} />
        ))}
      </div>
    </div>
  );
}

/** Página inteira: título, indicadores, filtros e lista. */
export function EsqueletoPagina({
  indicadores = 4,
  linhas = 6,
  filtros = true,
}: {
  indicadores?: number;
  linhas?: number;
  filtros?: boolean;
}) {
  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <EsqueletoTitulo />
      <EsqueletoIndicadores quantos={indicadores} />
      <div className="mt-4 space-y-4">
        {filtros && <EsqueletoBarraFiltros />}
        <EsqueletoLista linhas={linhas} />
      </div>
    </main>
  );
}
