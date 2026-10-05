"use client";

import { EnviarPdf } from "@/components/padrao/enviar-pdf";
import { brl } from "@/lib/formato";
import { gerarPdfRecibo, type ReciboPdf } from "../pdf-recibo";

/*
 * Emitir o recibo da venda.
 *
 * Usa o mesmo painel de envio do orçamento. O texto muda porque o assunto
 * muda: o orçamento é uma proposta com validade, o recibo é a prova do que
 * ficou combinado — e a frase que a cliente procura é o que ainda falta pagar.
 */
export function EmitirRecibo({ venda }: { venda: ReciboPdf }) {
  const rotulo = "Recibo Nº " + String(venda.numero).padStart(4, "0");

  const mensagem =
    `Olá! Segue o recibo da sua compra na LaLolla.` +
    `\nTotal: ${brl(venda.total)}` +
    (venda.saldo > 0.005
      ? `\nSaldo em aberto: ${brl(venda.saldo)}`
      : `\nPago integralmente. Obrigada!`);

  return (
    <EnviarPdf
      rotulo={rotulo}
      titulo={`Enviar ${rotulo.toLowerCase()}`}
      descricao={
        `${venda.cliente?.nome ?? "Consumidor não identificado"} · ${brl(venda.total)}` +
        (venda.saldo > 0.005 ? ` · falta ${brl(venda.saldo)}` : " · quitada")
      }
      mensagem={mensagem}
      telefone={venda.cliente?.telefone ?? null}
      nomeCliente={venda.cliente?.nome ?? null}
      rotuloBotao="Recibo em PDF"
      gerar={() => gerarPdfRecibo(venda)}
    />
  );
}
