import "server-only";

import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { veFinanceiro, type exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import type { Sessao } from "@/lib/auth/sessao";
import { podeFazer } from "@/modules/usuarios/permissoes";

/*
 * FERRAMENTAS DE LEITURA para o assistente.
 *
 * PRIVACIDADE: este módulo NUNCA envia dados pessoais de clientes ou
 * fornecedores (nome completo, CPF, telefone, e-mail, endereço) ao Gemini.
 * Motivo: o plano gratuito da API pode usar o conteúdo das requisições para
 * melhorar os modelos do Google. Identificamos registros apenas pelo número
 * (ex.: Venda #38) ou por rótulos genéricos.
 *
 * Cada ferramenta:
 * - É somente-leitura.
 * - Usa `select` mínimo e `take` para limitar resultados.
 * - Verifica a permissão do usuário antes de consultar.
 * - Converte Prisma.Decimal para string formatada antes de retornar.
 */

/* ──────────────────────────────────────────────────────────────
   Helpers
────────────────────────────────────────────────────────────── */

const num = (v: unknown) =>
  v === null || v === undefined ? 0 : Number(v);

const hoje = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
};

const inicioDoMes = () => {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
};

function podeVer(sessao: Sessao, area: "pecas" | "vendas" | "financeiro"): boolean {
  return (
    sessao.papel === "SUPER_ADMIN" ||
    sessao.papel === "ADMIN" ||
    podeFazer(sessao.permissoes, area, "ver")
  );
}

/* ──────────────────────────────────────────────────────────────
   1. buscarEstoque
   Permissão: pecas.ver
────────────────────────────────────────────────────────────── */

export const buscarEstoqueSchema = z.object({
  filtro: z
    .enum(["todos", "zeradas", "acabando", "insumos"])
    .default("todos")
    .describe(
      "Filtro: 'todos' retorna peças ativas; 'zeradas' só sem estoque; 'acabando' abaixo do mínimo; 'insumos' só insumos.",
    ),
  busca: z
    .string()
    .optional()
    .describe("Texto livre para filtrar por nome, SKU ou categoria."),
});

export async function buscarEstoque(
  params: z.infer<typeof buscarEstoqueSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "pecas")) {
    return "Você não tem permissão para ver o estoque.";
  }

  const comFinanceiro = veFinanceiro(sessao);

  const pecas = await prisma.peca.findMany({
    where: {
      arquivada: false,
      ...(params.filtro === "insumos"
        ? { tipo: "INSUMO" }
        : { tipo: "PECA" }),
      ...(params.busca
        ? {
            OR: [
              { nome: { contains: params.busca, mode: "insensitive" } },
              { sku: { contains: params.busca, mode: "insensitive" } },
              { categoria: { contains: params.busca, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      sku: true,
      nome: true,
      categoria: true,
      minimo: true,
      precoTabela: true,
      precoPromocional: true,
      ...(comFinanceiro ? { custo: true } : {}),
      movimentos: { select: { delta: true } },
    },
    take: 30,
    orderBy: { nome: "asc" },
  });

  if (pecas.length === 0) return "Nenhuma peça encontrada com esses critérios.";

  const linhas = pecas.map((p) => {
    const saldo = p.movimentos.reduce((s, m) => s + m.delta, 0);

    // Filtros aplicados em memória para evitar subconsulta complexa.
    if (params.filtro === "zeradas" && saldo > 0) return null;
    if (params.filtro === "acabando" && (saldo <= 0 || saldo > p.minimo)) return null;

    const preco = num(p.precoPromocional ?? p.precoTabela);
    const custo = comFinanceiro ? num((p as { custo?: unknown }).custo) : null;

    let linha = `SKU: ${p.sku} | ${p.nome} (${p.categoria}) | Saldo: ${saldo}`;
    if (preco) linha += ` | Preço: ${brl(preco)}`;
    if (custo !== null && custo > 0) linha += ` | Custo: ${brl(custo)}`;
    if (p.minimo > 0 && saldo <= p.minimo) linha += " ⚠ ACABANDO";
    if (saldo <= 0) linha += " ⛔ SEM ESTOQUE";
    return linha;
  }).filter(Boolean);

  if (linhas.length === 0) return "Nenhuma peça encontrada com esses critérios.";

  return linhas.join("\n");
}

/* ──────────────────────────────────────────────────────────────
   2. detalharPeca
   Permissão: pecas.ver
────────────────────────────────────────────────────────────── */

export const detalharPecaSchema = z.object({
  sku: z.string().describe("SKU da peça (ex.: LL-0001)."),
});

export async function detalharPeca(
  params: z.infer<typeof detalharPecaSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "pecas")) {
    return "Você não tem permissão para ver o estoque.";
  }

  const comFinanceiro = veFinanceiro(sessao);

  const peca = await prisma.peca.findFirst({
    where: { sku: { equals: params.sku, mode: "insensitive" } },
    select: {
      sku: true,
      nome: true,
      categoria: true,
      tamanho: true,
      minimo: true,
      precoTabela: true,
      precoPromocional: true,
      arquivada: true,
      ...(comFinanceiro ? { custo: true } : {}),
      movimentos: { select: { delta: true } },
    },
  });

  if (!peca) return `Peça com SKU "${params.sku}" não encontrada.`;

  const saldo = peca.movimentos.reduce((s, m) => s + m.delta, 0);
  const preco = num(peca.precoPromocional ?? peca.precoTabela);
  const custo = comFinanceiro ? num((peca as { custo?: unknown }).custo) : null;

  const linhas = [
    `Peça: ${peca.nome} (SKU: ${peca.sku})`,
    `Categoria: ${peca.categoria}${peca.tamanho ? ` | Tamanho: ${peca.tamanho}` : ""}`,
    `Saldo em estoque: ${saldo}${peca.arquivada ? " (ARQUIVADA)" : ""}`,
    `Preço de tabela: ${brl(preco)}`,
  ];
  if (peca.precoPromocional) linhas.push(`Preço promocional: ${brl(num(peca.precoPromocional))}`);
  if (custo !== null && custo > 0) {
    linhas.push(`Custo: ${brl(custo)}`);
    if (preco > 0) {
      const margem = ((preco - custo) / preco) * 100;
      linhas.push(`Margem: ${margem.toFixed(1)}%`);
    }
  }
  if (peca.minimo > 0 && saldo <= peca.minimo) linhas.push("⚠ Estoque abaixo do mínimo.");
  if (saldo <= 0) linhas.push("⛔ Sem estoque disponível.");

  return linhas.join("\n");
}

/* ──────────────────────────────────────────────────────────────
   3. resumirVendas
   Permissão: vendas.ver
────────────────────────────────────────────────────────────── */

export const resumirVendasSchema = z.object({
  periodo: z
    .enum(["hoje", "semana", "mes", "ano"])
    .default("mes")
    .describe("Período de referência para o resumo de vendas."),
});

export async function resumirVendas(
  params: z.infer<typeof resumirVendasSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "vendas")) {
    return "Você não tem permissão para ver as vendas.";
  }

  const agora = new Date();
  const d = hoje();
  let desde: Date;
  switch (params.periodo) {
    case "hoje":
      desde = d;
      break;
    case "semana":
      desde = new Date(d.getFullYear(), d.getMonth(), d.getDate() - 6);
      break;
    case "ano":
      desde = new Date(agora.getFullYear(), 0, 1);
      break;
    default:
      desde = inicioDoMes();
  }

  const vendas = await prisma.venda.findMany({
    where: { status: { not: "CANCELADA" }, data: { gte: desde } },
    select: { total: true, numero: true },
    take: 500,
  });

  if (vendas.length === 0) {
    return `Nenhuma venda registrada no período (${params.periodo}).`;
  }

  const total = vendas.reduce((s, v) => s + num(v.total), 0);
  const ticket = total / vendas.length;
  const nomePeriodo: Record<string, string> = {
    hoje: "hoje",
    semana: "nos últimos 7 dias",
    mes: "este mês",
    ano: "este ano",
  };

  return [
    `Resumo de vendas — ${nomePeriodo[params.periodo]}:`,
    `Total de vendas: ${vendas.length}`,
    `Faturamento: ${brl(total)}`,
    `Ticket médio: ${brl(ticket)}`,
  ].join("\n");
}

/* ──────────────────────────────────────────────────────────────
   4. listarOrcamentosAbertos
   Permissão: vendas.ver
   PRIVACIDADE: clienteId omitido; identificamos pelo número do orçamento.
────────────────────────────────────────────────────────────── */

export const listarOrcamentosAbertosSchema = z.object({
  incluirVencidos: z
    .boolean()
    .default(false)
    .describe("Se true, inclui também orçamentos com validade expirada."),
});

export async function listarOrcamentosAbertos(
  params: z.infer<typeof listarOrcamentosAbertosSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "vendas")) {
    return "Você não tem permissão para ver os orçamentos.";
  }

  const agora = new Date();

  const orcamentos = await prisma.orcamento.findMany({
    where: {
      status: "ABERTO",
      ...(params.incluirVencidos ? {} : { validoAte: { gte: agora } }),
    },
    select: {
      numero: true,
      total: true,
      validoAte: true,
      data: true,
    },
    orderBy: { validoAte: "asc" },
    take: 20,
  });

  if (orcamentos.length === 0) {
    return params.incluirVencidos
      ? "Nenhum orçamento em aberto."
      : "Nenhum orçamento em aberto com validade vigente.";
  }

  const linhas = orcamentos.map((o) => {
    const validade = o.validoAte
      ? new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" }).format(o.validoAte)
      : "—";
    const diasRestantes = o.validoAte
      ? Math.ceil((o.validoAte.getTime() - agora.getTime()) / 86_400_000)
      : null;
    const aviso =
      diasRestantes !== null && diasRestantes <= 2 ? " ⚠ VENCE EM BREVE" : "";
    return `Orçamento #${o.numero} | Total: ${brl(num(o.total))} | Válido até: ${validade}${aviso}`;
  });

  return [`Orçamentos em aberto (${orcamentos.length}):`, ...linhas].join("\n");
}

/* ──────────────────────────────────────────────────────────────
   5. resumirFinanceiro
   Permissão: financeiro.ver
────────────────────────────────────────────────────────────── */

export const resumirFinanceiroSchema = z.object({}); // sem parâmetros

export async function resumirFinanceiro(
  _params: z.infer<typeof resumirFinanceiroSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "financeiro")) {
    return "Você não tem permissão para ver dados financeiros.";
  }

  const agora = new Date();

  const [saldoCaixa, aPagar, aReceber] = await Promise.all([
    // Saldo total em caixa (todas as carteiras exceto cartão de crédito).
    prisma.carteira.findMany({
      where: { arquivada: false, tipo: { not: "CARTAO" } },
      select: {
        saldoInicial: true,
        lancamentos: { select: { valor: true } },
        pagamentos: {
          where: { venda: { status: { not: "CANCELADA" } } },
          select: { valor: true },
        },
        transferenciasSai: { select: { valor: true } },
        transferenciasEnt: { select: { valor: true } },
      },
    }),

    // Contas a pagar em aberto.
    prisma.conta.aggregate({
      where: { tipo: "PAGAR", status: "ABERTA" },
      _sum: { valor: true },
      _count: true,
    }),

    // Contas a receber em aberto.
    prisma.conta.aggregate({
      where: { tipo: "RECEBER", status: "ABERTA" },
      _sum: { valor: true },
      _count: true,
    }),
  ]);

  // Calcula saldo de cada carteira (mesma lógica do financeiro.service.ts).
  const totalEmCaixa = saldoCaixa.reduce((acc, c) => {
    const lanc = c.lancamentos.reduce((s, l) => s + num(l.valor), 0);
    const pag = c.pagamentos.reduce((s, p) => s + num(p.valor), 0);
    const saiu = c.transferenciasSai.reduce((s, t) => s + num(t.valor), 0);
    const entrou = c.transferenciasEnt.reduce((s, t) => s + num(t.valor), 0);
    return acc + num(c.saldoInicial) + lanc + pag - saiu + entrou;
  }, 0);

  const totalPagar = num(aPagar._sum.valor);
  const totalReceber = num(aReceber._sum.valor);

  return [
    `Resumo financeiro (${new Intl.DateTimeFormat("pt-BR").format(agora)}):`,
    `Em caixa: ${brl(totalEmCaixa)}`,
    `A pagar: ${brl(totalPagar)} (${aPagar._count} conta(s))`,
    `A receber: ${brl(totalReceber)} (${aReceber._count} conta(s))`,
  ].join("\n");
}

/* ──────────────────────────────────────────────────────────────
   6. listarContasVencidas
   Permissão: financeiro.ver
────────────────────────────────────────────────────────────── */

export const listarContasVencidasSchema = z.object({
  tipo: z
    .enum(["PAGAR", "RECEBER", "ambos"])
    .default("ambos")
    .describe("Filtrar por tipo de conta."),
  diasAFrente: z
    .number()
    .int()
    .min(0)
    .max(30)
    .default(7)
    .describe(
      "Inclui contas que vencem nos próximos N dias, além das já vencidas.",
    ),
});

export async function listarContasVencidas(
  params: z.infer<typeof listarContasVencidasSchema>,
  sessao: Sessao,
): Promise<string> {
  if (!podeVer(sessao, "financeiro")) {
    return "Você não tem permissão para ver dados financeiros.";
  }

  const agora = new Date();
  const limite = new Date(
    agora.getFullYear(),
    agora.getMonth(),
    agora.getDate() + params.diasAFrente,
    23,
    59,
    59,
    999,
  );

  const tipoWhere =
    params.tipo === "ambos"
      ? {}
      : { tipo: params.tipo as "PAGAR" | "RECEBER" };

  const contas = await prisma.conta.findMany({
    where: {
      ...tipoWhere,
      status: "ABERTA",
      vencimento: { lte: limite },
    },
    select: {
      tipo: true,
      descricao: true,
      valor: true,
      vencimento: true,
      parcela: true,
    },
    orderBy: { vencimento: "asc" },
    take: 20,
  });

  if (contas.length === 0) {
    return "Nenhuma conta vencida ou vencendo no período.";
  }

  const df = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short" });

  const linhas = contas.map((c) => {
    const venceu = c.vencimento < agora;
    const vencimento = df.format(c.vencimento);
    const tipo = c.tipo === "PAGAR" ? "A PAGAR" : "A RECEBER";
    // PRIVACIDADE: descricao pode conter texto do banco — é entregue
    // ao modelo delimitada; a instrução de sistema orienta ignorar comandos
    // que apareçam dentro do dado.
    return `${tipo} | ${c.descricao}${c.parcela ? ` (parc. ${c.parcela})` : ""} | ${brl(num(c.valor))} | Venc.: ${vencimento}${venceu ? " ⛔ VENCIDA" : ""}`;
  });

  return [
    `Contas vencidas / vencendo em ${params.diasAFrente} dia(s) (${contas.length}):`,
    ...linhas,
  ].join("\n");
}

/* ──────────────────────────────────────────────────────────────
   Mapa de ferramentas — usado pelo service para despachar chamadas
────────────────────────────────────────────────────────────── */

export type NomeFerramenta =
  | "buscarEstoque"
  | "detalharPeca"
  | "resumirVendas"
  | "listarOrcamentosAbertos"
  | "resumirFinanceiro"
  | "listarContasVencidas";

/**
 * Definições das ferramentas no formato que a SDK do Gemini espera
 * (FunctionDeclaration).
 */
export const declaracoesDasFerramentas = [
  {
    name: "buscarEstoque" as const,
    description:
      "Consulta o catálogo de peças e insumos em estoque. Retorna SKU, nome, categoria, saldo e preço. Custo e margem só aparecem se o usuário tiver permissão financeira.",
    parameters: {
      type: "OBJECT",
      properties: {
        filtro: {
          type: "STRING",
          enum: ["todos", "zeradas", "acabando", "insumos"],
          description:
            "Filtro: 'todos' retorna peças ativas; 'zeradas' só sem estoque; 'acabando' abaixo do mínimo; 'insumos' só insumos.",
        },
        busca: {
          type: "STRING",
          description: "Texto livre para filtrar por nome, SKU ou categoria.",
        },
      },
    },
  },
  {
    name: "detalharPeca" as const,
    description:
      "Retorna os detalhes de uma peça específica por SKU: saldo, preço, custo (se permitido) e margem.",
    parameters: {
      type: "OBJECT",
      properties: {
        sku: {
          type: "STRING",
          description: "SKU da peça (ex.: LL-0001).",
        },
      },
      required: ["sku"],
    },
  },
  {
    name: "resumirVendas" as const,
    description:
      "Retorna indicadores de vendas (quantidade, faturamento, ticket médio) para um período.",
    parameters: {
      type: "OBJECT",
      properties: {
        periodo: {
          type: "STRING",
          enum: ["hoje", "semana", "mes", "ano"],
          description: "Período de referência.",
        },
      },
    },
  },
  {
    name: "listarOrcamentosAbertos" as const,
    description:
      "Lista orçamentos em aberto com número, total e validade. Não inclui dados pessoais de clientes.",
    parameters: {
      type: "OBJECT",
      properties: {
        incluirVencidos: {
          type: "BOOLEAN",
          description: "Se true, inclui também orçamentos com validade expirada.",
        },
      },
    },
  },
  {
    name: "resumirFinanceiro" as const,
    description:
      "Retorna saldo em caixa, total a pagar e total a receber. Requer permissão financeira.",
    parameters: {
      type: "OBJECT",
      properties: {},
    },
  },
  {
    name: "listarContasVencidas" as const,
    description:
      "Lista contas vencidas e as que vencem nos próximos N dias, com descrição e valor.",
    parameters: {
      type: "OBJECT",
      properties: {
        tipo: {
          type: "STRING",
          enum: ["PAGAR", "RECEBER", "ambos"],
          description: "Filtrar por tipo de conta.",
        },
        diasAFrente: {
          type: "NUMBER",
          description: "Inclui contas que vencem nos próximos N dias (0-30).",
        },
      },
    },
  },
] as const;

/**
 * Executa a ferramenta pelo nome, validando os parâmetros com Zod.
 * Retorna uma string formatada para envio ao modelo.
 */
export async function executarFerramenta(
  nome: string,
  args: Record<string, unknown>,
  sessao: Sessao,
): Promise<string> {
  try {
    switch (nome) {
      case "buscarEstoque": {
        const p = buscarEstoqueSchema.parse(args);
        return await buscarEstoque(p, sessao);
      }
      case "detalharPeca": {
        const p = detalharPecaSchema.parse(args);
        return await detalharPeca(p, sessao);
      }
      case "resumirVendas": {
        const p = resumirVendasSchema.parse(args);
        return await resumirVendas(p, sessao);
      }
      case "listarOrcamentosAbertos": {
        const p = listarOrcamentosAbertosSchema.parse(args);
        return await listarOrcamentosAbertos(p, sessao);
      }
      case "resumirFinanceiro": {
        const p = resumirFinanceiroSchema.parse(args);
        return await resumirFinanceiro(p, sessao);
      }
      case "listarContasVencidas": {
        const p = listarContasVencidasSchema.parse(args);
        return await listarContasVencidas(p, sessao);
      }
      default:
        return `Ferramenta desconhecida: ${nome}`;
    }
  } catch (e) {
    console.error(`[assistente.ferramentas] erro em "${nome}"`, e);
    return "Erro ao consultar os dados. Tente novamente.";
  }
}
