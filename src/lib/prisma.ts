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
   * Com teto de 1, as consultas que o código pede JUNTAS (`Promise.all`)
   * viram fila, e cada uma paga a ida e volta até o banco. Medido no
   * servidor local: 8 consultas levavam 228 ms enfileiradas contra 133 ms
   * juntas. O Início pede umas 15.
   *
   * Na Vercel o teto era 1, pensando em "uma função por requisição": 50
   * acessos com 10 conexões cada virariam 500. Mas a Vercel de hoje (Fluid)
   * atende VÁRIAS requisições na mesma instância, e com 1 conexão uma tela
   * esperava a outra — inclusive as buscas antecipadas do menu, que saem
   * várias de uma vez. Foi a lentidão que o João sentiu na troca de telas
   * (08/10/2026). 5 por instância, atrás do pooler do Supabase (modo
   * transação, que divide as conexões reais entre todos), deixa as consultas
   * correrem juntas sem chegar perto do limite de clientes do pooler.
   *
   * Dá para forçar pelo ambiente com PG_POOL_MAX, se algum dia precisar.
   */
  const naVercel = Boolean(process.env.VERCEL);
  const max = Number(process.env.PG_POOL_MAX) || (naVercel ? 5 : 10);

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
