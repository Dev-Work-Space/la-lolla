import assert from "node:assert/strict";
import { test } from "node:test";
import { criarPecaSchema } from "./peca.schema";
import { envaseSchema } from "./decant.schemas";

/*
 * O formulário NÃO envia o campo que a tela não mostra. Em 17/11 o Zod 4
 * exigia essas chaves e travou todo cadastro: no modo "código" faltava o
 * valor pago; no "valor pago", o código. Estes testes mandam exatamente o
 * que cada tela envia.
 */

const base = { nome: "Produto teste", categoria: "", tipo: "PECA", precoTabela: "199,00", precoPromocional: "", minimo: "00", fornecedorId: "f1", tamanho: "" };

test("semijoia pelo código, sem valor pago nem volume", () => {
  const r = criarPecaSchema.safeParse({ ...base, linha: "SEMIJOIA", codigoFornecedor: "53,3", fator: "2,9" });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  assert.equal(r.data.custoPago, undefined);
  assert.equal(r.data.codigoFornecedor, 53.3);
});

test("perfume pelo valor pago, sem código nem multiplicador", () => {
  const r = criarPecaSchema.safeParse({ ...base, linha: "PERFUMARIA", custoPago: "189,90", volumeMl: "100" });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
  assert.equal(r.data.custoPago, 189.9);
  assert.equal(r.data.volumeMl, 100);
});

test("quem não vê financeiro não envia custo nenhum", () => {
  const r = criarPecaSchema.safeParse({ ...base, linha: "SEMIJOIA" });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
});

test("código e valor pago juntos são recusados", () => {
  const r = criarPecaSchema.safeParse({ ...base, linha: "SEMIJOIA", codigoFornecedor: "10", fator: "2,9", custoPago: "29" });
  assert.equal(r.success, false);
});

test("envase num tamanho que já existe, sem ml, frasquinho nem preço", () => {
  const r = envaseSchema.safeParse({ perfumeId: "p1", decantId: "d1", quantidade: "3" });
  assert.ok(r.success, JSON.stringify(!r.success && r.error.issues));
});

test("semijoia com material, e sem ele (é opcional)", () => {
  const com = criarPecaSchema.safeParse({ ...base, linha: "SEMIJOIA", codigoFornecedor: "10", fator: "2,9", material: "Prata 925" });
  assert.ok(com.success, JSON.stringify(!com.success && com.error.issues));
  assert.equal(com.data.material, "Prata 925");
  const sem = criarPecaSchema.safeParse({ ...base, linha: "SEMIJOIA", codigoFornecedor: "10", fator: "2,9" });
  assert.ok(sem.success);
});
