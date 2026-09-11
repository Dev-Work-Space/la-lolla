-- AlterTable
ALTER TABLE "compras" ADD COLUMN     "observacao" TEXT;

-- AlterTable
ALTER TABLE "contas" ADD COLUMN     "compraId" TEXT;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_compraId_fkey" FOREIGN KEY ("compraId") REFERENCES "compras"("id") ON DELETE CASCADE ON UPDATE CASCADE;

