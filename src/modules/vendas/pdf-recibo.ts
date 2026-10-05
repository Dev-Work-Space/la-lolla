/*
 * O recibo da venda — o papel que a cliente leva.
 *
 * Existia no app antigo e não existia no novo. Não é enfeite: é o que prova o
 * que foi comprado, por quanto, o que já foi pago e o que ainda falta. Quando
 * a cliente volta dizendo "eu já paguei essa parcela", o recibo é a única
 * coisa que resolve a conversa.
 *
 * O timbrado vem de `@/lib/pdf-lalolla`, o mesmo do orçamento. Aqui fica só o
 * que é do recibo: pagamentos recebidos, parcelas em aberto e a linha final
 * dizendo se está quitado.
 *
 * Neutro: sem "use client" e sem server-only. Quem importa é o componente.
 */

import { jsPDF } from "jspdf";
import {
  CINZA,
  COL_T,
  M,
  TINTA,
  apelidoArquivo,
  blocoCliente,
  cabecalho,
  carregarLogo,
  dataLonga,
  dinheiro,
  linhaTotal,
  numeroFormatado,
  rodape,
  tabelaItens,
  type ClientePdf,
  type ItemPdf,
} from "@/lib/pdf-lalolla";

const FORMAS: Record<string, string> = {
  DINHEIRO: "Dinheiro",
  PIX: "Pix",
  DEBITO: "Débito",
  CREDITO: "Crédito",
};

export type ReciboPdf = {
  numero: number;
  data: Date;
  cliente: ClientePdf | null;
  itens: ItemPdf[];
  subtotal: number;
  desconto: number;
  devolvido: number;
  total: number;
  pago: number;
  saldo: number;
  pagamentos: Array<{ data: Date; forma: string; valor: number }>;
  /** Só as que ainda estão em aberto: o que a cliente ainda deve. */
  parcelas: Array<{ numero: number | null; vencimento: Date; valor: number }>;
};

/** Gera o recibo e devolve o arquivo pronto para compartilhar, salvar ou abrir. */
export async function gerarPdfRecibo(v: ReciboPdf): Promise<{ blob: Blob; nome: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await carregarLogo();

  let y = cabecalho(doc, logo, "RECIBO " + numeroFormatado(v.numero), [
    "Venda em " + dataLonga(v.data),
    "Emitido em " + dataLonga(new Date()),
  ]);

  /* "Consumidor não identificado" é o termo do app antigo para a venda avulsa.
     Serve ao papel: recibo sem nome de quem comprou continua valendo. */
  y = blocoCliente(doc, y, v.cliente, "Consumidor não identificado");
  y = tabelaItens(doc, y, v.itens);

  if (y > 240) {
    doc.addPage();
    y = 24;
  }
  y += 2;

  y = linhaTotal(doc, y, "Subtotal", dinheiro(v.subtotal), false);
  if (v.desconto > 0) y = linhaTotal(doc, y, "Desconto", "- " + dinheiro(v.desconto), false);
  if (v.devolvido > 0) y = linhaTotal(doc, y, "Devoluções", "- " + dinheiro(v.devolvido), false);
  y = linhaTotal(doc, y, "Total", dinheiro(v.total), true);

  /* ── o que já foi pago ── */
  if (v.pagamentos.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text("PAGAMENTOS RECEBIDOS", M, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const p of v.pagamentos) {
      if (y > 278) {
        doc.addPage();
        y = 24;
      }
      doc.setTextColor(...CINZA);
      doc.text(`${dataLonga(p.data)} · ${FORMAS[p.forma] ?? p.forma}`, M + 2, y);
      doc.setTextColor(...TINTA);
      doc.text(dinheiro(p.valor), COL_T, y, { align: "right" });
      y += 5;
    }
    y += 2;
  }

  /* ── o que ainda falta ── */
  if (v.parcelas.length) {
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text("PARCELAS EM ABERTO", M, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    for (const c of v.parcelas) {
      if (y > 278) {
        doc.addPage();
        y = 24;
      }
      doc.setTextColor(...CINZA);
      doc.text(
        `${c.numero ? c.numero + "ª parcela · " : ""}vence ${dataLonga(c.vencimento)}`,
        M + 2,
        y,
      );
      doc.setTextColor(...TINTA);
      doc.text(dinheiro(c.valor), COL_T, y, { align: "right" });
      y += 5;
    }
    y += 2;
  }

  /* A frase que a cliente procura primeiro. Em verde quando não deve nada, em
     vermelho quando deve — é a única cor do papel que muda com o conteúdo. */
  if (y > 280) {
    doc.addPage();
    y = 24;
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(10.5);
  if (v.saldo > 0.005) {
    doc.setTextColor(154, 83, 34);
    doc.text("Saldo em aberto: " + dinheiro(v.saldo), M, y + 2);
  } else {
    doc.setTextColor(31, 107, 76);
    doc.text("Pago integralmente", M, y + 2);
  }

  rodape(doc, `LaLolla · Recibo ${numeroFormatado(v.numero)} · ${dataLonga(v.data)}`);

  return {
    blob: doc.output("blob"),
    nome: `recibo-${String(v.numero).padStart(4, "0")}${apelidoArquivo(v.cliente?.nome)}.pdf`,
  };
}
