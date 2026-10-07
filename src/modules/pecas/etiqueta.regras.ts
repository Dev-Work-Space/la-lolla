import type { DesenhoEtiqueta } from "./etiqueta-desenho";

/*
 * Regras e tipos da etiqueta, sem nenhuma biblioteca — o servidor usa para
 * montar os dados e a tela para a prévia, sem que nenhum dos dois carregue o
 * gerador de PDF à toa.
 */

/**
 * Como a etiqueta é desenhada — os quatro desenhos do app antigo:
 * - `termica`: rolo térmico comum (Argox/Elgin/Zebra), uma etiqueta por página;
 * - `joia`: a tarja que dobra e envolve o aro, QR de um lado e preço do outro;
 * - `niimbot`: rolo estreito da NIIMBOT, desenho próprio em preto puro;
 * - `folha`: A4 de jato/laser, 24 por página, para recortar.
 */
export type TipoEtiqueta = "termica" | "joia" | "niimbot" | "folha";

export type ModeloEtiqueta = {
  id: string;
  nome: string;
  tipo: TipoEtiqueta;
  /** Comprimento da etiqueta, em mm (na folha A4, o de cada recorte). */
  largura: number;
  /** Altura da etiqueta, em mm. */
  altura: number;
  /** Só NIIMBOT: parte ao meio e envolve o aro — QR numa metade, marca e preço na outra. */
  dobrada: boolean;
  /** Modelo montado em Ajustes › Criação de etiquetas: o desenho manda no lugar do padrão. */
  desenho?: DesenhoEtiqueta;
};

const termica = (l: number, a: number): ModeloEtiqueta => ({
  id: `t${l}x${a}`,
  nome: `Térmica ${l} × ${a} mm`,
  tipo: "termica",
  largura: l,
  altura: a,
  dobrada: false,
});

const niimbot = (l: number, a: number, dobrada: boolean): ModeloEtiqueta => ({
  id: `n${l}x${a}${dobrada ? "d" : ""}`,
  nome: `NIIMBOT · ${l} × ${a} mm${dobrada ? " (dobra)" : " (reta)"}`,
  tipo: "niimbot",
  largura: l,
  altura: a,
  dobrada,
});

/*
 * Os sete primeiros são os do app antigo, na mesma ordem e com os mesmos ids
 * (a etiqueta "niimbot" é a D110 de 40 × 12 que a loja usa). Depois deles, os
 * rolos que se vendem prontos para as mesmas impressoras: o 100 × 50 das
 * térmicas e os rolos da NIIMBOT D110/D11/D101. Os de 30 × 12 e 30 × 14 só
 * saem retos: dobrada, cada metade ficaria pequena demais para o QR. O de
 * 30 × 15 tem as duas — é o rolo que a loja usa (João, 07/10/2026), e cada
 * metade dobrada fica um quadrado de 15 mm, onde o QR cabe. Os rolos de 22 e
 * 25 mm ficaram de fora: nem reta cabe QR, nome e preço legíveis.
 */
export const MODELOS_ETIQUETA: readonly ModeloEtiqueta[] = [
  termica(40, 25),
  termica(50, 30),
  termica(33, 22),
  termica(60, 40),
  { id: "joia", nome: "Joia dobrável 56 × 13 mm", tipo: "joia", largura: 56, altura: 13, dobrada: false },
  { id: "niimbot", nome: "NIIMBOT D110 · 40 × 12 mm (dobra)", tipo: "niimbot", largura: 40, altura: 12, dobrada: true },
  { id: "a4", nome: "Folha A4 · 24 por página", tipo: "folha", largura: 63, altura: 33.5, dobrada: false },
  termica(100, 50),
  niimbot(40, 12, false),
  niimbot(30, 12, false),
  niimbot(30, 14, false),
  niimbot(40, 14, true),
  niimbot(30, 15, true),
  niimbot(30, 15, false),
  niimbot(40, 15, true),
  niimbot(50, 15, true),
];

export const MODELO_PADRAO = "t40x25";

export type OpcoesEtiqueta = {
  /** "Mostrar preço sugerido". */
  preco: boolean;
  /** "Incluir QR code". */
  qr: boolean;
};

export type Etiqueta = {
  /** O que vai no QR e escrito na etiqueta: LL-0001 ou LL-0001-03. */
  codigo: string;
  nome: string;
  tamanho: string | null;
  /** O preço que vale na venda (o promocional, quando menor). */
  preco: number | null;
  /** O preço de tabela riscado, quando há promoção. */
  precoDe: number | null;
};

/**
 * Preço de tabela e promocional → o que a etiqueta mostra. Mesma regra do
 * catálogo: o promocional só vale se for MENOR que o de tabela.
 */
export function precosDaEtiqueta(tabela: number | null, promo: number | null) {
  if (promo !== null && tabela !== null && promo < tabela) return { preco: promo, precoDe: tabela };
  return { preco: tabela, precoDe: null };
}

/**
 * A medida dos Ajustes vira mais um modelo da lista, desenhado como NIIMBOT —
 * para um rolo que não esteja entre os de mercado.
 */
export function modeloDosAjustes(a: {
  etiquetaLargura: number;
  etiquetaAltura: number;
  etiquetaDobrada: boolean;
}): ModeloEtiqueta {
  const mm = (n: number) => String(n).replace(".", ",");
  return {
    id: "ajustes",
    nome: `Tamanho dos Ajustes · ${mm(a.etiquetaLargura)} × ${mm(a.etiquetaAltura)} mm${a.etiquetaDobrada ? " (dobra)" : " (reta)"}`,
    tipo: "niimbot",
    largura: a.etiquetaLargura,
    altura: a.etiquetaAltura,
    dobrada: a.etiquetaDobrada,
  };
}

/** Um modelo desenhado vira mais uma opção da lista, impresso como NIIMBOT (canvas). */
export function modeloDoDesenho(d: DesenhoEtiqueta): ModeloEtiqueta {
  const mm = (n: number) => String(n).replace(".", ",");
  return {
    id: `desenho-${d.id}`,
    nome: `Meu modelo · ${d.nome} (${mm(d.largura)} × ${mm(d.altura)} mm)`,
    tipo: "niimbot",
    largura: d.largura,
    altura: d.altura,
    dobrada: d.dobra,
    desenho: d,
  };
}

/**
 * A lista do seletor: os modelos desenhados em Ajustes primeiro (são os da
 * loja), depois os de mercado e, se for diferente de todos, o tamanho dos Ajustes.
 */
export function modelosComAjustes(dosAjustes: ModeloEtiqueta, desenhos: DesenhoEtiqueta[] = []): ModeloEtiqueta[] {
  const proprios = desenhos.map(modeloDoDesenho);
  const repetido = MODELOS_ETIQUETA.some(
    (m) =>
      m.tipo === dosAjustes.tipo &&
      m.largura === dosAjustes.largura &&
      m.altura === dosAjustes.altura &&
      m.dobrada === dosAjustes.dobrada,
  );
  return [...proprios, ...MODELOS_ETIQUETA, ...(repetido ? [] : [dosAjustes])];
}

/** O que o app antigo explicava embaixo do seletor de modelo. */
export function dicaDoModelo(m: ModeloEtiqueta): string {
  if (m.desenho) {
    return `Modelo criado em Ajustes › Criação de etiquetas, ${m.largura}×${m.altura} mm${m.dobrada ? ", dobrável" : ""}.`;
  }
  if (m.tipo === "folha") return "Folha A4 para recortar — 24 etiquetas por página.";
  if (m.tipo === "niimbot") {
    return m.dobrada
      ? `Rolo da NIIMBOT, ${m.largura}×${m.altura} mm. Dobra ao meio e envolve o aro — QR de um lado, marca e preço do outro.`
      : `Rolo da NIIMBOT, ${m.largura}×${m.altura} mm. Etiqueta reta — marca, nome e preço com o QR ao lado.`;
  }
  if (m.tipo === "joia") return "Tarja que dobra ao meio e envolve o aro — QR de um lado, preço do outro.";
  return `Rolo térmico — uma etiqueta por página, ${m.largura}×${m.altura} mm. Configure a impressora para esse tamanho.`;
}
