/*
 * Emite o recibo de uma venda DE VERDADE, pela tela, e confere o arquivo.
 *
 * Mesma ideia da sonda do orçamento: o botão não dar erro não prova nada. O
 * que importa é sair um PDF válido com o número, a cliente, o que ela levou,
 * o que já pagou e o que ainda falta — é essa folha que resolve a conversa
 * quando a cliente volta dizendo que já pagou a parcela.
 */
import { chromium } from "playwright-core";
import { esperarPronto } from "./sonda-comum.mjs";

const BASE = process.argv[2] ?? "http://localhost:3000";
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
let vendaId = null;

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
      sku: `ZR-${Date.now().toString().slice(-6)}`,
      nome: MARCA + "Pulseira do Recibo",
      categoria: "Pulseiras",
      tamanho: "18 cm",
      custo: 30,
      precoTabela: 120,
    },
    select: { id: true, sku: true },
  });
  pecaId = peca.id;
  await db.movimentoEstoque.create({
    data: { pecaId, delta: 5, motivo: "COMPRA", observacao: "preparo do teste" },
  });

  const cliente = await db.cliente.create({
    data: {
      nome: MARCA + "Joana Ribeiro",
      tipo: "PF",
      doc: "52998224725",
      telefone: "44988776655",
      cidade: "Sarandi",
      uf: "PR",
    },
    select: { id: true },
  });
  clienteId = cliente.id;

  /* Venda de 240 com 100 pagos: sobra 140 em duas parcelas. Serve para provar
     as três partes do recibo — o que levou, o que pagou e o que falta. */
  const hoje = new Date();
  const venc = new Date(hoje);
  venc.setMonth(venc.getMonth() + 1);

  const venda = await db.venda.create({
    data: {
      status: "FECHADA",
      data: hoje,
      clienteId,
      subtotal: 240,
      desconto: 0,
      total: 240,
      itens: { create: [{ pecaId, quantidade: 2, precoUnit: 120, custoUnit: 30 }] },
      pagamentos: { create: [{ forma: "PIX", valor: 100, data: hoje }] },
      parcelas: {
        create: [
          {
            tipo: "RECEBER",
            status: "ABERTA",
            descricao: "parcela 1/2",
            valor: 70,
            vencimento: venc,
            parcela: 1,
            deParcelas: 2,
          },
          {
            tipo: "RECEBER",
            status: "ABERTA",
            descricao: "parcela 2/2",
            valor: 70,
            vencimento: venc,
            parcela: 2,
            deParcelas: 2,
          },
        ],
      },
    },
    select: { id: true, numero: true },
  });
  vendaId = venda.id;
  await db.movimentoEstoque.create({
    data: { pecaId, delta: -2, motivo: "VENDA", origem: vendaId, observacao: "teste" },
  });
  conferir("venda de teste criada", !!venda.id);

  console.log("\n=== ENTRAR E ABRIR A FICHA ===");
  await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
  await esperarPronto(page);
  await page.fill("#usuario", "teste");
  await page.fill("#senha", "Teste@2026!");
  await page.click('button[type="submit"]');
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

  await page.goto(`${BASE}/vendas/${vendaId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  conferir(
    "o botão Recibo em PDF aparece",
    (await page.locator('button:has-text("Recibo em PDF")').count()) > 0,
  );

  console.log("\n=== EMITIR ===");
  await page.click('button:has-text("Recibo em PDF")');
  await page.waitForSelector("text=Enviar recibo", { timeout: 30000 });
  const painel = await page.locator('[role="dialog"]').innerText();

  conferir("abre o painel de envio", /Enviar recibo/i.test(painel));
  conferir("mostra a cliente", painel.includes("Joana Ribeiro"));
  conferir("mostra o total", /R\$\s*240,00/.test(painel));
  conferir("diz o que falta", /falta R\$\s*140,00/.test(painel), painel.slice(0, 200));
  conferir("oferece a conversa da cliente", /Abrir conversa de /.test(painel));
  conferir("oferece salvar", /Salvar no aparelho/.test(painel));

  console.log("\n=== O ARQUIVO ===");
  const [download] = await Promise.all([
    page.waitForEvent("download", { timeout: 30000 }),
    page.click('button:has-text("Salvar no aparelho")'),
  ]);

  const nomeArquivo = download.suggestedFilename();
  conferir(
    "nome do arquivo tem número e cliente",
    /^recibo-\d{4}-zzqa-joana-ribeiro\.pdf$/.test(nomeArquivo),
    nomeArquivo,
  );

  const caminho = await download.path();
  const { readFileSync } = await import("node:fs");
  const bytes = readFileSync(caminho);
  conferir(
    "é um PDF de verdade",
    bytes.subarray(0, 5).toString() === "%PDF-",
    bytes.subarray(0, 8).toString(),
  );
  conferir("tem tamanho plausível", bytes.length > 3000, `${bytes.length} bytes`);

  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes) }).promise;
  const pagina = await doc.getPage(1);
  const conteudo = await pagina.getTextContent();
  const texto = conteudo.items.map((i) => i.str).join(" ");

  conferir("o PDF diz RECIBO e o número", /RECIBO Nº \d{4}/.test(texto), texto.slice(0, 80));
  conferir("traz a cliente", texto.includes("Joana Ribeiro"));
  conferir("traz o CPF com máscara", /529\.982\.247-25/.test(texto));
  conferir("traz a cidade", /Sarandi\/PR/.test(texto));
  conferir("traz a peça com o tamanho", /Pulseira do Recibo · tam\. 18 cm/.test(texto));
  conferir("traz o código interno", texto.includes(peca.sku));
  conferir("traz o total", /240,00/.test(texto));
  conferir("lista os pagamentos recebidos", /PAGAMENTOS RECEBIDOS/.test(texto));
  conferir("com a forma e o valor", /Pix/.test(texto) && /100,00/.test(texto));
  conferir("lista as parcelas em aberto", /PARCELAS EM ABERTO/.test(texto));
  conferir("com o vencimento", /1ª parcela · vence/.test(texto));
  conferir("diz o saldo em aberto", /Saldo em aberto: R\$ 140,00/.test(texto));
  conferir("tem rodapé com o número", /LaLolla · Recibo Nº \d{4}/.test(texto));

  /*
   * Venda cancelada não emite recibo — regra do app antigo. Aqui isso não é
   * uma checagem no botão: o bloco inteiro de ações some da ficha.
   */
  console.log("\n=== VENDA CANCELADA NÃO EMITE ===");
  await db.venda.update({
    where: { id: vendaId },
    data: { status: "CANCELADA", canceladaEm: new Date(), motivoCancelada: "teste" },
  });
  await page.goto(`${BASE}/vendas/${vendaId}`, { waitUntil: "networkidle" });
  await esperarPronto(page);
  conferir(
    "o botão some na venda cancelada",
    (await page.locator('button:has-text("Recibo em PDF")').count()) === 0,
  );

  conferir("nenhum erro de console", erros.length === 0, erros.slice(0, 2).join(" | "));
} catch (e) {
  falhou++;
  console.log("\nFALHA GERAL: " + e.message);
} finally {
  console.log("\n=== LIMPEZA ===");
  try {
    if (vendaId) {
      await db.conta.deleteMany({ where: { vendaId } });
      await db.pagamento.deleteMany({ where: { vendaId } });
      await db.itemVenda.deleteMany({ where: { vendaId } });
      await db.venda.delete({ where: { id: vendaId } });
    }
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
