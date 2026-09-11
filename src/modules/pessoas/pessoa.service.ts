import "server-only";

import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { NaoEncontrado } from "@/lib/errors";
import type {
  ClienteDados,
  ClienteLinha,
  FiltroCliente,
  FornecedorDados,
  FornecedorLinha,
} from "./pessoa.schema";

/*
 * Portado de `viewClientes` e `viewFornecedores` do app antigo.
 *
 * Lá o app carregava TUDO na memória do navegador (`S.clientes`, `S.vendas`)
 * e filtrava em JavaScript. Aqui os mesmos números saem de agregação no
 * banco: o resultado é idêntico, mas não depende de baixar a base inteira
 * para o celular do João.
 */

/** Padrão do app antigo (`cfg().diasParado`). Mora em Config, editável. */
const DIAS_PARADO_PADRAO = 60;

export async function diasParado(): Promise<number> {
  const c = await prisma.config.findUnique({ where: { chave: "diasParado" } });
  const n = Number(c?.valor);
  return Number.isFinite(n) && n > 0 ? n : DIAS_PARADO_PADRAO;
}

const diasEntre = (de: Date, ate: Date) =>
  Math.floor((ate.getTime() - de.getTime()) / 86_400_000);

/** Aniversário no mês corrente — filtro "Aniversariantes". */
function fazAniversarioNoMes(nascimento: string | null, hoje = new Date()): boolean {
  if (!nascimento) return false;
  const mes = Number(nascimento.slice(5, 7));
  return mes === hoje.getMonth() + 1;
}

/*
 * Monta o OR da busca. Campo de documento e telefone SÓ entram quando o
 * termo tem dígito: procurar "maria" dentro de um CPF não faz sentido e
 * ainda obriga o banco a varrer a coluna à toa.
 */
function filtroBusca(busca: string | undefined, texto: string[], digitos: string[]) {
  const q = busca?.trim();
  if (!q) return undefined;

  const ou: Array<Record<string, unknown>> = texto.map((campo) => ({
    [campo]: { contains: q, mode: "insensitive" },
  }));

  const d = q.replace(/\D/g, "");
  if (d.length >= 3) for (const campo of digitos) ou.push({ [campo]: { contains: d } });

  return { OR: ou };
}

/* ══════════════════════════ CLIENTES ══════════════════════════ */

export async function listarClientes(opcoes: {
  busca?: string;
  filtro?: FiltroCliente;
}): Promise<{ linhas: ClienteLinha[]; limite: number }> {
  const { busca, filtro = "todos" } = opcoes;
  const limite = await diasParado();
  const hoje = new Date();

  const where = (filtroBusca(busca, ["nome", "fantasia"], ["doc", "telefone"]) ??
    {}) as Prisma.ClienteWhereInput;

  const clientes = await prisma.cliente.findMany({
    where,
    select: {
      id: true,
      nome: true,
      tipo: true,
      doc: true,
      telefone: true,
      nascimento: true,
    },
    orderBy: { nome: "asc" },
  });
  if (clientes.length === 0) return { linhas: [], limite };

  const ids = clientes.map((c) => c.id);

  // Uma agregação para o total comprado e a data da última compra, em vez de
  // uma consulta por cliente.
  const [gastos, ultimas, emAberto] = await Promise.all([
    prisma.venda.groupBy({
      by: ["clienteId"],
      where: { clienteId: { in: ids }, status: { not: "CANCELADA" } },
      _sum: { total: true },
    }),
    prisma.venda.groupBy({
      by: ["clienteId"],
      where: { clienteId: { in: ids }, status: { not: "CANCELADA" } },
      _max: { criadoEm: true },
    }),
    // "Devendo": venda fechada cujos pagamentos não cobrem o total.
    prisma.venda.findMany({
      where: { clienteId: { in: ids }, status: "FECHADA" },
      select: { clienteId: true, total: true, pagamentos: { select: { valor: true } } },
    }),
  ]);

  const porGasto = new Map(gastos.map((g) => [g.clienteId, Number(g._sum.total ?? 0)]));
  const porUltima = new Map(ultimas.map((u) => [u.clienteId, u._max.criadoEm]));

  const devedores = new Set<string>();
  for (const v of emAberto) {
    const pago = v.pagamentos.reduce((s, p) => s + Number(p.valor), 0);
    if (v.clienteId && pago < Number(v.total) - 0.005) devedores.add(v.clienteId);
  }

  let linhas: ClienteLinha[] = clientes.map((c) => {
    const ultima = porUltima.get(c.id) ?? null;
    return {
      id: c.id,
      nome: c.nome,
      tipo: c.tipo,
      doc: c.doc,
      telefone: c.telefone,
      nascimento: c.nascimento,
      diasSemComprar: ultima ? diasEntre(ultima, hoje) : null,
      totalComprado: porGasto.get(c.id) ?? 0,
      devendo: devedores.has(c.id),
      aniversarianteNoMes: fazAniversarioNoMes(c.nascimento, hoje),
    };
  });

  // Os mesmos seis filtros do app antigo, na mesma ordem.
  if (filtro === "pf") linhas = linhas.filter((c) => c.tipo === "PF");
  else if (filtro === "pj") linhas = linhas.filter((c) => c.tipo === "PJ");
  else if (filtro === "devendo") linhas = linhas.filter((c) => c.devendo);
  else if (filtro === "parado")
    linhas = linhas.filter((c) => c.diasSemComprar !== null && c.diasSemComprar >= limite);
  else if (filtro === "aniversario") linhas = linhas.filter((c) => c.aniversarianteNoMes);

  return { linhas, limite };
}

/** Os 4 indicadores do topo da tela de clientes. */
export async function indicadoresClientes() {
  const limite = await diasParado();
  const hoje = new Date();
  const todos = await listarClientes({});

  const parados = todos.linhas.filter(
    (c) => c.diasSemComprar !== null && c.diasSemComprar >= limite,
  );
  const niver = todos.linhas.filter((c) => c.aniversarianteNoMes);
  const empresas = todos.linhas.filter((c) => c.tipo === "PJ");

  // "A receber": vendas fechadas com saldo, agrupadas por cliente.
  const vendas = await prisma.venda.findMany({
    where: { status: "FECHADA" },
    select: {
      id: true,
      criadoEm: true,
      total: true,
      clienteId: true,
      cliente: { select: { nome: true } },
      pagamentos: { select: { valor: true } },
    },
    orderBy: { criadoEm: "asc" },
  });

  const aberto = vendas
    .map((v) => ({
      ...v,
      saldo: Number(v.total) - v.pagamentos.reduce((s, p) => s + Number(p.valor), 0),
    }))
    .filter((v) => v.saldo > 0.005);

  const porCliente = new Map<string, { nome: string; qtd: number; total: number; maisAntiga: Date }>();
  for (const v of aberto) {
    const chave = v.clienteId ?? "_";
    const atual = porCliente.get(chave);
    if (atual) {
      atual.qtd++;
      atual.total += v.saldo;
    } else {
      porCliente.set(chave, {
        nome: v.cliente?.nome ?? "Sem cliente",
        qtd: 1,
        total: v.saldo,
        maisAntiga: v.criadoEm,
      });
    }
  }

  return {
    total: todos.linhas.length,
    empresas: empresas.length,
    parados: parados.length,
    limiteParado: limite,
    aniversariantes: niver.length,
    aReceberValor: aberto.reduce((s, v) => s + v.saldo, 0),
    aReceberVendas: aberto.length,
    aReceberPorCliente: [...porCliente.entries()]
      .map(([id, v]) => ({ id, ...v }))
      .sort((a, b) => b.total - a.total),
    hoje,
  };
}

export async function buscarCliente(id: string) {
  const c = await prisma.cliente.findUnique({ where: { id } });
  if (!c) throw new NaoEncontrado("Cliente");
  return c;
}

export async function criarCliente(dados: ClienteDados) {
  return prisma.cliente.create({ data: paraBanco(dados), select: { id: true, nome: true } });
}

export async function editarCliente(id: string, dados: ClienteDados) {
  await buscarCliente(id);
  return prisma.cliente.update({ where: { id }, data: paraBanco(dados), select: { id: true } });
}

export async function excluirCliente(id: string) {
  const vendas = await prisma.venda.count({ where: { clienteId: id } });
  if (vendas > 0) {
    // Mesma regra do app antigo: cliente com histórico não some — o vínculo
    // da venda é solto e o cadastro é removido.
    await prisma.venda.updateMany({ where: { clienteId: id }, data: { clienteId: null } });
  }
  return prisma.cliente.delete({ where: { id }, select: { id: true, nome: true } });
}

function paraBanco(d: ClienteDados) {
  return {
    tipo: d.tipo,
    nome: d.nome,
    // Nome fantasia só existe para empresa.
    fantasia: d.tipo === "PJ" ? (d.fantasia ?? null) : null,
    doc: d.doc ?? null,
    telefone: d.telefone ?? null,
    email: d.email ?? null,
    nascimento: d.nascimento ?? null,
    cep: d.cep ?? null,
    logradouro: d.logradouro ?? null,
    numero: d.numero ?? null,
    complemento: d.complemento ?? null,
    bairro: d.bairro ?? null,
    cidade: d.cidade ?? null,
    uf: d.uf ?? null,
    observacoes: d.observacoes ?? null,
  };
}

/* ══════════════════════════ FORNECEDORES ══════════════════════════ */

export async function listarFornecedores(busca?: string): Promise<FornecedorLinha[]> {
  const where = (filtroBusca(busca, ["nome", "fantasia", "cidade"], ["doc", "telefone"]) ??
    {}) as Prisma.FornecedorWhereInput;

  const forn = await prisma.fornecedor.findMany({
    where,
    select: {
      id: true,
      nome: true,
      fantasia: true,
      doc: true,
      telefone: true,
      cidade: true,
      uf: true,
      _count: { select: { compras: true } },
    },
    orderBy: { nome: "asc" },
  });
  if (forn.length === 0) return [];

  const ids = forn.map((f) => f.id);
  const contas = await prisma.conta.groupBy({
    by: ["fornecedorId"],
    where: { fornecedorId: { in: ids }, status: "ABERTA", tipo: "PAGAR" },
    _sum: { valor: true },
  });
  const porForn = new Map(contas.map((c) => [c.fornecedorId, Number(c._sum.valor ?? 0)]));

  return forn.map((f) => ({
    id: f.id,
    nome: f.nome,
    fantasia: f.fantasia,
    doc: f.doc,
    telefone: f.telefone,
    cidade: f.cidade,
    uf: f.uf,
    aPagar: porForn.get(f.id) ?? 0,
    compras: f._count.compras,
  }));
}

export async function indicadoresFornecedores() {
  const [total, compras, contas] = await Promise.all([
    prisma.fornecedor.count(),
    prisma.compra.count(),
    prisma.conta.groupBy({
      by: ["fornecedorId"],
      where: { status: "ABERTA", tipo: "PAGAR", fornecedorId: { not: null } },
      _sum: { valor: true },
    }),
  ]);
  return {
    total,
    compras,
    aPagarValor: contas.reduce((s, c) => s + Number(c._sum.valor ?? 0), 0),
    comSaldo: contas.length,
  };
}

export async function buscarFornecedor(id: string) {
  const f = await prisma.fornecedor.findUnique({ where: { id } });
  if (!f) throw new NaoEncontrado("Fornecedor");
  return f;
}

export async function criarFornecedor(dados: FornecedorDados) {
  return prisma.fornecedor.create({
    data: {
      tipo: dados.tipo,
      nome: dados.nome,
      fantasia: dados.tipo === "PJ" ? (dados.fantasia ?? null) : null,
      doc: dados.doc ?? null,
      telefone: dados.telefone ?? null,
      email: dados.email ?? null,
      cidade: dados.cidade ?? null,
      uf: dados.uf ?? null,
      observacoes: dados.observacoes ?? null,
    },
    select: { id: true, nome: true },
  });
}

export async function editarFornecedor(id: string, dados: FornecedorDados) {
  await buscarFornecedor(id);
  return prisma.fornecedor.update({
    where: { id },
    data: {
      tipo: dados.tipo,
      nome: dados.nome,
      fantasia: dados.tipo === "PJ" ? (dados.fantasia ?? null) : null,
      doc: dados.doc ?? null,
      telefone: dados.telefone ?? null,
      email: dados.email ?? null,
      cidade: dados.cidade ?? null,
      uf: dados.uf ?? null,
      observacoes: dados.observacoes ?? null,
    },
    select: { id: true },
  });
}

export async function excluirFornecedor(id: string) {
  return prisma.fornecedor.delete({ where: { id }, select: { id: true, nome: true } });
}
