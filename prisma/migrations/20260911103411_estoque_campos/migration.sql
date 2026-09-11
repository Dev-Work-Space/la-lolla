-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "minimo" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pagoFornecedor" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "unidade" TEXT;

