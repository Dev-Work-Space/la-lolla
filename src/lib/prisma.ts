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

  /*
   * O tamanho do pool depende de ONDE o app roda, e a diferença é grande.
   *
   * Na Vercel cada requisição roda numa função própria: se cada uma abrisse
   * 10 conexões, 50 acessos simultâneos viram 500 e o Supabase recusa. Lá o
   * teto é 1, e é inegociável.
   *
   * No servidor local (desenvolvimento, ou `npm start` numa máquina) é UM
   * processo só atendendo tudo. Com teto de 1, as consultas que eu escrevi
   * para rodar juntas viram fila — e cada uma paga a ida e volta até o banco.
   * Medido: 8 consultas levavam 228 ms enfileiradas contra 133 ms juntas.
   *
   * Dá para forçar pelo ambiente com PG_POOL_MAX, se algum dia precisar.
   */
  const naVercel = Boolean(process.env.VERCEL);
  const max = Number(process.env.PG_POOL_MAX) || (naVercel ? 1 : 10);

  const adapter = new PrismaPg({ connectionString, max });

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
