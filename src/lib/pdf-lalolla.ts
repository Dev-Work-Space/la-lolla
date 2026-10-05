/*
 * O papel da LaLolla: o que o orçamento e o recibo têm em comum.
 *
 * Faixa dourada, logo, assinatura "SEMIJOIAS", bloco do cliente, tabela de
 * itens e rodapé numerado. Estava tudo escrito duas vezes — e papel timbrado
 * que muda num arquivo e não muda no outro deixa a loja mandando dois
 * documentos que não parecem da mesma casa.
 *
 * Neutro de propósito: sem "use client" e sem server-only. Quem importa é o
 * componente, e o PDF é gerado no NAVEGADOR — a folha de compartilhar do
 * aparelho, a única coisa que anexa o arquivo de verdade no WhatsApp, precisa
 * dele ali, na mão do navegador.
 */

import type { jsPDF } from "jspdf";

/* As cores da marca, em RGB. Iguais às do app antigo. */
export const OURO: [number, number, number] = [169, 121, 44];
export const OURO_ESCURO: [number, number, number] = [140, 102, 32];
export const TINTA: [number, number, number] = [26, 24, 20];
export const CINZA: [number, number, number] = [123, 117, 106];
export const CINZA_CLARO: [number, number, number] = [148, 142, 132];
export const LINHA: [number, number, number] = [230, 225, 214];
export const CREME: [number, number, number] = [246, 239, 223];

export const M = 18; // margem
export const W = 210; // A4 em mm
export const DIR = W - M;

/* As três colunas da direita. Valem para os dois documentos: é o alinhamento
   que faz a coluna de dinheiro parecer uma coluna de dinheiro. */
export const COL_Q = 124;
export const COL_U = 146;
export const COL_T = DIR;

export const dinheiro = (n: number) =>
  "R$ " +
  (Number(n) || 0).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export const dataLonga = (d: Date | null) => (d ? d.toLocaleDateString("pt-BR") : "—");

export const numeroFormatado = (n: number) => "Nº " + String(n).padStart(4, "0");

export function mascaraDoc(doc: string, tipo: "PF" | "PJ") {
  const d = doc.replace(/\D/g, "");
  if (tipo === "PJ" && d.length === 14) {
    return `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}`;
  }
  if (d.length === 11) return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
  return doc;
}

/* A logo vem do próprio site, e não embutida em base64 como no app antigo:
   ela já está em /logo-lalolla.png, servida com cache. Se falhar (rede, modo
   avião), o papel sai com o nome em serifa no lugar — o documento não pode
   deixar de ser gerado por causa de uma imagem. */
export async function carregarLogo(): Promise<string | null> {
  try {
    const r = await fetch("/logo-lalolla.png");
    if (!r.ok) return null;
    const blob = await r.blob();
    return await new Promise((res) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result));
      fr.onerror = () => res(null);
      fr.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/**
 * O topo do papel: faixa, marca e o bloco de identificação à direita.
 * Devolve o `y` de onde o conteúdo continua.
 */
export function cabecalho(
  doc: jsPDF,
  logo: string | null,
  titulo: string,
  linhasDireita: string[],
): number {
  doc.setFillColor(...OURO);
  doc.rect(0, 0, W, 3, "F");
  const y = 24;

  let temLogo = false;
  if (logo) {
    try {
      // 353×90 é a proporção do arquivo da marca.
      doc.addImage(logo, "PNG", M, y - 8, 40, 40 * (90 / 353));
      temLogo = true;
    } catch {
      temLogo = false;
    }
  }
  if (!temLogo) {
    doc.setFont("times", "bold");
    doc.setFontSize(24);
    doc.setTextColor(...OURO);
    doc.text("LaLolla", M, y);
  }

  /* A assinatura "SEMIJOIAS" bem espaçada sob a logo: nove letras ocupando a
     largura da marca sem competir com ela. */
  doc.setFont("helvetica", "normal");
  doc.setFontSize(7);
  doc.setTextColor(...OURO);
  doc.text("SEMIJOIAS", M, y + 5.6, { charSpace: 2.6 });

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...TINTA);
  doc.text(titulo, DIR, y - 4, { align: "right" });

  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...CINZA);
  let yd = y + 1;
  for (const l of linhasDireita) {
    doc.text(l, DIR, yd, { align: "right" });
    yd += 4.6;
  }

  const fim = y + 13;
  doc.setDrawColor(...LINHA);
  doc.setLineWidth(0.3);
  doc.line(M, fim, DIR, fim);
  return fim + 10;
}

export type ClientePdf = {
  nome: string;
  tipo: "PF" | "PJ";
  doc: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
};

/** O bloco do cliente. Devolve o `y` de onde o conteúdo continua. */
export function blocoCliente(
  doc: jsPDF,
  y: number,
  cliente: ClientePdf | null,
  semNome: string,
): number {
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text("CLIENTE", M, y);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...TINTA);
  y += 6;
  doc.text(cliente?.nome ?? semNome, M, y);

  if (cliente) {
    const extra: string[] = [];
    if (cliente.doc) {
      extra.push((cliente.tipo === "PJ" ? "CNPJ " : "CPF ") + mascaraDoc(cliente.doc, cliente.tipo));
    }
    if (cliente.telefone) extra.push(cliente.telefone);
    if (cliente.cidade) extra.push(cliente.cidade + (cliente.uf ? "/" + cliente.uf : ""));
    if (extra.length) {
      y += 5;
      doc.setFont("helvetica", "normal");
      doc.setFontSize(9);
      doc.setTextColor(...CINZA);
      doc.text(extra.join("   "), M, y);
    }
  }
  return y + 12;
}

export type ItemPdf = {
  nome: string;
  sku: string;
  tamanho: string | null;
  quantidade: number;
  precoUnit: number;
};

/** A tabela de itens, com o código interno sob o nome. Devolve o `y` final. */
export function tabelaItens(doc: jsPDF, y: number, itens: ItemPdf[]): number {
  doc.setFillColor(...CREME);
  doc.rect(M - 3, y - 5, DIR - M + 6, 8, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(7.5);
  doc.setTextColor(...CINZA);
  doc.text("ITEM", M, y);
  doc.text("QTD", COL_Q, y, { align: "right" });
  doc.text("UNITÁRIO", COL_U, y, { align: "right" });
  doc.text("TOTAL", COL_T, y, { align: "right" });
  y += 8;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...TINTA);

  for (const i of itens) {
    if (y > 258) {
      doc.addPage();
      y = 24;
    }
    const nome = i.nome + (i.tamanho ? ` · tam. ${i.tamanho}` : "");
    const linhas = doc.splitTextToSize(nome, 98);
    doc.setFontSize(10.5);
    doc.setTextColor(...TINTA);
    doc.text(linhas[0], M, y);
    doc.text(String(i.quantidade), COL_Q, y, { align: "right" });
    doc.text(dinheiro(i.precoUnit), COL_U, y, { align: "right" });
    doc.text(dinheiro(i.precoUnit * i.quantidade), COL_T, y, { align: "right" });

    if (i.sku) {
      y += 4.4;
      doc.setFontSize(8);
      doc.setTextColor(...CINZA_CLARO);
      doc.text(i.sku, M, y);
    }
    y += 4.5;
    doc.setDrawColor(235, 230, 220);
    doc.line(M, y, DIR, y);
    y += 6;
  }
  return y;
}

/** Uma linha de total alinhada à direita. Devolve o `y` de baixo. */
export function linhaTotal(
  doc: jsPDF,
  y: number,
  rotulo: string,
  valor: string,
  forte: boolean,
): number {
  doc.setFont("helvetica", forte ? "bold" : "normal");
  doc.setFontSize(forte ? 12.5 : 10.5);
  doc.setTextColor(...CINZA);
  doc.text(rotulo, COL_U, y, { align: "right" });
  doc.setTextColor(...(forte ? OURO_ESCURO : TINTA));
  doc.text(valor, COL_T, y, { align: "right" });
  return y + (forte ? 8 : 6);
}

/** O rodapé, em todas as páginas. */
export function rodape(doc: jsPDF, texto: string) {
  const paginas = doc.getNumberOfPages();
  for (let p = 1; p <= paginas; p++) {
    doc.setPage(p);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(155, 149, 138);
    doc.text(texto, M, 289);
    doc.text(`${p}/${paginas}`, DIR, 289, { align: "right" });
  }
}

/** "maria-de-souza", para o nome do arquivo. */
export function apelidoArquivo(nome: string | null | undefined): string {
  if (!nome) return "";
  return (
    "-" +
    nome
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
  );
}
