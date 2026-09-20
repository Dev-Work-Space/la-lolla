"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Camera, Crop, RotateCcw, Trash2, ZoomIn } from "lucide-react";
import imageCompression from "browser-image-compression";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";

/*
 * A FOTO DA PEÇA.
 *
 * É obrigatória no cadastro, e por um motivo prático: na hora da venda, com a
 * cliente na frente, ninguém procura peça lendo nome — procura reconhecendo a
 * imagem. Catálogo sem foto vira lista de texto que ninguém usa.
 *
 * O enquadramento é QUADRADO por padrão porque a lista, a busca da venda e a
 * etiqueta são todas quadradas: deixar a pessoa escolher o corte aqui é o que
 * evita a peça aparecer cortada pela metade lá na frente. Quem quiser mandar a
 * imagem inteira tem o botão "recorte livre".
 *
 * Toda a redução acontece AQUI, no navegador, antes de subir: uma foto de
 * iPhone tem 4 MB e o que precisa chegar no servidor tem 300 KB. Subir os 4 MB
 * pela rede da loja seria lento e sem ganho nenhum — a tela nunca mostra a
 * imagem em tamanho original.
 */

/*
 * O TETO DA IMAGEM — e por que ele é apertado.
 *
 * A foto vai para o Supabase Storage, que é cobrado por espaço. Cada peça
 * guarda TRÊS arquivos (grande, média e miniatura), então o peso de uma foto
 * se multiplica por três no armazenamento. Com 1.200 px e ~250 KB na entrada,
 * o conjunto de uma peça fica em torno de **220 KB** — cerca de 4.500 peças
 * em 1 GB.
 *
 * 1.200 px é a medida certa para esta loja, não um número redondo: a maior
 * tela onde a foto aparece é a ficha da peça, que usa 720 px, e a etiqueta
 * imprime bem menos. O que sobra serve para ampliar sem borrar; acima disso é
 * espaço pago para guardar detalhe que ninguém vê.
 */
export const LADO_SAIDA = 1200;
export const ALVO_KB = 250;

/** Acima disto a tela avisa: alguma coisa deu errado na redução. */
const TETO_AVISO_KB = 600;

const kb = (bytes: number) => Math.round(bytes / 1024);

export type FotoEscolhida = {
  arquivo: File;
  previa: string;
  /** Para a tela poder mostrar o que de fato vai subir. */
  bytes: number;
  lado: number;
};

export function SeletorFoto({
  valor,
  aoMudar,
  obrigatoria = true,
  erro,
}: {
  valor: FotoEscolhida | null;
  aoMudar: (f: FotoEscolhida | null) => void;
  obrigatoria?: boolean;
  erro?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);

  /* A imagem crua, antes do recorte. Fica aqui para dar para reenquadrar sem
     pedir a foto de novo. */
  const [origem, setOrigem] = useState<HTMLImageElement | null>(null);
  const [origemUrl, setOrigemUrl] = useState<string | null>(null);
  const [livre, setLivre] = useState(false);
  const [escala, setEscala] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [processando, setProcessando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  const molduraRef = useRef<HTMLDivElement>(null);
  const arrasto = useRef<{ x: number; y: number } | null>(null);
  const pontos = useRef(new Map<number, { x: number; y: number }>());
  const pinca = useRef<{ dist: number; escala: number } | null>(null);

  /*
   * O lado da moldura mora em ESTADO, não em `ref.current`.
   *
   * O desenho da tela precisa dele para calcular o tamanho da imagem, e ler
   * uma ref durante o desenho é proibido pelo React — o valor pode estar
   * desatualizado e a tela sai errada sem avisar. Com o observador, girar o
   * celular ou abrir a barra lateral recalcula sozinho.
   */
  const [lado, setLado] = useState(0);

  useEffect(() => {
    const el = molduraRef.current;
    if (!el) return;
    setLado(el.clientWidth);
    const obs = new ResizeObserver(([e]) => setLado(e.contentRect.width));
    obs.observe(el);
    return () => obs.disconnect();
  }, [origem, livre]);

  /* Revoga a URL da prévia ao trocar/desmontar: sem isso cada foto escolhida
     deixa um blob preso na memória da aba até recarregar a página. */
  useEffect(() => {
    return () => {
      if (origemUrl) URL.revokeObjectURL(origemUrl);
    };
  }, [origemUrl]);

  function escolher() {
    inputRef.current?.click();
  }

  async function aoSelecionarArquivo(e: React.ChangeEvent<HTMLInputElement>) {
    const arq = e.target.files?.[0];
    e.target.value = ""; // permite escolher o MESMO arquivo de novo
    if (!arq) return;

    setAviso(null);
    if (!arq.type.startsWith("image/")) {
      setAviso("Escolha uma imagem.");
      return;
    }

    const url = URL.createObjectURL(arq);
    const img = new Image();
    img.onload = () => {
      if (origemUrl) URL.revokeObjectURL(origemUrl);
      setOrigem(img);
      setOrigemUrl(url);
      setEscala(1);
      setPos({ x: 0, y: 0 });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      setAviso("Não consegui abrir essa imagem. Tente outra.");
    };
    img.src = url;
  }

  /* A escala que faz a imagem COBRIR a moldura quadrada. É o ponto de partida:
     com ela, nenhuma borda vazia aparece antes de a pessoa mexer. */
  const base = useCallback(() => {
    if (!origem || !lado) return 1;
    return Math.max(lado / origem.naturalWidth, lado / origem.naturalHeight);
  }, [origem, lado]);

  /* Trava o arrasto para a moldura nunca mostrar vazio nas bordas. */
  const limitar = useCallback(
    (p: { x: number; y: number }, e: number) => {
      if (!origem || !lado) return p;
      const larg = origem.naturalWidth * base() * e;
      const alt = origem.naturalHeight * base() * e;
      const folgaX = Math.max(0, (larg - lado) / 2);
      const folgaY = Math.max(0, (alt - lado) / 2);
      return {
        x: Math.min(folgaX, Math.max(-folgaX, p.x)),
        y: Math.min(folgaY, Math.max(-folgaY, p.y)),
      };
    },
    [origem, lado, base],
  );

  function mudarEscala(nova: number) {
    const e = Math.min(4, Math.max(1, nova));
    setEscala(e);
    setPos((p) => limitar(p, e));
  }

  /* ---- arrastar e pinçar ---- */

  function aoDescer(ev: React.PointerEvent) {
    if (livre) return;
    (ev.target as Element).setPointerCapture?.(ev.pointerId);
    pontos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });
    if (pontos.current.size === 1) {
      arrasto.current = { x: ev.clientX - pos.x, y: ev.clientY - pos.y };
    } else if (pontos.current.size === 2) {
      const [a, b] = [...pontos.current.values()];
      pinca.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), escala };
      arrasto.current = null;
    }
  }

  function aoMover(ev: React.PointerEvent) {
    if (livre || !pontos.current.has(ev.pointerId)) return;
    pontos.current.set(ev.pointerId, { x: ev.clientX, y: ev.clientY });

    if (pontos.current.size === 2 && pinca.current) {
      const [a, b] = [...pontos.current.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y);
      mudarEscala(pinca.current.escala * (d / pinca.current.dist));
      return;
    }
    if (arrasto.current) {
      setPos(limitar({ x: ev.clientX - arrasto.current.x, y: ev.clientY - arrasto.current.y }, escala));
    }
  }

  function aoSubir(ev: React.PointerEvent) {
    pontos.current.delete(ev.pointerId);
    if (pontos.current.size < 2) pinca.current = null;
    if (pontos.current.size === 0) arrasto.current = null;
  }

  /* ---- confirmar: recorta, comprime e entrega ---- */

  async function confirmar() {
    if (!origem) return;
    setProcessando(true);
    setAviso(null);
    try {
      const tela = document.createElement("canvas");
      const ctx = tela.getContext("2d");
      if (!ctx) throw new Error("canvas");

      if (livre) {
        /* Recorte livre: manda a imagem inteira, só reduzida. Serve para peça
           comprida — um colar esticado perde metade num quadrado. */
        const maior = Math.max(origem.naturalWidth, origem.naturalHeight);
        const f = Math.min(1, LADO_SAIDA / maior);
        tela.width = Math.round(origem.naturalWidth * f);
        tela.height = Math.round(origem.naturalHeight * f);
        ctx.drawImage(origem, 0, 0, tela.width, tela.height);
      } else {
        /* Quadrado: converto o que está visível na moldura para coordenadas da
           imagem original e recorto exatamente aquilo. */
        const z = base() * escala;
        const largExibida = origem.naturalWidth * z;
        const altExibida = origem.naturalHeight * z;

        const esqExibido = (largExibida - lado) / 2 - pos.x;
        const topoExibido = (altExibida - lado) / 2 - pos.y;

        const srcX = Math.max(0, esqExibido / z);
        const srcY = Math.max(0, topoExibido / z);
        const srcLado = Math.min(lado / z, origem.naturalWidth - srcX, origem.naturalHeight - srcY);

        tela.width = LADO_SAIDA;
        tela.height = LADO_SAIDA;
        ctx.drawImage(origem, srcX, srcY, srcLado, srcLado, 0, 0, LADO_SAIDA, LADO_SAIDA);
      }

      const blob: Blob = await new Promise((res, rej) =>
        tela.toBlob((b) => (b ? res(b) : rej(new Error("blob"))), "image/jpeg", 0.9),
      );

      const bruto = new File([blob], "peca.jpg", { type: "image/jpeg" });
      const comprimido = await imageCompression(bruto, {
        maxSizeMB: ALVO_KB / 1024,
        maxWidthOrHeight: LADO_SAIDA,
        useWebWorker: true,
        fileType: "image/jpeg",
      });

      const arquivo = new File([comprimido], "peca.jpg", { type: "image/jpeg" });
      aoMudar({
        arquivo,
        previa: URL.createObjectURL(arquivo),
        bytes: arquivo.size,
        lado: Math.max(tela.width, tela.height),
      });

      if (origemUrl) URL.revokeObjectURL(origemUrl);
      setOrigem(null);
      setOrigemUrl(null);
    } catch {
      setAviso("Não consegui preparar a imagem. Tente outra foto.");
    } finally {
      setProcessando(false);
    }
  }

  /* ---- as três telas possíveis ---- */

  return (
    <div className="space-y-2">
      <Label>
        Foto da peça{obrigatoria && <span className="ml-1 text-destructive">*</span>}
      </Label>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={aoSelecionarArquivo}
        className="hidden"
        aria-hidden
        tabIndex={-1}
      />

      {/* 1. enquadrando */}
      {origem && (
        <div className="space-y-3 rounded-xl border bg-card p-3">
          <div
            ref={molduraRef}
            onPointerDown={aoDescer}
            onPointerMove={aoMover}
            onPointerUp={aoSubir}
            onPointerCancel={aoSubir}
            onWheel={(e) => !livre && mudarEscala(escala - e.deltaY * 0.0015)}
            className={cn(
              "relative mx-auto w-full max-w-72 overflow-hidden rounded-lg bg-muted",
              livre ? "aspect-auto" : "aspect-square cursor-grab touch-none active:cursor-grabbing",
            )}
          >
            {livre ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={origemUrl ?? ""} alt="" className="block w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={origemUrl ?? ""}
                alt=""
                draggable={false}
                style={{
                  position: "absolute",
                  left: "50%",
                  top: "50%",
                  width: origem.naturalWidth * base() * escala,
                  height: origem.naturalHeight * base() * escala,
                  transform: `translate(calc(-50% + ${pos.x}px), calc(-50% + ${pos.y}px))`,
                  maxWidth: "none",
                }}
              />
            )}
          </div>

          {!livre && (
            <div className="flex items-center gap-2">
              <ZoomIn className="size-4 shrink-0 text-muted-foreground" aria-hidden />
              <input
                type="range"
                min={1}
                max={4}
                step={0.01}
                value={escala}
                onChange={(e) => mudarEscala(Number(e.target.value))}
                aria-label="Aproximar a foto"
                className="w-full accent-foreground"
              />
            </div>
          )}

          <p className="text-xs text-muted-foreground">
            {livre
              ? "A imagem vai inteira, do jeito que está."
              : "Arraste para posicionar e use a barra para aproximar."}
          </p>

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={confirmar} disabled={processando}>
              {processando ? "Preparando…" : "Usar esta foto"}
            </Button>
            <Button type="button" variant="outline" onClick={() => setLivre((v) => !v)}>
              <Crop className="mr-1.5 size-4" aria-hidden />
              {livre ? "Recorte quadrado" : "Recorte livre"}
            </Button>
            <Button type="button" variant="ghost" onClick={escolher}>
              <RotateCcw className="mr-1.5 size-4" aria-hidden />
              Outra foto
            </Button>
          </div>
        </div>
      )}

      {/* 2. já escolhida */}
      {!origem && valor && (
        <div className="flex items-start gap-3 rounded-xl border bg-card p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={valor.previa}
            alt="Foto escolhida para a peça"
            className="size-24 shrink-0 rounded-lg border object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            <p className="text-sm">
              Pronta ·{" "}
              <strong className="tabular-nums">
                {valor.lado} × {valor.lado} px
              </strong>{" "}
              ·{" "}
              <strong className={cn("tabular-nums", kb(valor.bytes) > TETO_AVISO_KB && "text-destructive")}>
                {kb(valor.bytes)} KB
              </strong>
            </p>
            <p className="text-xs text-muted-foreground">
              {kb(valor.bytes) > TETO_AVISO_KB
                ? "Ficou pesada demais para o padrão do app. Tente outra foto ou um recorte menor."
                : "Reduzida antes de subir: a loja não gasta internet à toa e o armazenamento não estoura."}
            </p>
            <div className="flex flex-wrap gap-2">
              <Button type="button" variant="outline" size="sm" onClick={escolher}>
                Trocar
              </Button>
              <Button
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => {
                  URL.revokeObjectURL(valor.previa);
                  aoMudar(null);
                }}
              >
                <Trash2 className="mr-1.5 size-4" aria-hidden />
                Remover
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* 3. vazia */}
      {!origem && !valor && (
        <button
          type="button"
          onClick={escolher}
          className={cn(
            "flex w-full flex-col items-center gap-1.5 rounded-xl border border-dashed px-4 py-8 text-center transition-colors hover:bg-accent/40",
            erro && "border-destructive",
          )}
        >
          <Camera className="size-6 text-muted-foreground" aria-hidden />
          <span className="text-sm font-medium">Adicionar foto</span>
          <span className="text-xs text-muted-foreground">
            Ideal: quadrada, {LADO_SAIDA} × {LADO_SAIDA} px. O app reduz sozinho para ~{ALVO_KB} KB.
            <br />
            No celular dá para tirar na hora. Obrigatória: é por ela que a peça é achada na venda.
          </span>
        </button>
      )}

      {/*
        O erro que veio do servidor some assim que a foto entra.

        Sem isso, quem esquecia a foto via "Adicione a foto da peça", escolhia
        uma, e continuava lendo a mesma reclamação em vermelho — o app dizendo
        que falta o que já está ali. Erro que não some quando a pessoa conserta
        ensina a ignorar erro.
      */}
      {(aviso || (erro && !valor)) && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {aviso ?? erro}
        </p>
      )}
    </div>
  );
}
