-- AlterTable
ALTER TABLE "contas" ADD COLUMN     "deParcelas" INTEGER,
ADD COLUMN     "parcela" INTEGER,
ADD COLUMN     "vendaId" TEXT;

-- AlterTable
ALTER TABLE "itens_venda" ADD COLUMN     "custoUnit" DECIMAL(10,2),
ADD COLUMN     "devolvido" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "observacao" TEXT;

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_vendaId_fkey" FOREIGN KEY ("vendaId") REFERENCES "vendas"("id") ON DELETE CASCADE ON UPDATE CASCADE;

