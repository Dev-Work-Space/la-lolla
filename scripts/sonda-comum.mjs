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

/*
 * Abre um diálogo com insistência.
 *
 * O esqueleto sumir não garante que a página já está INTERATIVA: o React
 * ainda pode estar hidratando, e um clique nesse instante não faz nada —
 * o botão existe, mas ninguém está ouvindo. Uma pessoa repetiria o toque;
 * a sonda faz o mesmo.
 */
export async function abrirDialogo(page, seletor, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    await page.click(seletor, { timeout: 15000 }).catch(() => {});
    const abriu = await page
      .waitForSelector('[role="dialog"]', { timeout: 3000 })
      .then(() => true)
      .catch(() => false);
    if (abriu) return true;
    await page.waitForTimeout(700);
  }
  throw new Error(`o diálogo não abriu depois de ${tentativas} tentativas: ${seletor}`);
}

/*
 * Digita numa busca e espera o resultado aparecer, insistindo.
 *
 * Mesma razão de `abrirDialogo`: a busca é feita por Server Action a partir do
 * cliente, e antes da hidratação o que se digita não dispara nada. Redigitar é
 * exatamente o que uma pessoa faria.
 */
export async function buscarEClicar(page, campo, termo, seletorResultado, tentativas = 5) {
  for (let i = 0; i < tentativas; i++) {
    await page.fill(campo, "");
    await page.fill(campo, termo);
    const achou = await page
      .waitForSelector(seletorResultado, { timeout: 4000 })
      .then(() => true)
      .catch(() => false);
    if (achou) {
      await page.click(seletorResultado);
      return true;
    }
    await page.waitForTimeout(700);
  }
  throw new Error(`a busca não trouxe "${termo}" depois de ${tentativas} tentativas`);
}
