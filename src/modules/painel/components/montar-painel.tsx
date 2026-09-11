"use client";

import { useEffect, useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  lerPainel,
  normalizarPainel,
  salvarPainel,
  TAMANHOS_WGT,
  widgetPorId,
  type ItemPainel,
  type TamanhoWgt,
} from "../widgets";

/*
 * "Montar meu painel" — agora uma SEÇÃO dos Ajustes, não um botão no Início.
 *
 * Foi pedido do João: o Início é para olhar a loja, não para configurar. O
 * botão saiu de lá e a montagem passou a morar junto das outras configurações.
 *
 * Continua salvando na hora, sem botão de confirmar, como no app antigo — e
 * continua valendo só NESTE APARELHO, porque mora no localStorage. Isso é de
 * propósito e está escrito na tela: o João quer um painel enxuto no celular do
 * balcão e o quadro inteiro no computador.
 *
 * Guarda o estado sozinho (não recebe mais do Início): a primeira pintura usa
 * o padrão e o efeito troca pelo que está salvo, senão o servidor e o
 * navegador desenhariam coisas diferentes e a hidratação quebraria.
 */
export function MontarPainel() {
  const [cfg, setCfg] = useState<ItemPainel[]>(() => normalizarPainel(null));
  const [pronto, setPronto] = useState(false);

  useEffect(() => {
    /*
     * O lint reclama de `setState` dentro de efeito, e com razão no caso
     * comum — costuma ser render em cascata. Aqui é o oposto: é a leitura
     * ÚNICA de uma fonte que só existe no navegador.
     *
     * Ler o localStorage direto no render faria o servidor desenhar o padrão
     * e o navegador desenhar o salvo, e o React acusaria a divergência. Roda
     * uma vez, com a lista de dependências vazia.
     */
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setCfg(lerPainel());
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setPronto(true);
  }, []);

  function aplicar(novo: ItemPainel[]) {
    salvarPainel(novo);
    setCfg(novo);
  }

  const mover = (ix: number, passo: number) => {
    const destino = ix + passo;
    if (destino < 0 || destino >= cfg.length) return;
    const novo = [...cfg];
    [novo[ix], novo[destino]] = [novo[destino], novo[ix]];
    aplicar(novo);
  };

  const alternar = (ix: number) =>
    aplicar(cfg.map((it, i) => (i === ix ? { ...it, on: !it.on } : it)));

  const redimensionar = (ix: number, tam: TamanhoWgt) =>
    aplicar(cfg.map((it, i) => (i === ix ? { ...it, tam } : it)));

  const ligados = cfg.filter((i) => i.on).length;

  return (
    <section className="rounded-xl border bg-card">
      <div className="border-b px-4 py-3">
        <h2 className="text-sm font-semibold">Meu painel do Início</h2>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          O que aparece no Início, em que ordem e — no computador — com que largura.{" "}
          <strong className="font-medium text-foreground">Vale só neste aparelho:</strong> o celular
          e o computador guardam arranjos próprios.
        </p>
      </div>

      <div className="divide-y" aria-busy={!pronto}>
        {cfg.map((it, ix) => {
          const w = widgetPorId(it.id);
          if (!w) return null;
          return (
            <div key={it.id} className={cn("p-3.5", !it.on && "opacity-55")}>
              <div className="flex items-start gap-3">
                <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                  <input
                    type="checkbox"
                    checked={it.on}
                    onChange={() => alternar(ix)}
                    className="mt-0.5 size-4 shrink-0 accent-(--ll-accent)"
                  />
                  <span className="min-w-0">
                    <span className="block text-sm font-medium">{w.nome}</span>
                    <span className="block text-xs leading-relaxed text-muted-foreground">
                      {w.desc}
                    </span>
                  </span>
                </label>

                <div className="flex shrink-0 gap-0.5">
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Subir ${w.nome}`}
                    disabled={ix === 0}
                    onClick={() => mover(ix, -1)}
                  >
                    <ChevronUp className="size-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Descer ${w.nome}`}
                    disabled={ix === cfg.length - 1}
                    onClick={() => mover(ix, 1)}
                  >
                    <ChevronDown className="size-4" />
                  </Button>
                </div>
              </div>

              {it.on && (
                <div className="mt-2.5 flex flex-wrap gap-1 pl-7">
                  {TAMANHOS_WGT.map(([valor, rotulo]) => (
                    <button
                      key={valor}
                      type="button"
                      aria-pressed={it.tam === valor}
                      onClick={() => redimensionar(ix, valor)}
                      className={cn(
                        "rounded-full border px-2.5 py-1 text-xs transition-colors",
                        it.tam === valor
                          ? "border-(--ll-accent) bg-(--ll-accent) text-white"
                          : "text-muted-foreground hover:text-foreground",
                      )}
                    >
                      {rotulo}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>

      <div className="flex items-center justify-between gap-3 border-t px-4 py-3">
        <p className="text-xs text-muted-foreground">
          {ligados} de {cfg.length} {ligados === 1 ? "bloco ligado" : "blocos ligados"}
        </p>
        <Button variant="ghost" size="sm" onClick={() => aplicar(normalizarPainel(null))}>
          Restaurar padrão
        </Button>
      </div>
    </section>
  );
}
