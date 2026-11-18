/*
 * A REGRA DO PREÇO QUE VALE, num lugar só (João, 18/11).
 *
 * Promoção vale quando o promocional é MENOR que o preço de tabela
 * (documentação, seção 02) e a data de fim, se houver, ainda não passou.
 * Passou da data: o preço volta ao normal sozinho — o promocional continua
 * gravado, mas deixa de valer em todo lugar ao mesmo tempo.
 *
 * Antes esta conta estava copiada no catálogo, na vitrine, na etiqueta e no
 * assistente — e faltava na venda e no PDV: o catálogo mostrava R$ 79,90 e o
 * caixa cobrava R$ 99,90. Quem precisa do preço pergunta aqui.
 *
 * Neutro (sem `server-only` nem Prisma): a tela também usa.
 */

type Numero = number | string | { toString(): string } | null | undefined;

export type PrecosDaPeca = {
  precoTabela: Numero;
  precoPromocional: Numero;
  promocaoAte: Date | string | null | undefined;
};

const num = (v: Numero): number | null => (v === null || v === undefined ? null : Number(v));

/** A promoção está valendo agora? */
export function promocaoValendo(p: PrecosDaPeca, agora: Date = new Date()): boolean {
  const tabela = num(p.precoTabela);
  const promo = num(p.precoPromocional);
  if (promo === null || tabela === null || !(promo < tabela)) return false;
  return !p.promocaoAte || new Date(p.promocaoAte) >= agora;
}

/** O preço que se cobra hoje. `null` = produto sem preço. */
export function precoVigente(p: PrecosDaPeca, agora: Date = new Date()): number | null {
  return promocaoValendo(p, agora) ? num(p.precoPromocional) : num(p.precoTabela);
}

/** Preço, "de" riscado e % — o que catálogo e etiqueta desenham. */
export function precoComDesconto(p: PrecosDaPeca, agora: Date = new Date()) {
  const tabela = num(p.precoTabela);
  if (!promocaoValendo(p, agora) || tabela === null) return { preco: tabela, precoDe: null, descontoPct: null };
  const promo = num(p.precoPromocional)!;
  return { preco: promo, precoDe: tabela, descontoPct: Math.round((1 - promo / tabela) * 100) };
}

/** Já teve promoção cadastrada, mas a data passou: aparece para alguém limpar. */
export function promocaoEncerrada(p: PrecosDaPeca, agora: Date = new Date()): boolean {
  return num(p.precoPromocional) !== null && !!p.promocaoAte && new Date(p.promocaoAte) < agora;
}
