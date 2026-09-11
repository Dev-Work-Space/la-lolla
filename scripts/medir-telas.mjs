/* Tempo real de cada tela, com sessão de verdade. Só leitura. */
import { chromium } from "playwright-core";

const BASE = process.argv[2] ?? "http://localhost:3000";
const EDGE = "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe";

const TELAS = [
  ["Início", "/"],
  ["Cadastros", "/cadastros"],
  ["Estoque", "/estoque"],
  ["Portal de vendas", "/vendas"],
  ["Nova venda", "/vendas/nova"],
];

const navegador = await chromium.launch({ executablePath: EDGE, headless: true });
const ctx = await navegador.newContext({ viewport: { width: 1366, height: 900 } });
const page = await ctx.newPage();

await page.goto(`${BASE}/login`, { waitUntil: "domcontentloaded" });
await page.fill("#usuario", "teste");
await page.fill("#senha", "Teste@2026!");
await page.click('button[type="submit"]');
await page.waitForURL((u) => !u.pathname.startsWith("/login"), { timeout: 30000 });

// Primeira passada: compila. Só a segunda vale como medida.
for (const [, rota] of TELAS) await page.goto(BASE + rota, { waitUntil: "networkidle" });

console.log("\n=== TEMPO DE TROCAR DE TELA (já compilada) ===\n");
for (const [nome, rota] of TELAS) {
  const tempos = [];
  for (let i = 0; i < 3; i++) {
    const t0 = performance.now();
    await page.goto(BASE + rota, { waitUntil: "domcontentloaded" });
    tempos.push(performance.now() - t0);
  }
  tempos.sort((a, b) => a - b);
  console.log(`  ${nome.padEnd(18)} ${tempos[1].toFixed(0).padStart(5)} ms`);
}

console.log("\n  Referência: com o banco no Canadá, o Início levava ~3.316 ms.\n");
await navegador.close();
