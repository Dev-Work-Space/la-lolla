-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "precoPromocional" DECIMAL(10,2),
ADD COLUMN     "totalRecebido" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "sessoes" ADD COLUMN     "ultimoUso" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

