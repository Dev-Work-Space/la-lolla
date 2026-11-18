-- Data de fim da promoção do produto (18/11). Aditiva: a coluna nasce vazia
-- em todos os produtos — vazio quer dizer "sem data para acabar", que é como
-- toda promoção funcionava até hoje. Escrita a partir do `prisma migrate diff`.

-- AlterTable
ALTER TABLE "pecas" ADD COLUMN     "promocaoAte" TIMESTAMP(3);
