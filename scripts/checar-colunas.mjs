/* Confere se as colunas que a migration vai APAGAR estão vazias.
   Só leitura. Se alguma tiver dado, a migration não deve ser aplicada. */
import pg from "pg";

const alvos = [
  ["clientes", "cpf"],
  ["clientes", "observacao"],
  ["fornecedores", "cnpj"],
  ["fornecedores", "observacao"],
];

const c = new pg.Client({ connectionString: process.env.DIRECT_URL });
await c.connect();

let perigo = 0;
for (const [tabela, coluna] of alvos) {
  const existe = await c.query(
    `select 1 from information_schema.columns where table_schema='public' and table_name=$1 and column_name=$2`,
    [tabela, coluna],
  );
  if (existe.rowCount === 0) {
    console.log(`  ${tabela}.${coluna}: não existe (nada a perder)`);
    continue;
  }
  const r = await c.query(`select count(*)::int as n from public."${tabela}" where "${coluna}" is not null`);
  const n = r.rows[0].n;
  if (n > 0) perigo++;
  console.log(`  ${tabela}.${coluna}: ${n} linha(s) com valor ${n ? "<-- PERIGO" : "(vazia)"}`);
}

const tot = await c.query("select count(*)::int as n from public.clientes");
console.log(`\n  clientes no total: ${tot.rows[0].n}`);
console.log(perigo === 0 ? "\nSEGURO aplicar" : "\nNAO APLICAR — há dado nas colunas que seriam removidas");

await c.end();
process.exitCode = perigo === 0 ? 0 : 1;
