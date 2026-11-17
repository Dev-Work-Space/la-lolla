/*
 * Sonda das linhas e do decant, contra o banco de verdade.
 *
 * O que ela prova:
 *   1. perfume cadastrado pelo VALOR PAGO grava o custo, sem código nem fator
 *   2. o volume vira o tamanho ("100 ml") quando o tamanho fica vazio
 *   3. envasar cria o tamanho novo ligado ao perfume, dá entrada e baixa o frasco
 *   4. o custo do decant = custo do frasco ÷ ml × ml do decant + frasquinho
 *   5. tamanho repetido e frasco sem estoque são recusados, sem gravar nada
 *   6. a vitrine junta frasco e decant num card só, na aba Perfumaria
 *   7. a etiqueta do perfume sai com PERFUMARIA
 *
 * TUDO que ela cria, ela apaga no fim — inclusive se falhar no meio. Os
 * registros levam "ZZQA " no nome e são apagados pelo id guardado, nunca por
 * nome. Como o código LL- sai do maior que existe, apagar devolve a numeração.
 *
 * Rodar: node --env-file=.env --conditions=react-server --import tsx scripts/sonda-perfumaria.ts
 */
import { prisma } from "../src/lib/prisma";
import { criarPeca } from "../src/modules/pecas/peca.service";
import { envasarDecants } from "../src/modules/pecas/decant.service";
import { listarVitrine } from "../src/modules/pecas/vitrine.service";
import { montarEtiquetas } from "../src/modules/pecas/etiqueta.service";
import type { CriarPecaDados } from "../src/modules/pecas/peca.schema";

const criados: string[] = [];
let passou = 0;
let falhou = 0;

function conferir(nome: string, condicao: boolean, detalhe = "") {
  if (condicao) {
    passou++;
    console.log(`  OK    ${nome}`);
  } else {
    falhou++;
    console.log(`  FALHA ${nome}${detalhe ? " — " + detalhe : ""}`);
  }
}

async function recusa(nome: string, fn: () => Promise<unknown>, trecho: string) {
  try {
    await fn();
    conferir(nome, false, "não recusou");
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    conferir(nome, msg.includes(trecho), msg);
  }
}

const saldo = async (id: string) =>
  (await prisma.movimentoEstoque.aggregate({ where: { pecaId: id }, _sum: { delta: true } }))._sum.delta ?? 0;

async function main() {
  console.log("Perfume pelo valor pago");
  const dados: CriarPecaDados = {
    nome: "ZZQA Perfume Sonda",
    categoria: "Perfumes femininos",
    tipo: "PECA",
    linha: "PERFUMARIA",
    volumeMl: 100,
    codigoFornecedor: undefined,
    fator: undefined,
    custoPago: 200,
    precoTabela: 350,
    precoPromocional: undefined,
    minimo: 0,
    fornecedorId: "",
    tamanho: "",
  };
  const perfume = await criarPeca(dados, true);
  criados.push(perfume.id);
  const p = await prisma.peca.findUniqueOrThrow({ where: { id: perfume.id } });
  conferir("custo = valor pago", Number(p.custo) === 200, String(p.custo));
  conferir("sem código nem fator", p.codigoFornecedor === null && p.fator === null);
  conferir("linha Perfumaria", p.linha === "PERFUMARIA");
  conferir("tamanho vem do volume", p.tamanho === "100 ml", String(p.tamanho));

  // Dois frascos na prateleira, como se tivessem vindo de uma compra.
  await prisma.movimentoEstoque.create({ data: { pecaId: perfume.id, delta: 2, motivo: "COMPRA", observacao: "ZZQA sonda" } });
  await prisma.peca.update({ where: { id: perfume.id }, data: { totalRecebido: 2 } });

  console.log("Envasar");
  const r = await envasarDecants({
    perfumeId: perfume.id,
    volumeMl: 5,
    quantidade: 10,
    baixarFrasco: true,
    custoFrasquinho: 1.5,
    precoTabela: 39.9,
    decantId: "",
  });
  criados.push(r.decantId);
  const d = await prisma.peca.findUniqueOrThrow({ where: { id: r.decantId } });
  conferir("decant ligado ao perfume", d.perfumeId === perfume.id);
  conferir("decant tamanho 5 ml", d.tamanho === "5 ml" && d.volumeMl === 5, `${d.tamanho} / ${d.volumeMl}`);
  conferir("custo = 200 ÷ 100 × 5 + 1,50 = 11,50", Number(d.custo) === 11.5, String(d.custo));
  conferir("10 decants em estoque", (await saldo(d.id)) === 10);
  conferir("1 frasco baixado (sobra 1)", (await saldo(perfume.id)) === 1);
  conferir("decant conta como recebido", d.totalRecebido === 10, String(d.totalRecebido));

  await envasarDecants({ perfumeId: perfume.id, decantId: d.id, volumeMl: undefined, quantidade: 5, baixarFrasco: false, custoFrasquinho: undefined, precoTabela: undefined });
  conferir("envasar de novo no mesmo tamanho soma (15)", (await saldo(d.id)) === 15);

  console.log("Recusas");
  await recusa(
    "tamanho repetido",
    () => envasarDecants({ perfumeId: perfume.id, volumeMl: 5, quantidade: 1, baixarFrasco: false, custoFrasquinho: undefined, precoTabela: undefined, decantId: "" }),
    "Já existe o decant de 5 ml",
  );
  await envasarDecants({ perfumeId: perfume.id, decantId: d.id, volumeMl: undefined, quantidade: 1, baixarFrasco: true, custoFrasquinho: undefined, precoTabela: undefined });
  const decantsAntes = await saldo(d.id);
  await recusa(
    "baixar frasco sem estoque",
    () => envasarDecants({ perfumeId: perfume.id, decantId: d.id, volumeMl: undefined, quantidade: 3, baixarFrasco: true, custoFrasquinho: undefined, precoTabela: undefined }),
    "sem frasco em estoque",
  );
  conferir("a recusa não deu entrada em nada", (await saldo(d.id)) === decantsAntes);
  await recusa(
    "decant não sai de decant",
    () => envasarDecants({ perfumeId: d.id, volumeMl: 2, quantidade: 1, baixarFrasco: false, custoFrasquinho: undefined, precoTabela: undefined, decantId: "" }),
    "Decant só sai de um perfume",
  );

  console.log("Vitrine e etiqueta");
  const v = await listarVitrine({ linha: "PERFUMARIA" });
  const card = v.modelos.find((m) => m.variantes.some((x) => x.id === perfume.id));
  conferir("frasco e decant no mesmo card", !!card && card.variantes.some((x) => x.id === d.id), JSON.stringify(card?.variantes.map((x) => x.tamanho)));
  conferir("volumes em ordem (5 ml, 100 ml)", card?.variantes.map((x) => x.tamanho).join(",") === "5 ml,100 ml");
  conferir("aba Perfumaria aparece", v.linhas.includes("PERFUMARIA"));
  const vs = await listarVitrine({ linha: "SEMIJOIA" });
  conferir("aba Semijoias não traz o perfume", !vs.modelos.some((m) => m.variantes.some((x) => x.id === perfume.id)));
  const [et] = await montarEtiquetas([{ pecaId: perfume.id, quantidade: 1 }]);
  conferir("etiqueta do perfume diz PERFUMARIA", et.assinatura === "PERFUMARIA", String(et.assinatura));
}

async function limpar() {
  // Decant primeiro: ele aponta para o perfume (onDelete Restrict). Movimentos vão em cascata.
  const decants = await prisma.peca.findMany({ where: { perfumeId: { in: criados } }, select: { id: true } });
  const ids = [...new Set([...decants.map((x) => x.id), ...criados])];
  await prisma.peca.deleteMany({ where: { id: { in: ids.filter((id) => !criados.slice(0, 1).includes(id)) } } });
  await prisma.peca.deleteMany({ where: { id: { in: criados.slice(0, 1) } } });
  const sobrou = await prisma.peca.count({ where: { id: { in: ids } } });
  console.log(sobrou === 0 ? `\nLimpeza: ${ids.length} produtos de teste apagados pelo id.` : `\nATENÇÃO: sobraram ${sobrou} produtos de teste.`);
}

main()
  .catch((e) => {
    falhou++;
    console.error("ERRO:", e);
  })
  .finally(async () => {
    await limpar();
    console.log(`\n${passou} ok, ${falhou} falha(s)`);
    await prisma.$disconnect();
    process.exitCode = falhou ? 1 : 0;
  });
