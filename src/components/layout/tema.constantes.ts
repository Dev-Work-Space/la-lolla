/*
 * Constantes do tema, num módulo NEUTRO — sem "use client".
 *
 * O motivo é a mesma regra do App Router que já custou um 500 nesta base
 * (ver navegacao.ts): quando um Server Component importa algo de um módulo
 * marcado com "use client", ele NÃO recebe o valor — recebe uma referência
 * para o cliente. O layout raiz é Server Component e precisa do texto do
 * script para injetar no <head>; vindo do módulo com "use client", ele
 * receberia um objeto opaco e o script iria para a página como lixo.
 *
 * Módulo neutro pode ser importado pelos dois lados.
 */

export const CHAVE_TEMA = "lalolla-tema";

export type Tema = "claro" | "escuro" | "sistema";

/*
 * QUEM MANDA NO TEMA É A CLASSE `dark` NO <html>.
 *
 * Não é escolha estética: o `@custom-variant dark (&:is(.dark *))` no
 * globals.css e todas as utilidades `dark:` espalhadas pelo app já dependem
 * dela. Eu tinha começado marcando só `data-theme` e o tema escuro não mudava
 * NADA — a sonda de celular pegou: o fundo continuava rgb(247,246,243).
 *
 * `data-theme` fica junto porque ajuda a enxergar o estado ao depurar, mas
 * quem pinta é a classe.
 *
 * Roda ANTES da primeira pintura, no <head>.
 *
 * Sem ele o app pinta claro, o React acorda, lê a escolha e troca para
 * escuro — e quem escolheu escuro leva um flash branco na cara toda vez que
 * abre. É feio e, no escuro, incomoda de verdade.
 *
 * Pequeno e sem dependência de propósito: ele bloqueia a pintura.
 */
export const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
  var escuro = t === "escuro" ||
    (t !== "claro" && matchMedia("(prefers-color-scheme: dark)").matches);
  var r = document.documentElement;
  r.classList.toggle("dark", escuro);
  r.dataset.theme = escuro ? "dark" : "light";
} catch (e) {}
`.trim();
