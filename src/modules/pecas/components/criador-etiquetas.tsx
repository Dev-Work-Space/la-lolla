"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowArcLeftIcon,
  ArrowArcRightIcon,
  ArrowsInLineHorizontalIcon,
  ArrowsInLineVerticalIcon,
  CopyIcon,
  FloppyDiskIcon,
  StackIcon,
  TextAlignCenterIcon,
  TextAlignLeftIcon,
  TextAlignRightIcon,
  TrashIcon,
} from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seletor } from "@/components/padrao/seletor";
import { EnviarPdf } from "@/components/padrao/enviar-pdf";
import { cn } from "@/lib/utils";
import { excluirDesenhoAction, salvarDesenhoAction } from "../etiqueta.actions";
import { MODELOS_ETIQUETA, modeloDoDesenho, type Etiqueta } from "../etiqueta.regras";
import {
  ELEMENTOS,
  LIMITES,
  PECA_DE_EXEMPLO,
  elementoNovo,
  modelosProntos,
  nomeDoElemento,
  type Alinhamento,
  type DesenhoEtiqueta,
  type ElementoEtiqueta,
  type TipoElemento,
} from "../etiqueta-desenho";
import { gerarPdfEtiquetas } from "../pdf-etiqueta";
import { usePreviaEtiqueta } from "./use-previa-etiqueta";

/*
 * CRIAÇÃO DE ETIQUETAS — o editor de modelos (Ajustes).
 *
 * O João pediu "um menu de criação de etiqueta bem top, onde você cria tudo,
 * arrasta o que aparecer". Três decisões seguram o resto:
 *
 * 1. O FUNDO é a etiqueta de verdade, desenhada pelo MESMO motor que imprime
 *    (preto e branco, QR de impressão). Os quadros por cima são só alças. O
 *    que se vê aqui é o que sai na NIIMBOT — não uma imitação em HTML que
 *    poderia discordar dela.
 * 2. Tudo em MILÍMETROS: o mesmo modelo vale em qualquer zoom e em qualquer
 *    tela, e mudar o tamanho do rolo reescala os elementos junto.
 * 3. Arrastar não grava histórico a cada pixel: um gesto inteiro (pegar,
 *    mover, soltar) é UM passo do desfazer.
 */

const IMAN_MM = 0.6;
const r1 = (n: number) => Math.round(n * 10) / 10;
const novoId = () => (typeof crypto !== "undefined" && "randomUUID" in crypto ? crypto.randomUUID().slice(0, 12) : `e${Date.now().toString(36)}`);

type Gesto = {
  id: string;
  modo: "mover" | "redimensionar";
  inicioX: number;
  inicioY: number;
  original: ElementoEtiqueta;
  pxPorMm: number;
};

/* Os tamanhos que já existem na impressão, para começar do rolo certo. */
const TAMANHOS = MODELOS_ETIQUETA.filter((m) => m.tipo === "niimbot" || m.tipo === "termica").map((m) => ({
  value: `${m.largura}x${m.altura}${m.dobrada ? "d" : ""}`,
  label: m.nome,
  largura: m.largura,
  altura: m.altura,
  dobrada: m.dobrada,
}));

const TEM_TEXTO: TipoElemento[] = ["nome", "codigo", "tamanho", "preco", "precoDe", "desconto", "texto"];

export function CriadorEtiquetas({ desenhos: iniciais }: { desenhos: DesenhoEtiqueta[] }) {
  const router = useRouter();
  const prontos = useMemo(() => modelosProntos(), []);
  const [salvos, setSalvos] = useState(iniciais);
  const [atual, setAtual] = useState<DesenhoEtiqueta>(() => iniciais[0] ?? { ...prontos[0], id: novoId() });
  const [salvoComo, setSalvoComo] = useState<string | null>(iniciais[0] ? JSON.stringify(iniciais[0]) : null);
  const [selecionado, setSelecionado] = useState<string | null>(null);
  const [passado, setPassado] = useState<DesenhoEtiqueta[]>([]);
  const [futuro, setFuturo] = useState<DesenhoEtiqueta[]>([]);
  const [exemplo, setExemplo] = useState<Etiqueta>(PECA_DE_EXEMPLO);
  const [opc, setOpc] = useState({ preco: true, qr: true });
  const [contornos, setContornos] = useState(true);
  const [guias, setGuias] = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });
  const [aviso, setAviso] = useState<{ tom: "ok" | "erro"; texto: string } | null>(null);
  const [salvando, salvar] = useTransition();

  const palco = useRef<HTMLDivElement>(null);
  const gesto = useRef<Gesto | null>(null);
  const [larguraPalco, setLarguraPalco] = useState(0);

  const sujo = salvoComo !== JSON.stringify(atual);
  const el = atual.elementos.find((e) => e.id === selecionado) ?? null;

  useEffect(() => {
    const no = palco.current?.parentElement;
    if (!no) return;
    const obs = new ResizeObserver(([e]) => setLarguraPalco(e.contentRect.width));
    obs.observe(no);
    return () => obs.disconnect();
  }, []);

  // Sair com alteração sem salvar pede confirmação ao navegador.
  useEffect(() => {
    if (!sujo) return;
    const avisa = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", avisa);
    return () => window.removeEventListener("beforeunload", avisa);
  }, [sujo]);

  /* ---- histórico: cada mudança "de verdade" guarda o estado anterior ---- */
  const mudar = useCallback(
    (f: (d: DesenhoEtiqueta) => DesenhoEtiqueta) => {
      setPassado((p) => [...p.slice(-60), atual]);
      setFuturo([]);
      setAtual((d) => f(d));
    },
    [atual],
  );
  /* Cada estado é mudado por si, fora da atualização do outro: em modo
     estrito o React roda a atualização duas vezes, e um setState lá dentro
     duplicaria o histórico. */
  const desfazer = useCallback(() => {
    if (!passado.length) return;
    setFuturo((f) => [atual, ...f]);
    setAtual(passado[passado.length - 1]);
    setPassado((p) => p.slice(0, -1));
  }, [atual, passado]);
  const refazer = useCallback(() => {
    if (!futuro.length) return;
    setPassado((p) => [...p, atual]);
    setAtual(futuro[0]);
    setFuturo((f) => f.slice(1));
  }, [atual, futuro]);

  const mudarElemento = useCallback(
    (id: string, parcial: Partial<ElementoEtiqueta>) =>
      mudar((d) => ({ ...d, elementos: d.elementos.map((x) => (x.id === id ? { ...x, ...parcial } : x)) })),
    [mudar],
  );

  const adicionar = useCallback(
    (tipo: TipoElemento, centro?: { x: number; y: number }) => {
      if (atual.elementos.length >= LIMITES.elementos) {
        setAviso({ tom: "erro", texto: `No máximo ${LIMITES.elementos} elementos numa etiqueta.` });
        return;
      }
      const novo = elementoNovo(tipo, novoId(), atual);
      const x = centro ? centro.x - novo.w / 2 : (atual.largura - novo.w) / 2;
      const y = centro ? centro.y - novo.h / 2 : (atual.altura - novo.h) / 2;
      const posto = {
        ...novo,
        x: r1(Math.max(0, Math.min(atual.largura - novo.w, x))),
        y: r1(Math.max(0, Math.min(atual.altura - novo.h, y))),
      };
      mudar((d) => ({ ...d, elementos: [...d.elementos, posto] }));
      setSelecionado(posto.id);
    },
    [atual, mudar],
  );

  const remover = useCallback(
    (id: string) => {
      mudar((d) => ({ ...d, elementos: d.elementos.filter((x) => x.id !== id) }));
      setSelecionado(null);
    },
    [mudar],
  );

  const duplicar = useCallback(
    (id: string) => {
      const o = atual.elementos.find((x) => x.id === id);
      if (!o || atual.elementos.length >= LIMITES.elementos) return;
      const c = { ...o, id: novoId(), x: r1(Math.min(atual.largura - o.w, o.x + 1)), y: r1(Math.min(atual.altura - o.h, o.y + 1)) };
      mudar((d) => ({ ...d, elementos: [...d.elementos, c] }));
      setSelecionado(c.id);
    },
    [atual, mudar],
  );

  const camada = (id: string, sentido: 1 | -1) =>
    mudar((d) => {
      const i = d.elementos.findIndex((x) => x.id === id);
      const j = i + sentido;
      if (i < 0 || j < 0 || j >= d.elementos.length) return d;
      const els = [...d.elementos];
      [els[i], els[j]] = [els[j], els[i]];
      return { ...d, elementos: els };
    });

  /* ---- teclado: setas movem, Delete apaga, Ctrl+Z/Y desfaz/refaz, Ctrl+D duplica ---- */
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (alvo.closest("input, textarea, select, [role=combobox], [role=listbox]")) return;
      const ctrl = e.ctrlKey || e.metaKey;
      if (ctrl && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) refazer();
        else desfazer();
        return;
      }
      if (ctrl && e.key.toLowerCase() === "y") {
        e.preventDefault();
        refazer();
        return;
      }
      if (!selecionado) return;
      if (ctrl && e.key.toLowerCase() === "d") {
        e.preventDefault();
        duplicar(selecionado);
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        remover(selecionado);
        return;
      }
      if (e.key === "Escape") {
        setSelecionado(null);
        return;
      }
      const passo = e.shiftKey ? 1 : 0.1;
      const delta = { ArrowLeft: [-passo, 0], ArrowRight: [passo, 0], ArrowUp: [0, -passo], ArrowDown: [0, passo] }[e.key];
      if (!delta) return;
      e.preventDefault();
      const o = atual.elementos.find((x) => x.id === selecionado);
      if (!o) return;
      mudarElemento(selecionado, { x: r1(o.x + delta[0]), y: r1(o.y + delta[1]) });
    };
    window.addEventListener("keydown", tecla);
    return () => window.removeEventListener("keydown", tecla);
  }, [atual, selecionado, desfazer, refazer, duplicar, remover, mudarElemento]);

  /* ---- arrastar e redimensionar no palco ---- */
  const pxPorMm = larguraPalco > 0 ? Math.min(larguraPalco / atual.largura, 28) : 16;

  /* O ímã: bordas, centro, dobra e os lados/centros dos outros elementos. */
  function imantar(valor: number, tamanho: number, eixo: "x" | "y", ignorar: string) {
    const total = eixo === "x" ? atual.largura : atual.altura;
    const alvos = [0, total / 2, total, ...(eixo === "x" && atual.dobra ? [total / 2] : [])];
    for (const o of atual.elementos) {
      if (o.id === ignorar) continue;
      const a = eixo === "x" ? o.x : o.y;
      const t = eixo === "x" ? o.w : o.h;
      alvos.push(a, a + t / 2, a + t);
    }
    let melhor = { v: valor, guia: null as number | null, dist: IMAN_MM };
    for (const alvo of alvos) {
      for (const [ponta, ajuste] of [[valor, 0], [valor + tamanho / 2, tamanho / 2], [valor + tamanho, tamanho]] as const) {
        const d = Math.abs(ponta - alvo);
        if (d < melhor.dist) melhor = { v: alvo - ajuste, guia: alvo, dist: d };
      }
    }
    return melhor;
  }

  function aoDescer(e: React.PointerEvent, id: string, modo: Gesto["modo"]) {
    e.stopPropagation();
    e.preventDefault();
    const o = atual.elementos.find((x) => x.id === id);
    if (!o) return;
    (e.currentTarget as Element).setPointerCapture(e.pointerId);
    setSelecionado(id);
    setPassado((p) => [...p.slice(-60), atual]);
    setFuturo([]);
    gesto.current = { id, modo, inicioX: e.clientX, inicioY: e.clientY, original: o, pxPorMm };
  }

  function aoMover(e: React.PointerEvent) {
    const g = gesto.current;
    if (!g) return;
    const dx = (e.clientX - g.inicioX) / g.pxPorMm;
    const dy = (e.clientY - g.inicioY) / g.pxPorMm;
    const o = g.original;
    if (g.modo === "mover") {
      const sx = imantar(o.x + dx, o.w, "x", o.id);
      const sy = imantar(o.y + dy, o.h, "y", o.id);
      setGuias({ v: sx.guia === null ? [] : [sx.guia], h: sy.guia === null ? [] : [sy.guia] });
      setAtual((d) => ({
        ...d,
        elementos: d.elementos.map((x) =>
          x.id === o.id
            ? {
                ...x,
                x: r1(Math.max(-o.w / 2, Math.min(d.largura - o.w / 2, e.shiftKey ? o.x + dx : sx.v))),
                y: r1(Math.max(-o.h / 2, Math.min(d.altura - o.h / 2, e.shiftKey ? o.y + dy : sy.v))),
              }
            : x,
        ),
      }));
    } else {
      // O QR fica sempre quadrado: redimensionar mexe nos dois lados juntos.
      const quadrado = o.tipo === "qr";
      const w = Math.max(0.6, o.w + dx);
      const h = quadrado ? w : Math.max(o.tipo === "linha" ? 0.1 : 0.6, o.h + dy);
      setAtual((d) => ({
        ...d,
        elementos: d.elementos.map((x) => (x.id === o.id ? { ...x, w: r1(w), h: r1(h) } : x)),
      }));
    }
  }

  function aoSubir() {
    gesto.current = null;
    setGuias({ v: [], h: [] });
  }

  /* Soltar uma peça da paleta em cima da etiqueta: ela nasce onde caiu. */
  function aoSoltar(e: React.DragEvent) {
    e.preventDefault();
    const tipo = e.dataTransfer.getData("text/x-elemento") as TipoElemento;
    const caixa = palco.current?.getBoundingClientRect();
    if (!tipo || !caixa) return;
    adicionar(tipo, { x: (e.clientX - caixa.left) / pxPorMm, y: (e.clientY - caixa.top) / pxPorMm });
  }

  /* Trocar o tamanho do rolo reescala os elementos: a etiqueta muda de
     tamanho, o desenho acompanha — ninguém precisa reposicionar tudo. */
  function trocarTamanho(largura: number, altura: number, dobra?: boolean) {
    const fx = largura / atual.largura;
    const fy = altura / atual.altura;
    mudar((d) => ({
      ...d,
      largura,
      altura,
      dobra: dobra ?? d.dobra,
      elementos: d.elementos.map((x) => {
        const quadrado = x.tipo === "qr";
        const f = Math.min(fx, fy);
        return {
          ...x,
          x: r1(x.x * fx),
          y: r1(x.y * fy),
          w: r1(quadrado ? x.w * f : x.w * fx),
          h: r1(quadrado ? x.h * f : x.h * fy),
          letra: x.letra ? r1(x.letra * Math.min(fx, fy)) : 0,
        };
      }),
    }));
  }

  /* ---- abrir, salvar, apagar ---- */
  function abrir(d: DesenhoEtiqueta, eSalvo: boolean) {
    if (sujo && !window.confirm("Há alterações sem salvar neste modelo. Abrir outro mesmo assim?")) return;
    const copia = eSalvo ? d : { ...d, id: novoId(), elementos: d.elementos.map((x) => ({ ...x, id: novoId() })) };
    setAtual(copia);
    setSalvoComo(eSalvo ? JSON.stringify(d) : null);
    setPassado([]);
    setFuturo([]);
    setSelecionado(null);
    setAviso(null);
  }

  function gravar() {
    setAviso(null);
    salvar(async () => {
      const r = await salvarDesenhoAction(atual);
      if (!r.ok) {
        setAviso({ tom: "erro", texto: r.error.message });
        return;
      }
      setSalvos((l) => (l.some((x) => x.id === atual.id) ? l.map((x) => (x.id === atual.id ? atual : x)) : [...l, atual]));
      setSalvoComo(JSON.stringify(atual));
      setAviso({ tom: "ok", texto: "Modelo salvo. Ele já aparece na hora de imprimir etiquetas." });
      router.refresh();
    });
  }

  function apagar() {
    if (!salvos.some((x) => x.id === atual.id)) return;
    if (!window.confirm(`Apagar o modelo "${atual.nome}"? As etiquetas já impressas não mudam.`)) return;
    salvar(async () => {
      const r = await excluirDesenhoAction(atual.id);
      if (!r.ok) {
        setAviso({ tom: "erro", texto: r.error.message });
        return;
      }
      const resto = salvos.filter((x) => x.id !== atual.id);
      setSalvos(resto);
      const prox = resto[0] ?? { ...prontos[0], id: novoId() };
      setAtual(prox);
      setSalvoComo(resto[0] ? JSON.stringify(resto[0]) : null);
      setSelecionado(null);
      setAviso({ tom: "ok", texto: "Modelo apagado." });
      router.refresh();
    });
  }

  const modelo = useMemo(() => modeloDoDesenho(atual), [atual]);
  const previa = usePreviaEtiqueta(exemplo, modelo, opc);
  const eSalvo = salvos.some((x) => x.id === atual.id);

  return (
    <div className="space-y-4">
      {/* ── barra do modelo ── */}
      <div className="flex flex-wrap items-end gap-2 rounded-xl border bg-card p-3">
        <span className="space-y-1">
          <Label htmlFor="abrir-modelo" className="text-xs text-muted-foreground">
            Abrir
          </Label>
          <Seletor
            id="abrir-modelo"
            className="min-w-56"
            value={eSalvo ? `s:${atual.id}` : "__novo"}
            onValueChange={(v) => {
              if (v.startsWith("s:")) {
                const d = salvos.find((x) => x.id === v.slice(2));
                if (d) abrir(d, true);
              } else if (v.startsWith("p:")) {
                const d = prontos.find((x) => x.id === v.slice(2));
                if (d) abrir(d, false);
              }
            }}
            opcoes={[
              ...(eSalvo ? [] : [{ value: "__novo", label: "Modelo novo (não salvo)" }]),
              ...salvos.map((d) => ({ value: `s:${d.id}`, label: `Meu modelo · ${d.nome}` })),
              ...prontos.map((d) => ({ value: `p:${d.id}`, label: `Começar de: ${d.nome}` })),
            ]}
          />
        </span>
        <span className="min-w-40 flex-1 space-y-1">
          <Label htmlFor="nome-modelo" className="text-xs text-muted-foreground">
            Nome do modelo
          </Label>
          <Input
            id="nome-modelo"
            value={atual.nome}
            maxLength={40}
            onChange={(e) => setAtual((d) => ({ ...d, nome: e.target.value }))}
            className="text-base"
          />
        </span>
        <div className="flex flex-wrap gap-1">
          <Button type="button" variant="outline" size="icon" aria-label="Desfazer (Ctrl+Z)" title="Desfazer (Ctrl+Z)" disabled={!passado.length} onClick={desfazer}>
            <ArrowArcLeftIcon className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="outline" size="icon" aria-label="Refazer (Ctrl+Y)" title="Refazer (Ctrl+Y)" disabled={!futuro.length} onClick={refazer}>
            <ArrowArcRightIcon className="size-4" aria-hidden />
          </Button>
          <Button type="button" onClick={gravar} disabled={salvando || !atual.nome.trim()}>
            <FloppyDiskIcon className="mr-1.5 size-4" aria-hidden />
            {salvando ? "Salvando…" : sujo || !eSalvo ? "Salvar modelo" : "Salvo"}
          </Button>
          {eSalvo && (
            <Button type="button" variant="ghost" size="icon" aria-label="Apagar modelo" title="Apagar modelo" onClick={apagar}>
              <TrashIcon className="size-4" aria-hidden />
            </Button>
          )}
        </div>
        {aviso && (
          <p role={aviso.tom === "erro" ? "alert" : "status"} className={cn("w-full text-sm", aviso.tom === "erro" ? "text-destructive" : "text-(--ll-ok)")}>
            {aviso.texto}
          </p>
        )}
      </div>

      <div className="grid gap-4 lg:grid-cols-[13rem_1fr_17rem]">
        {/* ── paleta ── */}
        <aside className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">Arraste para a etiqueta</p>
          <ul className="grid grid-cols-2 gap-1.5 lg:grid-cols-1">
            {ELEMENTOS.map((item) => (
              <li key={item.tipo}>
                <button
                  type="button"
                  draggable
                  onDragStart={(e) => {
                    e.dataTransfer.setData("text/x-elemento", item.tipo);
                    e.dataTransfer.effectAllowed = "copy";
                  }}
                  onClick={() => adicionar(item.tipo)}
                  title={`${item.ajuda} — arraste ou toque para pôr no centro`}
                  className="w-full cursor-grab rounded-lg border bg-card px-2.5 py-1.5 text-left text-sm transition-colors hover:border-foreground/40 active:cursor-grabbing"
                >
                  <span className="block font-medium">{item.nome}</span>
                  <span className="block truncate text-[11px] text-muted-foreground">{item.ajuda}</span>
                </button>
              </li>
            ))}
          </ul>
        </aside>

        {/* ── palco ── */}
        <section className="min-w-0 space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <span className="space-y-1">
              <Label htmlFor="tamanho-rolo" className="text-xs text-muted-foreground">
                Rolo
              </Label>
              <Seletor
                id="tamanho-rolo"
                className="min-w-52"
                value={TAMANHOS.find((t) => t.largura === atual.largura && t.altura === atual.altura && t.dobrada === atual.dobra)?.value ?? "__livre"}
                onValueChange={(v) => {
                  const t = TAMANHOS.find((x) => x.value === v);
                  if (t) trocarTamanho(t.largura, t.altura, t.dobrada);
                }}
                opcoes={[{ value: "__livre", label: "Tamanho livre" }, ...TAMANHOS.map((t) => ({ value: t.value, label: t.label }))]}
              />
            </span>
            <CampoMm rotulo="Comprimento" valor={atual.largura} min={LIMITES.largura[0]} max={LIMITES.largura[1]} aoMudar={(v) => trocarTamanho(v, atual.altura)} />
            <CampoMm rotulo="Altura" valor={atual.altura} min={LIMITES.altura[0]} max={LIMITES.altura[1]} aoMudar={(v) => trocarTamanho(atual.largura, v)} />
            <label className="flex items-center gap-2 pb-2 text-sm">
              <input type="checkbox" checked={atual.dobra} onChange={(e) => mudar((d) => ({ ...d, dobra: e.target.checked }))} className="size-4 accent-primary" />
              Dobrável (vinco no meio)
            </label>
            <label className="flex items-center gap-2 pb-2 text-sm text-muted-foreground">
              <input type="checkbox" checked={contornos} onChange={(e) => setContornos(e.target.checked)} className="size-4 accent-primary" />
              Mostrar contornos
            </label>
          </div>

          <div className="overflow-x-auto rounded-xl border bg-[repeating-conic-gradient(var(--ll-surface-2)_0_25%,transparent_0_50%)] bg-size-[16px_16px] p-6">
            <div
              ref={palco}
              role="application"
              aria-label={`Etiqueta de ${atual.largura} por ${atual.altura} milímetros. Arraste os elementos; setas movem o escolhido.`}
              className="relative mx-auto touch-none bg-white shadow-md select-none"
              style={{ width: atual.largura * pxPorMm, height: atual.altura * pxPorMm }}
              onPointerMove={aoMover}
              onPointerUp={aoSubir}
              onPointerCancel={aoSubir}
              onPointerDown={() => setSelecionado(null)}
              onDragOver={(e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }}
              onDrop={aoSoltar}
            >
              {previa && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={previa} alt="" draggable={false} className="pointer-events-none absolute inset-0 size-full [image-rendering:pixelated]" />
              )}
              {guias.v.map((g) => (
                <span key={`v${g}`} aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-fuchsia-500" style={{ left: g * pxPorMm }} />
              ))}
              {guias.h.map((g) => (
                <span key={`h${g}`} aria-hidden className="pointer-events-none absolute inset-x-0 h-px bg-fuchsia-500" style={{ top: g * pxPorMm }} />
              ))}
              {atual.elementos.map((x) => {
                const ativo = x.id === selecionado;
                return (
                  <div
                    key={x.id}
                    role="button"
                    tabIndex={0}
                    aria-label={`${nomeDoElemento(x.tipo)} em ${x.x} por ${x.y} milímetros`}
                    aria-pressed={ativo}
                    onPointerDown={(e) => aoDescer(e, x.id, "mover")}
                    onFocus={() => setSelecionado(x.id)}
                    className={cn(
                      "absolute cursor-move outline-none",
                      ativo
                        ? "ring-2 ring-(--ll-accent)"
                        : contornos
                          ? "ring-1 ring-sky-500/40 hover:ring-sky-500"
                          : "hover:ring-1 hover:ring-sky-500",
                    )}
                    style={{
                      left: x.x * pxPorMm,
                      top: x.y * pxPorMm,
                      width: Math.max(4, x.w * pxPorMm),
                      height: Math.max(4, x.h * pxPorMm),
                    }}
                  >
                    {ativo && (
                      <>
                        <span className="pointer-events-none absolute -top-5 left-0 whitespace-nowrap rounded bg-(--ll-accent) px-1.5 text-[10px] text-white">
                          {nomeDoElemento(x.tipo)}
                        </span>
                        <span
                          role="slider"
                          aria-label="Redimensionar"
                          aria-valuenow={x.w}
                          onPointerDown={(e) => aoDescer(e, x.id, "redimensionar")}
                          className="absolute -right-1.5 -bottom-1.5 size-3 cursor-nwse-resize rounded-sm border border-white bg-(--ll-accent)"
                        />
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Arraste para mover e pela alça do canto para redimensionar — o elemento encaixa nas bordas, no centro e nos
            outros (segure <kbd>Shift</kbd> para soltar o ímã). Setas movem 0,1 mm (com <kbd>Shift</kbd>, 1 mm);{" "}
            <kbd>Delete</kbd> apaga, <kbd>Ctrl+D</kbd> duplica, <kbd>Ctrl+Z</kbd> desfaz. O fundo é a etiqueta de
            verdade, em preto e branco, como sai na impressora.
          </p>

          {/* ── peça de exemplo ── */}
          <details className="rounded-xl border bg-card p-3">
            <summary className="cursor-pointer text-sm font-medium">Peça de exemplo da prévia</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              <CampoTexto rotulo="Nome" valor={exemplo.nome} aoMudar={(v) => setExemplo((e) => ({ ...e, nome: v }))} />
              <CampoTexto rotulo="Código" valor={exemplo.codigo} aoMudar={(v) => setExemplo((e) => ({ ...e, codigo: v.toUpperCase() || "LL-0001" }))} />
              <CampoTexto rotulo="Tamanho" valor={exemplo.tamanho ?? ""} aoMudar={(v) => setExemplo((e) => ({ ...e, tamanho: v || null }))} />
              <CampoTexto rotulo="Preço" valor={String(exemplo.preco ?? "").replace(".", ",")} aoMudar={(v) => setExemplo((e) => ({ ...e, preco: Number(v.replace(",", ".")) || null }))} />
              <CampoTexto rotulo='Preço "DE" (promoção)' valor={String(exemplo.precoDe ?? "").replace(".", ",")} aoMudar={(v) => setExemplo((e) => ({ ...e, precoDe: Number(v.replace(",", ".")) || null }))} />
              <div className="flex flex-col justify-end gap-1 pb-1 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opc.preco} onChange={(e) => setOpc((o) => ({ ...o, preco: e.target.checked }))} className="size-4 accent-primary" />
                  Mostrar preço
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={opc.qr} onChange={(e) => setOpc((o) => ({ ...o, qr: e.target.checked }))} className="size-4 accent-primary" />
                  Mostrar QR
                </label>
              </div>
            </div>
          </details>

          <div className="flex flex-wrap items-center gap-2">
            <EnviarPdf
              rotulo="Etiqueta de teste"
              titulo="PDF de teste"
              descricao="Uma etiqueta com a peça de exemplo, no tamanho exato do rolo. Imprima uma para conferir antes de salvar."
              mensagem="Etiqueta de teste LaLolla"
              telefone={null}
              nomeCliente={null}
              rotuloBotao="Gerar PDF de teste"
              gerar={() => gerarPdfEtiquetas([exemplo], modelo, opc)}
            />
          </div>
        </section>

        {/* ── propriedades ── */}
        <aside className="space-y-3">
          {el ? (
            <Propriedades
              el={el}
              desenho={atual}
              aoMudar={(p) => mudarElemento(el.id, p)}
              aoDuplicar={() => duplicar(el.id)}
              aoRemover={() => remover(el.id)}
              aoCamada={(s) => camada(el.id, s)}
            />
          ) : (
            <p className="rounded-xl border border-dashed p-3 text-sm text-muted-foreground">
              Toque num elemento da etiqueta para mexer no tamanho da letra, alinhamento, negrito e posição exata.
            </p>
          )}

          <div className="rounded-xl border bg-card p-3">
            <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
              <StackIcon className="size-3.5" aria-hidden /> Camadas · {atual.elementos.length}
            </p>
            {atual.elementos.length === 0 ? (
              <p className="text-xs text-muted-foreground">Etiqueta vazia. Arraste algo da paleta.</p>
            ) : (
              <ul className="space-y-0.5">
                {[...atual.elementos].reverse().map((x) => (
                  <li key={x.id}>
                    <button
                      type="button"
                      onClick={() => setSelecionado(x.id)}
                      className={cn(
                        "w-full truncate rounded px-2 py-1 text-left text-sm",
                        x.id === selecionado ? "bg-accent font-medium" : "hover:bg-accent/50",
                      )}
                    >
                      {nomeDoElemento(x.tipo)}
                      {x.tipo === "texto" && x.texto ? ` · ${x.texto}` : ""}
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}

function Propriedades({
  el,
  desenho,
  aoMudar,
  aoDuplicar,
  aoRemover,
  aoCamada,
}: {
  el: ElementoEtiqueta;
  desenho: DesenhoEtiqueta;
  aoMudar: (p: Partial<ElementoEtiqueta>) => void;
  aoDuplicar: () => void;
  aoRemover: () => void;
  aoCamada: (sentido: 1 | -1) => void;
}) {
  const temTexto = TEM_TEXTO.includes(el.tipo);
  const alinhamentos: Array<[Alinhamento, typeof TextAlignLeftIcon, string]> = [
    ["esquerda", TextAlignLeftIcon, "À esquerda"],
    ["centro", TextAlignCenterIcon, "Ao centro"],
    ["direita", TextAlignRightIcon, "À direita"],
  ];
  return (
    <div className="space-y-3 rounded-xl border bg-card p-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-semibold">{nomeDoElemento(el.tipo)}</p>
        <div className="flex gap-1">
          <Button type="button" variant="ghost" size="icon" aria-label="Duplicar (Ctrl+D)" title="Duplicar (Ctrl+D)" onClick={aoDuplicar}>
            <CopyIcon className="size-4" aria-hidden />
          </Button>
          <Button type="button" variant="ghost" size="icon" aria-label="Apagar (Delete)" title="Apagar (Delete)" onClick={aoRemover}>
            <TrashIcon className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <CampoMm rotulo="X" valor={el.x} min={-60} max={120} aoMudar={(v) => aoMudar({ x: v })} />
        <CampoMm rotulo="Y" valor={el.y} min={-30} max={60} aoMudar={(v) => aoMudar({ y: v })} />
        <CampoMm rotulo="Largura" valor={el.w} min={0.2} max={120} aoMudar={(v) => aoMudar(el.tipo === "qr" ? { w: v, h: v } : { w: v })} />
        <CampoMm rotulo="Altura" valor={el.h} min={0.1} max={60} aoMudar={(v) => aoMudar(el.tipo === "qr" ? { w: v, h: v } : { h: v })} />
      </div>

      <div className="flex flex-wrap gap-1">
        <Button type="button" variant="outline" size="sm" onClick={() => aoMudar({ x: Math.round(((desenho.largura - el.w) / 2) * 10) / 10 })}>
          <ArrowsInLineHorizontalIcon className="mr-1 size-3.5" aria-hidden /> Centro
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => aoMudar({ y: Math.round(((desenho.altura - el.h) / 2) * 10) / 10 })}>
          <ArrowsInLineVerticalIcon className="mr-1 size-3.5" aria-hidden /> Meio
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => aoCamada(1)}>
          Para frente
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => aoCamada(-1)}>
          Para trás
        </Button>
      </div>

      {(temTexto || el.tipo === "marca" || el.tipo === "qr") && (
        <div className="flex gap-1" role="group" aria-label="Alinhamento">
          {alinhamentos.map(([a, Icone, r]) => (
            <Button
              key={a}
              type="button"
              variant={el.alinhar === a ? "default" : "outline"}
              size="icon"
              aria-label={r}
              aria-pressed={el.alinhar === a}
              onClick={() => aoMudar({ alinhar: a })}
            >
              <Icone className="size-4" aria-hidden />
            </Button>
          ))}
        </div>
      )}

      {temTexto && (
        <>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm">
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={el.negrito} onChange={(e) => aoMudar({ negrito: e.target.checked })} className="size-4 accent-primary" />
              Negrito
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={el.maiusculas} onChange={(e) => aoMudar({ maiusculas: e.target.checked })} className="size-4 accent-primary" />
              MAIÚSCULAS
            </label>
            <label className="flex items-center gap-2">
              <input type="checkbox" checked={el.linhas === 2} onChange={(e) => aoMudar({ linhas: e.target.checked ? 2 : 1 })} className="size-4 accent-primary" />
              Até 2 linhas
            </label>
          </div>
          <div className="space-y-1">
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={el.letra === 0} onChange={(e) => aoMudar({ letra: e.target.checked ? 0 : Math.max(1.2, Math.round(el.h * 0.8 * 10) / 10) })} className="size-4 accent-primary" />
              Letra automática (a maior que cabe)
            </label>
            {el.letra > 0 && (
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.8}
                  max={8}
                  step={0.1}
                  value={el.letra}
                  onChange={(e) => aoMudar({ letra: Number(e.target.value) })}
                  aria-label="Tamanho da letra em milímetros"
                  className="w-full accent-foreground"
                />
                <span className="w-14 text-right text-xs tabular-nums">{String(el.letra).replace(".", ",")} mm</span>
              </div>
            )}
          </div>
          {el.tipo !== "texto" && (
            <CampoTexto rotulo="Escrito antes (opcional)" valor={el.rotulo} max={12} aoMudar={(v) => aoMudar({ rotulo: v })} dica='Ex.: "TAM. ", "DE ", "Cód. "' />
          )}
          {el.tipo === "texto" && (
            <div className="space-y-1">
              <CampoTexto rotulo="Texto" valor={el.texto} max={80} aoMudar={(v) => aoMudar({ texto: v })} />
              <div className="flex flex-wrap gap-1">
                {["{nome}", "{codigo}", "{tamanho}", "{preco}"].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => aoMudar({ texto: `${el.texto}${el.texto ? " " : ""}${c}`.slice(0, 80) })}
                    className="rounded-full border px-2 py-0.5 text-[11px] text-muted-foreground hover:text-foreground"
                  >
                    + {c}
                  </button>
                ))}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

/* Número em mm com vírgula; só aplica quando o valor faz sentido. */
function CampoMm({ rotulo, valor, min, max, aoMudar }: { rotulo: string; valor: number; min: number; max: number; aoMudar: (v: number) => void }) {
  const [texto, setTexto] = useState(String(valor).replace(".", ","));
  const [ultimo, setUltimo] = useState(valor);
  if (ultimo !== valor) {
    setUltimo(valor);
    setTexto(String(valor).replace(".", ","));
  }
  const id = `mm-${rotulo}`;
  return (
    <span className="w-28 space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo} (mm)
      </Label>
      <Input
        id={id}
        inputMode="decimal"
        value={texto}
        onChange={(e) => {
          setTexto(e.target.value);
          const n = Number(e.target.value.replace(",", "."));
          if (Number.isFinite(n) && n >= min && n <= max) aoMudar(Math.round(n * 10) / 10);
        }}
        className="text-base tabular-nums"
      />
    </span>
  );
}

function CampoTexto({ rotulo, valor, aoMudar, max = 60, dica }: { rotulo: string; valor: string; aoMudar: (v: string) => void; max?: number; dica?: string }) {
  const id = `txt-${rotulo}`;
  return (
    <span className="block space-y-1">
      <Label htmlFor={id} className="text-xs text-muted-foreground">
        {rotulo}
      </Label>
      <Input id={id} value={valor} maxLength={max} onChange={(e) => aoMudar(e.target.value)} className="text-base" />
      {dica && <span className="block text-[11px] text-muted-foreground">{dica}</span>}
    </span>
  );
}
