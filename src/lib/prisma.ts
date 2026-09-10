import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

/*
 * Prisma 7 substituiu o motor Rust pelo query compiler: a conexão passa a ser
 * feita por um driver adapter, não mais pela URL do schema. Na prática isso é
 * bom para o nosso caso — o pool fica sob nosso controle, que é exatamente o
 * que a Vercel exige.
 *
 * DATABASE_URL aponta para o pooler do Supabase na porta 6543 (modo
 * transaction) com pgbouncer=true e connection_limit=1. Ver .env.example para
 * o porquê de cada parâmetro.
 */

function criarClient() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL não configurada. Copie .env.example para .env.");
  }

  const adapter = new PrismaPg({
    connectionString,
    // Uma conexão por instância. Cada função serverless da Vercel roda em seu
    // próprio processo: sem este teto, 50 acessos simultâneos viram centenas
    // de conexões e o Supabase começa a recusar.
    max: 1,
  });

  return new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });
}

// Em desenvolvimento o hot-reload reexecuta este módulo a cada save. Sem o
// cache global, cada reload abriria um pool novo até esgotar o banco.
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma = globalForPrisma.prisma ?? criarClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
