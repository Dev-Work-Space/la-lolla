/*
 * O PDF do orçamento — a folha que vai para a cliente.
 *
 * O papel em si (faixa dourada, logo, bloco do cliente, tabela de itens,
 * rodapé) mora em `@/lib/pdf-lalolla`, junto com o do recibo: timbrado que
 * muda num documento e não muda no outro deixa a loja mandando dois papéis
 * que não parecem da mesma casa. Aqui fica só o que é do orçamento —
 * validade, revisão e condições de pagamento.
 *
 * Roda no NAVEGADOR de propósito. Gerar no servidor obrigaria a mandar o
 * arquivo de volta pela rede só para o celular poder compartilhar, e a folha
 * de compartilhar do aparelho — a única coisa que anexa o PDF de verdade no
 * WhatsApp — precisa do arquivo ali, na mão do navegador.
 *
 * Neutro: sem "use client" e sem server-only. Quem importa é o componente.
 */

import { jsPDF } from "jspdf";
import { dividirEmParcelas, vencimentoParcela } from "@/lib/parcelas";
import {
  CINZA,
  COL_T,
  DIR,
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

export type { ItemPdf };
export { numeroFormatado };

const FORMAS: Record<string, string> = {
  DINHEIRO: "dinheiro",
  PIX: "Pix",
  DEBITO: "débito",
  CREDITO: "crédito",
};

export type OrcamentoPdf = {
  numero: number;
  data: Date;
  validoAte: Date | null;
  revisaoDe: number | null;
  cliente: ClientePdf | null;
  itens: ItemPdf[];
  subtotal: number;
  desconto: number;
  total: number;
  modoPagamento: "A_COMBINAR" | "A_VISTA" | "PARCELADO";
  formaPagamento: string | null;
  parcelas: number | null;
  primeiroVencimento: Date | null;
  /** Entrada combinada, em reais; as parcelas cobrem o que sobra. */
  entrada?: number | null;
  intervaloParcelas?: "mes" | "quinzena" | "semana" | null;
  observacao: string | null;
};

/** Gera o PDF e devolve o arquivo pronto para compartilhar, salvar ou abrir. */
export async function gerarPdfOrcamento(o: OrcamentoPdf): Promise<{ blob: Blob; nome: string }> {
  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const logo = await carregarLogo();

  let y = cabecalho(doc, logo, "ORÇAMENTO " + numeroFormatado(o.numero), [
    "Emissão " + dataLonga(o.data),
    "Validade " + dataLonga(o.validoAte),
    ...(o.revisaoDe ? ["Revisão do orçamento " + numeroFormatado(o.revisaoDe)] : []),
  ]);

  y = blocoCliente(doc, y, o.cliente, "Não informado");
  y = tabelaItens(doc, y, o.itens);

  /* ── totais ── */
  if (y > 240) {
    doc.addPage();
    y = 24;
  }
  y += 2;

  y = linhaTotal(doc, y, "Subtotal", dinheiro(o.subtotal), false);
  if (o.desconto > 0) y = linhaTotal(doc, y, "Desconto", "- " + dinheiro(o.desconto), false);
  y = linhaTotal(doc, y, "Total", dinheiro(o.total), true);

  /* ── condições de pagamento e observação ── */
  y += 4;
  const cond: string[] = [];
  const pctDesc = o.subtotal > 0 ? Math.round((o.desconto / o.subtotal) * 1000) / 10 : 0;
  const forma = o.formaPagamento ? FORMAS[o.formaPagamento] ?? o.formaPagamento : null;

  if (o.desconto > 0) {
    cond.push(
      `Desconto de ${String(pctDesc).replace(".", ",")}% (${dinheiro(o.desconto)}) já aplicado nos valores acima` +
        (o.modoPagamento === "A_VISTA" && forma ? ` para pagamento em ${forma}` : "") +
        ".",
    );
  }
  if (o.modoPagamento === "A_VISTA") {
    cond.push(`Pagamento à vista${forma ? " em " + forma : ""}: ${dinheiro(o.total)}.`);
  } else if (o.modoPagamento === "PARCELADO") {
    const n = o.parcelas || 2;
    const entrada = o.entrada && o.entrada > 0 && o.entrada < o.total ? o.entrada : 0;
    const resto = Math.round((o.total - entrada) * 100) / 100;
    const un = Math.round((resto / n) * 100) / 100;
    cond.push(
      entrada > 0
        ? `Entrada de ${dinheiro(entrada)} e o restante em ${n}x de ${dinheiro(un)}${forma ? " em " + forma : ""}.`
        : `Parcelamento em ${n}x de ${dinheiro(un)}${forma ? " em " + forma : ""}.`,
    );
  }
  if (o.observacao) cond.push(o.observacao);

  if (cond.length) {
    const temPagamento = o.desconto > 0 || o.modoPagamento !== "A_COMBINAR";
    doc.setFont("helvetica", "bold");
    doc.setFontSize(7.5);
    doc.setTextColor(...CINZA);
    doc.text(temPagamento ? "CONDIÇÕES DE PAGAMENTO" : "OBSERVAÇÕES", M, y);
    y += 6;

    doc.setFont("helvetica", "normal");
    doc.setFontSize(9.5);
    doc.setTextColor(76, 70, 61);
    for (const t of cond) {
      for (const l of doc.splitTextToSize(t, DIR - M)) {
        if (y > 280) {
          doc.addPage();
          y = 24;
        }
        doc.text(l, M, y);
        y += 5;
      }
    }

    /* O quadro de vencimentos só sai quando as datas foram combinadas: sem
       elas, prometer data no papel seria inventar. */
    if (o.modoPagamento === "PARCELADO" && o.primeiroVencimento) {
      const n = o.parcelas || 2;
      const entrada = o.entrada && o.entrada > 0 && o.entrada < o.total ? o.entrada : 0;
      const valores = dividirEmParcelas(Math.round((o.total - entrada) * 100) / 100, n);
      y += 3;
      if (entrada > 0) {
        doc.setTextColor(...CINZA);
        doc.text("Entrada", M, y);
        doc.setTextColor(...TINTA);
        doc.text(dinheiro(entrada), COL_T, y, { align: "right" });
        y += 5;
      }
      for (let k = 0; k < n; k++) {
        if (y > 278) {
          doc.addPage();
          y = 24;
        }
        /* O intervalo combinado (mês, 15 dias ou semana); antes era sempre mês. */
        const venc = vencimentoParcela(new Date(o.primeiroVencimento), k, o.intervaloParcelas ?? "mes");
        doc.setTextColor(...CINZA);
        doc.text(`${k + 1}ª parcela · ${dataLonga(venc)}`, M, y);
        doc.setTextColor(...TINTA);
        doc.text(dinheiro(valores[k]), COL_T, y, { align: "right" });
        y += 5;
      }
    }
  }

  rodape(doc, `LaLolla · ${numeroFormatado(o.numero)} · ${dataLonga(o.data)}`);

  return {
    blob: doc.output("blob"),
    nome: `orcamento-${String(o.numero).padStart(4, "0")}${apelidoArquivo(o.cliente?.nome)}.pdf`,
  };
}
