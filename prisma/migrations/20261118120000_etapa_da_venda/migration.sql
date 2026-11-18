-- Etapa da entrega na venda (quadro de pedidos, 18/11). Tudo aditivo: as
-- vendas que já existem ficam VENDIDO pelo DEFAULT e sem data de entrega;
-- nenhuma coluna sai e nenhum dado é apagado. Escrita a partir do
-- `prisma migrate diff`, como as anteriores.

-- CreateEnum
CREATE TYPE "EtapaVenda" AS ENUM ('VENDIDO', 'A_ENTREGAR', 'ENTREGUE');

-- AlterTable
ALTER TABLE "vendas" ADD COLUMN     "entregueEm" TIMESTAMP(3),
ADD COLUMN     "etapa" "EtapaVenda" NOT NULL DEFAULT 'VENDIDO';
