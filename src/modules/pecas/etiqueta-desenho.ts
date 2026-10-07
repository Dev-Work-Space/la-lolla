/*
 * MODELOS DE ETIQUETA DESENHADOS — o que o "Criação de etiquetas" (Ajustes)
 * monta e o que a impressão usa.
 *
 * Um modelo é um tamanho de rolo e uma lista de ELEMENTOS posicionados em
 * milímetros: logo, nome, código, tamanho, preço, preço "DE", desconto, QR,
 * texto livre, linha e moldura. Milímetro e não pixel, porque o mesmo modelo
 * é desenhado na tela (qualquer zoom) e na impressora (8 pontos por mm).
 *
 * Neutro: sem "use client" e sem server-only. O editor, a action e o
 * desenhista do PDF leem os mesmos tipos e as mesmas regras.
 */

import type { Etiqueta } from "./etiqueta.regras";

export type TipoElemento =
  | "marca"
  | "nome"
  | "codigo"
  | "tamanho"
  | "preco"
  | "precoDe"
  | "desconto"
  | "qr"
  | "texto"
  | "linha"
  | "moldura";

export type Alinhamento = "esquerda" | "centro" | "direita";

export type ElementoEtiqueta = {
  id: string;
  tipo: TipoElemento;
  /** Posição e tamanho do quadro, em mm, a partir do canto de cima à esquerda. */
  x: number;
  y: number;
  w: number;
  h: number;
  alinhar: Alinhamento;
  negrito: boolean;
  maiusculas: boolean;
  /** Altura da letra em mm; 0 = automática (a maior que cabe no quadro). */
  letra: number;
  /** Até quantas linhas o texto pode quebrar (o nome comprido usa 2). */
  linhas: 1 | 2;
  /** Texto livre; aceita {nome}, {codigo}, {tamanho}, {preco}. */
  texto: string;
  /** Prefixo antes do valor — "TAM. " no tamanho, "DE " no preço antigo. */
  rotulo: string;
};

export type DesenhoEtiqueta = {
  id: string;
  nome: string;
  largura: number;
  altura: number;
  /** Etiqueta de joia: o vinco tracejado no meio, para dobrar. */
  dobra: boolean;
  elementos: ElementoEtiqueta[];
};

export const LIMITES = { largura: [10, 120], altura: [8, 60], elementos: 30, modelos: 20 } as const;

export const ELEMENTOS: ReadonlyArray<{ tipo: TipoElemento; nome: string; ajuda: string }> = [
  { tipo: "marca", nome: "Logo", ajuda: "A logo da LaLolla" },
  { tipo: "nome", nome: "Nome da peça", ajuda: "Ex.: Anel solitário" },
  { tipo: "codigo", nome: "Código", ajuda: "O código interno, LL-0001" },
  { tipo: "tamanho", nome: "Tamanho", ajuda: "Aro 17, 45 cm… some se a peça não tiver" },
  { tipo: "preco", nome: "Preço", ajuda: "O preço que vale (o promocional, se houver)" },
  { tipo: "precoDe", nome: "Preço \"DE\"", ajuda: "O preço antigo riscado, só na promoção" },
  { tipo: "desconto", nome: "Desconto", ajuda: "\"-22%\", só na promoção" },
  { tipo: "qr", nome: "QR code", ajuda: "Guarda o código; o \"Ler etiqueta\" abre a peça" },
  { tipo: "texto", nome: "Texto livre", ajuda: "Qualquer frase, com {nome}, {preco}…" },
  { tipo: "linha", nome: "Linha", ajuda: "Traço para separar" },
  { tipo: "moldura", nome: "Moldura", ajuda: "Um quadro em volta" },
];

export const nomeDoElemento = (t: TipoElemento) => ELEMENTOS.find((e) => e.tipo === t)?.nome ?? t;

/** Um elemento novo com tamanho e jeito que fazem sentido para o tipo. */
export function elementoNovo(tipo: TipoElemento, id: string, d: Pick<DesenhoEtiqueta, "largura" | "altura">): ElementoEtiqueta {
  const base: ElementoEtiqueta = {
    id,
    tipo,
    x: 1,
    y: 1,
    w: Math.min(14, d.largura - 2),
    h: Math.min(2.4, d.altura - 2),
    alinhar: "esquerda",
    negrito: true,
    maiusculas: false,
    letra: 0,
    linhas: 1,
    texto: "",
    rotulo: "",
  };
  const lado = Math.max(4, Math.min(d.altura - 2, d.largura / 2 - 2));
  switch (tipo) {
    case "qr":
      return { ...base, w: lado, h: lado };
    case "marca":
      return { ...base, w: Math.min(10, d.largura - 2), h: 2.6, negrito: false };
    case "nome":
      return { ...base, h: 4.6, linhas: 2 };
    case "preco":
      return { ...base, h: 3.8 };
    case "tamanho":
      return { ...base, rotulo: "TAM. ", maiusculas: true };
    case "precoDe":
      return { ...base, rotulo: "DE ", negrito: false };
    case "desconto":
      return { ...base, w: 6 };
    case "texto":
      return { ...base, texto: "Garantia de 6 meses", negrito: false };
    case "linha":
      return { ...base, h: 0.25 };
    case "moldura":
      return { ...base, x: 0.4, y: 0.4, w: d.largura - 0.8, h: d.altura - 0.8 };
    default:
      return base;
  }
}

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * O que o elemento escreve para esta peça. Vazio quando não há o que mostrar
 * (peça sem tamanho, sem promoção…) — e aí o elemento some, sem deixar
 * "TAM. " sozinho na etiqueta.
 */
export function textoDoElemento(el: ElementoEtiqueta, e: Etiqueta, opc: { preco: boolean }): string {
  const promo = e.precoDe !== null && e.preco !== null && e.preco < e.precoDe;
  const valor = (() => {
    switch (el.tipo) {
      case "nome":
        return e.nome;
      case "codigo":
        return e.codigo;
      case "tamanho":
        return e.tamanho ?? "";
      case "preco":
        return opc.preco && e.preco ? brl(e.preco) : "";
      case "precoDe":
        return opc.preco && promo ? brl(e.precoDe!) : "";
      case "desconto":
        return opc.preco && promo ? `-${Math.round((1 - e.preco! / e.precoDe!) * 100)}%` : "";
      case "texto":
        return el.texto
          .replaceAll("{nome}", e.nome)
          .replaceAll("{codigo}", e.codigo)
          .replaceAll("{tamanho}", e.tamanho ?? "")
          .replaceAll("{preco}", e.preco ? brl(e.preco) : "");
      default:
        return "";
    }
  })();
  if (!valor) return "";
  const t = (el.tipo === "texto" ? "" : el.rotulo) + valor;
  return el.maiusculas ? t.toUpperCase() : t;
}

let seq = 0;
const novoId = () => `e${Date.now().toString(36)}${(seq++).toString(36)}`;

/** Os modelos de partida: o desenho de sempre, para a pessoa mexer a partir dele. */
export function modelosProntos(): DesenhoEtiqueta[] {
  const el = (tipo: TipoElemento, p: Partial<ElementoEtiqueta>, d: Pick<DesenhoEtiqueta, "largura" | "altura">) => ({
    ...elementoNovo(tipo, novoId(), d),
    ...p,
  });
  const d1 = { largura: 30, altura: 15 };
  const d2 = { largura: 40, altura: 12 };
  return [
    {
      id: "pronto-dobra-30x15",
      nome: "Joia dobrável 30 × 15",
      ...d1,
      dobra: true,
      elementos: [
        el("qr", { x: 0.6, y: 1.25, w: 12.5, h: 12.5 }, d1),
        el("marca", { x: 15.9, y: 0.8, w: 7, h: 1.8 }, d1),
        el("nome", { x: 15.9, y: 2.9, w: 13.4, h: 4.2 }, d1),
        el("codigo", { x: 15.9, y: 7.3, w: 13.4, h: 1.7 }, d1),
        el("tamanho", { x: 15.9, y: 9.1, w: 13.4, h: 1.7 }, d1),
        el("preco", { x: 15.9, y: 11, w: 13.4, h: 3.2 }, d1),
      ],
    },
    {
      id: "pronto-reta-40x12",
      nome: "Reta 40 × 12",
      ...d2,
      dobra: false,
      elementos: [
        el("marca", { x: 0.9, y: 0.8, w: 7, h: 1.8 }, d2),
        el("nome", { x: 0.9, y: 2.9, w: 25, h: 2.2, linhas: 1 }, d2),
        el("codigo", { x: 0.9, y: 5.3, w: 25, h: 1.7 }, d2),
        el("preco", { x: 0.9, y: 7.4, w: 18, h: 3.6 }, d2),
        el("desconto", { x: 19.2, y: 8.6, w: 6, h: 2 }, d2),
        el("qr", { x: 28.3, y: 0.6, w: 10.8, h: 10.8 }, d2),
      ],
    },
    { id: "pronto-branco", nome: "Em branco 30 × 15", ...d1, dobra: false, elementos: [] },
  ];
}

/** O exemplo da tela: uma peça com tudo preenchido, inclusive promoção. */
export const PECA_DE_EXEMPLO: Etiqueta = {
  codigo: "LL-0042",
  nome: "Anel solitário zircônia",
  tamanho: "17",
  preco: 129.9,
  precoDe: 159.9,
};
