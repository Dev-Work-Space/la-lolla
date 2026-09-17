-- =====================================================================
--  Data do FATO, cartão de crédito, devolução, insumo na venda e orçamento
--
--  Escrita à mão, e não gerada pelo `migrate dev`, por três motivos — cada
--  um deles um estrago que o SQL automático faria calado:
--
--  1. `cofrinho` vira `tipo`. O automático DROPava a coluna na mesma
--     instrução em que criava a nova, e a carteira marcada como cofrinho
--     virava uma conta comum. Aqui o dado é copiado ANTES do drop.
--
--  2. As colunas `data` novas nascem com CURRENT_TIMESTAMP. Sem o UPDATE
--     que vem depois, os 26 movimentos de estoque e as 2 vendas que já
--     existem passariam a dizer que aconteceram hoje — e o relatório de
--     qualquer mês passado ficaria errado para sempre.
--
--  3. O enum de orçamento perde PERDIDO e ganha RECUSADO/SUBSTITUIDO. Está
--     seguro porque não existe nenhum orçamento gravado (conferido antes),
--     mas o UPDATE defensivo fica aqui para o caso de rodar noutro banco.
-- =====================================================================

-- ─────────────────── enums novos ───────────────────
CREATE TYPE "ResolucaoDevolucao" AS ENUM ('ABATER', 'DEVOLVER');
CREATE TYPE "ModoPagamentoOrcamento" AS ENUM ('A_COMBINAR', 'A_VISTA', 'PARCELADO');
CREATE TYPE "TipoCarteira" AS ENUM ('ESPECIE', 'CONTA', 'RESERVA', 'CARTAO', 'OUTRA');

-- ─────────────── status do orçamento ───────────────
-- PERDIDO passa a se chamar RECUSADO (é o que a tela diz), e nasce
-- SUBSTITUIDO, para a revisão marcar o orçamento que ela aposenta.
UPDATE "orcamentos" SET "status" = 'ABERTO' WHERE "status"::text = 'PERDIDO';

BEGIN;
CREATE TYPE "StatusOrcamento_new" AS ENUM ('ABERTO', 'CONVERTIDO', 'RECUSADO', 'SUBSTITUIDO');
ALTER TABLE "public"."orcamentos" ALTER COLUMN "status" DROP DEFAULT;
ALTER TABLE "orcamentos" ALTER COLUMN "status" TYPE "StatusOrcamento_new" USING ("status"::text::"StatusOrcamento_new");
ALTER TYPE "StatusOrcamento" RENAME TO "StatusOrcamento_old";
ALTER TYPE "StatusOrcamento_new" RENAME TO "StatusOrcamento";
DROP TYPE "public"."StatusOrcamento_old";
ALTER TABLE "orcamentos" ALTER COLUMN "status" SET DEFAULT 'ABERTO';
COMMIT;

-- ─────────────── carteiras e cartão ───────────────
ALTER TABLE "carteiras"
  ADD COLUMN "tipo"          "TipoCarteira" NOT NULL DEFAULT 'CONTA',
  ADD COLUMN "limite"        DECIMAL(10,2),
  ADD COLUMN "usadoInicial"  DECIMAL(10,2) NOT NULL DEFAULT 0,
  ADD COLUMN "diaFechamento" INTEGER,
  ADD COLUMN "diaVencimento" INTEGER,
  ADD COLUMN "validade"      TEXT;

-- O dado do cofrinho é copiado para o tipo ANTES de a coluna sumir.
UPDATE "carteiras" SET "tipo" = 'RESERVA' WHERE "cofrinho" = true;

ALTER TABLE "carteiras" DROP COLUMN "cofrinho";

-- Compra no crédito: a parcela vira conta na fatura do cartão.
ALTER TABLE "contas"
  ADD COLUMN "cartaoId"   TEXT,
  ADD COLUMN "dataCompra" TIMESTAMP(3);

-- ─────────────── data do fato ───────────────
ALTER TABLE "vendas"             ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "pagamentos"         ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "lancamentos"        ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "movimentos_estoque" ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "compras"            ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "orcamentos"         ADD COLUMN "data" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "transferencias"
  ADD COLUMN "data"       TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ADD COLUMN "observacao" TEXT;

-- O que já existia aconteceu quando foi registrado — não agora.
UPDATE "vendas"             SET "data" = "criadoEm";
UPDATE "pagamentos"         SET "data" = "criadoEm";
UPDATE "lancamentos"        SET "data" = "criadoEm";
UPDATE "movimentos_estoque" SET "data" = "criadoEm";
UPDATE "compras"            SET "data" = "criadoEm";
UPDATE "orcamentos"         SET "data" = "criadoEm";
UPDATE "transferencias"     SET "data" = "criadoEm";

-- ─────────────── orçamento: validade, revisão e condição ───────────────
ALTER TABLE "orcamentos"
  ADD COLUMN "validadeDias"       INTEGER NOT NULL DEFAULT 7,
  ADD COLUMN "revisaoDeId"        TEXT,
  ADD COLUMN "modoPagamento"      "ModoPagamentoOrcamento" NOT NULL DEFAULT 'A_COMBINAR',
  ADD COLUMN "formaPagamento"     "FormaPagamento",
  ADD COLUMN "parcelas"           INTEGER,
  ADD COLUMN "primeiroVencimento" TIMESTAMP(3),
  ADD COLUMN "observacao"         TEXT;

-- ─────────────── insumo consumido na venda ───────────────
CREATE TABLE "insumos_venda" (
    "id"         TEXT NOT NULL,
    "vendaId"    TEXT NOT NULL,
    "pecaId"     TEXT NOT NULL,
    "quantidade" INTEGER NOT NULL,
    "custoUnit"  DECIMAL(10,2) NOT NULL,
    CONSTRAINT "insumos_venda_pkey" PRIMARY KEY ("id")
);

-- ─────────────── devolução ───────────────
CREATE TABLE "devolucoes" (
    "id"           TEXT NOT NULL,
    "vendaId"      TEXT NOT NULL,
    "data"         TIMESTAMP(3) NOT NULL,
    "motivo"       TEXT,
    "resolucao"    "ResolucaoDevolucao" NOT NULL,
    "total"        DECIMAL(10,2) NOT NULL,
    "lancamentoId" TEXT,
    "criadoEm"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "devolucoes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "itens_devolucao" (
    "id"          TEXT NOT NULL,
    "devolucaoId" TEXT NOT NULL,
    "itemVendaId" TEXT NOT NULL,
    "quantidade"  INTEGER NOT NULL,
    "precoUnit"   DECIMAL(10,2) NOT NULL,
    CONSTRAINT "itens_devolucao_pkey" PRIMARY KEY ("id")
);

-- ─────────────── índices ───────────────
DROP INDEX "lancamentos_carteiraId_criadoEm_idx";
DROP INDEX "movimentos_estoque_pecaId_criadoEm_idx";
DROP INDEX "orcamentos_status_criadoEm_idx";

CREATE INDEX "lancamentos_carteiraId_data_idx"        ON "lancamentos"("carteiraId", "data");
CREATE INDEX "movimentos_estoque_pecaId_data_idx"     ON "movimentos_estoque"("pecaId", "data");
CREATE INDEX "orcamentos_status_data_idx"             ON "orcamentos"("status", "data");
CREATE INDEX "insumos_venda_vendaId_idx"              ON "insumos_venda"("vendaId");
CREATE INDEX "devolucoes_vendaId_idx"                 ON "devolucoes"("vendaId");
CREATE INDEX "itens_devolucao_devolucaoId_idx"        ON "itens_devolucao"("devolucaoId");
CREATE UNIQUE INDEX "devolucoes_lancamentoId_key"     ON "devolucoes"("lancamentoId");
CREATE UNIQUE INDEX "orcamentos_revisaoDeId_key"      ON "orcamentos"("revisaoDeId");

-- ─────────────── chaves estrangeiras ───────────────
ALTER TABLE "insumos_venda"   ADD CONSTRAINT "insumos_venda_vendaId_fkey"      FOREIGN KEY ("vendaId")     REFERENCES "vendas"("id")      ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "insumos_venda"   ADD CONSTRAINT "insumos_venda_pecaId_fkey"       FOREIGN KEY ("pecaId")      REFERENCES "pecas"("id")       ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "devolucoes"      ADD CONSTRAINT "devolucoes_vendaId_fkey"         FOREIGN KEY ("vendaId")     REFERENCES "vendas"("id")      ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_devolucaoId_fkey" FOREIGN KEY ("devolucaoId") REFERENCES "devolucoes"("id")  ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "itens_devolucao" ADD CONSTRAINT "itens_devolucao_itemVendaId_fkey" FOREIGN KEY ("itemVendaId") REFERENCES "itens_venda"("id") ON DELETE CASCADE  ON UPDATE CASCADE;
ALTER TABLE "orcamentos"      ADD CONSTRAINT "orcamentos_revisaoDeId_fkey"     FOREIGN KEY ("revisaoDeId") REFERENCES "orcamentos"("id")  ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "contas"          ADD CONSTRAINT "contas_cartaoId_fkey"            FOREIGN KEY ("cartaoId")    REFERENCES "carteiras"("id")   ON DELETE SET NULL ON UPDATE CASCADE;
