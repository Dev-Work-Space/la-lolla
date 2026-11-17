-- Linhas de produto (semijoia / perfumaria / outros) e decant de perfume.
--
-- Tudo aditivo: as peças que já existem viram SEMIJOIA pelo DEFAULT, nenhuma
-- coluna sai e nenhum dado é apagado. Escrita a partir do
-- `prisma migrate diff`, como as anteriores.
--
-- Decant é a peça com "perfumeId", com estoque em unidades como qualquer
-- outra. ENVASE é o motivo da entrada dele, que não vem de compra.

-- CreateEnum
CREATE TYPE "Linha" AS ENUM ('SEMIJOIA', 'PERFUMARIA', 'OUTROS');

-- AlterEnum
ALTER TYPE "MotivoMovimento" ADD VALUE 'ENVASE';

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "linha" "Linha" NOT NULL DEFAULT 'SEMIJOIA',
ADD COLUMN     "perfumeId" TEXT,
ADD COLUMN     "volumeMl" INTEGER;

-- CreateIndex
CREATE INDEX "pecas_linha_idx" ON "pecas"("linha");

-- CreateIndex
CREATE INDEX "pecas_perfumeId_idx" ON "pecas"("perfumeId");

-- AddForeignKey
ALTER TABLE "pecas" ADD CONSTRAINT "pecas_perfumeId_fkey" FOREIGN KEY ("perfumeId") REFERENCES "pecas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

