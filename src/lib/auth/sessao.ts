import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { cache } from "react";
import { prisma } from "@/lib/prisma";
import { lerPermissoes, type Permissoes } from "@/modules/usuarios/permissoes";
import type { Papel } from "@prisma/client";

export const COOKIE_SESSAO = "lalolla_sessao";
const DIAS_SESSAO = 30;

export type Sessao = {
  usuarioId: string;
  nome: string;
  email: string;
  papel: Papel;
  permissoes: Permissoes;
};

/*
 * O token vai para o cookie em texto, mas no banco guardamos só o SHA-256.
 * Quem conseguir ler a tabela `sessoes` não consegue se passar por ninguém —
 * é o mesmo raciocínio de guardar senha em hash.
 *
 * SHA-256 (e não bcrypt) porque o token já é 256 bits aleatórios: não há o
 * que adivinhar, e a checagem acontece a cada requisição.
 */
export function gerarToken() {
  const token = randomBytes(32).toString("base64url");
  return { token, hash: hashToken(token) };
}

export function hashToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

/**
 * Lê a sessão da requisição atual.
 *
 * `cache()` do React memoiza por REQUISIÇÃO: o layout, a página e três
 * componentes podem chamar `sessaoAtual()` que o banco é consultado uma vez só.
 */
export const sessaoAtual = cache(async (): Promise<Sessao | null> => {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (!token) return null;

  const registro = await prisma.sessao.findUnique({
    where: { tokenHash: hashToken(token) },
    select: {
      expiraEm: true,
      usuario: {
        select: { id: true, nome: true, email: true, papel: true, permissoes: true, ativo: true },
      },
    },
  });

  if (!registro) return null;
  if (registro.expiraEm < new Date()) return null;
  if (!registro.usuario.ativo) return null;

  const u = registro.usuario;
  return {
    usuarioId: u.id,
    nome: u.nome,
    email: u.email,
    papel: u.papel,
    permissoes: lerPermissoes(u.permissoes, u.papel),
  };
});

export async function criarSessao(usuarioId: string, ip?: string, userAgent?: string) {
  const { token, hash } = gerarToken();
  const expiraEm = new Date(Date.now() + DIAS_SESSAO * 24 * 60 * 60 * 1000);

  await prisma.sessao.create({
    data: { usuarioId, tokenHash: hash, expiraEm, ip, userAgent },
  });

  const jar = await cookies();
  jar.set(COOKIE_SESSAO, token, {
    httpOnly: true, // JavaScript da página não lê: protege contra XSS
    sameSite: "strict", // o cookie não viaja em requisição de outro site: protege contra CSRF
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiraEm,
  });

  return token;
}

export async function encerrarSessao() {
  const jar = await cookies();
  const token = jar.get(COOKIE_SESSAO)?.value;
  if (token) {
    await prisma.sessao.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  jar.delete(COOKIE_SESSAO);
}

/** Remove sessões vencidas. Chamado no login — sem cron, sem processo vivo. */
export async function limparSessoesVencidas() {
  await prisma.sessao.deleteMany({ where: { expiraEm: { lt: new Date() } } });
}
