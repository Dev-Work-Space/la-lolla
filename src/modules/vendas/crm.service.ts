import "server-only";

import { brl } from "@/lib/formato";
import { listarOrcamentos } from "@/modules/orcamentos/orcamento.service";
import { FORMAS, listarVendas } from "./venda.service";
import { COLUNA_DA_ETAPA, type CartaoCrm } from "./crm.tipos";

/*
 * Monta os cartões do quadro com o que o banco guarda: orçamento aberto ou
 * recusado pelo status dele, venda pela `etapa` da entrega. Entregue há mais
 * de 30 dias sai do quadro — senão a coluna cresce para sempre; a venda
 * continua na lista de vendas.
 */

const EPS = 0.005;

function resumoItens(itens: Array<{ nome: string; quantidade: number }>): string {
  const nomes = itens.slice(0, 2).map((i) => (i.quantidade > 1 ? `${i.quantidade}× ${i.nome}` : i.nome));
  const resto = itens.length - nomes.length;
  return nomes.join(", ") + (resto > 0 ? ` +${resto}` : "");
}

const numero = (n: number) => "Nº " + String(n).padStart(4, "0");

const NOME_FORMA = new Map(FORMAS);

export async function quadroCrm(veFinanceiro: boolean): Promise<CartaoCrm[]> {
  const [abertos, vencidos, recusados, vendas] = await Promise.all([
    listarOrcamentos({ filtro: "aberto", veFinanceiro }),
    listarOrcamentos({ filtro: "vencidos", veFinanceiro }),
    // "Não aprovado" é o RECUSADO do orçamento, que o sistema já guarda.
    listarOrcamentos({ filtro: "recusados", veFinanceiro }),
    listarVendas({ veFinanceiro }),
  ]);

  const orcamentos: CartaoCrm[] = [...abertos, ...vencidos, ...recusados].map((o) => ({
    chave: `orc:${o.id}`,
    id: o.id,
    tipo: "orcamento",
    // "volta=quadro": o que for feito lá volta para o quadro (João, 18/11).
    href: `/orcamentos/${o.id}?volta=quadro`,
    rotulo: `Orçamento ${numero(o.numero)}`,
    cliente: o.cliente?.nome ?? null,
    itens: resumoItens(o.itens),
    total: o.total,
    falta: 0,
    etapa: o.status === "RECUSADO" ? "recusado" : "orcamento",
    aviso: o.status === "RECUSADO"
      ? { texto: "recusado", tom: "neutro" }
      : o.vencido
      ? { texto: "vencido", tom: "due" }
      : o.diasParaVencer !== null && o.diasParaVencer <= 2
        ? { texto: o.diasParaVencer === 0 ? "vence hoje" : `vence em ${o.diasParaVencer}d`, tom: "due" }
        : { texto: "aguardando aprovação", tom: "neutro" },
    data: o.data.toISOString(),
    detalhe: {
      itens: o.itens.map((i) => ({ nome: i.nome, quantidade: i.quantidade, total: i.total })),
      pago: 0,
      recebimentos: [],
      parcelas: [],
      semComprovante: 0,
    },
  }));

  const hoje0 = new Date();
  hoje0.setHours(0, 0, 0, 0);

  const corte = new Date(Date.now() - 30 * 86_400_000);
  const vivas = vendas.filter((v) => !(v.etapa === "ENTREGUE" && v.entregueEm && v.entregueEm < corte));

  const cartoesVenda: CartaoCrm[] = vivas.map((v) => {
    const falta = v.saldo > EPS ? v.saldo : 0;
    return {
      chave: `venda:${v.id}`,
      id: v.id,
      tipo: "venda",
      href: `/vendas/${v.id}?volta=quadro`,
      rotulo: `Venda ${numero(v.numero)}`,
      cliente: v.cliente?.nome ?? null,
      itens: resumoItens(v.itens),
      total: v.total,
      falta,
      etapa: COLUNA_DA_ETAPA[v.etapa],
      aviso: falta ? { texto: `a receber ${brl(falta)}`, tom: "due" } : { texto: "pago", tom: "accent" },
      data: v.data.toISOString(),
      detalhe: {
        // O que voltou na devolução não conta: a cliente não levou.
        itens: v.itens
          .filter((i) => i.quantidade - i.devolvido > 0)
          .map((i) => ({
            nome: i.nome,
            quantidade: i.quantidade - i.devolvido,
            total: Math.round((i.quantidade - i.devolvido) * i.precoUnit * 100) / 100,
          })),
        pago: v.pago,
        recebimentos: v.pagamentos.map((p) => ({
          forma: NOME_FORMA.get(p.forma) ?? p.forma,
          valor: p.valor,
          data: p.data.toISOString(),
        })),
        parcelas: v.parcelas
          .filter((p) => !p.paga)
          .sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime())
          .map((p) => ({
            rotulo: p.numero && p.de ? `Parcela ${p.numero}/${p.de}` : "Parcela",
            valor: p.valor,
            vencimento: p.vencimento.toISOString(),
            atrasada: p.vencimento < hoje0,
          })),
        semComprovante: v.comprovantesPendentes,
      },
    };
  });

  return [...orcamentos, ...cartoesVenda];
}
