/*
 * O que a cliente vê no catálogo público.
 *
 * Tipo próprio, e não um `Pick` da linha do catálogo interno, de propósito:
 * campo novo no catálogo interno (custo, fornecedor, saldo) não pode aparecer
 * aqui por descuido. Para vazar, alguém teria de escrevê-lo neste arquivo.
 */
export type PecaVitrine = {
  id: string;
  sku: string;
  nome: string;
  categoria: string;
  tamanho: string | null;
  /** O preço que vai para a venda: o promocional, quando é menor. */
  preco: number;
  /** O sugerido riscado ("DE"), só quando há promoção. */
  precoDe: number | null;
  descontoPct: number | null;
  /** A cliente vê "disponível" ou "esgotada", nunca a quantidade. */
  disponivel: boolean;
  foto: string | null;
};
