/*
 * Descobre em que região está o projeto do Supabase, testando os endereços
 * de pooler candidatos. Só tenta conectar — não escreve nada.
 */
import pg from "pg";

const REF = process.argv[2];
const SENHA = process.argv[3];
if (!REF || !SENHA) {
  console.error("uso: node scripts/achar-regiao.mjs <ref> <senha>");
  process.exit(1);
}

const REGIOES = [
  ["sa-east-1", "São Paulo"],
  ["us-east-1", "Norte da Virgínia"],
  ["us-east-2", "Ohio"],
  ["us-west-1", "Norte da Califórnia"],
  ["ca-central-1", "Canadá"],
  ["eu-west-1", "Irlanda"],
  ["eu-central-1", "Frankfurt"],
];

const ms = (t) => `${t.toFixed(0)} ms`;

for (const prefixo of ["aws-0", "aws-1"]) {
  for (const [regiao, nome] of REGIOES) {
    const host = `${prefixo}-${regiao}.pooler.supabase.com`;
    const url = `postgresql://postgres.${REF}:${encodeURIComponent(SENHA)}@${host}:5432/postgres`;
    const c = new pg.Client({ connectionString: url, connectionTimeoutMillis: 6000 });
    try {
      const t0 = performance.now();
      await c.connect();
      const conectou = performance.now() - t0;

      const tempos = [];
      for (let i = 0; i < 5; i++) {
        const t = performance.now();
        await c.query("select 1");
        tempos.push(performance.now() - t);
      }
      tempos.sort((a, b) => a - b);
      await c.end();

      console.log(`\nACHEI: ${nome} (${regiao})`);
      console.log(`  host        : ${host}`);
      console.log(`  conectar    : ${ms(conectou)}`);
      console.log(`  ida e volta : ${ms(tempos[2])}`);
      console.log(`\nPREFIXO=${prefixo}\nREGIAO=${regiao}`);
      process.exit(0);
    } catch (e) {
      await c.end().catch(() => {});
      const msg = String(e.message);
      // Senha errada significa que o HOST está certo — o projeto está aqui.
      if (/password authentication/i.test(msg)) {
        console.log(`\n${host}: o projeto ESTÁ aqui, mas a senha foi recusada.`);
        process.exit(2);
      }
    }
  }
}

console.log("\nNão encontrei o projeto em nenhuma região testada.");
process.exit(1);
