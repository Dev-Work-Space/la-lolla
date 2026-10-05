/*
 * Apaga os dados de DEMONSTRAÇÃO e de TESTE do banco.
 *
 * O João pediu para limpar tudo que é mock antes de a loja começar a usar de
 * verdade. Some o que foi semeado (`DEMO-`) e o que as sondas deixaram
 * (`ZZQA `). NÃO toca em:
 *
 *   - usuários (são as contas de acesso, inclusive as que as sondas usam)
 *   - carteiras e cartões (o Nubank é dele, e carteira é estrutura)
 *   - ajustes (multiplicador, meta, categorias)
 *
 * Roda em transação: ou apaga tudo, ou não apaga nada. Sem `--apagar` apenas
 * mostra o que sairia.
 *
 *   node --env-file=.env scripts/limpar-mocks.mjs            (só mostra)
 *   node --env-file=.env scripts/limpar-mocks.mjs --apagar   (apaga)
 */
const { PrismaClient } = await import("@prisma/client");
const { PrismaPg } = await import("@prisma/adapter-pg");
const db = new PrismaClient({
  adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL, max: 3 }),
});

const APAGAR = process.argv.includes("--apagar");

/* Quem é mock: o nome/código começa com um destes. */
const ehMock = (texto) => /^(DEMO-|ZZQA )/.test(String(texto ?? ""));

const pecas = await db.peca.findMany({
  select: { id: true, sku: true, nome: true },
});
const pecasMock = pecas.filter((p) => ehMock(p.sku) || ehMock(p.nome));
const idsPecas = pecasMock.map((p) => p.id);

const clientes = await db.cliente.findMany({ select: { id: true, nome: true } });
const clientesMock = clientes.filter((c) => ehMock(c.nome));
const idsClientes = clientesMock.map((c) => c.id);

const fornecedores = await db.fornecedor.findMany({ select: { id: true, nome: true } });
const fornecedoresMock = fornecedores.filter((f) => ehMock(f.nome));
const idsFornecedores = fornecedoresMock.map((f) => f.id);

/*
 * Venda entra na limpeza quando QUALQUER parte dela é mock: a peça vendida, o
 * cliente ou a própria descrição. Uma venda de peça DEMO não é venda de
 * verdade, mesmo que o cliente tenha nome de gente.
 */
const vendas = await db.venda.findMany({
  select: {
    id: true,
    numero: true,
    total: true,
    cliente: { select: { id: true, nome: true } },
    itens: { select: { peca: { select: { id: true, sku: true, nome: true } } } },
  },
});
const vendasMock = vendas.filter(
  (v) =>
    (v.cliente && ehMock(v.cliente.nome)) ||
    v.itens.some((i) => idsPecas.includes(i.peca.id)) ||
    v.itens.length === 0,
);
const idsVendas = vendasMock.map((v) => v.id);

const orcamentos = await db.orcamento.findMany({
  select: {
    id: true,
    numero: true,
    cliente: { select: { nome: true } },
    itens: { select: { pecaId: true } },
  },
});
const orcamentosMock = orcamentos.filter(
  (o) =>
    (o.cliente && ehMock(o.cliente.nome)) || o.itens.some((i) => idsPecas.includes(i.pecaId)),
);
const idsOrcamentos = orcamentosMock.map((o) => o.id);

const compras = await db.compra.findMany({
  select: { id: true, fornecedorId: true, itens: { select: { pecaId: true } } },
});
const comprasMock = compras.filter(
  (c) =>
    (c.fornecedorId && idsFornecedores.includes(c.fornecedorId)) ||
    c.itens.some((i) => idsPecas.includes(i.pecaId)),
);
const idsCompras = comprasMock.map((c) => c.id);

console.log("=== O QUE SAI ===");
console.log(`  ${pecasMock.length} peças/insumos`);
pecasMock.slice(0, 6).forEach((p) => console.log(`      ${p.sku} · ${p.nome}`));
if (pecasMock.length > 6) console.log(`      … e mais ${pecasMock.length - 6}`);
console.log(`  ${clientesMock.length} clientes: ${clientesMock.map((c) => c.nome).join(", ")}`);
console.log(
  `  ${fornecedoresMock.length} fornecedores: ${fornecedoresMock.map((f) => f.nome).join(", ")}`,
);
console.log(
  `  ${vendasMock.length} vendas: ${vendasMock.map((v) => `#${v.numero} (${Number(v.total).toFixed(2)})`).join(", ")}`,
);
console.log(`  ${orcamentosMock.length} orçamentos`);
console.log(`  ${idsCompras.length} compras`);
console.log("  + movimentos de estoque, imagens, pagamentos, parcelas e devoluções ligados");

console.log("\n=== O QUE FICA ===");
console.log(`  ${await db.usuario.count()} usuários`);
console.log(`  ${await db.carteira.count()} carteiras e cartões`);
console.log(`  ${await db.config.count()} ajustes`);
console.log(`  ${pecas.length - pecasMock.length} peças de verdade`);

if (!APAGAR) {
  console.log("\nNada foi apagado. Para apagar de verdade:");
  console.log("  node --env-file=.env scripts/limpar-mocks.mjs --apagar");
  await db.$disconnect();
  process.exit(0);
}

console.log("\n=== APAGANDO ===");
await db.$transaction(async (tx) => {
  /* A ordem importa: filho antes do pai, mesmo com cascata — assim o script
     não depende de como cada relação foi configurada no schema. */
  if (idsVendas.length) {
    await tx.itemDevolucao.deleteMany({ where: { devolucao: { vendaId: { in: idsVendas } } } });
    await tx.devolucao.deleteMany({ where: { vendaId: { in: idsVendas } } });
    await tx.pagamento.deleteMany({ where: { vendaId: { in: idsVendas } } });
    await tx.insumoVenda.deleteMany({ where: { vendaId: { in: idsVendas } } });
    await tx.itemVenda.deleteMany({ where: { vendaId: { in: idsVendas } } });
    await tx.conta.deleteMany({ where: { vendaId: { in: idsVendas } } });
  }
  if (idsOrcamentos.length) {
    await tx.itemOrcamento.deleteMany({ where: { orcamentoId: { in: idsOrcamentos } } });
  }
  if (idsCompras.length) {
    await tx.itemCompra.deleteMany({ where: { compraId: { in: idsCompras } } });
    await tx.conta.deleteMany({ where: { compraId: { in: idsCompras } } });
  }

  /* Orçamento aponta para a venda; venda aponta para o orçamento. Solta o laço
     antes de apagar os dois. */
  if (idsOrcamentos.length) {
    await tx.orcamento.updateMany({
      where: { id: { in: idsOrcamentos } },
      data: { vendaId: null, revisaoDeId: null },
    });
  }

  await tx.venda.deleteMany({ where: { id: { in: idsVendas } } });
  await tx.orcamento.deleteMany({ where: { id: { in: idsOrcamentos } } });
  await tx.compra.deleteMany({ where: { id: { in: idsCompras } } });

  if (idsPecas.length) {
    await tx.movimentoEstoque.deleteMany({ where: { pecaId: { in: idsPecas } } });
    await tx.imagemPeca.deleteMany({ where: { pecaId: { in: idsPecas } } });
    await tx.peca.deleteMany({ where: { id: { in: idsPecas } } });
  }

  await tx.cliente.deleteMany({ where: { id: { in: idsClientes } } });
  await tx.fornecedor.deleteMany({ where: { id: { in: idsFornecedores } } });
});

console.log("=== COMO FICOU ===");
console.log(`  peças: ${await db.peca.count()}`);
console.log(`  clientes: ${await db.cliente.count()}`);
console.log(`  fornecedores: ${await db.fornecedor.count()}`);
console.log(`  vendas: ${await db.venda.count()}`);
console.log(`  orçamentos: ${await db.orcamento.count()}`);
console.log(`  movimentos: ${await db.movimentoEstoque.count()}`);
console.log(`  carteiras (intactas): ${await db.carteira.count()}`);
console.log(`  usuários (intactos): ${await db.usuario.count()}`);

await db.$disconnect();
