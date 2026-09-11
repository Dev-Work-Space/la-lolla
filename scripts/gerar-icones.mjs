/*
 * Gera os ícones do app a partir da logo oficial.
 *
 *   node scripts/gerar-icones.mjs
 *
 * Por que um script e não arquivos soltos: se a logo mudar, é só rodar de
 * novo. Mesma ideia do recortar-l-da-logo.mjs.
 *
 * O que sai:
 *   src/app/icon.png            512  — favicon e aba do navegador
 *   src/app/apple-icon.png      180  — ícone na tela de início do iPhone
 *   public/icone-192.png        192  — manifesto (Android)
 *   public/icone-512.png        512  — manifesto (Android)
 *   public/icone-mascarado.png  512  — Android recorta em círculo/quadrado
 *
 * DUAS DECISÕES QUE IMPORTAM:
 *
 * 1. O ícone leva a MARCA INTEIRA, não a letra "L". O João foi explícito:
 *    "seja o ícone da LaLolla, não esse L". A logo é larga e o ícone é
 *    quadrado, então ela entra deitada no meio, com respiro dos dois lados.
 *
 * 2. O "mascarado" tem margem MAIOR. O Android recorta o ícone em círculo,
 *    losango ou quadrado arredondado conforme o aparelho — quem desenha
 *    encostando na borda perde pedaço da marca. A zona segura é o círculo
 *    central de 80%, então a arte ocupa só 60% da largura.
 */
import sharp from "sharp";
import { mkdir } from "node:fs/promises";

const LOGO = "public/logo-lalolla.png";
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

await mkdir("src/app", { recursive: true });

console.log("gerando ícones a partir de", LOGO);
await gerar("src/app/icon.png", 512, 0.78);
await gerar("src/app/apple-icon.png", 180, 0.78);
await gerar("public/icone-192.png", 192, 0.78);
await gerar("public/icone-512.png", 512, 0.78);
// Margem maior: o Android recorta a borda.
await gerar("public/icone-mascarado.png", 512, 0.6);
console.log("pronto");
