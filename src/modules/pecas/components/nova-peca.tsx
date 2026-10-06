"use client";

import { Seletor } from "@/components/padrao/seletor";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PencilSimpleIcon } from "@phosphor-icons/react/ssr";
import { criarPecaAction, editarPecaAction, pecaComCodigoAction } from "../peca.actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/formato";
import type { Result } from "@/lib/result";
import { FormFornecedor } from "@/modules/pessoas/components/form-fornecedor";
import { SeletorFoto, type FotoEscolhida } from "./seletor-foto";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

/*
 * Cadastrar e editar peça — os campos de `assistentePeca` e `editarProduto`
 * do app antigo, num formulário só: foto, código do fornecedor e
 * multiplicador (com o custo na hora), nome, categoria, tamanho, fornecedor,
 * preço sugerido, preço promocional, margem e o aviso de estoque mínimo.
 *
 * O que NÃO tem, de propósito, também é do app antigo: quantidade. A peça
 * nasce com estoque zero e quem põe peça na prateleira é a COMPRA, onde
 * entram a nota e o pagamento ao fornecedor.
 *
 * Client Component porque tem estado e envio. `veFinanceiro` chega calculado
 * NO SERVIDOR; esconder os campos aqui é só conveniência — quem manda é a
 * action, que ignora custo e fator quando a sessão não pode gravá-los.
 */

type Opcoes = {
  veFinanceiro: boolean;
  /** Sem o Storage configurado a foto não tem onde ficar: o seletor some e a peça entra sem foto. */
  fotosLigadas?: boolean;
  /** Multiplicador vindo dos Ajustes; usado como padrão no cadastro. */
  fator?: number;
  categorias?: string[];
  fornecedores?: Array<{ id: string; nome: string }>;
};

export type PecaEditavel = {
  id: string;
  sku: string;
  nome: string;
  categoria: string;
  tamanho: string | null;
  precoTabela: number | null;
  precoPromocional: number | null;
  minimo: number;
  fornecedorId: string | null;
  fotoUrl: string | null;
  /** Só chegam a quem vê o financeiro. */
  codigoFornecedor?: number | null;
  fator?: number | null;
};

/* O Select não guarda valor vazio; "nenhum" vira esta marca e sai vazio no formulário. */
const NENHUM = "__nenhum__";

const br = (n: number | null | undefined) => (n === null || n === undefined ? "" : String(n).replace(".", ","));
const paraNumero = (s: string) => Number(s.trim().replace(/\./g, "").replace(",", ".")) || 0;

export function NovaPeca({ rotulo, ...opcoes }: Opcoes & { rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      {/* Base UI compõe com `render`, não com `asChild` (que é do Radix). */}
      <DialogTrigger render={rotulo ? <Button /> : <Button className="w-full sm:w-auto" />}>
        {rotulo ?? "Nova peça"}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Cadastrar peça</DialogTitle>
          <DialogDescription>O código interno (LL-0001) é gerado automaticamente.</DialogDescription>
        </DialogHeader>
        {/* Montado só com o painel aberto: cada abertura começa do zero. */}
        {aberto && <FormPeca {...opcoes} aoTerminar={() => setAberto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

export function EditarPeca({ peca, ...opcoes }: Opcoes & { peca: PecaEditavel }) {
  const [aberto, setAberto] = useState(false);
  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline" />}>
        <PencilSimpleIcon className="mr-1.5 size-4" aria-hidden />
        Editar peça
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Editar peça</DialogTitle>
          <DialogDescription>Código interno {peca.sku}</DialogDescription>
        </DialogHeader>
        {aberto && <FormPeca {...opcoes} peca={peca} aoTerminar={() => setAberto(false)} />}
      </DialogContent>
    </Dialog>
  );
}

function FormPeca({
  veFinanceiro,
  fotosLigadas = true,
  fator: fatorPadrao = 2.9,
  categorias = [],
  fornecedores = [],
  peca,
  aoTerminar,
}: Opcoes & { peca?: PecaEditavel; aoTerminar: () => void }) {
  const router = useRouter();
  const editando = Boolean(peca);
  const [foto, setFoto] = useState<FotoEscolhida | null>(null);
  const [nome, setNome] = useState(peca?.nome ?? "");
  const [categoria, setCategoria] = useState(peca?.categoria ?? "");
  const [fornecedorId, setFornecedorId] = useState(peca?.fornecedorId ?? "");
  const [codigo, setCodigo] = useState(br(peca?.codigoFornecedor));
  const [fator, setFator] = useState(br(peca?.fator ?? fatorPadrao));
  const [preco, setPreco] = useState(br(peca?.precoTabela));
  const [repetida, setRepetida] = useState<{ id: string; nome: string; categoria: string } | null>(null);
  const [estado, setEstado] = useState<Result<{ id: string }> | null>(null);
  const [pendente, salvar] = useTransition();

  const custo = Math.round(paraNumero(codigo) * (paraNumero(fator) || fatorPadrao) * 100) / 100;
  const venda = paraNumero(preco);

  /* O aviso de código repetido só vale no cadastro: na edição, a peça com o
     código é ela mesma. */
  useEffect(() => {
    if (editando || !veFinanceiro || paraNumero(codigo) <= 0) return;
    let vivo = true;
    const t = setTimeout(() => {
      pecaComCodigoAction(codigo).then((r) => vivo && setRepetida(r.ok ? r.data : null));
    }, 300);
    return () => {
      vivo = false;
      clearTimeout(t);
    };
  }, [codigo, editando, veFinanceiro]);

  /*
   * `onSubmit` no lugar de `<form action={...}>`, e isso NÃO é estilo: o
   * React 19 LIMPA o formulário depois de um envio por form action — mesmo
   * quando ele falha. Tratando à mão, o que foi digitado continua na tela e a
   * pessoa só corrige o que faltou.
   */
  function enviar(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    // A foto é recortada no navegador e vive em estado, não num <input>.
    if (foto) fd.set("foto", foto.arquivo);

    salvar(async () => {
      const r = peca ? await editarPecaAction(peca.id, fd) : await criarPecaAction(fd);
      setEstado(r);
      if (r.ok) {
        aoTerminar();
        router.refresh();
      }
    });
  }

  const erroDe = (campo: string) => (estado && !estado.ok ? estado.error.fields?.[campo]?.[0] : undefined);
  const erroGeral = estado && !estado.ok && !estado.error.fields ? estado.error.message : undefined;

  // Categoria que saiu da lista continua na peça, marcada, em vez de sumir calada.
  const foraDaLista = categoria && !categorias.includes(categoria);
  const opcoesCategoria = [
    { value: NENHUM, label: "Sem categoria" },
    ...(foraDaLista ? [{ value: categoria, label: `${categoria} (fora da lista)` }] : []),
    ...categorias.map((c) => ({ value: c, label: c })),
  ];

  return (
    <form onSubmit={enviar} className="space-y-4">
      {/* Primeiro campo, como no app antigo: quem cadastra está com a peça na mão. */}
      {fotosLigadas && (
        <div className="space-y-2">
          {peca?.fotoUrl && !foto && (
            <div className="flex items-center gap-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={peca.fotoUrl} alt={`Foto atual de ${peca.nome}`} className="size-16 rounded-lg border object-cover" />
              <p className="text-xs text-muted-foreground">Foto atual. Escolha outra abaixo para trocar.</p>
            </div>
          )}
          <SeletorFoto valor={foto} aoMudar={setFoto} obrigatoria={!editando} erro={erroDe("foto")} />
        </div>
      )}

      {veFinanceiro && (
        <div className="space-y-3 rounded-lg border bg-muted/30 p-3">
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo
              id="codigoFornecedor"
              rotulo="Código do fornecedor"
              erro={erroDe("codigoFornecedor")}
              inputMode="decimal"
              placeholder="ex.: 35"
              value={codigo}
              onChange={(e) => {
                setCodigo(e.target.value);
                if (paraNumero(e.target.value) <= 0) setRepetida(null);
              }}
            />
            <Campo
              id="fator"
              rotulo="Multiplicador"
              erro={erroDe("fator")}
              inputMode="decimal"
              value={fator}
              onChange={(e) => setFator(e.target.value)}
            />
          </div>
          <div>
            <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
              Custo de aquisição
            </p>
            <p className="text-lg font-bold tabular-nums">{brl(custo)}</p>
            <p className="text-xs text-muted-foreground">
              código {paraNumero(codigo) || 0} × {fator || br(fatorPadrao)}
            </p>
          </div>
          {repetida && paraNumero(codigo) > 0 && (
            <div role="status" className="space-y-2 rounded-lg border bg-card p-3 text-sm">
              <p>
                Código já cadastrado em <strong>{repetida.nome}</strong>. Se for a mesma peça, use{" "}
                <strong>Nova compra</strong> para repor o estoque em vez de cadastrar de novo.
              </p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="w-full"
                onClick={() => {
                  setNome(repetida.nome);
                  setCategoria(repetida.categoria);
                }}
              >
                Copiar nome e categoria
              </Button>
            </div>
          )}
        </div>
      )}

      <Campo
        id="nome"
        rotulo="Nome da peça"
        erro={erroDe("nome")}
        placeholder="ex.: Anel solitário zircônia"
        value={nome}
        onChange={(e) => setNome(e.target.value)}
        autoFocus={!editando}
        required
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="categoria">Categoria</Label>
          <input type="hidden" name="categoria" value={categoria} />
          <Seletor
            id="categoria"
            opcoes={opcoesCategoria}
            value={categoria || NENHUM}
            onValueChange={(v) => setCategoria(v === NENHUM ? "" : v)}
            aria-invalid={!!erroDe("categoria")}
          />
          <p className="text-xs text-muted-foreground">Para criar ou renomear: Estoque › Categorias.</p>
          {erroDe("categoria") && <p className="text-sm text-destructive">{erroDe("categoria")}</p>}
        </div>
        <Campo
          id="tamanho"
          rotulo="Tamanho"
          erro={erroDe("tamanho")}
          placeholder="ex.: 17, 45 cm, P/M/G"
          maxLength={30}
          defaultValue={peca?.tamanho ?? ""}
          ajuda="Opcional. Aparece no orçamento, no recibo e na etiqueta."
        />
      </div>

      <div className="space-y-1.5">
        <Label htmlFor="fornecedor">Fornecedor</Label>
        <input type="hidden" name="fornecedorId" value={fornecedorId} />
        <div className="flex gap-2">
          <div className="min-w-0 flex-1">
            <Seletor
              id="fornecedor"
              opcoes={[{ value: NENHUM, label: "Selecione" }, ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))]}
              value={fornecedorId || NENHUM}
              onValueChange={(v) => setFornecedorId(v === NENHUM ? "" : v)}
              aria-invalid={!!erroDe("fornecedorId")}
            />
          </div>
          {/* O cadastro de verdade do fornecedor. Ao salvar, a tela recarrega e
              ele aparece na lista — o que já foi digitado aqui continua. */}
          <FormFornecedor rotulo="Novo" />
        </div>
        <p className="text-xs text-muted-foreground">
          De quem você compra esta peça. Serve para repor e para filtrar o catálogo.
        </p>
        {erroDe("fornecedorId") && <p className="text-sm text-destructive">{erroDe("fornecedorId")}</p>}
      </div>

      <Campo
        id="precoTabela"
        rotulo="Preço sugerido"
        erro={erroDe("precoTabela")}
        inputMode="decimal"
        placeholder="deixe em branco se decidir na hora"
        value={preco}
        onChange={(e) => setPreco(e.target.value)}
        ajuda="Opcional. O preço final é definido na venda ou no orçamento."
      />
      <Campo
        id="precoPromocional"
        rotulo="Preço promocional (opcional)"
        erro={erroDe("precoPromocional")}
        inputMode="decimal"
        placeholder="deixe em branco se não houver desconto"
        defaultValue={br(peca?.precoPromocional)}
        ajuda="Se for menor que o sugerido, a peça sai com desconto — que aparece na etiqueta e já vem na venda."
      />

      {/* Margem = custo × venda: só quem vê o financeiro. */}
      {veFinanceiro && venda > 0 && (
        <div className="flex items-center justify-between rounded-lg border p-3 text-sm">
          <span className="text-muted-foreground">Margem por peça</span>
          <span
            className={
              venda >= custo
                ? "font-semibold tabular-nums text-emerald-700 dark:text-emerald-400"
                : "font-semibold tabular-nums text-destructive"
            }
          >
            {brl(venda - custo)}
            {custo > 0 ? ` · ${Math.round(((venda - custo) / custo) * 100)}% sobre o custo` : ""}
          </span>
        </div>
      )}

      <Campo
        id="minimo"
        rotulo="Avisar quando o estoque chegar em"
        erro={erroDe("minimo")}
        inputMode="numeric"
        defaultValue={String(peca?.minimo ?? 0)}
        ajuda="A peça aparece como “acabando” a partir desta quantidade."
      />

      {!editando && (
        <p className="rounded-lg border bg-muted/30 p-3 text-sm leading-relaxed">
          A peça entra no catálogo com <strong>estoque zero</strong>. Quem coloca peça na prateleira é a{" "}
          <strong>compra</strong> — é lá que entra a nota e o pagamento ao fornecedor.
        </p>
      )}

      {erroGeral && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {erroGeral}
        </p>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <Button type="button" variant="ghost" onClick={aoTerminar}>
          Cancelar
        </Button>
        <Button type="submit" disabled={pendente}>
          {pendente ? "Salvando…" : editando ? "Salvar" : "Cadastrar peça"}
        </Button>
      </div>
    </form>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  ajuda,
  ...props
}: { id: string; rotulo: string; erro?: string; ajuda?: string } & React.ComponentProps<typeof Input>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      {/* text-base = 16px: abaixo disso o Safari do iPhone dá zoom sozinho */}
      <Input id={id} name={id} aria-invalid={!!erro} className="text-base" {...props} />
      {ajuda && <p className="text-xs text-muted-foreground">{ajuda}</p>}
      {erro && <p className="text-sm text-destructive">{erro}</p>}
    </div>
  );
}
