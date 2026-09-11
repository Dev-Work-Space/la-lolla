/* Quantas tentativas de login estão contando na janela atual. Só leitura. */
import pg from "pg";

const c = new pg.Client({ connectionString: process.env.DIRECT_URL });
await c.connect();
const r = await c.query(
  `select chave, count(*)::int as n, max(now() - "criadoEm") as mais_antiga
   from tentativas_login
   where "criadoEm" > now() - interval '15 minutes'
   group by chave order by n desc`,
);
if (r.rows.length === 0) console.log("nenhuma tentativa na janela — não é o limite");
for (const x of r.rows) {
  console.log(`  ${x.chave}: ${x.n} tentativa(s) · limite 20`);
}
await c.end();
