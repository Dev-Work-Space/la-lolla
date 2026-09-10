/*
 * Verificação da vertical de peças, contra o Supabase de verdade.
 *
 * O que este teste prova, em ordem de importância:
 *   1. o custo NÃO chega a quem não vê financeiro (é o ponto de segurança)
 *   2. quem não vê financeiro não consegue GRAVAR custo, nem mandando o campo
 *   3. o SKU interno é gerado em sequência
 *   4. o saldo é a soma dos movimentos, não um campo editável
 *
 * TUDO que ele cria, ele apaga no fim — inclusive se falhar no meio.
 * Os registros levam o prefixo "ZZ-QA-" e o id é guardado antes de excluir:
 * nunca se apaga por nome nem por seletor aproximado.
 */
import { prisma } from "../src/lib/prisma";
import { criarPeca, listarPecas, movimentarEstoque, proximaSerie } from "../src/modules/pecas/peca.service";
import { temCusto } from "../src/modules/pecas/peca.schema";
import type { CriarPecaDados } from "../src/modules/pecas/peca.schema";

const MARCA = "ZZ-QA-";
const criados: string[] = [];
let passou = 0;
let falhou = 0;

function conferir(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  OK   ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

const base: CriarPecaDados = {
  nome: `${MARCA}Anel Solitário`,
  categoria: `${MARCA}Categoria`,
  tipo: "PECA",
  tamanho: "16",
  codigoFornecedor: 25,
  fator: 4.5,
  precoTabela: 189.9,
  fornecedorId: "",
};

async function main() {
  console.log("\n1) CRIAÇÃO E CÁLCULO DE CUSTO");

  const comFin = await criarPeca(base, true);
  criados.push(comFin.id);
  conferir("SKU gerado no formato LL-0000", /^LL-\d{4}$/.test(comFin.sku), comFin.sku);

  const linha = await prisma.peca.findUniqueOrThrow({
    where: { id: comFin.id },
    select: { custo: true, codigoFornecedor: true, fator: true },
  });
  conferir("custo = codigo × fator (25 × 4,5 = 112,50)", Number(linha.custo) === 112.5, String(linha.custo));

  console.log("\n2) VENDEDOR NÃO GRAVA CUSTO, NEM MANDANDO O CAMPO");

  // Mesmo payload, mas a sessão não vê financeiro: os campos devem ser ignorados.
  const semFin = await criarPeca({ ...base, nome: `${MARCA}Brinco Gota` }, false);
  criados.push(semFin.id);

  const linha2 = await prisma.peca.findUniqueOrThrow({
    where: { id: semFin.id },
    select: { custo: true, codigoFornecedor: true, fator: true, precoTabela: true },
  });
  conferir("custo ficou nulo", linha2.custo === null, String(linha2.custo));
  conferir("codigoFornecedor ficou nulo", linha2.codigoFornecedor === null);
  conferir("fator ficou nulo", linha2.fator === null);
  conferir("preço de tabela FOI gravado (não é campo financeiro)", Number(linha2.precoTabela) === 189.9);

  console.log("\n3) O CUSTO NÃO CHEGA NA LISTAGEM DE QUEM NÃO VÊ FINANCEIRO");

  const comoAdmin = await listarPecas({ busca: MARCA, veFinanceiro: true });
  const comoVendedor = await listarPecas({ busca: MARCA, veFinanceiro: false });

  conferir("admin recebe as peças", comoAdmin.length >= 2, String(comoAdmin.length));
  conferir("vendedor recebe as mesmas peças", comoVendedor.length === comoAdmin.length);
  conferir("objeto do admin TEM custo", comoAdmin.every(temCusto));
  conferir("objeto do vendedor NÃO tem custo", comoVendedor.every((p) => !temCusto(p)));

  // A prova final: serializar como o Next faria e procurar a palavra.
  const json = JSON.stringify(comoVendedor);
  conferir("nenhuma chave 'custo' na resposta do vendedor", !json.includes('"custo"'));
  conferir("nenhuma chave 'fator' na resposta do vendedor", !json.includes('"fator"'));
  conferir("nenhuma chave 'margem' na resposta do vendedor", !json.includes('"margem"'));

  console.log("\n4) ESTOQUE SÓ MUDA POR MOVIMENTO");

  const antes = (await listarPecas({ busca: MARCA, veFinanceiro: true })).find((p) => p.id === comFin.id);
  conferir("saldo começa em 0", antes?.saldo === 0, String(antes?.saldo));

  await movimentarEstoque({ pecaId: comFin.id, delta: 10, motivo: "COMPRA" });
  await movimentarEstoque({ pecaId: comFin.id, delta: -3, motivo: "VENDA" });

  const depois = (await listarPecas({ busca: MARCA, veFinanceiro: true })).find((p) => p.id === comFin.id);
  conferir("saldo = soma dos deltas (10 − 3 = 7)", depois?.saldo === 7, String(depois?.saldo));

  console.log("\n5) SÉRIE POR UNIDADE NA ETIQUETA");

  const series = await proximaSerie(comFin.id, 3);
  conferir("gerou 3 séries", series.length === 3);
  conferir("formato SKU-01", series[0] === `${comFin.sku}-01`, series.join(", "));
  conferir("sequência não repete", new Set(series).size === 3);

  const maisUma = await proximaSerie(comFin.id, 1);
  conferir("continua de onde parou (SKU-04)", maisUma[0] === `${comFin.sku}-04`, maisUma[0]);
}

async function limpar() {
  console.log("\nLIMPEZA");
  for (const id of criados) {
    // Alvo EXATO por id, guardado no momento da criação. Nunca por nome.
    await prisma.movimentoEstoque.deleteMany({ where: { pecaId: id } });
    const apagada = await prisma.peca.delete({ where: { id }, select: { id: true, sku: true, nome: true } });
    console.log(`  removida ${apagada.sku} (${apagada.nome})`);
  }
  const sobrou = await prisma.peca.count({ where: { nome: { startsWith: MARCA } } });
  console.log(`  restou algum registro de QA? ${sobrou === 0 ? "não" : "SIM — " + sobrou}`);
}

main()
  .catch((e) => {
    falhou++;
    console.error("\nERRO:", e instanceof Error ? e.message : e);
  })
  .finally(async () => {
    await limpar().catch((e) => console.error("limpeza falhou:", e));
    console.log(`\nRESULTADO: ${passou} passaram, ${falhou} falharam\n`);
    await prisma.$disconnect();
    process.exitCode = falhou === 0 ? 0 : 1;
  });
