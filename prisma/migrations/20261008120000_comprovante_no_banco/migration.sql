-- O comprovante pode morar no banco quando o Supabase Storage ainda não está
-- ligado: `path` deixa de ser obrigatório e ganha o par `dados`. Os já
-- gravados (nenhum em uso real) continuam com o caminho.
ALTER TABLE "comprovantes" ALTER COLUMN "path" DROP NOT NULL;
ALTER TABLE "comprovantes" ADD COLUMN "dados" BYTEA;
