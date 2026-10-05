/*
 * Seed inicial. IDEMPOTENTE: pode rodar quantas vezes quiser sem duplicar
 * nem sobrescrever nada que já exista.
 *
 * Nenhuma senha aqui dentro. Os usuários nascem com senhaHash = null, que é
 * o "primeiro acesso": a primeira senha que a pessoa digitar no login vira a
 * senha dela. Senha em arquivo de seed acaba em backup, em Git e em print.
 */
import { prisma } from "../src/lib/prisma";
import { TUDO_LIBERADO } from "../src/modules/usuarios/permissoes";

const CATEGORIAS = ["Anéis", "Brincos", "Colares", "Pulseiras", "Correntes", "Pingentes", "Conjuntos"];

async function main() {
  // ── Super admins ────────────────────────────────────────────
  for (const [email, nome] of [
    ["joao", "João"],
    ["hemily", "Hemily"],
  ] as const) {
    const u = await prisma.usuario.upsert({
      where: { email },
      update: {}, // não mexe em quem já existe — nunca reseta senha
      create: { email, nome, papel: "SUPER_ADMIN", permissoes: TUDO_LIBERADO() },
      select: { id: true, email: true, senhaHash: true },
    });
    console.log(
      `usuario ${u.email}: ${u.senhaHash ? "já tem senha" : "PRIMEIRO ACESSO — define no login"}`,
    );
  }

  // ── Carteiras ───────────────────────────────────────────────
  // O "cofrinho" sim-ou-não virou `tipo` na migração de 16/09; o seed tinha
  // ficado para trás e quebrava num banco novo.
  const carteiras = [
    { nome: "Caixa", tipo: "ESPECIE" as const, ordem: 0 },
    { nome: "Banco", tipo: "CONTA" as const, ordem: 1 },
    { nome: "Cofrinho", tipo: "RESERVA" as const, ordem: 2 },
  ];
  for (const c of carteiras) {
    await prisma.carteira.upsert({ where: { nome: c.nome }, update: {}, create: c });
  }
  console.log(`carteiras: ${carteiras.length}`);

  // ── Config ──────────────────────────────────────────────────
  await prisma.config.upsert({
    where: { chave: "categorias" },
    update: {}, // NÃO sobrescreve: o João pode ter editado a lista
    create: { chave: "categorias", valor: CATEGORIAS },
  });
  await prisma.config.upsert({
    where: { chave: "loja" },
    update: {},
    create: { chave: "loja", valor: { nome: "LaLolla", assinatura: "semijoias" } },
  });
  console.log("config: categorias, loja");
}

main()
  .catch((e) => {
    console.error("seed falhou:", e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
