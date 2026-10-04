"use client";

import { useMemo, useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { AvisoPdf, EnviarPdf } from "@/components/padrao/enviar-pdf";
import { cn } from "@/lib/utils";
import { gerarEtiquetasAction } from "../etiqueta.actions";
import { MAX_ETIQUETAS } from "../etiqueta.schemas";
import { gerarPdfEtiquetas, previaEtiqueta } from "../pdf-etiqueta";
import type { ModeloEtiqueta } from "../etiqueta.regras";

/*
 * Imprimir etiquetas da NIIMBOT — de uma peça, de várias ou de todas.
 *
 * O mesmo painel serve à ficha da peça (uma só), ao catálogo (as peças da
 * lista, com o filtro que estiver aplicado) e à compra (o que acabou de
 * chegar). O que muda é só a lista e a quantidade inicial; o resto — quantas
 * de cada, numerar ou não, pré-visualizar, mandar para a NIIMBOT — é igual.
 *
 * O PDF sai no navegador e vai para o painel de envio: no celular,
 * "Compartilhar" entrega o arquivo direto ao app da NIIMBOT.
 */

export type PecaEtiqueta = {
  id: string;
  sku: string;
  nome: string;
  tamanho: string | null;
  saldo: number;
  preco: number | null;
  precoDe: number | null;
};

type Modo = "um" | "estoque" | "lista" | "n";

/* Canvas e câmera só existem no navegador. No servidor (e na hidratação) isto
   é falso; logo depois vira verdadeiro — sem estado mudado dentro de efeito. */
const assinarNada = () => () => {};


export function ImprimirEtiquetas({
  pecas,
  modelo,
  podeNumerar,
  quantidades,
  rotulo = "Etiquetas",
  titulo,
  variante = "outline",
}: {
  pecas: PecaEtiqueta[];
  modelo: ModeloEtiqueta;
  /** Numerar reserva números na peça: só quem pode editar o estoque. */
  podeNumerar: boolean;
  /** Quantidade sugerida por peça — ex.: as unidades que entraram na compra. */
  quantidades?: Record<string, number>;
  rotulo?: string;
  titulo?: string;
  variante?: "default" | "outline";
}) {
  const router = useRouter();
  const unica = pecas.length === 1;
  const [aberto, setAberto] = useState(false);
  const [qtd, setQtd] = useState<Record<string, number>>({});
  const [modo, setModo] = useState<Modo>("um");
  const [nDeCada, setNDeCada] = useState("2");
  const [numerar, setNumerar] = useState(podeNumerar);
  const noNavegador = useSyncExternalStore(assinarNada, () => true, () => false);

  function aplicar(m: Modo, n = Number(nDeCada) || 1) {
    setModo(m);
    const novo: Record<string, number> = {};
    for (const p of pecas) {
      novo[p.id] =
        m === "um" ? 1
        : m === "estoque" ? Math.max(0, p.saldo)
        : m === "lista" ? (quantidades?.[p.id] ?? 0)
        : n;
    }
    setQtd(novo);
  }

  function abrir(v: boolean) {
    setAberto(v);
    if (!v) return;
    setNumerar(podeNumerar);
    if (unica) {
      // Uma peça: o normal é etiquetar o que tem na prateleira.
      const p = pecas[0];
      setQtd({ [p.id]: quantidades?.[p.id] ?? Math.max(1, p.saldo) });
      setModo("n");
    } else {
      aplicar(quantidades ? "lista" : "um");
    }
  }

  const escolhidas = pecas.filter((p) => (qtd[p.id] ?? 0) > 0);
  const total = escolhidas.reduce((s, p) => s + (qtd[p.id] ?? 0), 0);
  const demais = total > MAX_ETIQUETAS;

  const primeira = escolhidas[0] ?? pecas[0];
  const exemplo = useMemo(
    () =>
      primeira
        ? {
            codigo: primeira.sku + (numerar ? "-01" : ""),
            nome: primeira.nome,
            tamanho: primeira.tamanho,
            preco: primeira.preco,
            precoDe: primeira.precoDe,
          }
        : null,
    [primeira, numerar],
  );

  // O desenho usa canvas: só no navegador, e só com o painel aberto.
  const previa = useMemo(
    () => (noNavegador && aberto && exemplo ? previaEtiqueta(exemplo, modelo) : null),
    [noNavegador, aberto, exemplo, modelo],
  );

  const mudar = (id: string, valor: number) =>
    setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(200, Math.round(valor) || 0)) }));

  async function gerar() {
    const itens = pecas
      .filter((p) => (qtd[p.id] ?? 0) > 0)
      .map((p) => ({ pecaId: p.id, quantidade: qtd[p.id] }));
    const r = await gerarEtiquetasAction({ itens, numerar });
    if (!r.ok) throw new AvisoPdf(r.error.message);
    if (numerar) router.refresh();
    return gerarPdfEtiquetas(r.data.etiquetas, modelo);
  }

  if (pecas.length === 0) return null;

  const MODOS: Array<[Modo, string]> = [
    ["um", "1 de cada"],
    ["estoque", "O estoque de cada"],
    ...(quantidades ? ([["lista", "O que entrou na compra"]] as Array<[Modo, string]>) : []),
    ["n", "Escolher quantas"],
  ];

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger render={<Button variant={variante} />}>
        <Printer className="mr-1.5 size-4" aria-hidden />
        {rotulo}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo ?? (unica ? `Etiquetas de ${pecas[0].nome}` : "Etiquetas")}</DialogTitle>
          <DialogDescription>
            Para a NIIMBOT · {String(modelo.largura).replace(".", ",")} ×{" "}
            {String(modelo.altura).replace(".", ",")} mm{modelo.dobrada ? ", dobrada ao meio" : ""}. O
            tamanho se ajusta em Ajustes.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {previa && (
            <figure className="rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previa}
                alt={`Prévia da etiqueta de ${primeira?.nome ?? "peça"}`}
                className="mx-auto h-auto w-full max-w-sm [image-rendering:pixelated]"
              />
              <figcaption className="mt-2 text-center text-xs text-neutral-500">
                Prévia da primeira etiqueta
                {numerar ? " — o número da unidade sai na hora de gerar" : ""}
              </figcaption>
            </figure>
          )}

          {unica ? (
            <div className="space-y-1.5">
              <Label htmlFor="qtd-etiquetas">Quantas etiquetas</Label>
              <Contador
                id="qtd-etiquetas"
                valor={qtd[pecas[0].id] ?? 1}
                onChange={(v) => mudar(pecas[0].id, Math.max(1, v))}
              />
              <div className="flex flex-wrap gap-1.5">
                <Atalho onClick={() => mudar(pecas[0].id, 1)}>Só 1</Atalho>
                {pecas[0].saldo > 1 && (
                  <Atalho onClick={() => mudar(pecas[0].id, pecas[0].saldo)}>
                    Uma por unidade em estoque ({pecas[0].saldo})
                  </Atalho>
                )}
                {quantidades?.[pecas[0].id] && (
                  <Atalho onClick={() => mudar(pecas[0].id, quantidades[pecas[0].id])}>
                    O que entrou ({quantidades[pecas[0].id]})
                  </Atalho>
                )}
              </div>
            </div>
          ) : (
            <>
              <div className="space-y-1.5">
                <Label>Quantas de cada</Label>
                <div className="flex flex-wrap items-center gap-1.5">
                  {MODOS.map(([m, r]) => (
                    <Atalho key={m} ativo={modo === m} onClick={() => aplicar(m)}>
                      {r}
                    </Atalho>
                  ))}
                  {modo === "n" && (
                    <Input
                      aria-label="Quantas etiquetas de cada peça"
                      inputMode="numeric"
                      value={nDeCada}
                      onChange={(e) => {
                        const v = e.target.value.replace(/\D/g, "").slice(0, 3);
                        setNDeCada(v);
                        if (Number(v) > 0) aplicar("n", Number(v));
                      }}
                      className="h-8 w-16 text-base"
                    />
                  )}
                </div>
                {modo === "estoque" && pecas.some((p) => p.saldo <= 0) && (
                  <p className="text-xs text-muted-foreground">
                    Peças sem estoque ficaram de fora — marque na lista se quiser etiqueta delas.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <Label>Peças</Label>
                  <div className="flex gap-1">
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => aplicar(modo === "lista" || modo === "estoque" ? modo : "n")}
                    >
                      Marcar todas
                    </button>
                    <button
                      type="button"
                      className="rounded px-2 py-0.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                      onClick={() => setQtd({})}
                    >
                      Desmarcar
                    </button>
                  </div>
                </div>
                <ul className="max-h-64 divide-y overflow-y-auto rounded-lg border">
                  {pecas.map((p) => {
                    const n = qtd[p.id] ?? 0;
                    return (
                      <li key={p.id} className="flex items-center gap-2 px-3 py-2">
                        <input
                          type="checkbox"
                          aria-label={`Etiquetar ${p.nome}`}
                          checked={n > 0}
                          onChange={(e) => mudar(p.id, e.target.checked ? Math.max(1, p.saldo, quantidades?.[p.id] ?? 0) : 0)}
                          className="size-4 shrink-0 accent-primary"
                        />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.nome}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {p.sku} · {p.saldo} em estoque
                          </span>
                        </span>
                        <Contador compacto valor={n} onChange={(v) => mudar(p.id, v)} />
                      </li>
                    );
                  })}
                </ul>
              </div>
            </>
          )}

          <label className="flex items-start gap-2.5 rounded-lg border p-3">
            <input
              type="checkbox"
              checked={numerar}
              disabled={!podeNumerar}
              onChange={(e) => setNumerar(e.target.checked)}
              className="mt-0.5 size-4 shrink-0 accent-primary"
            />
            <span className="text-sm">
              <span className="font-medium">Numerar cada unidade</span>
              <span className="block text-xs leading-relaxed text-muted-foreground">
                {podeNumerar
                  ? "Como no app antigo: LL-0001-01, LL-0001-02… — dá para saber exatamente qual unidade saiu. Desligado, todas saem com o código da peça."
                  : "Só quem pode editar o estoque numera unidades. As etiquetas saem com o código da peça."}
              </span>
            </span>
          </label>

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className={cn("text-sm", demais ? "font-medium text-destructive" : "text-muted-foreground")}>
              {demais
                ? `${total} etiquetas — o máximo é ${MAX_ETIQUETAS} por vez. Divida em lotes.`
                : total === 0
                  ? "Nenhuma etiqueta escolhida."
                  : `${total} etiqueta${total === 1 ? "" : "s"}${unica ? "" : ` de ${escolhidas.length} peça${escolhidas.length === 1 ? "" : "s"}`}`}
            </p>
            <EnviarPdf
              rotulo="Etiquetas LaLolla"
              titulo="Etiquetas prontas"
              descricao={`${total} etiqueta${total === 1 ? "" : "s"}. No celular, toque em Compartilhar e escolha o app da NIIMBOT. No computador, salve e mande o arquivo para o celular.`}
              mensagem="Etiquetas LaLolla"
              telefone={null}
              nomeCliente={null}
              rotuloBotao={total > 0 ? `Gerar ${total} etiqueta${total === 1 ? "" : "s"}` : "Gerar etiquetas"}
              desabilitado={total === 0 || demais}
              gerar={gerar}
            />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function Atalho({
  ativo,
  onClick,
  children,
}: {
  ativo?: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={ativo}
      onClick={onClick}
      className={cn(
        "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
        ativo ? "border-primary bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function Contador({
  id,
  valor,
  onChange,
  compacto,
}: {
  id?: string;
  valor: number;
  onChange: (v: number) => void;
  compacto?: boolean;
}) {
  return (
    <div className="flex shrink-0 items-center gap-1">
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={compacto ? "size-8" : undefined}
        aria-label="Uma a menos"
        onClick={() => onChange(valor - 1)}
      >
        <Minus className="size-4" aria-hidden />
      </Button>
      <Input
        id={id}
        inputMode="numeric"
        aria-label="Quantidade de etiquetas"
        value={String(valor)}
        onChange={(e) => onChange(Number(e.target.value.replace(/\D/g, "").slice(0, 3)))}
        className={cn("text-center text-base tabular-nums", compacto ? "h-8 w-12" : "w-20")}
      />
      <Button
        type="button"
        variant="outline"
        size="icon"
        className={compacto ? "size-8" : undefined}
        aria-label="Uma a mais"
        onClick={() => onChange(valor + 1)}
      >
        <Plus className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
