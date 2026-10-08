"use client";

import { useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/*
 * Barrinha dourada no topo enquanto a próxima tela não chega.
 *
 * Pedido do João (08/10/2026): na Vercel a troca de tela parecia travada,
 * "faz aquele bagulho de disfarçar". O clique já dá sinal de vida na hora,
 * mesmo quando o servidor ainda está respondendo.
 *
 * O Next não avisa quando uma navegação começa; o que dá para ouvir é o
 * clique num link interno. Ela some quando o endereço muda — o que também
 * resolve o voltar do navegador, que não passa por clique nenhum.
 */
export function BarraProgresso() {
  const pathname = usePathname();
  const params = useSearchParams();
  const busca = params.toString();
  const aqui = pathname + (busca ? `?${busca}` : "");

  /* De qual endereço saiu o clique. Chegou em outro endereço = terminou. */
  const [saindoDe, setSaindoDe] = useState<string | null>(null);
  const [ultimo, setUltimo] = useState(aqui);
  if (ultimo !== aqui) {
    setUltimo(aqui);
    setSaindoDe(null);
  }

  useEffect(() => {
    const clique = (e: MouseEvent) => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.("a[href]");
      if (!(a instanceof HTMLAnchorElement)) return;
      if ((a.target && a.target !== "_self") || a.hasAttribute("download")) return;
      const destino = new URL(a.href, location.href);
      if (destino.origin !== location.origin) return;
      const atual = location.pathname + location.search;
      if (destino.pathname + destino.search === atual) return;
      setSaindoDe(atual);
    };
    // Fase de captura: antes de o <Link> tratar o clique e trocar de tela.
    document.addEventListener("click", clique, true);
    return () => document.removeEventListener("click", clique, true);
  }, []);

  if (saindoDe === null) return null;
  return (
    <div
      role="progressbar"
      aria-label="Abrindo a tela"
      className="ll-progresso pointer-events-none fixed inset-x-0 top-0 z-80 h-0.5 overflow-hidden bg-(--ll-accent-soft)"
    >
      <span className="block h-full w-2/5 bg-(--ll-accent)" />
    </div>
  );
}
