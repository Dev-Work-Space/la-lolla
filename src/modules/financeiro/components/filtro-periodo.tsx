"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CaretLeftIcon, CaretRightIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seletor } from "@/components/padrao/seletor";
import { cn } from "@/lib/utils";
import {
  AGRUPAMENTOS,
  ATALHOS,
  deslocar,
  diaDoIso,
  paramsDoPeriodo,
  rotuloDoPeriodo,
  type Agrupar,
  type Atalho,
  type Periodo,
} from "../periodo";

/*
 * A barra de período, a mesma em todas as abas do Financeiro: atalhos, datas
 * livres, setas ◀ ▶ e "agrupar por". Tudo vai para a URL — o link guarda o
 * filtro, o "voltar" do navegador desfaz, e o servidor lê de lá.
 *
 * `params` são os OUTROS filtros da tela (aba, carteira, busca…): trocar o
 * período não pode apagar o resto.
 */
export function FiltroPeriodo({
  params,
  de,
  ate,
  atalho,
  agrupar,
  atalhos,
  agrupamentos,
  rotuloDatas = "Período",
}: {
  params: Record<string, string>;
  /** "AAAA-MM-DD" — datas, não Date: o componente roda no navegador. */
  de: string | null;
  ate: string | null;
  atalho: Atalho | null;
  agrupar?: Agrupar;
  /** Os atalhos que fazem sentido na aba (o extrato não tem "Próximo mês"). */
  atalhos?: ReadonlyArray<Atalho>;
  /** Sem isso, o "Agrupar por" não aparece. */
  agrupamentos?: ReadonlyArray<Agrupar>;
  rotuloDatas?: string;
}) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  const periodo: Periodo = { de: diaDoIso(de), ate: diaDoIso(ate), atalho };

  function ir(mudanca: Record<string, string | null>) {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v === null || v === "") p.delete(k);
      else p.set(k, v);
    }
    iniciar(() => router.push(`/financeiro?${p.toString()}`));
  }

  const semPeriodo = { periodo: null, de: null, ate: null };
  const irPara = (p: Periodo) => ir({ ...semPeriodo, ...paramsDoPeriodo(p) });

  const opcoes = ATALHOS.filter(([a]) => !atalhos || atalhos.includes(a));
  const anterior = deslocar(periodo, -1);
  const proximo = deslocar(periodo, 1);

  return (
    <div className={cn("space-y-2 rounded-xl border bg-card p-3", pendente && "opacity-70")}>
      <div className="flex flex-wrap gap-1" role="group" aria-label="Atalhos de período">
        {opcoes.map(([a, rotulo]) => (
          <button
            key={a}
            type="button"
            aria-pressed={atalho === a}
            onClick={() => ir({ ...semPeriodo, periodo: a })}
            className={cn(
              "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
              atalho === a
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {rotulo}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        {/* No celular a linha das datas ocupa a largura toda e os campos
            encolhem; lado a lado com tamanho fixo, eles vazavam da tela. */}
        <div className="flex w-full items-end gap-1 sm:w-auto">
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Período anterior"
            disabled={!anterior || pendente}
            onClick={() => anterior && irPara(anterior)}
          >
            <CaretLeftIcon className="size-4" aria-hidden />
          </Button>
          <span className="min-w-0 flex-1 space-y-1 sm:flex-none">
            <label htmlFor="periodo-de" className="block text-xs text-muted-foreground">
              {rotuloDatas}: de
            </label>
            <Input
              id="periodo-de"
              type="date"
              value={de ?? ""}
              onChange={(e) => ir({ ...semPeriodo, de: e.target.value, ate: ate ?? e.target.value })}
              className="w-full text-base sm:w-38"
            />
          </span>
          <span className="min-w-0 flex-1 space-y-1 sm:flex-none">
            <label htmlFor="periodo-ate" className="block text-xs text-muted-foreground">
              até
            </label>
            <Input
              id="periodo-ate"
              type="date"
              value={ate ?? ""}
              onChange={(e) => ir({ ...semPeriodo, de: de ?? e.target.value, ate: e.target.value })}
              className="w-full text-base sm:w-38"
            />
          </span>
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Próximo período"
            disabled={!proximo || pendente}
            onClick={() => proximo && irPara(proximo)}
          >
            <CaretRightIcon className="size-4" aria-hidden />
          </Button>
        </div>

        {agrupamentos && agrupar && (
          <span className="space-y-1">
            <label htmlFor="agrupar" className="block text-xs text-muted-foreground">
              Agrupar por
            </label>
            <Seletor
              id="agrupar"
              className="w-32"
              value={agrupar}
              onValueChange={(v) => ir({ agrupar: v })}
              opcoes={AGRUPAMENTOS.filter(([a]) => agrupamentos.includes(a)).map(([v, r]) => ({ value: v, label: r }))}
            />
          </span>
        )}

        <p className="pb-2 text-sm font-medium first-letter:uppercase" aria-live="polite">
          {rotuloDoPeriodo(periodo)}
        </p>
      </div>
    </div>
  );
}
