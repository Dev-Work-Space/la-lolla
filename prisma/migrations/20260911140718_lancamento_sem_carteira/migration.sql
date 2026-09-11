-- DropForeignKey
ALTER TABLE "lancamentos" DROP CONSTRAINT "lancamentos_carteiraId_fkey";

-- AlterTable
ALTER TABLE "lancamentos" ALTER COLUMN "carteiraId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "lancamentos" ADD CONSTRAINT "lancamentos_carteiraId_fkey" FOREIGN KEY ("carteiraId") REFERENCES "carteiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

