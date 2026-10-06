"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  criarCategoriaAction,
  excluirCategoriaAction,
  renomearCategoriaAction,
  restaurarCategoriasAction,
} from "../categoria.actions";

/*
 * Categorias de peça — portada de `telaCategorias` do app antigo: criar,
 * renomear, excluir e restaurar a lista de fábrica, cada categoria com quantas
 * peças a usam. Antes ela era um editor de etiquetas no meio dos Ajustes; o
 * João pediu de volta numa opção própria, como era lá.
 */

type Linha = { nome: string; pecas: number };

const pecas = (n: number) => (n === 1 ? "1 peça" : `${n} peças`);

export function CategoriasPecas({
  lista,
  semCategoria,
  foraDaLista,
  padrao,
}: {
  lista: Linha[];
  semCategoria: number;
  foraDaLista: Linha[];
  /** A lista de fábrica, para o aviso do "Restaurar". */
  padrao: string[];
}) {
  const router = useRouter();
  const [nova, setNova] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [criando, criar] = useTransition();
  const [renomeando, setRenomeando] = useState<Linha | null>(null);
  const [excluindo, setExcluindo] = useState<Linha | null>(null);
  const [restaurando, setRestaurando] = useState(false);

  function adicionar(e: React.FormEvent) {
    e.preventDefault();
    setErro(null);
    setAviso(null);
    criar(async () => {
      const r = await criarCategoriaAction(nova);
      if (!r.ok) return setErro(r.error.message);
      setNova("");
      setAviso(`Categoria ${r.data.nome} criada.`);
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="space-y-1.5">
        <Label htmlFor="nova-categoria">Nova categoria</Label>
        <div className="flex gap-2">
          <Input
            id="nova-categoria"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder="ex.: Alianças"
            maxLength={40}
            aria-invalid={!!erro}
            aria-describedby={erro ? "nova-categoria-erro" : undefined}
            className="text-base"
          />
          <Button type="submit" disabled={criando || !nova.trim()}>
            <PlusIcon className="mr-1.5 size-4" aria-hidden />
            Criar
          </Button>
        </div>
        {erro && (
          <p id="nova-categoria-erro" role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        {aviso && (
          <p role="status" className="text-sm text-muted-foreground">
            {aviso}
          </p>
        )}
      </form>

      {lista.length > 0 ? (
        <ul className="divide-y rounded-xl border bg-card">
          {lista.map((c) => (
            <li key={c.nome} className="flex items-center gap-2 px-4 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  {c.pecas ? pecas(c.pecas) : "nenhuma peça"}
                </span>
              </span>
              <Button variant="ghost" size="sm" onClick={() => setRenomeando(c)}>
                Renomear
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setExcluindo(c)}>
                Excluir
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="rounded-xl border bg-card px-4 py-8 text-center text-sm text-muted-foreground">
          Nenhuma categoria. Crie a primeira acima.
        </p>
      )}

      {foraDaLista.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Fora da lista, ainda em uso:{" "}
          {foraDaLista.map((c) => `${c.nome} (${pecas(c.pecas)})`).join(", ")}. Elas continuam nas peças; para
          trocar, edite a peça.
        </p>
      )}
      {semCategoria > 0 && (
        <p className="text-xs text-muted-foreground">
          {semCategoria === 1 ? "1 peça está" : `${semCategoria} peças estão`} sem categoria.
        </p>
      )}

      <Button variant="outline" onClick={() => setRestaurando(true)}>
        Restaurar lista de fábrica
      </Button>

      {renomeando && (
        <Renomear linha={renomeando} aoFechar={() => setRenomeando(null)} aoTerminar={setAviso} />
      )}
      {excluindo && (
        <Confirmar
          titulo="Excluir categoria"
          texto={
            excluindo.pecas
              ? `${excluindo.nome} está em ${pecas(excluindo.pecas)}. ${
                  excluindo.pecas === 1 ? "Ela fica" : "Elas ficam"
                } sem categoria — nenhuma peça é apagada.`
              : `A categoria ${excluindo.nome} sai da lista.`
          }
          rotulo="Excluir"
          acao={async () => {
            const r = await excluirCategoriaAction(excluindo.nome);
            if (!r.ok) return r.error.message;
            setAviso(`Categoria ${excluindo.nome} excluída.`);
            return null;
          }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
      {restaurando && (
        <Confirmar
          titulo="Restaurar lista de fábrica"
          texto={`A lista volta a ser: ${padrao.join(", ")}. As peças não são alteradas — uma que use categoria fora dessa lista continua com ela, marcada como fora da lista.`}
          rotulo="Restaurar"
          acao={async () => {
            const r = await restaurarCategoriasAction();
            if (!r.ok) return r.error.message;
            setAviso("Lista de fábrica restaurada.");
            return null;
          }}
          aoFechar={() => setRestaurando(false)}
        />
      )}
    </div>
  );
}

function Renomear({
  linha,
  aoFechar,
  aoTerminar,
}: {
  linha: Linha;
  aoFechar: () => void;
  aoTerminar: (aviso: string) => void;
}) {
  const router = useRouter();
  const [nome, setNome] = useState(linha.nome);
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  function enviar(e: React.FormEvent) {
    e.preventDefault();
    if (nome.trim() === linha.nome) return aoFechar();
    salvar(async () => {
      const r = await renomearCategoriaAction({ de: linha.nome, para: nome });
      if (!r.ok) return setErro(r.error.message);
      aoTerminar(r.data.pecas ? `Renomeada em ${pecas(r.data.pecas)}.` : "Categoria renomeada.");
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Renomear categoria</DialogTitle>
          <DialogDescription>
            {linha.pecas
              ? `${linha.pecas === 1 ? "1 peça usa" : `${linha.pecas} peças usam`} esta categoria e ${
                  linha.pecas === 1 ? "será atualizada" : "serão atualizadas"
                } junto.`
              : "Nenhuma peça usa esta categoria ainda."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={enviar} className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="renomear-categoria">Nome</Label>
            <Input
              id="renomear-categoria"
              value={nome}
              onChange={(e) => setNome(e.target.value)}
              maxLength={40}
              autoFocus
              className="text-base"
            />
            {erro && (
              <p role="alert" className="text-sm text-destructive">
                {erro}
              </p>
            )}
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={aoFechar}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || !nome.trim()}>
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Confirmar({
  titulo,
  texto,
  rotulo,
  acao,
  aoFechar,
}: {
  titulo: string;
  texto: string;
  rotulo: string;
  /** Devolve a mensagem de erro, ou null quando deu certo. */
  acao: () => Promise<string | null>;
  aoFechar: () => void;
}) {
  const router = useRouter();
  const [erro, setErro] = useState<string | null>(null);
  const [indo, ir] = useTransition();

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{titulo}</DialogTitle>
          <DialogDescription>{texto}</DialogDescription>
        </DialogHeader>
        {erro && (
          <p role="alert" className="text-sm text-destructive">
            {erro}
          </p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={aoFechar}>
            Cancelar
          </Button>
          <Button
            disabled={indo}
            onClick={() =>
              ir(async () => {
                const falha = await acao();
                if (falha) return setErro(falha);
                aoFechar();
                router.refresh();
              })
            }
          >
            {indo ? "Aguarde…" : rotulo}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
