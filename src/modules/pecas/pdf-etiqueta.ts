/*
 * As etiquetas da peça — portadas do app antigo, função por função:
 *
 *   desenhaEtiqueta        → térmicas comuns e a folha A4 (jsPDF, vetor)
 *   desenhaEtiquetaJoia    → a tarja de joia 56 × 13 (jsPDF, vetor)
 *   etiquetaPequenaCanvas  → NIIMBOT (canvas, preto puro)
 *   gerarEtiquetas / gerarEtiquetasNiimbotPDF / enviarEtiquetasNiimbot
 *
 * O João pediu a etiqueta EXATAMENTE igual à do app antigo: medidas, fontes,
 * cores e proporções abaixo são as de lá. Mudar um número aqui é mudar o que
 * sai no papel — só com teste na impressora.
 *
 * Uma diferença de propósito: o QR guarda só o código da peça (LL-0001-03),
 * nunca o link. Foi a escolha do João, e é o que o "Ler etiqueta" do app lê.
 *
 * Roda no NAVEGADOR (canvas + jsPDF): a folha de compartilhar do celular — o
 * caminho para o app da NIIMBOT — precisa do arquivo na mão do navegador.
 *
 * Neutro: sem "use client" e sem server-only.
 */

import { jsPDF } from "jspdf";
import qrcode from "qrcode-generator";
import type { Etiqueta, ModeloEtiqueta, OpcoesEtiqueta } from "./etiqueta.regras";

/* 16 px/mm ≈ 406 dpi: o dobro dos 203 dpi da D110, então a impressora reduz
   (nunca amplia) e o traço sai limpo. */
export const PX_MM = 16;

/** Para a pré-visualização dos Ajustes. */
export const ETIQUETA_EXEMPLO: Etiqueta = {
  codigo: "LL-0001-01",
  nome: "Brinco argola dourada",
  tamanho: null,
  preco: 89.9,
  precoDe: null,
};

const LOGO_SRC = "/logo-lalolla.png";
/* A logo da loja tem 353 × 90 px; as contas de altura do app antigo usam a razão. */
const LOGO_RAZAO = 90 / 353;

type Cor = [number, number, number];
const INK: Cor = [28, 26, 22];
const GOLD: Cor = [168, 120, 44];
const MUT: Cor = [139, 133, 124];
const LINHA: Cor = [214, 197, 152];

const pdfMoney = (n: number) =>
  "R$ " + n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const precoVigente = (e: Etiqueta) => e.preco ?? 0;
const temPromocao = (e: Etiqueta) => e.precoDe !== null && e.preco !== null && e.preco < e.precoDe;
const descontoPct = (e: Etiqueta) =>
  temPromocao(e) ? Math.round((1 - e.preco! / e.precoDe!) * 100) : 0;
const skuComTam = (e: Etiqueta) => e.codigo + (e.tamanho ? "  ·  " + e.tamanho : "");

/* ------------------------------------------------------------------ imagens */

let logoCarregando: Promise<HTMLImageElement | null> | null = null;
function carregarLogo(): Promise<HTMLImageElement | null> {
  logoCarregando ??= new Promise((ok) => {
    const im = new Image();
    im.onload = () => ok(im);
    im.onerror = () => ok(null);
    im.src = LOGO_SRC;
  });
  return logoCarregando;
}

/* A logo da loja é dourada, e impressora térmica não tem meio-tom: ou queima o
   ponto ou não queima. Dourado (luminância ~126) viraria um chuvisco cinza.
   Então tudo que tem tinta vira PRETO puro e o resto vira transparente — o
   limiar por luminância funciona tanto com fundo transparente quanto branco. */
let logoTermicaPronta: HTMLCanvasElement | HTMLImageElement | null = null;
function logoTermica(img: HTMLImageElement) {
  if (logoTermicaPronta) return logoTermicaPronta;
  try {
    const w = img.naturalWidth || img.width;
    const h = img.naturalHeight || img.height;
    const c = document.createElement("canvas");
    c.width = w;
    c.height = h;
    const g = c.getContext("2d")!;
    g.drawImage(img, 0, 0);
    const d = g.getImageData(0, 0, w, h);
    const a = d.data;
    for (let i = 0; i < a.length; i += 4) {
      const lum = 0.299 * a[i] + 0.587 * a[i + 1] + 0.114 * a[i + 2];
      if (a[i + 3] > 100 && lum < 210) {
        a[i] = a[i + 1] = a[i + 2] = 0;
        a[i + 3] = 255;
      } else a[i + 3] = 0;
    }
    g.putImageData(d, 0, 0);
    logoTermicaPronta = c;
  } catch {
    logoTermicaPronta = img;
  }
  return logoTermicaPronta;
}

function rrPath(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/* QR com visual mais fino para as etiquetas grandes: módulos com o canto
   suavizado e os três "olhos" desenhados como quadros arredondados. Mantém o
   miolo cheio e a zona de silêncio de 4 módulos, então continua lendo bem. */
function qrEtiqueta(texto: string, px: number): HTMLCanvasElement | null {
  try {
    const t = qrcode(0, "M");
    t.addData(texto);
    t.make();
    const n = t.getModuleCount();
    const quiet = 4;
    const s = Math.max(3, Math.floor(px / (n + quiet * 2)));
    const lado = (n + quiet * 2) * s;
    const cv = document.createElement("canvas");
    cv.width = lado;
    cv.height = lado;
    const ctx = cv.getContext("2d")!;
    ctx.fillStyle = "#FFFFFF";
    ctx.fillRect(0, 0, lado, lado);
    const TINTA = "#141414";
    ctx.fillStyle = TINTA;
    const olho = (r: number, c: number) => (r < 7 && c < 7) || (r < 7 && c >= n - 7) || (r >= n - 7 && c < 7);
    for (let r = 0; r < n; r++) {
      for (let c = 0; c < n; c++) {
        if (!t.isDark(r, c) || olho(r, c)) continue;
        rrPath(ctx, (c + quiet) * s, (r + quiet) * s, s, s, s * 0.32);
        ctx.fill();
      }
    }
    const desenhaOlho = (rr: number, cc: number) => {
      const x = (cc + quiet) * s;
      const y = (rr + quiet) * s;
      ctx.fillStyle = TINTA;
      rrPath(ctx, x, y, 7 * s, 7 * s, s * 2.1);
      ctx.fill();
      ctx.fillStyle = "#FFFFFF";
      rrPath(ctx, x + s, y + s, 5 * s, 5 * s, s * 1.5);
      ctx.fill();
      ctx.fillStyle = TINTA;
      rrPath(ctx, x + 2 * s, y + 2 * s, 3 * s, 3 * s, s * 1.0);
      ctx.fill();
    };
    desenhaOlho(0, 0);
    desenhaOlho(0, n - 7);
    desenhaOlho(n - 7, 0);
    return cv;
  } catch {
    return null;
  }
}

/* QR para impressão térmica. O QR bonito das etiquetas grandes não serve aqui:
   em 10 mm cada módulo tem 2 ou 3 pontos da impressora, e o canto arredondado
   mais a suavização somem na queima — sai fraco e o leitor não pega.

   Aqui é o que imprime: quadrado duro, PRETO puro, sem suavização, e o módulo
   com tamanho INTEIRO e par de pixels, para cair em número redondo de pontos
   quando a impressora reduz de 406 para 203 dpi. Correção de erro L: guarda o
   mesmo dado em menos módulos, e módulo maior é o que faz o leitor enxergar. */
function qrTermico(texto: string, caixaPx: number) {
  const quiet = 2;
  let t: ReturnType<typeof qrcode> | null = null;
  for (const nivel of ["L", "M"] as const) {
    try {
      const q = qrcode(0, nivel);
      q.addData(texto);
      q.make();
      t = q;
      break;
    } catch {
      /* não coube neste nível: tenta o próximo */
    }
  }
  if (!t) return null;
  const n = t.getModuleCount();
  const total = n + quiet * 2;
  const s = Math.max(2, Math.floor(caixaPx / total / 2) * 2);
  const lado = total * s;
  const cv = document.createElement("canvas");
  cv.width = lado;
  cv.height = lado;
  const ctx = cv.getContext("2d")!;
  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, lado, lado);
  ctx.fillStyle = "#000000";
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      if (t.isDark(r, c)) ctx.fillRect((c + quiet) * s, (r + quiet) * s, s, s);
    }
  }
  return { cv, lado };
}

/* ------------------------------------------------- o "papel" das etiquetas
 * As térmicas, a joia e a folha A4 são desenhadas com as chamadas do jsPDF,
 * como no app antigo. Para a PRÉVIA na tela, o mesmo desenho roda num canvas
 * que imita essas chamadas — assim o que se vê é o mesmo código que vai para
 * o PDF, e não uma segunda versão que pode divergir.
 */

type Imagem = HTMLCanvasElement | HTMLImageElement;

interface Papel {
  setFont(nome: string, estilo: string): unknown;
  setFontSize(pt: number): unknown;
  setTextColor(r: number, g: number, b: number): unknown;
  setFillColor(r: number, g: number, b: number): unknown;
  setDrawColor(r: number, g: number, b: number): unknown;
  setLineWidth(mm: number): unknown;
  setLineDashPattern(padrao: number[], fase: number): unknown;
  roundedRect(x: number, y: number, w: number, h: number, rx: number, ry: number, estilo?: string): unknown;
  line(x1: number, y1: number, x2: number, y2: number): unknown;
  text(texto: string, x: number, y: number, opcoes?: { charSpace?: number }): unknown;
  addImage(img: Imagem, formato: string, x: number, y: number, w: number, h: number, alias?: string, compressao?: "FAST"): unknown;
  splitTextToSize(texto: string, larguraMax: number): string[];
  getTextWidth(texto: string): number;
}

const PT_MM = 25.4 / 72;
const rgb = (c: Cor) => `rgb(${c[0]},${c[1]},${c[2]})`;

class PapelCanvas implements Papel {
  private fonte = "helvetica";
  private estilo = "normal";
  private pt = 16;
  private corTexto: Cor = [0, 0, 0];

  constructor(
    private ctx: CanvasRenderingContext2D,
    private esc: number,
  ) {
    ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 0.2 * esc;
    this.aplicarFonte();
  }

  private aplicarFonte() {
    const familia = this.fonte === "times" ? '"Times New Roman", Times, serif' : "Helvetica, Arial, sans-serif";
    const px = this.pt * PT_MM * this.esc;
    this.ctx.font = `${this.estilo === "italic" ? "italic " : ""}${this.estilo === "bold" ? "bold " : ""}${px}px ${familia}`;
  }
  setFont(nome: string, estilo: string) {
    this.fonte = nome;
    this.estilo = estilo;
    this.aplicarFonte();
  }
  setFontSize(pt: number) {
    this.pt = pt;
    this.aplicarFonte();
  }
  setTextColor(r: number, g: number, b: number) {
    this.corTexto = [r, g, b];
  }
  setFillColor(r: number, g: number, b: number) {
    this.ctx.fillStyle = rgb([r, g, b]);
  }
  setDrawColor(r: number, g: number, b: number) {
    this.ctx.strokeStyle = rgb([r, g, b]);
  }
  setLineWidth(mm: number) {
    this.ctx.lineWidth = mm * this.esc;
  }
  setLineDashPattern(padrao: number[]) {
    this.ctx.setLineDash(padrao.map((v) => v * this.esc));
  }
  roundedRect(x: number, y: number, w: number, h: number, rx: number, _ry: number, estilo = "S") {
    const e = this.esc;
    rrPath(this.ctx, x * e, y * e, w * e, h * e, rx * e);
    if (estilo.includes("F")) this.ctx.fill();
    if (estilo.includes("D") || estilo === "S") this.ctx.stroke();
  }
  line(x1: number, y1: number, x2: number, y2: number) {
    const e = this.esc;
    this.ctx.beginPath();
    this.ctx.moveTo(x1 * e, y1 * e);
    this.ctx.lineTo(x2 * e, y2 * e);
    this.ctx.stroke();
  }
  text(texto: string, x: number, y: number, opcoes?: { charSpace?: number }) {
    const antes = this.ctx.fillStyle;
    this.ctx.fillStyle = rgb(this.corTexto);
    this.ctx.letterSpacing = `${(opcoes?.charSpace ?? 0) * this.esc}px`;
    this.ctx.fillText(texto, x * this.esc, y * this.esc);
    this.ctx.letterSpacing = "0px";
    this.ctx.fillStyle = antes;
  }
  addImage(img: Imagem, _formato: string, x: number, y: number, w: number, h: number) {
    const e = this.esc;
    this.ctx.drawImage(img, x * e, y * e, w * e, h * e);
  }
  getTextWidth(texto: string) {
    return this.ctx.measureText(texto).width / this.esc;
  }
  splitTextToSize(texto: string, larguraMax: number) {
    const linhas: string[] = [];
    let atual = "";
    for (const palavra of texto.split(/\s+/).filter(Boolean)) {
      const tentativa = atual ? `${atual} ${palavra}` : palavra;
      if (!atual || this.getTextWidth(tentativa) <= larguraMax) atual = tentativa;
      else {
        linhas.push(atual);
        atual = palavra;
      }
    }
    linhas.push(atual);
    return linhas;
  }
}

/* ----------------------------------------------- térmica comum e folha A4 */

type CacheQr = Map<string, HTMLCanvasElement | null>;

function qrDoCache(cache: CacheQr, codigo: string, px: number) {
  if (!cache.has(codigo)) cache.set(codigo, qrEtiqueta(codigo, px));
  return cache.get(codigo) ?? null;
}

/* Desenha UMA etiqueta dentro do retângulo (x,y,w,h). Adapta fonte, QR e
   espaçamento ao tamanho da caixa, então serve para a folha A4 e para o rolo
   térmico com o mesmo código — a etiqueta fica igual, só muda a moldura. */
function desenhaEtiqueta(
  doc: Papel,
  x: number,
  y: number,
  w: number,
  h: number,
  p: Etiqueta,
  opc: OpcoesEtiqueta,
  logo: HTMLImageElement | null,
  cacheQR: CacheQr,
) {
  const pad = Math.max(2.3, Math.min(4.2, w * 0.085));
  const luxo = h >= 24;

  /* QR bonito dentro de uma caixinha com moldura fina, no canto inferior
     direito — emoldurado, não solto. */
  let boxQR = 0;
  if (opc.qr) {
    const qr = Math.max(8, Math.min(11, Math.min(w, h) * 0.27));
    const inset = Math.max(1.0, qr * 0.15);
    boxQR = qr + inset * 2;
    const bx = x + w - pad - boxQR;
    const by = y + h - pad - boxQR;
    const img = qrDoCache(cacheQR, p.codigo, 380);
    if (img) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(210, 203, 188);
        doc.setLineWidth(0.3);
        doc.roundedRect(bx, by, boxQR, boxQR, 1.6, 1.6, "FD");
        doc.addImage(img, "PNG", bx + inset, by + inset, qr, qr, "qr" + p.codigo, "FAST");
      } catch {
        boxQR = 0;
      }
    } else boxQR = 0;
  }

  const fNome = Math.max(6.6, Math.min(9.5, h * 0.205));
  const fSku = Math.max(4.3, Math.min(6, h * 0.1));
  const fPreco = Math.max(8.5, Math.min(13, h * 0.3));

  /* ---- marca: a LOGO da loja (imagem); se falhar, o nome em serifa ---- */
  let ty: number;
  let logoOK = false;
  let logoH = 0;
  if (logo) {
    const logoW = Math.min(w * 0.46, 20);
    logoH = logoW * LOGO_RAZAO;
    try {
      doc.addImage(logo, "PNG", x + pad, y + pad, logoW, logoH, "lllogo", "FAST");
      logoOK = true;
    } catch {
      /* sem a imagem, a marca sai em serifa logo abaixo */
    }
  }
  if (logoOK) {
    // gap real: a assinatura não encosta na logo
    ty = y + pad + logoH + Math.max(2.0, logoH * 0.4);
  } else {
    const fM = Math.max(7.5, Math.min(12, h * 0.3));
    ty = y + pad + fM * 0.35;
    doc.setFont("times", "italic");
    doc.setFontSize(fM);
    doc.setTextColor(...INK);
    doc.text("LaLolla", x + pad, ty);
    ty += 2.4;
  }
  if (luxo) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(Math.max(3.4, Math.min(4.4, h * 0.088)));
    doc.setTextColor(...GOLD);
    doc.text("SEMIJOIAS", x + pad, ty, { charSpace: 0.9 });
    ty += 1.8;
    doc.setDrawColor(...LINHA);
    doc.setLineWidth(0.25);
    doc.line(x + pad, ty - 0.4, x + pad + Math.min(w * 0.42, 15), ty - 0.4);
    ty += 2.4;
  } else ty += 1.2;

  /* ---- nome (reserva a coluna do QR) ---- */
  const txtW = w - pad * 2 - (boxQR ? boxQR + 2.5 : 0);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(fNome);
  doc.setTextColor(...INK);
  const nome = doc.splitTextToSize(p.nome, txtW);
  const lh = fNome * 0.42 + 0.6;
  const promo = opc.preco && temPromocao(p);
  const limiteBaixo = y + h - pad - fPreco * 0.42 - (fSku * 0.42 + 1.6);
  doc.text(nome[0], x + pad, ty);
  ty += lh;
  if (nome[1] && ty + lh <= limiteBaixo) {
    doc.text(nome[2] ? nome[1].replace(/.$/, "…") : nome[1], x + pad, ty);
    ty += lh;
  }

  /* ---- rodapé: código (+ preço antigo riscado), preço vigente e desconto ---- */
  const baseP = y + h - pad - 0.6;
  const precoFinal = precoVigente(p);
  const temPreco = opc.preco && precoFinal > 0;
  const yMid = baseP - (temPreco ? fPreco * 0.42 + 1.3 : 0);

  // linha do código, em caixa alta; no luxo com promoção, mostra "DE R$x" riscado
  doc.setFont("helvetica", "normal");
  doc.setFontSize(fSku);
  doc.setTextColor(...MUT);
  const skuTxt = skuComTam(p).toUpperCase();
  doc.text(skuTxt, x + pad, yMid);
  if (promo && luxo) {
    const w1 = doc.getTextWidth(skuTxt);
    const sep = "   DE ";
    const de = pdfMoney(p.precoDe!);
    doc.text(sep, x + pad + w1, yMid);
    const xDe = x + pad + w1 + doc.getTextWidth(sep);
    doc.text(de, xDe, yMid);
    doc.setDrawColor(...MUT);
    doc.setLineWidth(0.3);
    doc.line(xDe, yMid - fSku * 0.11, xDe + doc.getTextWidth(de), yMid - fSku * 0.11);
  }
  if (temPreco) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(fPreco);
    doc.setTextColor(...INK);
    doc.text(pdfMoney(precoFinal), x + pad, baseP);
    if (promo) {
      const wp = doc.getTextWidth(pdfMoney(precoFinal));
      doc.setFont("helvetica", "bold");
      doc.setFontSize(fSku * 1.05);
      doc.setTextColor(...GOLD);
      doc.text("-" + descontoPct(p) + "%", x + pad + wp + 2, baseP);
    }
  }
}

/* A tarja de joia: dobra na linha do meio. Esquerda = QR + código; direita =
   marca, nome e preço, que é o lado que fica à mostra no aro. */
function desenhaEtiquetaJoia(
  doc: Papel,
  p: Etiqueta,
  opc: OpcoesEtiqueta,
  logo: HTMLImageElement | null,
  cacheQR: CacheQr,
) {
  const w = 56;
  const h = 13;
  const meio = w / 2;
  const pad = 2.2;
  // vinco
  doc.setDrawColor(210, 204, 192);
  doc.setLineWidth(0.2);
  doc.setLineDashPattern([0.8, 0.8], 0);
  doc.line(meio, 1.4, meio, h - 1.4);
  doc.setLineDashPattern([], 0);
  // esquerda: QR emoldurado + código
  const qr = Math.min(h - pad * 2 - 1.4, 6.6);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(5);
  if (opc.qr) {
    const ins = 0.8;
    const box = qr + ins * 2;
    const by = (h - box) / 2;
    const img = qrDoCache(cacheQR, p.codigo, 320);
    if (img) {
      try {
        doc.setFillColor(255, 255, 255);
        doc.setDrawColor(210, 203, 188);
        doc.setLineWidth(0.25);
        doc.roundedRect(pad, by, box, box, 1.1, 1.1, "FD");
        doc.addImage(img, "PNG", pad + ins, by + ins, qr, qr, "qr" + p.codigo, "FAST");
      } catch {
        /* sem o QR, o código escrito continua lá */
      }
    }
    doc.setTextColor(...MUT);
    doc.text(skuComTam(p).toUpperCase(), pad + box + 1.6, h / 2 + 0.6, { charSpace: 0.3 });
  } else {
    doc.setTextColor(...MUT);
    doc.text(skuComTam(p).toUpperCase(), pad, h / 2 + 2.6, { charSpace: 0.3 });
  }
  // direita: LOGO (LaLolla) + nome + preço
  const lw = Math.min(meio - pad * 2, 16);
  const lh = lw * LOGO_RAZAO;
  let logoOK = false;
  if (logo) {
    try {
      doc.addImage(logo, "PNG", meio + pad, 1.4, lw, lh, "lllogoj", "FAST");
      logoOK = true;
    } catch {
      /* sem a imagem, a marca sai em serifa */
    }
  }
  if (!logoOK) {
    doc.setFont("times", "italic");
    doc.setFontSize(6.6);
    doc.setTextColor(...INK);
    doc.text("LaLolla", meio + pad, 4.4);
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(6);
  doc.setTextColor(...INK);
  const nome = doc.splitTextToSize(p.nome, meio - pad * 2);
  doc.text(nome[0], meio + pad, 8.6);
  if (opc.preco && precoVigente(p) > 0) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.2);
    doc.setTextColor(...INK);
    doc.text(pdfMoney(precoVigente(p)), meio + pad, h - pad - 0.3);
    if (temPromocao(p)) {
      const wp = doc.getTextWidth(pdfMoney(precoVigente(p)));
      doc.setFontSize(4.6);
      doc.setTextColor(...GOLD);
      doc.text("-" + descontoPct(p) + "%", meio + pad + wp + 1.2, h - pad - 0.3);
    }
  }
}

/* ======================================== etiqueta pequena · NIIMBOT
 * A etiqueta do rolo da NIIMBOT é MUITO menor que as térmicas comuns: 12 mm de
 * altura não comportam o desenho grande (só o QR mínimo dele tem 8 mm e a
 * moldura estoura a altura). Então esta tem desenho próprio, feito em canvas.
 *
 * Um renderizador só serve aos dois caminhos: o PNG vai para a folha de
 * compartilhar (o app da NIIMBOT aparece lá e imprime) e o MESMO PNG entra no
 * PDF. O que sai no papel é exatamente o que se vê na tela.
 *
 * Por que imagem e não "imprimir direto": a D110 é Bluetooth com protocolo
 * fechado da NIIMBOT, e o Safari do iPhone não tem Web Bluetooth. Nenhum site
 * conversa com ela. A folha de compartilhar é o caminho honesto — e é um toque.
 */

/** Corta o texto até caber na largura, com reticência. */
function cortaCanvas(ctx: CanvasRenderingContext2D, txt: string, max: number) {
  if (ctx.measureText(txt).width <= max) return txt;
  while (txt.length > 1 && ctx.measureText(txt + "…").width > max) txt = txt.slice(0, -1);
  return txt + "…";
}

const SANS = "Helvetica,Arial,sans-serif";

function etiquetaPequenaCanvas(
  p: Etiqueta,
  opc: OpcoesEtiqueta,
  m: ModeloEtiqueta,
  logo: HTMLImageElement | null,
): HTMLCanvasElement {
  const W = Math.round(m.largura * PX_MM);
  const H = Math.round(m.altura * PX_MM);
  const cv = document.createElement("canvas");
  cv.width = W;
  cv.height = H;
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = "#000000";
  ctx.strokeStyle = "#000000";
  ctx.textBaseline = "top";

  const pad = Math.round(0.9 * PX_MM);
  const preco = precoVigente(p);
  const promo = temPromocao(p);
  const pct = descontoPct(p);
  const codigo = p.codigo.toUpperCase();
  const tam = p.tamanho ? "TAM " + p.tamanho.toUpperCase() : "";

  // a marca: a logo real da loja, pequena; se não carregar, serifa
  function marca(x: number, y: number, maxW: number) {
    const lw = Math.min(maxW, Math.round(13 * PX_MM));
    const lh = Math.round(lw * LOGO_RAZAO);
    if (logo) {
      try {
        ctx.drawImage(logoTermica(logo), x, y, lw, lh);
        return lh;
      } catch {
        /* cai na serifa */
      }
    }
    const f = Math.round(2.6 * PX_MM);
    ctx.font = `italic ${f}px Georgia,'Times New Roman',serif`;
    ctx.fillText("LaLolla", x, y);
    return f;
  }

  /* O preço é o maior da etiqueta. Tendo promoção, o "-X%" vai COLADO nele, na
     mesma linha: nesta altura não sobra linha para o preço antigo riscado, e a
     porcentagem ao lado do valor é o que a cliente lê de longe. Em vez de um
     montar no outro, o preço encolhe até os dois caberem. */
  function precoEm(x: number, y: number, maxW: number, fPx: number) {
    if (!opc.preco || !(preco > 0)) return 0;
    const MIN = Math.round(1.7 * PX_MM);
    const gap = Math.round(0.4 * PX_MM);
    const txt = brl(preco);
    const tag = promo && pct > 0 ? "-" + pct + "%" : "";
    fPx = Math.max(MIN, fPx);
    let fp = 0;
    for (;;) {
      ctx.font = `700 ${fPx}px ${SANS}`;
      const wP = ctx.measureText(txt).width;
      if (!tag) {
        if (wP <= maxW || fPx <= MIN) break;
      } else {
        fp = Math.max(Math.round(1.3 * PX_MM), Math.round(fPx * 0.46));
        ctx.font = `700 ${fp}px ${SANS}`;
        if (wP + gap + ctx.measureText(tag).width <= maxW || fPx <= MIN) break;
      }
      fPx -= 2;
    }
    ctx.font = `700 ${fPx}px ${SANS}`;
    const corte = cortaCanvas(ctx, txt, maxW);
    const wFinal = ctx.measureText(corte).width;
    ctx.fillText(corte, x, y);
    if (tag) {
      ctx.font = `700 ${fp}px ${SANS}`;
      ctx.fillText(tag, x + Math.min(wFinal + gap, maxW - ctx.measureText(tag).width), y + fPx - fp);
    }
    return fPx;
  }

  /* Acha a maior fonte em que o texto ainda cabe na largura, sem descer de um
     piso legível. Melhor diminuir um pouco a letra do que cortar o nome da
     peça em "Anel solitário zi…". */
  function fonteQueCabe(txt: string, maxW: number, fMax: number, fMin: number, peso: string) {
    for (let f = fMax; f > fMin; f -= 1) {
      ctx.font = `${peso} ${f}px ${SANS}`;
      if (ctx.measureText(txt).width <= maxW) return f;
    }
    return fMin;
  }

  if (m.dobrada) {
    /* Dobra ao meio e envolve o aro. Não cabe tudo, então há uma ordem de
       prioridade — QR, preço, nome e tamanho é o que a loja usa; a marca entra
       pequena, de assinatura, e é a primeira a ceder espaço. O vinco
       pontilhado marca onde dobrar. */
    const meia = Math.floor(W / 2);
    ctx.save();
    ctx.setLineDash([Math.round(0.5 * PX_MM), Math.round(0.5 * PX_MM)]);
    ctx.lineWidth = Math.max(1, Math.round(0.12 * PX_MM));
    ctx.beginPath();
    ctx.moveTo(meia, pad);
    ctx.lineTo(meia, H - pad);
    ctx.stroke();
    ctx.restore();

    /* Face esquerda: só o QR, usando a ALTURA INTEIRA — módulo mais grosso é o
       que faz o leitor pegar de primeira no térmico. Desenhado 1:1:
       redimensionar reamostra os módulos e o código sai fraco. */
    const espL = meia - pad * 2;
    const caixaQR = Math.min(espL, H - pad * 2);
    if (opc.qr && caixaQR > Math.round(4 * PX_MM)) {
      const qt = qrTermico(p.codigo, caixaQR);
      if (qt) {
        ctx.imageSmoothingEnabled = false;
        ctx.drawImage(qt.cv, pad + Math.round((espL - qt.lado) / 2), Math.round((H - qt.lado) / 2));
      }
    }

    // Face direita, de cima para baixo: assinatura, nome, código com tamanho e o preço fechando.
    const xR = meia + pad;
    const espR = W - meia - pad * 2;
    let yR = pad;
    yR += marca(xR, yR, Math.round(7 * PX_MM)) + Math.round(0.3 * PX_MM);

    const fNome = fonteQueCabe(p.nome, espR, Math.round(2.2 * PX_MM), Math.round(1.7 * PX_MM), "600");
    ctx.font = `600 ${fNome}px ${SANS}`;
    ctx.fillText(cortaCanvas(ctx, p.nome, espR), xR, yR);
    yR += fNome + Math.round(0.2 * PX_MM);

    const fSub = Math.round(1.6 * PX_MM);
    ctx.font = `${fSub}px ${SANS}`;
    ctx.fillText(cortaCanvas(ctx, codigo + (tam ? "  ·  " + tam : ""), espR), xR, yR);
    yR += fSub + Math.round(0.25 * PX_MM);

    precoEm(xR, yR, espR, Math.min(Math.round(3.4 * PX_MM), H - pad - yR));
    return cv;
  }

  /* ---- etiqueta reta: QR à direita, texto à esquerda ----
     O app antigo punha aqui o QR bonito redimensionado; como é rolo térmico,
     vai o QR de impressão, o mesmo da etiqueta dobrada. */
  let espTexto = W - pad * 2;
  if (opc.qr) {
    const caixa = H - pad * 2;
    const qt = qrTermico(p.codigo, caixa);
    if (qt) {
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(qt.cv, W - pad - caixa + Math.round((caixa - qt.lado) / 2), Math.round((H - qt.lado) / 2));
      espTexto = W - pad * 3 - caixa;
    }
  }
  /* A marca vai do tamanho da assinatura da dobrada: com a logo grande do app
     antigo, nos rolos de 30 mm o preço não cabia. */
  let y = pad;
  y += marca(pad, y, Math.min(espTexto, Math.round(7 * PX_MM))) + Math.round(0.45 * PX_MM);

  const fN = Math.round(2.0 * PX_MM);
  ctx.font = `${fN}px ${SANS}`;
  ctx.fillText(cortaCanvas(ctx, p.nome, espTexto), pad, y);
  y += fN + Math.round(0.25 * PX_MM);

  const fC = Math.round(1.7 * PX_MM);
  ctx.font = `${fC}px ${SANS}`;
  ctx.fillText(cortaCanvas(ctx, codigo + (tam ? "  ·  " + tam : ""), espTexto), pad, y);
  y += fC + Math.round(0.3 * PX_MM);

  // o preço ocupa o que sobrou de altura, sem estourar a etiqueta
  const sobra = H - pad - y;
  if (opc.preco && preco > 0 && sobra > Math.round(1.6 * PX_MM)) {
    precoEm(pad, y, espTexto, Math.min(Math.round(3.4 * PX_MM), sobra));
  }
  return cv;
}

/* ----------------------------------------------------------- saídas */

function nomeDoArquivo() {
  const d = new Date();
  const hoje = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  return `lalolla-etiquetas-${hoje}.pdf`;
}

/** A imagem de uma etiqueta, para mostrar antes de imprimir. */
export async function previaEtiqueta(e: Etiqueta, m: ModeloEtiqueta, opc: OpcoesEtiqueta): Promise<string> {
  const logo = await carregarLogo();
  if (m.tipo === "niimbot") return etiquetaPequenaCanvas(e, opc, m, logo).toDataURL("image/png");

  const esc = 12;
  const cv = document.createElement("canvas");
  cv.width = Math.round(m.largura * esc);
  cv.height = Math.round(m.altura * esc);
  const ctx = cv.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, cv.width, cv.height);
  const papel = new PapelCanvas(ctx, esc);
  const cache: CacheQr = new Map();
  if (m.tipo === "joia") desenhaEtiquetaJoia(papel, e, opc, logo, cache);
  else desenhaEtiqueta(papel, 0, 0, m.largura, m.altura, e, opc, logo, cache);
  if (m.tipo === "folha") {
    // o contorno de recorte, como sai na folha
    papel.setDrawColor(226, 221, 210);
    papel.setLineWidth(0.2);
    papel.roundedRect(0.1, 0.1, m.largura - 0.2, m.altura - 0.2, 2, 2);
  }
  return cv.toDataURL("image/png");
}

/** O PDF das etiquetas, no formato do modelo — igual ao "Gerar PDF" do app antigo. */
export async function gerarPdfEtiquetas(
  etiquetas: Etiqueta[],
  m: ModeloEtiqueta,
  opc: OpcoesEtiqueta,
): Promise<{ blob: Blob; nome: string }> {
  const logo = await carregarLogo();
  const cache: CacheQr = new Map();

  if (m.tipo === "folha") {
    const doc = new jsPDF({ unit: "mm", format: "a4" });
    const M = 10;
    const cols = 3;
    const rows = 8;
    const gx = 1.5;
    const gy = 1.5;
    etiquetas.forEach((p, ix) => {
      const pos = ix % (cols * rows);
      if (ix > 0 && pos === 0) doc.addPage();
      const c = pos % cols;
      const r = Math.floor(pos / cols);
      const x = M + c * (m.largura + gx);
      const y = M + r * (m.altura + gy);
      doc.setDrawColor(226, 221, 210);
      doc.setLineWidth(0.2);
      doc.roundedRect(x, y, m.largura, m.altura, 2, 2);
      desenhaEtiqueta(doc, x, y, m.largura, m.altura, p, opc, logo, cache);
    });
    return { blob: doc.output("blob"), nome: nomeDoArquivo() };
  }

  // térmica, joia e NIIMBOT: uma etiqueta por página, do tamanho do rótulo
  const orient = m.largura >= m.altura ? "landscape" : "portrait";
  const doc = new jsPDF({ unit: "mm", format: [m.largura, m.altura], orientation: orient });
  etiquetas.forEach((p, ix) => {
    if (ix > 0) doc.addPage([m.largura, m.altura], orient);
    if (m.tipo === "niimbot") {
      const png = etiquetaPequenaCanvas(p, opc, m, logo).toDataURL("image/png");
      doc.addImage(png, "PNG", 0, 0, m.largura, m.altura, "et" + ix, "FAST");
    } else if (m.tipo === "joia") desenhaEtiquetaJoia(doc, p, opc, logo, cache);
    else desenhaEtiqueta(doc, 0, 0, m.largura, m.altura, p, opc, logo, cache);
  });
  return { blob: doc.output("blob"), nome: nomeDoArquivo() };
}

/** Mais que isso a folha de compartilhar do celular engasga. */
export const MAX_IMAGENS_NIIMBOT = 12;

/** As imagens PNG para a folha de compartilhar — é ali que o app da NIIMBOT aparece. */
export async function imagensNiimbot(etiquetas: Etiqueta[], m: ModeloEtiqueta, opc: OpcoesEtiqueta): Promise<File[]> {
  const logo = await carregarLogo();
  const arquivos: File[] = [];
  for (const [i, p] of etiquetas.slice(0, MAX_IMAGENS_NIIMBOT).entries()) {
    const cv = etiquetaPequenaCanvas(p, opc, m, logo);
    const blob = await new Promise<Blob | null>((ok) => cv.toBlob(ok, "image/png"));
    if (!blob) throw new Error("png");
    arquivos.push(new File([blob], `etiqueta-${p.codigo || i + 1}.png`, { type: "image/png" }));
  }
  return arquivos;
}

/* A folha de compartilhar com arquivo só existe em contexto seguro e em
   navegador que a implementa (iPhone e Android têm; o PC em geral não). */
export function podeCompartilharImagem() {
  try {
    if (!("canShare" in navigator) || !("share" in navigator)) return false;
    const f = new File([new Blob(["x"], { type: "image/png" })], "t.png", { type: "image/png" });
    return navigator.canShare({ files: [f] });
  } catch {
    return false;
  }
}
