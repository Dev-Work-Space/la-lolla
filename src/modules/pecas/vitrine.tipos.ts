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

/*
 * Um card do catálogo. Peças com o mesmo nome e categoria e tamanhos
 * diferentes (aliança aro 16, 17, 18; perfume 100 ml e 5 ml) são cadastradas
 * uma a uma, cada uma com seu código, estoque e preço. A cliente vê UM card e
 * escolhe o tamanho, a pedido do João.
 */
export type ModeloVitrine = {
  chave: string;
  nome: string;
  categoria: string;
  /** Na ordem de tamanho; a primeira disponível é a que o card abre escolhida. */
  variantes: PecaVitrine[];
};
