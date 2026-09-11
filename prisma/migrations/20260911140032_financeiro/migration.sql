-- AlterTable
ALTER TABLE "carteiras" ADD COLUMN     "arquivada" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "saldoInicial" DECIMAL(10,2) NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pagamentos" ADD COLUMN     "carteiraId" TEXT;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "carteiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

