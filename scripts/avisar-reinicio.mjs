/* Lembrete impossível de ignorar. O `next dev` que já está no ar continua com
   o client do Prisma ANTIGO em memória: o sintoma é "Unknown argument X" com
   schema e typecheck corretos. Já custou três investigações. */
const linha = "═".repeat(64);
console.log(`\n${linha}`);
console.log("  MIGRATION APLICADA — REINICIE O SERVIDOR DE DESENVOLVIMENTO");
console.log("");
console.log("  O `next dev` em execução ainda tem o client ANTIGO em memória.");
console.log("  Sem reiniciar, a tela falha com \"Unknown argument ...\" mesmo");
console.log("  com o schema e o typecheck corretos.");
console.log(`${linha}\n`);
