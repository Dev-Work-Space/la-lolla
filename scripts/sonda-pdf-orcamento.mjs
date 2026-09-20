/*
 * Emite o PDF de um orçamento DE VERDADE, pela tela, e confere o arquivo.
 *
 * Não basta o botão não dar erro: o que importa é sair um PDF válido, com o
 * número, o cliente e os valores dentro. Por isso o teste intercepta o
 * download e lê os bytes.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";

const BASE = "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";
const MARCA = "ZZQA ";

const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 5 }),
});

let passou = 0;
let falhou = 0;
const conferir = (n, c, d = "") => {
  if (c) {
    passou++;
    console.log(`  OK    ${n}`);
  } else {
    falhou++;
    console.log(`  FALHA ${n}${d ? " — " + d : ""}`);
  }
};

let pecaId = null;
let clienteId = null;
let orcId = null;

const nav = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await nav.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true });
const page = await ctx.newPage();
const erros = [];
page.on("console", (m) => m.type() === "error" && erros.push(m.text()));
page.on("pageerror", (e) => erros.push("pageerror: " + e.message));

try {
  console.log("=== PREPARAR ===");
  const peca = await db.peca.create({
    data: {
      sku: `ZP-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Colar do PDF",
      categoria: "Colares",
      tamanho: "45 cm",
      custo: 40,
      precoTabela: 150,
    },
    select: { id: true, sku: true, nome: true },
  });
  pecaId = peca.id;

  const cliente = await db.cliente.create({
    data: {
      nome: MARCA + "Maria Aparecida",
      tipo: "PF",
      doc: "39053344705",
      telefone: "44999887766",
      cidade: "Maringá",
      uf: "PR",
    },
    select: { id: true },
  });
  clienteId = cliente.id;

  const hoje = new Date();
  const validoAte = new Date(hoje);
  validoAte.setDate(validoAte.getDate() + 7);

  const orc = await db.orcamento.create({
    data: {
      clienteId,
      data: hoje,
      validadeDias: 7,
      validoAte,
      subtotal: 300,
      desconto: 30,
      total: 270,
      modoPagamento: "PARCELADO",
      formaPagamento: "PIX",
      parcelas: 3,
      primeiroVencimento: validoAte,
      observacao: "Entrega em 5 dias úteis.",
      itens: { create: [{ pecaId, quantidade: 2, precoUnit: 150 }] },
    },
    select: { id: true, numero: true },
  });
  orcId = orc.id;
  conferir("orçamento de teste criado", !!orc.id);

  console.log("\n=== ENTRAR E ABRIR A FICHA ===");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(`${BASE}/orcamentos/${orcId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  conferir("o botão Gerar PDF aparece", (await page.locator('button:has-text("Gerar PDF")').count()) > 0);

  console.log("\n=== EMITIR ===");
  await page.click('button:has-text("Gerar PDF")');
  await page.waitForSelector(`text=Enviar Nº`, { timeout: 30000 });
  const painel = await page.locator('[role="dialog"]').innerText();

  conferir("abre o painel de envio", /Enviar Nº/.test(painel));
  conferir("mostra o cliente", painel.includes("Maria Aparecida"));
  conferir("mostra o total", /R\$\s*270,00/.test(painel));
  /* O nome do cliente de teste começa com a marca ZZQA, então o primeiro
     nome que o botão mostra é "ZZQA" — conferir o rótulo, não o nome. */
  conferir("oferece a conversa da cliente", /Abrir conversa de /.test(painel), painel.slice(0, 200));
  conferir("oferece salvar", /Salvar no aparelho/.test(painel));
  conferir("oferece visualizar", /Visualizar/.test(painel));

  console.log("\n=== O ARQUIVO ===");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('button:has-text("Salvar no aparelho")'),
  ]);

  const nomeArquivo = download.suggestedFilename();
  conferir(
    "nome do arquivo tem número e cliente",
    /^orcamento-\d{4}-zzqa-maria-aparecida\.pdf$/.test(nomeArquivo),
    nomeArquivo,
  );

  const caminho = await download.path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(caminho);
  conferir("é um PDF de verdade", bytes.subarray(0, 5).toString() === "%PDF-", bytes.subarray(0, 8).toString());
  conferir("tem tamanho plausível", bytes.length > 3000, `${bytes.length} bytes`);

  /* O texto do PDF fica comprimido; o pdfjs do projeto sabe ler. */
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pagina = await doc.getPage(1);
  const conteudo = await pagina.getTextContent();
  const texto = conteudo.items.map((i) => i.str).join(" ");

  conferir("o PDF diz ORÇAMENTO e o número", /ORÇAMENTO Nº \d{4}/.test(texto), texto.slice(0, 80));
  conferir("traz o cliente", texto.includes("Maria Aparecida"));
  conferir("traz o CPF com máscara", /390\.533\.447-05/.test(texto));
  conferir("traz a cidade", /Maringá\/PR/.test(texto));
  conferir("traz o nome da peça com o tamanho", /Colar do PDF · tam\. 45 cm/.test(texto));
  conferir("traz o código interno", texto.includes(peca.sku));
  conferir("traz o subtotal", /300,00/.test(texto));
  conferir("traz o desconto", /30,00/.test(texto));
  conferir("traz o total", /270,00/.test(texto));
  conferir("traz as condições de pagamento", /CONDIÇÕES DE PAGAMENTO/.test(texto));
  conferir("diz o parcelamento (3x de 90)", /3x de R\$ 90,00/.test(texto), texto.match(/\d+x de [^.]+/)?.[0]);
  conferir("traz a observação", /Entrega em 5 dias úteis/.test(texto));
  conferir("traz o quadro de vencimentos", /1ª parcela/.test(texto));
  conferir("tem rodapé com o número", /LaLolla · Nº \d{4}/.test(texto));

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.log("\nFALHA GERAL: " + e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (orcId) await db.orcamento.deleteMany({ where: { id: orcId } });
    if (pecaId) {
      await db.movimentoEstoque.deleteMany({ where: { pecaId } });
      await db.peca.delete({ where: { id: pecaId } });
    }
    if (clienteId) await db.cliente.delete({ where: { id: clienteId } });
    console.log("  dados de teste removidos");
  } catch (e) {
    console.log("  ATENÇÃO: limpeza falhou — " + e.message);
  }
  await nav.close();
  await db.$disconnect();
  console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam`);
  process.exit(falhou ? 1 : 0);
}
