/*
 * Constantes do tema, num módulo NEUTRO — sem "use client".
 *
 * O motivo é a mesma regra do App Router que já custou um 500 nesta base
 * (ver navegacao.ts): quando um Server Component importa algo de um módulo
 * marcado com "use client", ele NÃO recebe o valor — recebe uma referência
 * para o cliente. O layout raiz é Server Component e também importa constantes deste
 * arquivo; vindas de um módulo com "use client", seriam referências
 * opacas em vez dos valores esperados.
 *
 * Módulo neutro pode ser importado pelos dois lados.
 */

export const CHAVE_TEMA = "lalolla-tema";

/*
 * A cor que o sistema pinta na faixa do relógio quando o app está instalado.
 * São os mesmos valores de `--ll-canvas` (claro) e do fundo escuro — se um
 * dia mudarem no globals.css, mudam aqui junto, senão aparece uma emenda de
 * cor no topo.
 */
export const COR_BARRA_CLARA = "#F7F6F3";
export const COR_BARRA_ESCURA = "#191714";

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
 * A COR DA BARRA tem DUAS tags theme-color na página: a do servidor e uma que
 * o Next acrescenta ao hidratar, sempre com a cor clara. O script pintava só
 * a primeira, e a segunda deixava o topo do navegador branco com o app no
 * escuro (medido: `#191714` e `#F7F6F3` ao mesmo tempo). Agora todas são
 * pintadas e um MutationObserver repinta qualquer uma que apareça ou que o
 * Next volte a escrever; a cor certa fica em `data-cor-barra` no <html>.
 *
 * Inserido por ScriptTema no HTML do servidor, antes da primeira pintura.
 * Não é renderizado novamente pelo React no cliente. Mantém a escolha salva e a cor da barra do navegador
 * sincronizadas sem depender de um efeito de componente cliente.
 */
export const SCRIPT_TEMA = `
try {
  var t = localStorage.getItem(${JSON.stringify(CHAVE_TEMA)});
  var escuro = t === "escuro" ||
    (t !== "claro" && matchMedia("(prefers-color-scheme: dark)").matches);
  var r = document.documentElement;
  r.classList.toggle("dark", escuro);
  r.dataset.theme = escuro ? "dark" : "light";
  r.dataset.corBarra = escuro ? ${JSON.stringify(COR_BARRA_ESCURA)} : ${JSON.stringify(COR_BARRA_CLARA)};
  var pintar = function () {
    var c = r.dataset.corBarra;
    document.querySelectorAll('meta[name="theme-color"]').forEach(function (m) {
      if (m.getAttribute("content") !== c) m.setAttribute("content", c);
    });
  };
  pintar();
  new MutationObserver(pintar).observe(document.head, { childList: true, subtree: true, attributes: true, attributeFilter: ["content"] });
} catch (e) {}
`.trim();
