/*
 * Extrai o texto de um PDF, com as quebras de linha preservadas pela posição
 * dos trechos na página.
 *
 *   node scripts/ler-pdf.mjs <arquivo.pdf> [saida.txt]
 *
 * Só leitura.
 */
import { readFileSync, writeFileSync } from "node:fs";
import * as pdfjs from "pdfjs-dist/legacy/build/pdf.mjs";

const entrada = process.argv[2];
const saida = process.argv[3];
if (!entrada) {
  console.error("uso: node scripts/ler-pdf.mjs <arquivo.pdf> [saida.txt]");
  process.exit(1);
}

const doc = await pdfjs.getDocument({
  data: new Uint8Array(readFileSync(entrada)),
  useSystemFonts: true,
}).promise;

const partes = [];
for (let n = 1; n <= doc.numPages; n++) {
  const pagina = await doc.getPage(n);
  const conteudo = await pagina.getTextContent();

  // Agrupa por linha usando a coordenada Y do trecho: sem isso o texto sai
  // todo grudado e a leitura vira adivinhação.
  const linhas = new Map();
  for (const item of conteudo.items) {
    if (!("str" in item)) continue;
    const y = Math.round(item.transform[5]);
    const x = item.transform[4];
    if (!linhas.has(y)) linhas.set(y, []);
    linhas.get(y).push({ x, texto: item.str });
  }

  const ordenadas = [...linhas.entries()]
    .sort((a, b) => b[0] - a[0]) // de cima para baixo
    .map(([, trechos]) =>
      trechos
        .sort((a, b) => a.x - b.x)
        .map((t) => t.texto)
        .join("")
        .trimEnd(),
    )
    .filter((l) => l.trim() !== "");

  partes.push(`\n──────── página ${n} de ${doc.numPages} ────────\n`);
  partes.push(ordenadas.join("\n"));
}

const texto = partes.join("\n");
if (saida) {
  writeFileSync(saida, texto, "utf8");
  console.log(`${doc.numPages} páginas · ${texto.length} caracteres → ${saida}`);
} else {
  console.log(texto);
}
