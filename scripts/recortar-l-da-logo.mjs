/*
 * Recorta o "L" da logo oficial para servir de monograma na barra fechada.
 *
 *   node scripts/recortar-l-da-logo.mjs
 *
 * Por que um arquivo e não CSS: a barra fechada mostrava um "L" digitado numa
 * fonte serifada qualquer, que não é a fonte da marca. De perto dava para ver
 * que eram dois desenhos diferentes — o João viu. Recortando da própria
 * imagem, o monograma É a logo, e continua sendo mesmo se a logo mudar
 * (basta rodar isto de novo).
 *
 * O recorte é medido, não chutado: varre as colunas de pixels, acha onde há
 * tinta, e corta na primeira folga depois da primeira letra.
 */
import sharp from "sharp";

const ORIGEM = "public/logo-lalolla.png";
const DESTINO = "public/logo-lalolla-l.png";

const img = sharp(ORIGEM);
const { width, height } = await img.metadata();
const { data, info } = await img.ensureAlpha().raw().toBuffer({ resolveWithObject: true });
const canais = info.channels;

/* Uma coluna tem tinta se algum pixel dela é opaco e escuro o bastante. */
const temTinta = (x) => {
  for (let y = 0; y < height; y++) {
    const i = (y * width + x) * canais;
    const [r, g, b, a] = [data[i], data[i + 1], data[i + 2], data[i + 3]];
    if (a > 40 && (r + g + b) / 3 < 235) return true;
  }
  return false;
};

const colunas = Array.from({ length: width }, (_, x) => temTinta(x));

const inicio = colunas.indexOf(true);
if (inicio < 0) throw new Error("a logo parece vazia — nenhuma coluna com tinta");

/*
 * O fim do L é a primeira folga em branco depois do começo. Uma folga de 1 ou
 * 2 pixels pode ser ruído de antisserrilhado, então só conta como separação
 * de letra a partir de um vão de verdade.
 */
const VAO_MINIMO = Math.max(3, Math.round(width * 0.008));
let fim = -1;
for (let x = inicio; x < width; x++) {
  if (colunas[x]) continue;
  let vao = 0;
  while (x + vao < width && !colunas[x + vao]) vao++;
  if (vao >= VAO_MINIMO) {
    fim = x;
    break;
  }
  x += vao;
}
if (fim < 0) throw new Error("não achei o fim da primeira letra");

// Linhas com tinta dentro dessa faixa, para o recorte vertical ficar justo.
let topo = height;
let base = 0;
for (let y = 0; y < height; y++) {
  for (let x = inicio; x < fim; x++) {
    const i = (y * width + x) * canais;
    if (data[i + 3] > 40 && (data[i] + data[i + 1] + data[i + 2]) / 3 < 235) {
      if (y < topo) topo = y;
      if (y > base) base = y;
      break;
    }
  }
}

const larguraL = fim - inicio;
const alturaL = base - topo + 1;

await sharp(ORIGEM)
  .extract({ left: inicio, top: topo, width: larguraL, height: alturaL })
  .png()
  .toFile(DESTINO);

console.log(`logo:     ${width}×${height}`);
console.log(`L achado: x ${inicio}–${fim}, y ${topo}–${base}`);
console.log(`gravado:  ${DESTINO} (${larguraL}×${alturaL})`);
