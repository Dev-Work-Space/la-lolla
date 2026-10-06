/*
 * Gera os ícones do app a partir da logo oficial.
 *
 *   node scripts/gerar-icones.mjs
 *
 * Por que um script e não arquivos soltos: se a logo mudar, é só rodar de
 * novo. Mesma ideia do recortar-l-da-logo.mjs.
 *
 * O que sai:
 *   src/app/favicon.ico      16–48  — aba do navegador (o "L")
 *   src/app/icon.png             96  — aba do navegador (o "L")
 *   src/app/apple-icon.png      180  — ícone na tela de início do iPhone
 *   public/icone-192.png        192  — manifesto (Android)
 *   public/icone-512.png        512  — manifesto (Android)
 *   public/icone-mascarado.png  512  — Android recorta em círculo/quadrado
 *
 * TRÊS DECISÕES QUE IMPORTAM:
 *
 * 1. O ícone do APP leva a MARCA INTEIRA, não a letra "L". O João foi
 *    explícito: "seja o ícone da LaLolla, não esse L". A logo é larga e o
 *    ícone é quadrado, então ela entra deitada no meio, com respiro.
 *
 * 1b. A ABA do navegador leva o "L" (pedido do João, 06/10/2026). Ali o
 *    ícone tem 16 px, e a marca inteira vira um risco ilegível. Até então a
 *    aba mostrava o triângulo da Vercel: o favicon.ico padrão do Next tinha
 *    ficado no projeto, e o navegador prefere o .ico ao icon.png.
 *
 * 2. O "mascarado" tem margem MAIOR. O Android recorta o ícone em círculo,
 *    losango ou quadrado arredondado conforme o aparelho — quem desenha
 *    encostando na borda perde pedaço da marca. A zona segura é o círculo
 *    central de 80%, então a arte ocupa só 60% da largura.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";

const LOGO = "public/logo-lalolla.png";
const LETRA_L = "public/logo-lalolla-l.png"; // sai do recortar-l-da-logo.mjs
const FUNDO = { r: 0xf7, g: 0xf6, b: 0xf3, alpha: 1 }; // --ll-canvas, o creme da marca

async function gerar(destino, lado, ocupacao) {
  const larguraArte = Math.round(lado * ocupacao);

  const arte = await sharp(LOGO)
    .resize({ width: larguraArte, fit: "inside", withoutEnlargement: false })
    .toBuffer();
  const { height: alturaArte } = await sharp(arte).metadata();

  await sharp({
    create: { width: lado, height: lado, channels: 4, background: FUNDO },
  })
    .composite([
      {
        input: arte,
        left: Math.round((lado - larguraArte) / 2),
        top: Math.round((lado - alturaArte) / 2),
      },
    ])
    .png()
    .toFile(destino);

  console.log(`  ${destino.padEnd(28)} ${lado}×${lado}  arte ${Math.round(ocupacao * 100)}%`);
}

/* O "L" em pé num quadrado transparente: o dourado aparece tanto na aba
   clara quanto na escura, e um fundo creme viraria uma caixinha na aba. */
async function letraL(lado) {
  const arte = await sharp(LETRA_L).resize({ height: Math.round(lado * 0.9), fit: "inside" }).toBuffer();
  const { width, height } = await sharp(arte).metadata();
  return sharp({ create: { width: lado, height: lado, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } })
    .composite([{ input: arte, left: Math.round((lado - width) / 2), top: Math.round((lado - height) / 2) }])
    .png()
    .toBuffer();
}

/* O sharp não escreve .ico. O formato é só um índice seguido de PNGs, que
   todo navegador atual aceita dentro do .ico. */
async function gerarIco(destino, lados) {
  const pngs = await Promise.all(lados.map(letraL));
  const indice = Buffer.alloc(6 + 16 * lados.length);
  indice.writeUInt16LE(1, 2);
  indice.writeUInt16LE(lados.length, 4);
  let posicao = indice.length;
  lados.forEach((lado, i) => {
    const o = 6 + 16 * i;
    indice.writeUInt8(lado, o);
    indice.writeUInt8(lado, o + 1);
    indice.writeUInt16LE(1, o + 4);
    indice.writeUInt16LE(32, o + 6);
    indice.writeUInt32LE(pngs[i].length, o + 8);
    indice.writeUInt32LE(posicao, o + 12);
    posicao += pngs[i].length;
  });
  await writeFile(destino, Buffer.concat([indice, ...pngs]));
  console.log(`  ${destino.padEnd(28)} ${lados.join(", ")} px  letra L`);
}

await mkdir("src/app", { recursive: true });

console.log("gerando ícones a partir de", LOGO);
await gerarIco("src/app/favicon.ico", [16, 32, 48]);
// 96: o "L" recortado tem 85 px de altura; maior que isso só borraria.
await writeFile("src/app/icon.png", await letraL(96));
console.log(`  ${"src/app/icon.png".padEnd(28)} 96×96  letra L`);
await gerar("src/app/apple-icon.png", 180, 0.78);
await gerar("public/icone-192.png", 192, 0.78);
await gerar("public/icone-512.png", 512, 0.78);
// Margem maior: o Android recorta a borda.
await gerar("public/icone-mascarado.png", 512, 0.6);
console.log("pronto");
