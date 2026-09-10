/* Prova de ponta a ponta: src/lib/prisma.ts conecta no Supabase e consulta.
   Só leitura — nenhuma escrita. Rode com:  npm run testar:banco  */
import { prisma } from "../src/lib/prisma";

async function main() {
  const tabelas = await prisma.$queryRaw<Array<{ table_name: string }>>`
    select table_name from information_schema.tables
    where table_schema = 'public' order by table_name
  `;

  const contagens = {
    usuarios: await prisma.usuario.count(),
    pecas: await prisma.peca.count(),
    vendas: await prisma.venda.count(),
    clientes: await prisma.cliente.count(),
  };

  console.log("OK — conectado via adapter pg");
  console.log("tabelas no schema public:", tabelas.length);
  console.log("contagens:", contagens);
}

main()
  .catch((e) => {
    console.error("FALHOU:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
