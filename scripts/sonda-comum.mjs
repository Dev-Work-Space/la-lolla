/*
 * Ferramentas compartilhadas pelas sondas.
 *
 * O motivo de existir: depois que o app ganhou esqueletos de carregamento
 * (loading.tsx), navegar mostra a FORMA da tela imediatamente e o conteúdo
 * chega em seguida. As sondas que liam a página logo após navegar passaram a
 * capturar o esqueleto e reportar falhas que não existiam.
 *
 * `esperarPronto` resolve na raiz: espera não haver mais nenhum bloco pulsando
 * na tela. É a mesma coisa que uma pessoa faz — olha e vê que parou de
 * carregar.
 */

/** Espera o esqueleto sumir, ou seja: o conteúdo de verdade estar na tela. */
export async function esperarPronto(page, timeout = 20000) {
  await page
    .waitForFunction(() => document.querySelectorAll(".animate-pulse").length === 0, undefined, {
      timeout,
    })
    .catch(() => {});
}

/** Navega e espera o conteúdo, não só a navegação. */
export async function irPara(page, url, timeout = 30000) {
  await page.goto(url, { waitUntil: "domcontentloaded", timeout });
  await esperarPronto(page, timeout);
}

/** Clica e espera a tela nova ficar pronta. */
export async function clicarEEsperar(page, seletor, timeout = 30000) {
  await page.click(seletor, { timeout });
  await esperarPronto(page, timeout);
}
