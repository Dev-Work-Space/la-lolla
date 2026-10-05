"use client";

import { EnviarPdf } from "@/components/padrao/enviar-pdf";
import { brl } from "@/lib/formato";
import { gerarPdfOrcamento, numeroFormatado, type OrcamentoPdf } from "../pdf-orcamento";

/*
 * Emitir a cotação.
 *
 * O painel de envio (compartilhar, abrir a conversa, salvar, visualizar) é o
 * mesmo do recibo e mora em `@/components/padrao/enviar-pdf`. Aqui fica só o
 * que é do orçamento: o texto que vai junto no WhatsApp.
 */
export function EmitirOrcamento({ orcamento }: { orcamento: OrcamentoPdf }) {
  const rotulo = numeroFormatado(orcamento.numero);
  const validade = orcamento.validoAte
    ? orcamento.validoAte.toLocaleDateString("pt-BR")
    : null;

  const mensagem =
    `Olá! Segue o orçamento ${rotulo} da LaLolla.` +
    `\nTotal: ${brl(orcamento.total)}` +
    (validade ? `\nVálido até ${validade}.` : "");

  return (
    <EnviarPdf
      rotulo={rotulo}
      titulo={`Enviar ${rotulo}`}
      descricao={
        `${orcamento.cliente?.nome ?? "Sem cliente"} · ${brl(orcamento.total)}` +
        (validade ? ` · válido até ${validade}` : "")
      }
      mensagem={mensagem}
      telefone={orcamento.cliente?.telefone ?? null}
      nomeCliente={orcamento.cliente?.nome ?? null}
      gerar={() => gerarPdfOrcamento(orcamento)}
    />
  );
}
