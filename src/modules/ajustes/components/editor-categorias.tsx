"use client";

import { useState } from "react";
import { ChevronLeft, ChevronRight, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/*
 * Editor de categorias.
 *
 * Antes era uma caixa de texto com uma categoria por linha. Funcionava, mas
 * não dizia nada: não dava para ver quantas peças usam cada uma, apagar uma
 * linha sem querer passava despercebido, e a ordem em que elas aparecem no
 * cadastro ficava escondida no meio do texto.
 *
 * Aqui cada categoria é uma etiqueta com a contagem de peças ao lado, e a
 * ordem é a mesma que a moça vai ver no cadastro da peça — então dá para
 * colocar as mais usadas na frente.
 *
 * A REGRA QUE IMPORTA: categoria com peça dentro não se apaga por engano.
 * Sem isso, tirar "Anéis" daqui deixaria dezenas de peças apontando para uma
 * categoria que não existe mais — e elas sumiriam dos filtros sem aviso. Quem
 * insistir precisa primeiro mudar a categoria das peças.
 *
 * O valor sai num campo escondido, uma por linha, no mesmo formato que a ação
 * de salvar já entendia. A troca foi só de tela.
 */
export function EditorCategorias({
  iniciais,
  usos,
  erro,
}: {
  iniciais: string[];
  /** Quantas peças usam cada categoria hoje. */
  usos: Record<string, number>;
  erro?: string;
}) {
  const [lista, setLista] = useState<string[]>(iniciais);
  const [nova, setNova] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);

  const existe = (nome: string) =>
    lista.some((c) => c.toLocaleLowerCase("pt-BR") === nome.toLocaleLowerCase("pt-BR"));

  function adicionar() {
    const nome = nova.trim();
    if (!nome) return;
    if (existe(nome)) {
      setAviso(`"${nome}" já está na lista.`);
      return;
    }
    setLista([...lista, nome]);
    setNova("");
    setAviso(null);
  }

  function remover(nome: string) {
    const emUso = usos[nome] ?? 0;
    if (emUso > 0) {
      setAviso(
        `"${nome}" está em ${emUso} ${emUso === 1 ? "peça" : "peças"}. ` +
          `Mude a categoria ${emUso === 1 ? "dessa peça" : "dessas peças"} antes de tirar a categoria da lista.`,
      );
      return;
    }
    setLista(lista.filter((c) => c !== nome));
    setAviso(null);
  }

  function mover(ix: number, passo: number) {
    const destino = ix + passo;
    if (destino < 0 || destino >= lista.length) return;
    const novo = [...lista];
    [novo[ix], novo[destino]] = [novo[destino], novo[ix]];
    setLista(novo);
    setAviso(null);
  }

  return (
    <div className="space-y-2.5">
      <Label htmlFor="nova-categoria">Categorias de peça</Label>

      {/* O que a ação de salvar lê. A tela mudou; o formato, não. */}
      <input type="hidden" name="categorias" value={lista.join("\n")} />

      <div className="flex flex-wrap gap-1.5">
        {lista.map((c, ix) => {
          const emUso = usos[c] ?? 0;
          return (
            <span
              key={c}
              className={cn(
                "group inline-flex items-center gap-1 rounded-full border py-1 pl-2.5 pr-1 text-sm",
                "bg-(--ll-surface-2) transition-colors",
              )}
            >
              <button
                type="button"
                aria-label={`Mover ${c} para a esquerda`}
                disabled={ix === 0}
                onClick={() => mover(ix, -1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ChevronLeft className="size-3.5" />
              </button>

              <span className="font-medium">{c}</span>
              <span
                className="tabular-nums text-xs text-muted-foreground"
                title={`${emUso} ${emUso === 1 ? "peça usa" : "peças usam"} esta categoria`}
              >
                {emUso}
              </span>

              <button
                type="button"
                aria-label={`Mover ${c} para a direita`}
                disabled={ix === lista.length - 1}
                onClick={() => mover(ix, 1)}
                className="text-muted-foreground hover:text-foreground disabled:opacity-25"
              >
                <ChevronRight className="size-3.5" />
              </button>

              <button
                type="button"
                aria-label={`Remover ${c}`}
                onClick={() => remover(c)}
                className={cn(
                  "ml-0.5 grid size-5 place-items-center rounded-full transition-colors",
                  emUso > 0
                    ? "text-muted-foreground/40 hover:bg-amber-100 hover:text-amber-800 dark:hover:bg-amber-950"
                    : "text-muted-foreground hover:bg-destructive/10 hover:text-destructive",
                )}
              >
                <X className="size-3.5" />
              </button>
            </span>
          );
        })}

        {lista.length === 0 && (
          <p className="text-sm text-muted-foreground">
            Nenhuma categoria. Adicione a primeira abaixo.
          </p>
        )}
      </div>

      <div className="flex gap-2">
        <Input
          id="nova-categoria"
          value={nova}
          onChange={(e) => {
            setNova(e.target.value);
            setAviso(null);
          }}
          onKeyDown={(e) => {
            // Enter adiciona; sem isto o Enter enviaria o formulário inteiro
            // e a pessoa perderia o que estava digitando.
            if (e.key === "Enter") {
              e.preventDefault();
              adicionar();
            }
          }}
          placeholder="Nova categoria — ex.: Tornozeleiras"
          className="text-base"
          maxLength={40}
        />
        <Button type="button" variant="secondary" onClick={adicionar} disabled={!nova.trim()}>
          <Plus className="size-4" />
          <span className="hidden sm:inline">Adicionar</span>
        </Button>
      </div>

      {aviso ? (
        <p role="alert" className="text-sm font-medium text-amber-700 dark:text-amber-500">
          {aviso}
        </p>
      ) : erro ? (
        <p className="text-sm text-destructive">{erro}</p>
      ) : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          O número ao lado é quantas peças usam a categoria. As setas mudam a ordem em que elas
          aparecem no cadastro da peça — deixe as mais usadas na frente.
        </p>
      )}
    </div>
  );
}
