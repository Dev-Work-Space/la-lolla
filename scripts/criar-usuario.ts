/*
 * Cria ou atualiza um usuário pela linha de comando.
 *
 *   npx tsx scripts/criar-usuario.ts <email> "<Nome>" <PAPEL> [senha]
 *
 *   PAPEL: SUPER_ADMIN | ADMIN | VENDEDOR
 *   senha: opcional. SEM ela o usuário nasce em "primeiro acesso" — a
 *          primeira senha digitada no login vira a dele. É o modo preferido:
 *          senha em linha de comando fica no histórico do terminal.
 *
 * Exemplos:
 *   npx tsx scripts/criar-usuario.ts vendedora "Maria" VENDEDOR
 *   npx tsx scripts/criar-usuario.ts teste "Teste" ADMIN "Teste@2026!"
 */
import bcrypt from "bcryptjs";
import { prisma } from "../src/lib/prisma";
import { TUDO_LIBERADO, permissoesVendedor } from "../src/modules/usuarios/permissoes";
import type { Papel } from "@prisma/client";

const PAPEIS = ["SUPER_ADMIN", "ADMIN", "VENDEDOR"] as const;
const MIN_SENHA = Number(process.env.MIN_SENHA ?? 10);

async function main() {
  const [email, nome, papelBruto, senha] = process.argv.slice(2);

  if (!email || !nome || !papelBruto) {
    console.error('uso: tsx scripts/criar-usuario.ts <email> "<Nome>" <PAPEL> [senha]');
    console.error(`PAPEL: ${PAPEIS.join(" | ")}`);
    process.exitCode = 1;
    return;
  }

  const papel = papelBruto.toUpperCase() as Papel;
  if (!PAPEIS.includes(papel as (typeof PAPEIS)[number])) {
    console.error(`papel inválido: ${papelBruto}. Use ${PAPEIS.join(", ")}.`);
    process.exitCode = 1;
    return;
  }

  if (senha && senha.length < MIN_SENHA) {
    console.error(`senha curta: mínimo ${MIN_SENHA} caracteres.`);
    process.exitCode = 1;
    return;
  }

  const permissoes = papel === "VENDEDOR" ? permissoesVendedor() : TUDO_LIBERADO();
  const senhaHash = senha ? await bcrypt.hash(senha, 12) : null;

  const existente = await prisma.usuario.findUnique({
    where: { email: email.toLowerCase() },
    select: { id: true },
  });

  const u = await prisma.usuario.upsert({
    where: { email: email.toLowerCase() },
    // Numa atualização, senha só muda se foi passada de propósito.
    update: { nome, papel, permissoes, ...(senhaHash ? { senhaHash } : {}), ativo: true },
    create: { email: email.toLowerCase(), nome, papel, permissoes, senhaHash },
    select: { id: true, email: true, nome: true, papel: true, senhaHash: true },
  });

  console.log(`${existente ? "atualizado" : "criado"}: ${u.email} · ${u.nome} · ${u.papel}`);
  console.log(u.senhaHash ? "senha: definida" : "senha: PRIMEIRO ACESSO (define no login)");
}

main()
  .catch((e) => {
    console.error("falhou:", e instanceof Error ? e.message : e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
