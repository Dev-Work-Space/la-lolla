import "server-only";

import { revalidatePath } from "next/cache";

/*
 * QUEM MEXE EM QUÊ.
 *
 * Este arquivo existe por causa de um defeito que o João sentiu antes de
 * qualquer teste pegar: ele fechava uma venda e ia no Financeiro, e o
 * "Em caixa" continuava igual. O dinheiro ESTAVA no banco — o que faltava era
 * avisar a tela do Financeiro que ela tinha ficado velha.
 *
 * A causa raiz é que cada ação avisava as telas de memória, uma por uma, e a
 * lista era escrita olhando só para o próprio módulo. Venda avisava Vendas,
 * Estoque e Início, porque é onde a venda "aparece" — e esquecia o
 * Financeiro, porque o efeito ali é indireto (a venda cria um pagamento na
 * carteira e as parcelas a receber).
 *
 * Escrever o mapa de uma vez, num lugar só, com o PORQUÊ de cada seta, torna
 * o esquecimento difícil: para errar agora é preciso discordar do comentário.
 *
 * Regra para mexer aqui: uma seta existe quando um registro gravado por um
 * fluxo APARECE, mesmo que só como número, em outra tela.
 */

type Fluxo = "venda" | "compra" | "estoque" | "financeiro" | "pessoas" | "ajustes";

const AFETA: Record<Fluxo, string[]> = {
  /*
   * Fechar, cancelar, receber ou devolver uma venda mexe em:
   *   /vendas      — a lista e os indicadores
   *   /estoque     — as peças saíram da prateleira
   *   /financeiro  — o pagamento entrou na carteira e as parcelas viraram
   *                  "a receber". ERA ESTE QUE FALTAVA.
   *   /            — vendido hoje, faturamento, ritmo, mais vendidas
   */
  venda: ["/vendas", "/estoque", "/financeiro", "/"],

  /*
   * Registrar ou excluir uma compra mexe em:
   *   /compras     — a lista e os indicadores
   *   /estoque     — entrou mercadoria e o custo das peças mudou
   *   /financeiro  — saiu dinheiro (à vista) ou nasceu conta a pagar
   *   /            — peças que estavam zeradas deixam de estar
   */
  compra: ["/compras", "/estoque", "/financeiro", "/"],

  /*
   * Criar, editar, movimentar ou excluir peça mexe em:
   *   /estoque     — o óbvio
   *   /            — "peças zeradas" no bloco "Precisa de você", e o Início
   *                  contava errado quando a peça sumia ou zerava
   *   /vendas      — a busca de peças da venda nova e o nome nas vendas
   */
  estoque: ["/estoque", "/", "/vendas"],

  /*
   * Lançar, baixar, cancelar conta, mexer em carteira ou transferir mexe em:
   *   /financeiro  — o óbvio
   *   /vendas      — baixar uma parcela A RECEBER muda o "falta R$ X" da
   *                  venda e pode quitá-la
   *   /compras     — baixar uma parcela A PAGAR muda o "falta R$ X" da compra
   *   /estoque     — a pílula "A pagar" da peça sai quando o fornecedor é
   *                  quitado
   *   /            — contas vencidas e vencendo, e o saldo em caixa
   */
  financeiro: ["/financeiro", "/vendas", "/compras", "/estoque", "/"],

  /*
   * Cliente e fornecedor mexem em:
   *   /cadastros   — o óbvio
   *   /vendas      — o nome do cliente aparece em cada linha da venda
   *   /compras     — o nome do fornecedor aparece em cada linha da compra
   *   /estoque     — o fornecedor aparece na linha da peça e no filtro
   */
  pessoas: ["/cadastros", "/vendas", "/compras", "/estoque"],

  /*
   * Ajustes muda o multiplicador, a meta, as categorias e o desconto padrão —
   * coisas que aparecem em quase toda tela. Vai no layout inteiro.
   */
  ajustes: [],
};

/**
 * Avisa as telas afetadas por um fluxo que elas ficaram velhas.
 *
 * `fichas` são caminhos extras de detalhe (ex.: `/vendas/abc123`), que só
 * quem chamou sabe montar.
 */
export function recarregar(fluxo: Fluxo, ...fichas: Array<string | undefined>) {
  if (fluxo === "ajustes") {
    revalidatePath("/", "layout");
    return;
  }
  for (const tela of AFETA[fluxo]) revalidatePath(tela);
  for (const ficha of fichas) if (ficha) revalidatePath(ficha);
}
