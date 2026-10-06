"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import { MinusIcon, PlusIcon, PrinterIcon, ShareNetworkIcon } from "@phosphor-icons/react/ssr";
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
import { Seletor } from "@/components/padrao/seletor";
import { cn } from "@/lib/utils";
import { gerarEtiquetasAction } from "../etiqueta.actions";
import { MAX_ETIQUETAS } from "../etiqueta.schemas";
import {
  gerarPdfEtiquetas,
  imagensNiimbot,
  MAX_IMAGENS_NIIMBOT,
  podeCompartilharImagem,
} from "../pdf-etiqueta";
import {
  dicaDoModelo,
  MODELO_PADRAO,
  modelosComAjustes,
  type ModeloEtiqueta,
} from "../etiqueta.regras";
import { usePreviaEtiqueta } from "./use-previa-etiqueta";

/*
 * Imprimir etiquetas — de uma peça, de várias ou de todas.
 *
 * As opções são as do app antigo: o modelo (térmicas, joia, NIIMBOT, folha
 * A4), mostrar o preço, incluir o QR e, na NIIMBOT, "Enviar para a
 * impressora" pela folha de compartilhar do celular. Por cima delas, as
 * quantidades que o João pediu: 1 de cada, o estoque de cada, o que entrou na
 * compra ou quantas quiser.
 *
 * O mesmo painel serve à ficha da peça (uma só), ao catálogo (as peças da
 * lista, com o filtro que estiver aplicado) e à compra (o que acabou de
 * chegar).
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

/* O modelo escolhido é do APARELHO: o celular do balcão manda para a NIIMBOT,
   o computador do escritório imprime a folha A4. */
const CHAVE_MODELO = "lalolla:etiqueta-modelo";

function modeloSalvo(): string {
  try {
    return localStorage.getItem(CHAVE_MODELO) ?? MODELO_PADRAO;
  } catch {
    return MODELO_PADRAO;
  }
}

function guardarModelo(id: string) {
  try {
    localStorage.setItem(CHAVE_MODELO, id);
  } catch {
    /* aba anônima: só não lembra da próxima vez */
  }
}

const assinarNada = () => () => {};

export function ImprimirEtiquetas({
  pecas,
  personalizado,
  podeNumerar,
  quantidades,
  rotulo = "Etiquetas",
  titulo,
  variante = "outline",
}: {
  pecas: PecaEtiqueta[];
  /** O tamanho guardado nos Ajustes — entra no fim da lista de modelos. */
  personalizado: ModeloEtiqueta;
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
  const [modeloId, setModeloId] = useState(MODELO_PADRAO);
  const [mostrarPreco, setMostrarPreco] = useState(true);
  const [incluirQr, setIncluirQr] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  /* Celular que recusou abrir a folha logo depois de gerar (o Safari exige o
     toque "fresco"): as imagens ficam prontas para um segundo toque. */
  const [prontas, setProntas] = useState<File[] | null>(null);
  // A folha de compartilhar com arquivo só existe no navegador — no servidor, falso.
  const compartilha = useSyncExternalStore(assinarNada, podeCompartilharImagem, () => false);

  const modelos = modelosComAjustes(personalizado);
  const modelo = modelos.find((m) => m.id === modeloId) ?? modelos[0];
  const opc = { preco: mostrarPreco, qr: incluirQr };
  const niimbot = modelo.tipo === "niimbot";

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
    setModeloId(modeloSalvo());
    setMostrarPreco(true);
    setIncluirQr(true);
    setAviso(null);
    setProntas(null);
    if (unica) {
      // Uma peça: o normal é etiquetar o que tem na prateleira.
      const p = pecas[0];
      setQtd({ [p.id]: quantidades?.[p.id] ?? Math.max(1, p.saldo) });
      setModo("n");
    } else {
      aplicar(quantidades ? "lista" : "um");
    }
  }

  function escolherModelo(id: string) {
    setModeloId(id);
    guardarModelo(id);
    setProntas(null);
  }

  const escolhidas = pecas.filter((p) => (qtd[p.id] ?? 0) > 0);
  const total = escolhidas.reduce((s, p) => s + (qtd[p.id] ?? 0), 0);
  const demais = total > MAX_ETIQUETAS;
  const folhas = Math.ceil(total / 24);

  const primeira = escolhidas[0] ?? pecas[0];
  const previa = usePreviaEtiqueta(
    primeira
      ? {
          codigo: primeira.sku + (numerar ? "-01" : ""),
          nome: primeira.nome,
          tamanho: primeira.tamanho,
          preco: primeira.preco,
          precoDe: primeira.precoDe,
        }
      : null,
    modelo,
    opc,
    aberto,
  );

  const mudar = (id: string, valor: number) => {
    setProntas(null);
    setQtd((q) => ({ ...q, [id]: Math.max(0, Math.min(200, Math.round(valor) || 0)) }));
  };

  /** O pedido para o servidor, cortado em `limite` etiquetas quando houver. */
  function pedido(limite = Infinity) {
    const itens: Array<{ pecaId: string; quantidade: number }> = [];
    let resta = limite;
    for (const p of escolhidas) {
      if (resta <= 0) break;
      const n = Math.min(qtd[p.id] ?? 0, resta);
      itens.push({ pecaId: p.id, quantidade: n });
      resta -= n;
    }
    return itens;
  }

  async function gerar() {
    const r = await gerarEtiquetasAction({ itens: pedido(), numerar });
    if (!r.ok) throw new AvisoPdf(r.error.message);
    if (numerar) router.refresh();
    return gerarPdfEtiquetas(r.data.etiquetas, modelo, opc);
  }

  async function compartilhar(arquivos: File[]) {
    let lista = arquivos;
    // Alguns aparelhos aceitam um arquivo mas recusam a lista inteira.
    if (!navigator.canShare({ files: lista }) && lista.length > 1 && navigator.canShare({ files: [lista[0]] })) {
      lista = [lista[0]];
    }
    try {
      await navigator.share({ files: lista, title: "Etiqueta LaLolla" });
      setAberto(false);
    } catch (e) {
      if (e instanceof DOMException && e.name === "NotAllowedError") {
        setProntas(lista);
        return;
      }
      // a pessoa fechou a folha — não é erro
    }
  }

  async function enviarNiimbot() {
    setAviso(null);
    setEnviando(true);
    try {
      /* Só as que vão de fato: numerar 50 e mandar 12 queimaria 38 números. */
      const r = await gerarEtiquetasAction({ itens: pedido(MAX_IMAGENS_NIIMBOT), numerar });
      if (!r.ok) {
        setAviso(r.error.message);
        return;
      }
      if (numerar) router.refresh();
      const arquivos = await imagensNiimbot(r.data.etiquetas, modelo, opc);
      await compartilhar(arquivos);
    } catch {
      setAviso("Não consegui gerar a imagem da etiqueta. Tente de novo ou use Gerar PDF.");
    } finally {
      setEnviando(false);
    }
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
        <PrinterIcon className="mr-1.5 size-4" aria-hidden />
        {rotulo}
      </DialogTrigger>

      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{titulo ?? (unica ? `Etiquetas de ${pecas[0].nome}` : "Etiquetas")}</DialogTitle>
          <DialogDescription>
            {unica
              ? "Escolha o tamanho e imprima quantas precisar desta peça."
              : "Gera as etiquetas para recortar/colar ou imprimir no rolo térmico."}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="modelo-etiqueta">Modelo de etiqueta</Label>
            <Seletor
              id="modelo-etiqueta"
              opcoes={modelos.map((m) => ({ value: m.id, label: m.nome }))}
              value={modelo.id}
              onValueChange={escolherModelo}
              aria-describedby="modelo-etiqueta-dica"
            />
            <p id="modelo-etiqueta-dica" className="text-xs leading-relaxed text-muted-foreground">
              {dicaDoModelo(modelo)}
            </p>
          </div>

          {previa && (
            <figure className="rounded-lg border bg-white p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={previa}
                alt={`Prévia da etiqueta de ${primeira?.nome ?? "peça"}`}
                className={cn(
                  "mx-auto h-auto w-full max-w-sm",
                  niimbot && "[image-rendering:pixelated]",
                )}
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

          <div className="space-y-2.5">
            <label className="flex items-center gap-2.5 text-sm">
              <input
                type="checkbox"
                checked={mostrarPreco}
                onChange={(e) => setMostrarPreco(e.target.checked)}
                className="size-4 shrink-0 accent-primary"
              />
              Mostrar preço sugerido
            </label>
            <label className="flex items-start gap-2.5">
              <input
                type="checkbox"
                checked={incluirQr}
                onChange={(e) => setIncluirQr(e.target.checked)}
                className="mt-0.5 size-4 shrink-0 accent-primary"
              />
              <span className="text-sm">
                Incluir QR code
                <span className="block text-xs leading-relaxed text-muted-foreground">
                  O QR guarda o código da peça — o &quot;Ler etiqueta&quot; do catálogo abre a ficha dela.
                </span>
              </span>
            </label>
          </div>

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

          {/* Caminho do celular: a folha de compartilhar do aparelho é onde o app
              da NIIMBOT aparece. O botão só existe onde a folha existe — no PC
              ele seria mentira. */}
          {niimbot && compartilha && (
            <div className="space-y-2 rounded-lg border p-3">
              {prontas ? (
                <Button type="button" className="w-full" onClick={() => compartilhar(prontas)}>
                  <ShareNetworkIcon className="mr-1.5 size-4" aria-hidden />
                  Abrir a folha de compartilhar
                </Button>
              ) : (
                <Button
                  type="button"
                  className="w-full"
                  disabled={total === 0 || demais || enviando}
                  onClick={enviarNiimbot}
                >
                  <ShareNetworkIcon className="mr-1.5 size-4" aria-hidden />
                  {enviando ? "Gerando…" : "Enviar para a impressora"}
                </Button>
              )}
              {/* Só o iPhone decide quais apps entram na folha (o app precisa
                  publicar uma Share Extension). Se a NIIMBOT não estiver lá, o
                  caminho é salvar na galeria e importar no app dela — por isso
                  o texto ensina os dois. */}
              <p className="text-xs leading-relaxed text-muted-foreground">
                Abre a folha de compartilhar. Se a <strong>NIIMBOT</strong> aparecer na lista, toque nela. Se
                não aparecer, toque em <strong>Salvar Imagem</strong> e depois importe a foto dentro do app da
                NIIMBOT.
                {total > MAX_IMAGENS_NIIMBOT &&
                  ` Vão as ${MAX_IMAGENS_NIIMBOT} primeiras — para todas de uma vez, use Gerar PDF.`}
              </p>
              {aviso && (
                <p role="alert" className="text-sm text-destructive">
                  {aviso}
                </p>
              )}
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-3 border-t pt-3">
            <p className={cn("text-sm", demais ? "font-medium text-destructive" : "text-muted-foreground")}>
              {demais
                ? `${total} etiquetas — o máximo é ${MAX_ETIQUETAS} por vez. Divida em lotes.`
                : total === 0
                  ? "Nenhuma etiqueta escolhida."
                  : `${total} etiqueta${total === 1 ? "" : "s"}${unica ? "" : ` de ${escolhidas.length} peça${escolhidas.length === 1 ? "" : "s"}`}` +
                    (modelo.tipo === "folha"
                      ? ` · ${folhas} folha${folhas === 1 ? "" : "s"} A4`
                      : " no rolo")}
            </p>
            <EnviarPdf
              rotulo="Etiquetas LaLolla"
              titulo="Etiquetas prontas"
              descricao={
                `${total} etiqueta${total === 1 ? "" : "s"}. ` +
                (niimbot
                  ? "No celular, toque em Compartilhar e escolha o app da NIIMBOT. No computador, salve e mande o arquivo para o celular."
                  : modelo.tipo === "folha"
                    ? "Imprima em tamanho real (100%, sem ajustar à página) e recorte."
                    : `Imprima na térmica configurada para ${modelo.largura} × ${modelo.altura} mm.`)
              }
              mensagem="Etiquetas LaLolla"
              telefone={null}
              nomeCliente={null}
              rotuloBotao="Gerar PDF"
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
        <MinusIcon className="size-4" aria-hidden />
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
        <PlusIcon className="size-4" aria-hidden />
      </Button>
    </div>
  );
}
