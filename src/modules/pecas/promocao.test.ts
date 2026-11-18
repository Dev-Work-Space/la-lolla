/*
 * A regra do preço que vale (pecas/promocao.ts). Dela depende o que o caixa
 * cobra, o catálogo mostra e a etiqueta imprime.
 *
 * Rodar: node --import tsx --test src/modules/pecas/promocao.test.ts
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { precoComDesconto, precoVigente, promocaoEncerrada, promocaoValendo } from "./promocao";

const agora = new Date(2026, 10, 18, 15, 0); // 18/11/2026 15h
const fimDe = (dia: number) => new Date(2026, 10, dia, 23, 59, 59, 999);

test("sem promoção, vale o de tabela", () => {
  assert.equal(precoVigente({ precoTabela: 100, precoPromocional: null, promocaoAte: null }, agora), 100);
});

test("promoção sem data vale até alguém tirar", () => {
  const p = { precoTabela: 100, precoPromocional: 80, promocaoAte: null };
  assert.equal(promocaoValendo(p, agora), true);
  assert.equal(precoVigente(p, agora), 80);
  assert.deepEqual(precoComDesconto(p, agora), { preco: 80, precoDe: 100, descontoPct: 20 });
});

test("vale até o fim do último dia, e no dia seguinte volta ao normal", () => {
  const p = { precoTabela: 100, precoPromocional: 80, promocaoAte: fimDe(18) };
  assert.equal(precoVigente(p, agora), 80);
  assert.equal(precoVigente(p, new Date(2026, 10, 18, 23, 59)), 80);
  assert.equal(precoVigente(p, new Date(2026, 10, 19, 0, 0)), 100);
  assert.equal(promocaoEncerrada(p, new Date(2026, 10, 19, 0, 0)), true);
});

test("promocional maior ou igual ao de tabela não é promoção", () => {
  assert.equal(precoVigente({ precoTabela: 100, precoPromocional: 100, promocaoAte: null }, agora), 100);
  assert.equal(precoVigente({ precoTabela: 100, precoPromocional: 120, promocaoAte: null }, agora), 100);
});

test("aceita Decimal do Prisma e data em texto", () => {
  const dec = (n: number) => ({ toString: () => String(n) });
  const p = { precoTabela: dec(59.9), precoPromocional: dec(49.9), promocaoAte: fimDe(30).toISOString() };
  assert.equal(precoVigente(p, agora), 49.9);
});

test("sem preço de tabela não há promoção", () => {
  assert.equal(precoVigente({ precoTabela: null, precoPromocional: 50, promocaoAte: null }, agora), null);
});
