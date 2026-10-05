/*
 * Regras e tipos da etiqueta, sem nenhuma biblioteca — o servidor usa para
 * montar os dados e a tela para a prévia, sem que nenhum dos dois carregue o
 * gerador de PDF à toa.
 */

export type ModeloEtiqueta = {
  /** Comprimento da área impressa, em mm (o sentido em que a etiqueta sai). */
  largura: number;
  /** Altura da área impressa, em mm. */
  altura: number;
  /** Etiqueta de joia que dobra ao meio: frente numa metade, QR na outra. */
  dobrada: boolean;
};

export type Etiqueta = {
  /** O que vai no QR e escrito embaixo dele: LL-0001 ou LL-0001-03. */
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

/** Os Ajustes guardam as medidas soltas; a etiqueta quer o modelo junto. */
export function modeloDosAjustes(a: {
  etiquetaLargura: number;
  etiquetaAltura: number;
  etiquetaDobrada: boolean;
}): ModeloEtiqueta {
  return { largura: a.etiquetaLargura, altura: a.etiquetaAltura, dobrada: a.etiquetaDobrada };
}
