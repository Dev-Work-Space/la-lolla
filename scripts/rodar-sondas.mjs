/*
 * Roda todas as sondas em fila e resume no fim.
 *
 *   npm run sondas                       (contra http://localhost:3000)
 *   npm run sondas -- http://10.0.0.5:3000
 *
 * Precisa do app no ar em outro terminal.
 *
 * Existe porque rodar onze comandos na mão e somar os números de cabeça é
 * como se perde uma falha: a linha some no meio do rolo do terminal.
 */
import { spawn } from "node:child_process";

const BASE = process.argv[2] ?? "http://localhost:3000";

const SONDAS = [
  "lateral",
  "painel",
  "cadastros",
  "estoque",
  "ficha",
  "vendas",
  "orcamentos",
  "pdf-orcamento",
  "recibo",
  "financeiro",
  "cartao",
  "agenda",
  "compras",
  "regras",
  "comunicacao",
  "celular",
];

/*
 * `--env-file=.env` é obrigatório para as sondas que conversam com o banco
 * (compras, comunicacao, ficha, financeiro, painel, regras, vendas): elas leem
 * `process.env.DATABASE_URL` direto, e `node` puro não carrega o .env sozinho
 * — quem carrega é o Next.
 *
 * Sem isso a URL vem vazia, o Prisma tenta um banco local que não existe e a
 * sonda morre com ECONNREFUSED antes de conferir coisa alguma. A convenção
 * antiga era `npx dotenvx run --`, um pacote a mais; o Node 20+ já faz nativo.
 */
function rodar(nome) {
  return new Promise((resolve) => {
    const p = spawn(process.execPath, ["--env-file=.env", `scripts/sonda-${nome}.mjs`, BASE], {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let saida = "";
    p.stdout.on("data", (d) => (saida += d));
    p.stderr.on("data", (d) => (saida += d));
    p.on("close", () => {
      const m = saida.match(/RESULTADO: (\d+) passaram, (\d+) falharam/);
      const falhas = saida
        .split("\n")
        .filter((l) => l.startsWith("  FALHA") || l.startsWith("ERRO"));
      resolve({
        nome,
        passou: Number(m?.[1] ?? 0),
        falhou: Number(m?.[2] ?? 1),
        falhas,
      });
    });
  });
}

console.log(`\nRodando as sondas contra ${BASE}\n`);

let totalPassou = 0;
let totalFalhou = 0;

for (const nome of SONDAS) {
  const r = await rodar(nome);
  totalPassou += r.passou;
  totalFalhou += r.falhou;
  const marca = r.falhou === 0 ? "ok  " : "FALHA";
  console.log(`  ${marca} ${nome.padEnd(13)} ${r.passou} passaram, ${r.falhou} falharam`);
  for (const f of r.falhas) console.log(`        ${f.trim()}`);
}

console.log(`\n  TOTAL: ${totalPassou} passaram, ${totalFalhou} falharam\n`);
process.exitCode = totalFalhou === 0 ? 0 : 1;
