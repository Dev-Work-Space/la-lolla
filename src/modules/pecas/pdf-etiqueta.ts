/*
 * A etiqueta da peça para a NIIMBOT D110 — portada de `gerarEtiquetasNiimbotPDF`
 * e `etiquetaPequenaCanvas` do app antigo.
 *
 * Os números abaixo custaram acerto fino no app antigo e NÃO podem mudar sem
 * teste na impressora (PARIDADE, seção 6):
 *
 *   - 16 px por mm, o DOBRO exato da D110 (203 dpi = 8 pontos por mm). Com o
 *     dobro exato, cada ponto da impressora recebe 2×2 pixels inteiros e não
 *     há interpolação borrando o QR.
 *   - QR com módulos QUADRADOS, preto puro, tamanho de módulo PAR e sem
 *     suavização.
 *   - O QR guarda SÓ o código da peça. LL-0001-01 cabe em 21 módulos, que dão
 *     3 pontos de impressora por módulo; a URL inteira daria 29 módulos e 2
 *     pontos, e o leitor falha. A consulta é feita pelo "Ler etiqueta" do app.
 *   - Hierarquia: nome, preço e tamanho grandes; a marca pequena; o QR grande.
 *   - Desconto aparece na etiqueta; se colidir com o preço, o PREÇO encolhe.
 *
 * Roda no NAVEGADOR (canvas + jsPDF), pelo mesmo motivo do orçamento: a folha
 * de compartilhar do celular — o caminho para mandar o PDF ao app da NIIMBOT —
 * precisa do arquivo na mão do navegador.
 *
 * Neutro: sem "use client" e sem server-only.
 */

import { jsPDF } from "jspdf";
import qrcode from "qrcode-generator";
import { precosDaEtiqueta, type Etiqueta, type ModeloEtiqueta } from "./etiqueta.regras";

export type { Etiqueta, ModeloEtiqueta };
export { precosDaEtiqueta };

export const PX_MM = 16;
const PX_PONTO = 2;

/** Para a pré-visualização dos Ajustes e do painel de impressão. */
export const ETIQUETA_EXEMPLO: Etiqueta = {
  codigo: "LL-0001-01",
  nome: "Brinco argola dourada",
  tamanho: null,
  preco: 89.9,
  precoDe: null,
};

const dinheiro = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const MARCA = (px: number) => `italic 600 ${px}px Georgia, "Times New Roman", serif`;
const FORTE = (px: number) => `bold ${px}px Arial, "Helvetica Neue", Helvetica, sans-serif`;
const NORMAL = (px: number) => `${px}px Arial, "Helvetica Neue", Helvetica, sans-serif`;

/** Maior fonte (em px) em que o texto cabe na largura, sem passar do mínimo. */
function caber(
  ctx: CanvasRenderingContext2D,
  texto: string,
  larguraMax: number,
  maxPx: number,
  minPx: number,
  estilo: (px: number) => string,
) {
  for (let px = Math.round(maxPx); px >= minPx; px--) {
    ctx.font = estilo(px);
    if (ctx.measureText(texto).width <= larguraMax) return px;
  }
  ctx.font = estilo(minPx);
  return Math.round(minPx);
}

/**
 * Quebra em até `maxLinhas`. Quando não cabe, a última linha termina em
 * reticências e `cortou` diz isso — quem chama prefere diminuir a letra antes.
 */
function quebrar(ctx: CanvasRenderingContext2D, texto: string, larguraMax: number, maxLinhas: number) {
  const palavras = texto.trim().split(/\s+/);
  const linhas: string[] = [];
  let atual = "";
  for (const p of palavras) {
    const tentativa = atual ? `${atual} ${p}` : p;
    if (ctx.measureText(tentativa).width <= larguraMax || !atual) {
      atual = tentativa;
    } else {
      linhas.push(atual);
      atual = p;
    }
  }
  if (atual) linhas.push(atual);
  const largaDemais = linhas.some((l) => ctx.measureText(l).width > larguraMax);
  if (linhas.length <= maxLinhas && !largaDemais) return { linhas, cortou: false };
  const corte = linhas.slice(0, maxLinhas);
  let ultima = corte[corte.length - 1];
  while (ultima.length > 1 && ctx.measureText(ultima + "…").width > larguraMax) {
    ultima = ultima.slice(0, -1);
  }
  corte[corte.length - 1] = ultima.trimEnd() + "…";
  return { linhas: corte, cortou: true };
}

function centro(ctx: CanvasRenderingContext2D, texto: string, x: number, larg: number, y: number) {
  const w = ctx.measureText(texto).width;
  ctx.fillText(texto, Math.round(x + (larg - w) / 2), Math.round(y));
}

/**
 * O QR, módulo por módulo, em pixels inteiros. O módulo é sempre um número
 * inteiro de PONTOS da impressora (logo, um número par de pixels): 3 pontos
 * quando cabe, que é o que o app antigo mediu como leitura segura.
 */
function desenharQr(ctx: CanvasRenderingContext2D, texto: string, x: number, y: number, lado: number) {
  const qr = qrcode(0, "M");
  qr.addData(texto, /^[0-9A-Z $%*+\-./:]*$/.test(texto) ? "Alphanumeric" : "Byte");
  qr.make();
  const n = qr.getModuleCount();
  const pontos = Math.max(1, Math.min(3, Math.floor(lado / (n * PX_PONTO))));
  const mod = pontos * PX_PONTO;
  const total = n * mod;
  const x0 = Math.round(x + (lado - total) / 2);
  const y0 = Math.round(y + (lado - total) / 2);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (qr.isDark(r, c)) ctx.fillRect(x0 + c * mod, y0 + r * mod, mod, mod);
    }
  }
}

/** Metade de trás (ou a ponta da etiqueta simples): QR e o código escrito. */
function verso(ctx: CanvasRenderingContext2D, e: Etiqueta, x: number, y: number, w: number, h: number) {
  const pad = Math.round(PX_MM * 0.6);
  const px = caber(ctx, e.codigo, w - 2 * pad, PX_MM * 2.2, PX_MM * 1.3, FORTE);
  const alturaTexto = Math.round(px * 1.1);
  const lado = Math.min(w - 2 * pad, h - 2 * pad - alturaTexto - Math.round(PX_MM * 0.3));
  desenharQr(ctx, e.codigo, x + (w - lado) / 2, y + pad, lado);
  ctx.font = FORTE(px);
  centro(ctx, e.codigo, x, w, y + h - pad - alturaTexto);
}

/** Metade da frente: marca, nome, tamanho e preço. */
function frente(ctx: CanvasRenderingContext2D, e: Etiqueta, x: number, y: number, w: number, h: number) {
  const pad = Math.round(PX_MM * 0.7);
  const larg = w - 2 * pad;
  let topo = y + pad;
  let base = y + h - pad;

  // Marca pequena, como no app antigo: o espaço é do nome e do preço.
  const pxMarca = caber(ctx, "LaLolla", larg, PX_MM * 2, PX_MM * 1.2, MARCA);
  ctx.font = MARCA(pxMarca);
  centro(ctx, "LaLolla", x + pad, larg, topo);
  topo += Math.round(pxMarca * 1.05);

  if (e.preco !== null) {
    const txt = dinheiro(e.preco);
    const px = caber(ctx, txt, larg, PX_MM * 3.6, PX_MM * 1.6, FORTE);
    base -= Math.round(px * 0.95);
    ctx.font = FORTE(px);
    centro(ctx, txt, x + pad, larg, base);

    if (e.precoDe !== null) {
      const pct = Math.round((1 - e.preco / e.precoDe) * 100);
      const de = `DE ${dinheiro(e.precoDe)}${pct > 0 ? `  -${pct}%` : ""}`;
      const pxDe = caber(ctx, de, larg, PX_MM * 1.5, PX_MM * 1, NORMAL);
      base -= Math.round(pxDe * 1.1);
      ctx.font = NORMAL(pxDe);
      centro(ctx, de, x + pad, larg, base);
      // risca só o "DE R$ …", não o percentual
      const so = `DE ${dinheiro(e.precoDe)}`;
      const wTudo = ctx.measureText(de).width;
      const x0 = x + pad + (larg - wTudo) / 2;
      ctx.fillRect(Math.round(x0), Math.round(base + pxDe * 0.5), Math.round(ctx.measureText(so).width), PX_PONTO);
    }
  }

  if (e.tamanho) {
    const tam = `TAM. ${e.tamanho}`;
    const px = caber(ctx, tam, larg, PX_MM * 1.8, PX_MM * 1.1, FORTE);
    base -= Math.round(px * 1.1);
    ctx.font = FORTE(px);
    centro(ctx, tam, x + pad, larg, base);
  }

  /* O nome ocupa o que sobrou no meio, em até duas linhas. Primeiro a maior
     letra em que ele cabe INTEIRO; reticências só quando nem a letra mínima
     dá conta (e aí, a maior que cabe na altura). */
  const espaco = base - topo;
  const minimo = Math.round(PX_MM * 1);
  let px = minimo;
  let linhas: string[] = [];
  let achou = false;
  for (let t = Math.round(PX_MM * 2.2); t >= minimo && !achou; t--) {
    ctx.font = FORTE(t);
    const q = quebrar(ctx, e.nome, larg, 2);
    if (!q.cortou && q.linhas.length * t * 1.1 <= espaco) [px, linhas, achou] = [t, q.linhas, true];
  }
  for (let t = Math.round(PX_MM * 1.6); t >= minimo && !achou; t--) {
    ctx.font = FORTE(t);
    const q = quebrar(ctx, e.nome, larg, espaco >= 2 * t * 1.1 ? 2 : 1);
    if (q.linhas.length * t * 1.1 <= espaco || t === minimo) [px, linhas, achou] = [t, q.linhas, true];
  }
  ctx.font = FORTE(px);
  const bloco = linhas.length * px * 1.1;
  let yl = topo + (espaco - bloco) / 2;
  for (const l of linhas) {
    centro(ctx, l, x + pad, larg, yl);
    yl += px * 1.1;
  }
}

/**
 * Impressora térmica só tem preto e branco. Texto suavizado vira cinza e a
 * NIIMBOT o converte do jeito dela, com serrilhado irregular. Decidimos aqui,
 * pixel a pixel, o que é tinta.
 */
function binarizar(ctx: CanvasRenderingContext2D, w: number, h: number) {
  const img = ctx.getImageData(0, 0, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const luz = d[i] * 0.299 + d[i + 1] * 0.587 + d[i + 2] * 0.114;
    const v = luz < 150 ? 0 : 255;
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
}

export function desenharEtiqueta(e: Etiqueta, m: ModeloEtiqueta): HTMLCanvasElement {
  const W = Math.round(m.largura * PX_MM);
  const H = Math.round(m.altura * PX_MM);
  const canvas = document.createElement("canvas");
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.textBaseline = "top";

  if (m.dobrada) {
    const meio = Math.round(W / 2);
    frente(ctx, e, 0, 0, meio, H);
    verso(ctx, e, meio, 0, W - meio, H);
    // Marquinhas da dobra, só nas bordas: guiam o dedo sem riscar o meio.
    const tique = Math.round(PX_MM * 0.6);
    ctx.fillRect(meio - 1, 0, PX_PONTO, tique);
    ctx.fillRect(meio - 1, H - tique, PX_PONTO, tique);
  } else {
    const ladoQr = Math.min(H, Math.round(W * 0.45));
    verso(ctx, e, 0, 0, ladoQr, H);
    frente(ctx, e, ladoQr, 0, W - ladoQr, H);
  }

  binarizar(ctx, W, H);
  return canvas;
}

/** A imagem de uma etiqueta, para mostrar antes de imprimir. */
export function previaEtiqueta(e: Etiqueta, m: ModeloEtiqueta): string {
  return desenharEtiqueta(e, m).toDataURL("image/png");
}

/**
 * Um PDF com UMA etiqueta por página, no tamanho exato da etiqueta — é o
 * formato que o app da NIIMBOT importa e imprime sem redimensionar.
 */
export async function gerarPdfEtiquetas(
  etiquetas: Etiqueta[],
  m: ModeloEtiqueta,
): Promise<{ blob: Blob; nome: string }> {
  // A fonte da marca precisa estar carregada antes de desenhar a primeira.
  if (typeof document !== "undefined" && document.fonts) await document.fonts.ready;

  const orientacao = m.largura >= m.altura ? "landscape" : "portrait";
  const doc = new jsPDF({ orientation: orientacao, unit: "mm", format: [m.largura, m.altura], compress: true });

  etiquetas.forEach((e, i) => {
    if (i > 0) doc.addPage([m.largura, m.altura], orientacao);
    const png = desenharEtiqueta(e, m).toDataURL("image/png");
    doc.addImage(png, "PNG", 0, 0, m.largura, m.altura, undefined, "FAST");
  });

  const quando = new Date();
  const carimbo = `${quando.getFullYear()}${String(quando.getMonth() + 1).padStart(2, "0")}${String(
    quando.getDate(),
  ).padStart(2, "0")}-${String(quando.getHours()).padStart(2, "0")}${String(quando.getMinutes()).padStart(2, "0")}`;
  return { blob: doc.output("blob"), nome: `etiquetas-lalolla-${carimbo}.pdf` };
}
