/*
 * Dados de demonstração, para dar o que olhar nas telas.
 *
 *   npx tsx scripts/dados-demo.ts            cria
 *   npx tsx scripts/dados-demo.ts --limpar   remove TUDO que este script criou
 *
 * Tudo que ele cria leva o prefixo DEMO- no SKU e no nome do fornecedor, e a
 * limpeza só apaga o que casa com esse prefixo — nunca dado de verdade.
 */
import { prisma } from "../src/lib/prisma";
import { calcularCusto } from "../src/modules/pecas/peca.service";

const MARCA = "DEMO-";

type Modelo = {
  nome: string;
  categoria: string;
  tamanho?: string;
  codigo: number;
  fator: number;
  preco: number;
  entrada: number;
  saida?: number;
};

const MODELOS: Modelo[] = [
  { nome: "Anel Solitário Zircônia", categoria: "Anéis", tamanho: "16", codigo: 25, fator: 4.5, preco: 189.9, entrada: 12, saida: 3 },
  { nome: "Anel Aparador Cravejado", categoria: "Anéis", tamanho: "18", codigo: 18, fator: 4.5, preco: 139.9, entrada: 8, saida: 1 },
  { nome: "Brinco Gota Cristal", categoria: "Brincos", codigo: 22, fator: 4.2, preco: 159.9, entrada: 15, saida: 6 },
  { nome: "Brinco Argola Média", categoria: "Brincos", codigo: 14, fator: 4.5, preco: 109.9, entrada: 20, saida: 11 },
  { nome: "Colar Ponto de Luz", categoria: "Colares", tamanho: "45cm", codigo: 30, fator: 4.0, preco: 219.9, entrada: 6, saida: 2 },
  { nome: "Corrente Veneziana", categoria: "Correntes", tamanho: "50cm", codigo: 28, fator: 4.3, preco: 199.9, entrada: 10, saida: 4 },
  { nome: "Pulseira Riviera", categoria: "Pulseiras", tamanho: "18cm", codigo: 35, fator: 4.1, preco: 249.9, entrada: 5 },
  { nome: "Pingente Coração", categoria: "Pingentes", codigo: 12, fator: 4.6, preco: 99.9, entrada: 18, saida: 9 },
  { nome: "Conjunto Pérola", categoria: "Conjuntos", codigo: 48, fator: 3.9, preco: 329.9, entrada: 4, saida: 1 },
  { nome: "Anel Falange Liso", categoria: "Anéis", tamanho: "14", codigo: 9, fator: 4.8, preco: 79.9, entrada: 25, saida: 14 },
];

const INSUMOS = [
  { nome: "Caixinha de veludo", categoria: "Embalagem", codigo: 4.5, fator: 2, preco: 0, entrada: 200, saida: 51 },
  { nome: "Sacola kraft pequena", categoria: "Embalagem", codigo: 1.2, fator: 2, preco: 0, entrada: 300, saida: 51 },
];

async function limpar() {
  const pecas = await prisma.peca.findMany({
    where: { sku: { startsWith: MARCA } },
    select: { id: true, sku: true },
  });
  for (const p of pecas) {
    await prisma.movimentoEstoque.deleteMany({ where: { pecaId: p.id } });
  }
  const { count } = await prisma.peca.deleteMany({ where: { sku: { startsWith: MARCA } } });
  const forn = await prisma.fornecedor.deleteMany({ where: { nome: { startsWith: MARCA } } });
  const cli = await prisma.cliente.deleteMany({ where: { nome: { startsWith: MARCA } } });
  console.log(`removidos: ${count} itens, ${forn.count} fornecedor, ${cli.count} clientes`);
}

async function criar() {
  // `nome` não é único no schema, então upsert não serve aqui: procura e cria.
  const nomeFornecedor = `${MARCA}Fornecedor Exemplo`;
  const fornecedor =
    (await prisma.fornecedor.findFirst({ where: { nome: nomeFornecedor }, select: { id: true } })) ??
    (await prisma.fornecedor.create({ data: { nome: nomeFornecedor }, select: { id: true } }));

  let n = 0;
  const todos = [
    ...MODELOS.map((m) => ({ ...m, tipo: "PECA" as const })),
    ...INSUMOS.map((m) => ({ ...m, tamanho: undefined, tipo: "INSUMO" as const })),
  ];

  for (const m of todos) {
    n++;
    const sku = `${MARCA}${String(n).padStart(4, "0")}`;
    const existe = await prisma.peca.findUnique({ where: { sku }, select: { id: true } });
    if (existe) continue;

    const peca = await prisma.peca.create({
      data: {
        sku,
        nome: m.nome,
        categoria: m.categoria,
        tipo: m.tipo,
        tamanho: m.tamanho ?? null,
        codigoFornecedor: m.codigo,
        fator: m.fator,
        custo: calcularCusto(m.codigo, m.fator),
        precoTabela: m.preco || null,
        fornecedorId: fornecedor.id,
      },
      select: { id: true },
    });

    // Regra 2.4: o saldo nasce de movimentos, nunca de um campo.
    await prisma.movimentoEstoque.create({
      data: { pecaId: peca.id, delta: m.entrada, motivo: "COMPRA", observacao: "carga inicial (demo)" },
    });
    if (m.saida) {
      await prisma.movimentoEstoque.create({
        data: { pecaId: peca.id, delta: -m.saida, motivo: "VENDA", observacao: "vendas (demo)" },
      });
    }
  }

  for (const nome of ["Ana Paula", "Juliana Freitas", "Marcos Antônio"]) {
    const existe = await prisma.cliente.findFirst({ where: { nome: `${MARCA}${nome}` } });
    if (!existe) await prisma.cliente.create({ data: { nome: `${MARCA}${nome}` } });
  }

  const total = await prisma.peca.count({ where: { sku: { startsWith: MARCA } } });
  console.log(`itens de demonstração no catálogo: ${total}`);
  console.log("para remover tudo:  npx tsx scripts/dados-demo.ts --limpar");
}

const acao = process.argv.includes("--limpar") ? limpar : criar;

acao()
  .catch((e) => {
    console.error("falhou:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
