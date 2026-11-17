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
import {
  criarMaterialAction,
  excluirMaterialAction,
  renomearMaterialAction,
  restaurarMateriaisAction,
} from "../material.actions";
import type { Linha as LinhaLoja } from "@prisma/client";
import type { Result } from "@/lib/result";

/*
 * Categorias de peça — portada de `telaCategorias` do app antigo: criar,
 * renomear, excluir e restaurar a lista de fábrica, cada categoria com quantas
 * peças a usam. Antes ela era um editor de etiquetas no meio dos Ajustes; o
 * João pediu de volta numa opção própria, como era lá.
 *
 * Os MATERIAIS (17/11) são a mesma tela com outra lista: o editor é um só, e
 * cada lista entra com os seus textos (categoria é "ela", material é "ele") e
 * as suas actions.
 */

type Linha = { nome: string; pecas: number };

const pecas = (n: number) => (n === 1 ? "1 produto" : `${n} produtos`);

type Acoes = {
  criar: (nome: string) => Promise<Result<{ nome: string }>>;
  renomear: (de: string, para: string) => Promise<Result<{ pecas: number }>>;
  excluir: (nome: string) => Promise<Result<{ pecas: number }>>;
  restaurar: () => Promise<Result<{ ok: true }>>;
};

type Textos = {
  nova: string;
  placeholder: string;
  vazia: string;
  criada: (nome: string) => string;
  excluida: (nome: string) => string;
  excluir: string;
  /** "Ela fica" / "Elas ficam" sem categoria. */
  fica: (n: number) => string;
  saiDaLista: (nome: string) => string;
  continuam: string;
  sem: (n: number) => string;
  renomear: string;
  renomeada: string;
  usam: (n: number) => string;
  ninguemUsa: string;
  restaurar: (padrao: string[]) => string;
};

type Props = { lista: Linha[]; semNada?: number; foraDaLista: Linha[]; padrao: string[] };

export function CategoriasPecas({
  linhaLoja,
  semCategoria,
  ...props
}: Omit<Props, "semNada"> & {
  /** Semijoias, Perfumaria ou Outros: cada uma tem a sua lista. */
  linhaLoja: LinhaLoja;
  semCategoria: number;
}) {
  return (
    <EditorDeLista
      {...props}
      semNada={semCategoria}
      acoes={{
        criar: (nome) => criarCategoriaAction({ linha: linhaLoja, nome }),
        renomear: (de, para) => renomearCategoriaAction({ linha: linhaLoja, de, para }),
        excluir: (nome) => excluirCategoriaAction({ linha: linhaLoja, nome }),
        restaurar: () => restaurarCategoriasAction(linhaLoja),
      }}
      textos={{
        nova: "Nova categoria",
        placeholder: { SEMIJOIA: "ex.: Alianças", PERFUMARIA: "ex.: Body splash", OUTROS: "ex.: Carteiras" }[linhaLoja],
        vazia: "Nenhuma categoria. Crie a primeira acima.",
        criada: (n) => `Categoria ${n} criada.`,
        excluida: (n) => `Categoria ${n} excluída.`,
        excluir: "Excluir categoria",
        fica: (n) => (n === 1 ? "Ela fica" : "Elas ficam") + " sem categoria",
        saiDaLista: (n) => `A categoria ${n} sai da lista.`,
        continuam: "Elas continuam nos produtos; para trocar, edite o produto.",
        sem: (n) => `${n === 1 ? "1 produto está" : `${n} produtos estão`} sem categoria.`,
        renomear: "Renomear categoria",
        renomeada: "Categoria renomeada.",
        usam: (n) => `${n === 1 ? "1 produto usa" : `${n} produtos usam`} esta categoria e ${n === 1 ? "será atualizado" : "serão atualizados"} junto.`,
        ninguemUsa: "Nenhum produto usa esta categoria ainda.",
        restaurar: (padrao) =>
          `A lista volta a ser: ${padrao.join(", ")}. Os produtos não são alterados — um que use categoria fora dessa lista continua com ela, marcado como fora da lista.`,
      }}
    />
  );
}

export function MateriaisPecas(props: Omit<Props, "semNada">) {
  return (
    <EditorDeLista
      {...props}
      acoes={{
        criar: criarMaterialAction,
        renomear: (de, para) => renomearMaterialAction({ de, para }),
        excluir: excluirMaterialAction,
        restaurar: restaurarMateriaisAction,
      }}
      textos={{
        nova: "Novo material",
        placeholder: "ex.: Banhado a ouro 18k",
        vazia: "Nenhum material. Crie o primeiro acima.",
        criada: (n) => `Material ${n} criado.`,
        excluida: (n) => `Material ${n} excluído.`,
        excluir: "Excluir material",
        fica: (n) => (n === 1 ? "Ele fica" : "Eles ficam") + " sem material",
        saiDaLista: (n) => `O material ${n} sai da lista.`,
        continuam: "Eles continuam nos produtos; para trocar, edite o produto.",
        sem: () => "",
        renomear: "Renomear material",
        renomeada: "Material renomeado.",
        usam: (n) => `${n === 1 ? "1 produto usa" : `${n} produtos usam`} este material e ${n === 1 ? "será atualizado" : "serão atualizados"} junto.`,
        ninguemUsa: "Nenhum produto usa este material ainda.",
        restaurar: (padrao) =>
          `A lista volta a ser: ${padrao.join(", ")}. Os produtos não são alterados — um que use material fora dessa lista continua com ele.`,
      }}
    />
  );
}

function EditorDeLista({
  lista,
  semNada = 0,
  foraDaLista,
  padrao,
  acoes,
  textos,
}: Props & { acoes: Acoes; textos: Textos }) {
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
      const r = await acoes.criar(nova);
      if (!r.ok) return setErro(r.error.message);
      setNova("");
      setAviso(textos.criada(r.data.nome));
      router.refresh();
    });
  }

  return (
    <div className="space-y-4">
      <form onSubmit={adicionar} className="space-y-1.5">
        <Label htmlFor="nova-categoria">{textos.nova}</Label>
        <div className="flex gap-2">
          <Input
            id="nova-categoria"
            value={nova}
            onChange={(e) => setNova(e.target.value)}
            placeholder={textos.placeholder}
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
                  {c.pecas ? pecas(c.pecas) : "nenhum produto"}
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
          {textos.vazia}
        </p>
      )}

      {foraDaLista.length > 0 && (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Fora da lista, ainda em uso:{" "}
          {foraDaLista.map((c) => `${c.nome} (${pecas(c.pecas)})`).join(", ")}. {textos.continuam}
        </p>
      )}
      {semNada > 0 && <p className="text-xs text-muted-foreground">{textos.sem(semNada)}</p>}

      <Button variant="outline" onClick={() => setRestaurando(true)}>
        Restaurar lista de fábrica
      </Button>

      {renomeando && (
        <Renomear linha={renomeando} acoes={acoes} textos={textos} aoFechar={() => setRenomeando(null)} aoTerminar={setAviso} />
      )}
      {excluindo && (
        <Confirmar
          titulo={textos.excluir}
          texto={
            excluindo.pecas
              ? `${excluindo.nome} está em ${pecas(excluindo.pecas)}. ${textos.fica(excluindo.pecas)} — nenhum produto é apagado.`
              : textos.saiDaLista(excluindo.nome)
          }
          rotulo="Excluir"
          acao={async () => {
            const r = await acoes.excluir(excluindo.nome);
            if (!r.ok) return r.error.message;
            setAviso(textos.excluida(excluindo.nome));
            return null;
          }}
          aoFechar={() => setExcluindo(null)}
        />
      )}
      {restaurando && (
        <Confirmar
          titulo="Restaurar lista de fábrica"
          texto={textos.restaurar(padrao)}
          rotulo="Restaurar"
          acao={async () => {
            const r = await acoes.restaurar();
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
  acoes,
  textos,
  aoFechar,
  aoTerminar,
}: {
  linha: Linha;
  acoes: Acoes;
  textos: Textos;
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
      const r = await acoes.renomear(linha.nome, nome);
      if (!r.ok) return setErro(r.error.message);
      aoTerminar(r.data.pecas ? `${textos.renomeada} Mudou em ${pecas(r.data.pecas)}.` : textos.renomeada);
      aoFechar();
      router.refresh();
    });
  }

  return (
    <Dialog open onOpenChange={(v) => !v && aoFechar()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{textos.renomear}</DialogTitle>
          <DialogDescription>{linha.pecas ? textos.usam(linha.pecas) : textos.ninguemUsa}</DialogDescription>
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
