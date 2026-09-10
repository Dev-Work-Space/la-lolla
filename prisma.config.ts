import { defineConfig, env } from "prisma/config";

/*
 * Prisma 7 mudou de lugar a configuração de conexão: o CLI NÃO lê mais
 * `url`/`directUrl` do bloco `datasource` do schema.prisma — ele lê daqui.
 *
 * Por isso a URL abaixo é a DIRECT_URL (pooler em modo session, porta 5432):
 * migration é DDL e precisa de conexão estável, que o modo transaction do
 * PgBouncer não entrega.
 *
 * O runtime da aplicação é outra história: o Prisma Client usa a
 * DATABASE_URL (porta 6543, transaction + connection_limit=1). Ver
 * src/lib/prisma.ts.
 */

// O CLI do Prisma 7 não carrega .env sozinho. Node 20.12+ tem isto nativo,
// então não precisamos da dependência `dotenv`.
process.loadEnvFile?.(".env");

export default defineConfig({
  schema: "prisma/schema.prisma",

  datasource: {
    url: env("DIRECT_URL"),
  },

  migrations: {
    path: "prisma/migrations",
    seed: "tsx prisma/seed.ts",
  },
});
