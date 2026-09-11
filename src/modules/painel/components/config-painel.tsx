"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp, LayoutGrid } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  limparPainel,
  normalizarPainel,
  salvarPainel,
  TAMANHOS_WGT,
  widgetPorId,
  type ItemPainel,
  type TamanhoWgt,
} from "../widgets";

/*
 * "Montar meu painel", portado de `abrirPainelConfig()`.
 *
 * Cada widget: liga/desliga, sobe/desce e escolhe a largura. Salva na hora,
 * sem botão de confirmar — no app antigo era assim e o João vê o resultado
 * ao fechar.
 */
export function ConfigPainel({
  cfg,
  aoMudar,
}: {
  cfg: ItemPainel[];
  aoMudar: (c: ItemPainel[]) => void;
}) {
  const [aberto, setAberto] = useState(false);

  function aplicar(novo: ItemPainel[]) {
    salvarPainel(novo);
    aoMudar(novo);
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
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="secondary" size="sm" />}>
        <LayoutGrid className="mr-1.5 size-4" />
        Montar painel
      </DialogTrigger>

      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Montar meu painel</DialogTitle>
          <DialogDescription>
            Escolha o que aparece no Início, em que ordem e — no computador — com que largura. Vale
            só neste aparelho: o celular e o PC guardam layouts próprios.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-lg border">
          {cfg.map((it, ix) => {
            const w = widgetPorId(it.id);
            if (!w) return null;
            return (
              <div key={it.id} className={cn("p-3", !it.on && "opacity-55")}>
                <div className="flex items-start gap-3">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={it.on}
                      onChange={() => alternar(ix)}
                      className="mt-0.5 size-4 shrink-0 accent-foreground"
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
                            ? "border-foreground bg-foreground text-background"
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

        <div className="flex items-center justify-between gap-3">
          <p className="text-xs text-muted-foreground">
            {ligados} de {cfg.length} {ligados === 1 ? "bloco ligado" : "blocos ligados"}
          </p>
          <div className="flex gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                limparPainel();
                aoMudar(normalizarPainel(null));
              }}
            >
              Restaurar padrão
            </Button>
            <Button onClick={() => setAberto(false)}>Pronto</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
