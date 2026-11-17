import "server-only";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
import type { Sessao } from "@/lib/auth/sessao";
import type { Area } from "@/modules/usuarios/permissoes";
import { ErroDominio } from "@/lib/errors";
import { lancamentoNoCaixa, pagamentoNoCaixa } from "@/modules/financeiro/caixa.regras";
import { esquemasFerramentas, nomeFerramentaSchema, type NomeFerramenta } from "./assistente.schemas";
import { podeConsultar } from "./assistente.acesso";
import { diaDaLoja, deslocarDia, inicioDiaLoja, intervaloPeriodo } from "./assistente.periodos";
import { FalhaProvedor, type DefinicaoFerramenta } from "./provedores/provedor";

// Planos gratuitos podem usar conteúdo para melhorar produtos. Não selecionamos
// clientes, fornecedores, observações ou descrições de contas. Registros usam números.
// Dinheiro permanece Decimal até virar texto, sem perda por conversão para float.
const moeda = (v: Prisma.Decimal | null) => `R$ ${(v ?? new Prisma.Decimal(0)).toFixed(2).replace(".", ",")}`;
const decimal = (v: Prisma.Decimal | null) => v ?? new Prisma.Decimal(0);
const LIMITE = 30;
type Contexto = { sessao: Sessao; agora: Date; sinal: AbortSignal };
const conferirPrazo = (ctx: Contexto) => ctx.sinal.throwIfAborted();

function definir<S extends z.ZodType>(nome: NomeFerramenta, area: Area, descricao: string, schema: S,
  consultar: (p: z.output<S>, ctx: Contexto) => Promise<unknown>) {
  const { $schema: versao, ...parametros } = z.toJSONSchema(schema, { io: "input" });
  void versao;
  return {
    area,
    definicao: { nome, descricao, parametros } satisfies DefinicaoFerramenta,
    preparar(argumentos: unknown) {
      const p = schema.safeParse(argumentos);
      if (!p.success) throw new FalhaProvedor("resposta_invalida");
      return {
        // Zod reconstrói objetos na ordem do schema e aplica defaults: chave canônica.
        chave: `${nome}:${JSON.stringify(p.data)}`,
        async executar(ctx: Contexto) {
          conferirPrazo(ctx);
          const permissao = await exigirPermissao(area, "ver");
          if (!permissao.ok) throw new ErroDominio(permissao.error.code, permissao.error.message);
          if (permissao.data.usuarioId !== ctx.sessao.usuarioId) throw new ErroDominio("SEM_PERMISSAO", "Sessão alterada. Entre novamente.");
          try {
            const resultado = await consultar(p.data, { ...ctx, sessao: permissao.data });
            conferirPrazo(ctx);
            const texto = JSON.stringify(resultado);
            if (texto.length > 24_000) throw new ErroDominio("REGRA_NEGOCIO", "Consulta muito ampla. Refine os filtros.");
            return texto;
          } catch (erro) {
            if (erro instanceof ErroDominio || ctx.sinal.aborted) throw erro;
            // Não registrar erro bruto do Prisma: pode incluir parâmetros e dados pessoais.
            console.error("[assistente.consulta]", { ferramenta: nome, motivo: "falha_consulta" });
            throw new ErroDominio("ERRO_INTERNO", "Não foi possível consultar os dados da loja. Tente novamente.");
          }
        },
      };
    },
  };
}

const selecaoPeca = { id: true, sku: true, nome: true, categoria: true, minimo: true, precoTabela: true, precoPromocional: true } satisfies Prisma.PecaSelect;
function pecaPublica(p: Prisma.PecaGetPayload<{ select: typeof selecaoPeca }>, saldo: number) {
  const promocional = p.precoPromocional;
  const preco = promocional && (!p.precoTabela || promocional.lt(p.precoTabela)) ? promocional : p.precoTabela;
  return { sku: p.sku, nome: p.nome.slice(0, 120), categoria: p.categoria.slice(0, 80), saldo, minimo: p.minimo, preco: preco ? moeda(preco) : "Não informado" };
}

export const ferramentas = {
  buscarEstoque: definir("buscarEstoque", "pecas", "Lista peças ou insumos e seus saldos atuais. Filtros zeradas e acabando. No máximo 30 registros; não é o total do catálogo.", esquemasFerramentas.buscarEstoque, async (p, ctx) => {
    const where: Prisma.PecaWhereInput = {
      arquivada: false, tipo: p.filtro === "insumos" ? "INSUMO" : "PECA",
      ...(p.busca ? { OR: [{ nome: { contains: p.busca, mode: "insensitive" } }, { sku: { contains: p.busca, mode: "insensitive" } }, { categoria: { contains: p.busca, mode: "insensitive" } }] } : {}),
    };
    const itens: ReturnType<typeof pecaPublica>[] = [];
    let cursor: string | undefined;
    // Pagina o catálogo e agrega movimentos por lote, sem N+1. O filtro de
    // saldo vem ANTES do limite da resposta, incluindo peças sem movimentos.
    while (itens.length <= LIMITE) {
      conferirPrazo(ctx);
      const lote = await prisma.peca.findMany({ where, select: selecaoPeca, orderBy: { id: "asc" }, take: 200, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
      if (!lote.length) break;
      conferirPrazo(ctx);
      const saldos = await prisma.movimentoEstoque.groupBy({ by: ["pecaId"], where: { pecaId: { in: lote.map((i) => i.id) } }, _sum: { delta: true }, orderBy: { pecaId: "asc" }, take: 200 });
      const porPeca = new Map(saldos.map((s) => [s.pecaId, s._sum.delta ?? 0]));
      for (const item of lote) {
        const saldo = porPeca.get(item.id) ?? 0;
        if (p.filtro === "zeradas" && saldo > 0) continue;
        if (p.filtro === "acabando" && (saldo <= 0 || saldo > item.minimo)) continue;
        itens.push(pecaPublica(item, saldo));
        if (itens.length > LIMITE) break;
      }
      if (lote.length < 200) break;
      cursor = lote[lote.length - 1].id;
    }
    return { posicao: diaDaLoja(ctx.agora), itens: itens.slice(0, LIMITE), maisResultados: itens.length > LIMITE };
  }),
  detalharPeca: definir("detalharPeca", "pecas", "Detalha uma peça pelo SKU, com saldo e preço. Custo e margem exigem acesso financeiro.", esquemasFerramentas.detalharPeca, async (p, ctx) => {
    const peca = await prisma.peca.findFirst({ where: { sku: { equals: p.sku, mode: "insensitive" } }, select: selecaoPeca });
    if (!peca) return { encontrado: false };
    conferirPrazo(ctx);
    const saldo = await prisma.movimentoEstoque.aggregate({ where: { pecaId: peca.id }, _sum: { delta: true } });
    const publico = pecaPublica(peca, saldo._sum.delta ?? 0);
    if (!veFinanceiro(ctx.sessao)) return { ...publico, posicao: diaDaLoja(ctx.agora) };
    conferirPrazo(ctx);
    const financeiro = await prisma.peca.findUnique({ where: { id: peca.id }, select: { custo: true } });
    const custo = financeiro?.custo;
    const preco = peca.precoPromocional && (!peca.precoTabela || peca.precoPromocional.lt(peca.precoTabela)) ? peca.precoPromocional : peca.precoTabela;
    return { ...publico, posicao: diaDaLoja(ctx.agora), custo: custo == null ? "Não informado" : moeda(custo), margem: custo != null && preco?.gt(0) ? `${preco.minus(custo).div(preco).mul(100).toFixed(2)}%` : "Não disponível" };
  }),
  resumirVendas: definir("resumirVendas", "vendas", "Faturamento líquido registrado, quantidade de vendas e ticket médio no período, excluindo canceladas. Ranking de 10 peças por unidades líquidas de devoluções.", esquemasFerramentas.resumirVendas, async (p, ctx) => {
    const periodo = intervaloPeriodo(p, ctx.agora);
    const where: Prisma.VendaWhereInput = { status: { not: "CANCELADA" }, data: periodo.janela };
    const total = await prisma.venda.aggregate({ where, _sum: { total: true }, _count: true });
    let ultima: string | undefined;
    let ranking: { pecaId: string; unidades: number }[] = [];
    while (true) {
      conferirPrazo(ctx);
      const lote = await prisma.itemVenda.groupBy({ by: ["pecaId"], where: { venda: where, ...(ultima ? { pecaId: { gt: ultima } } : {}) }, _sum: { quantidade: true, devolvido: true }, orderBy: { pecaId: "asc" }, take: 200 });
      ranking = [...ranking, ...lote.map((i) => ({ pecaId: i.pecaId, unidades: (i._sum.quantidade ?? 0) - (i._sum.devolvido ?? 0) }))].filter((i) => i.unidades > 0).sort((a, b) => b.unidades - a.unidades || a.pecaId.localeCompare(b.pecaId)).slice(0, 10);
      if (lote.length < 200) break;
      ultima = lote[lote.length - 1].pecaId;
    }
    conferirPrazo(ctx);
    const pecas = await prisma.peca.findMany({ where: { id: { in: ranking.map((r) => r.pecaId) } }, select: { id: true, sku: true, nome: true }, take: 10 });
    return { periodo: periodo.rotulo, quantidadeVendas: total._count, faturamento: moeda(total._sum.total), ticketMedio: moeda(total._count ? decimal(total._sum.total).div(total._count) : null), maisVendidas: ranking.map((r) => { const item = pecas.find((i) => i.id === r.pecaId); return { sku: item?.sku, nome: item?.nome.slice(0, 120), unidades: r.unidades }; }) };
  }),
  listarOrcamentosAbertos: definir("listarOrcamentosAbertos", "vendas", "Orçamentos ABERTOS emitidos no período, com total e validade; inclui vencidos se solicitado. Sem dados de clientes.", esquemasFerramentas.listarOrcamentosAbertos, async (p, ctx) => {
    const periodo = intervaloPeriodo(p, ctx.agora);
    const where: Prisma.OrcamentoWhereInput = { status: "ABERTO", data: periodo.janela, ...(!p.incluirVencidos ? { OR: [{ validoAte: null }, { validoAte: { gte: inicioDiaLoja(diaDaLoja(ctx.agora)) } }] } : {}) };
    const [itens, total] = await Promise.all([
      prisma.orcamento.findMany({ where, select: { numero: true, total: true, validoAte: true }, orderBy: [{ validoAte: "asc" }, { numero: "asc" }], take: LIMITE }),
      prisma.orcamento.aggregate({ where, _count: true, _sum: { total: true } }),
    ]);
    return { periodo: periodo.rotulo, quantidade: total._count, total: moeda(total._sum.total), maisResultados: total._count > itens.length, itens: itens.map((i) => ({ numero: i.numero, total: moeda(i.total), validade: i.validoAte ? diaDaLoja(i.validoAte) : null })) };
  }),
  resumirFinanceiro: definir("resumirFinanceiro", "financeiro", "Saldo atual do caixa, entradas e saídas realizadas no período e totais de contas abertas com vencimento no período. Respeita comprovantes e exclui cartões do saldo.", esquemasFerramentas.resumirFinanceiro, async (p, ctx) => {
    const periodo = intervaloPeriodo(p, ctx.agora);
    const ateHoje = { lt: inicioDiaLoja(deslocarDia(diaDaLoja(ctx.agora), 1)) };
    const carteira: Prisma.CarteiraWhereInput = { arquivada: false, tipo: { not: "CARTAO" } };
    const lancWhere: Prisma.LancamentoWhereInput = { AND: [lancamentoNoCaixa, { OR: [{ carteiraId: null }, { carteira }] }] };
    const pagWhere: Prisma.PagamentoWhereInput = { AND: [pagamentoNoCaixa, { OR: [{ carteiraId: null }, { carteira }] }], venda: { status: { not: "CANCELADA" } } };
    const [inicial, lanc, pagos, saiu, entrou, entradasPeriodo, saidasPeriodo, pagamentosPeriodo, pagar, receber] = await Promise.all([
      prisma.carteira.aggregate({ where: carteira, _sum: { saldoInicial: true } }),
      prisma.lancamento.aggregate({ where: { ...lancWhere, data: ateHoje }, _sum: { valor: true } }),
      prisma.pagamento.aggregate({ where: { ...pagWhere, data: ateHoje }, _sum: { valor: true } }),
      prisma.transferencia.aggregate({ where: { origem: carteira, data: ateHoje }, _sum: { valor: true } }),
      prisma.transferencia.aggregate({ where: { destino: carteira, data: ateHoje }, _sum: { valor: true } }),
      prisma.lancamento.aggregate({ where: { ...lancWhere, data: periodo.janela, valor: { gt: 0 } }, _sum: { valor: true } }),
      prisma.lancamento.aggregate({ where: { ...lancWhere, data: periodo.janela, valor: { lt: 0 } }, _sum: { valor: true } }),
      prisma.pagamento.aggregate({ where: { ...pagWhere, data: periodo.janela }, _sum: { valor: true } }),
      prisma.conta.aggregate({ where: { tipo: "PAGAR", status: "ABERTA", vencimento: periodo.janela }, _sum: { valor: true }, _count: true }),
      prisma.conta.aggregate({ where: { tipo: "RECEBER", status: "ABERTA", vencimento: periodo.janela }, _sum: { valor: true }, _count: true }),
    ]);
    const saldo = decimal(inicial._sum.saldoInicial).plus(decimal(lanc._sum.valor)).plus(decimal(pagos._sum.valor)).minus(decimal(saiu._sum.valor)).plus(decimal(entrou._sum.valor));
    return { periodo: periodo.rotulo, posicaoCaixa: diaDaLoja(ctx.agora), saldoCaixa: moeda(saldo), entradasPeriodo: moeda(decimal(entradasPeriodo._sum.valor).plus(decimal(pagamentosPeriodo._sum.valor))), saidasPeriodo: moeda(decimal(saidasPeriodo._sum.valor).abs()), aPagar: moeda(pagar._sum.valor), contasAPagar: pagar._count, aReceber: moeda(receber._sum.valor), contasAReceber: receber._count };
  }),
  listarContas: definir("listarContas", "financeiro", "Contas abertas a pagar/receber. Filtra vencimento no período, todas vencidas até ontem ou próximos 7 dias. Usa rótulos sem nomes ou descrições.", esquemasFerramentas.listarContas, async (p, ctx) => {
    const periodo = intervaloPeriodo(p, ctx.agora);
    const hoje = diaDaLoja(ctx.agora);
    const vencimento = p.situacao === "vencidas" ? { lt: inicioDiaLoja(hoje) } : p.situacao === "proximos7dias" ? { gte: inicioDiaLoja(hoje), lt: inicioDiaLoja(deslocarDia(hoje, 7)) } : periodo.janela;
    const where: Prisma.ContaWhereInput = { status: "ABERTA", ...(p.tipo === "ambos" ? {} : { tipo: p.tipo }), vencimento };
    const [itens, quantidade] = await Promise.all([
      prisma.conta.findMany({ where, select: { tipo: true, valor: true, vencimento: true, parcela: true, venda: { select: { numero: true } }, compra: { select: { numero: true } } }, orderBy: [{ vencimento: "asc" }, { id: "asc" }], take: LIMITE }),
      prisma.conta.count({ where }),
    ]);
    return { periodo: p.situacao === "vencidas" ? `Vencidas até ${deslocarDia(hoje, -1)}` : p.situacao === "proximos7dias" ? `${hoje} a ${deslocarDia(hoje, 6)}` : periodo.rotulo, quantidade, maisResultados: quantidade > itens.length, itens: itens.map((i, indice) => ({ registro: i.venda ? `Venda #${i.venda.numero}` : i.compra ? `Compra #${i.compra.numero}` : `Conta ${indice + 1} desta consulta`, tipo: i.tipo, valor: moeda(i.valor), vencimento: diaDaLoja(i.vencimento), parcela: i.parcela })) };
  }),
  resumirCompras: definir("resumirCompras", "pecas", "Quantidade de compras e unidades recebidas no período. Valores apenas com permissão financeira; não retorna fornecedores.", esquemasFerramentas.resumirCompras, async (p, ctx) => {
    const periodo = intervaloPeriodo(p, ctx.agora);
    const where = { data: periodo.janela };
    const [quantidade, unidades, itens] = await Promise.all([
      prisma.compra.count({ where }),
      prisma.itemCompra.aggregate({ where: { compra: where }, _sum: { quantidade: true } }),
      prisma.compra.findMany({ where, select: { numero: true, data: true }, orderBy: [{ data: "desc" }, { numero: "desc" }], take: LIMITE }),
    ]);
    const publico = { periodo: periodo.rotulo, quantidade, unidades: unidades._sum.quantidade ?? 0, maisResultados: quantidade > itens.length, itens: itens.map((i) => ({ numero: i.numero, data: diaDaLoja(i.data) })) };
    if (!veFinanceiro(ctx.sessao)) return publico;
    conferirPrazo(ctx);
    const total = await prisma.compra.aggregate({ where, _sum: { total: true } });
    return { ...publico, total: moeda(total._sum.total) };
  }),
};

export function ferramentasPermitidas(sessao: Sessao): DefinicaoFerramenta[] {
  return Object.values(ferramentas).filter((f) => podeConsultar(sessao, f.area)).map((f) => f.definicao);
}
export function prepararFerramenta(nome: string, argumentos: unknown, sessao: Sessao) {
  const nomeValido = nomeFerramentaSchema.safeParse(nome);
  if (!nomeValido.success) throw new FalhaProvedor("resposta_invalida");
  const ferramenta = ferramentas[nomeValido.data];
  if (!podeConsultar(sessao, ferramenta.area)) throw new ErroDominio("SEM_PERMISSAO", "Você não tem acesso aos dados solicitados.");
  return ferramenta.preparar(argumentos);
}
