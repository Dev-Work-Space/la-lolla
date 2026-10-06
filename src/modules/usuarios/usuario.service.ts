import "server-only";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { ErroDominio } from "@/lib/errors";
import { lerPermissoes, TUDO_LIBERADO } from "./permissoes";
import { administrador, superProtegido } from "./usuario.regras";
import type { DadosUsuario, EdicaoUsuario, SituacaoUsuario, SenhaUsuario } from "./usuario.schemas";

export async function listarUsuarios() {
  const usuarios = await prisma.usuario.findMany({
    select: { id: true, nome: true, email: true, papel: true, permissoes: true, ativo: true },
    orderBy: [{ nome: "asc" }, { id: "asc" }],
  });
  return usuarios.map((u) => ({ ...u, permissoes: lerPermissoes(u.permissoes, u.papel) }));
}
export type UsuarioListado = Awaited<ReturnType<typeof listarUsuarios>>[number];

// Releitura dentro da transação evita usar privilégios retirados por outro administrador.
async function gestor(tx: Prisma.TransactionClient, autorId: string) {
  const autor = await tx.usuario.findUnique({ where: { id: autorId }, select: { id: true, papel: true, ativo: true } });
  if (!autor?.ativo || !administrador(autor.papel)) {
    throw new ErroDominio("SEM_PERMISSAO", "Somente administradores podem gerenciar usuários.");
  }
  return autor;
}
async function alvo(tx: Prisma.TransactionClient, id: string, papelAutor: string) {
  const usuario = await tx.usuario.findUnique({ where: { id }, select: { id: true, email: true, papel: true, ativo: true } });
  if (!usuario) throw new ErroDominio("NAO_ENCONTRADO", "Usuário não encontrado.");
  if (superProtegido(usuario) && papelAutor !== "SUPER_ADMIN") {
    throw new ErroDominio("SEM_PERMISSAO", "Somente superadministradores podem editar esta conta.");
  }
  return usuario;
}
function conferirPapel(dados: DadosUsuario, papelAutor: string) {
  if (superProtegido(dados) && papelAutor !== "SUPER_ADMIN") {
    throw new ErroDominio("SEM_PERMISSAO", "Somente superadministradores podem atribuir esse perfil ou login reservado.");
  }
  if (superProtegido(dados) && dados.papel !== "SUPER_ADMIN") {
    throw new ErroDominio("REGRA_NEGOCIO", "Esse login é reservado a um superadministrador.");
  }
}
const isolamento = { isolationLevel: Prisma.TransactionIsolationLevel.Serializable };

export async function criarUsuario(autorId: string, dados: DadosUsuario) {
  return prisma.$transaction(async (tx) => {
    const autor = await gestor(tx, autorId);
    conferirPapel(dados, autor.papel);
    return tx.usuario.create({
      data: { ...dados, permissoes: administrador(dados.papel) ? TUDO_LIBERADO() : dados.permissoes },
      select: { id: true },
    });
  }, isolamento);
}
export async function editarUsuario(autorId: string, { id, ...dados }: EdicaoUsuario) {
  return prisma.$transaction(async (tx) => {
    const autor = await gestor(tx, autorId);
    const usuario = await alvo(tx, id, autor.papel);
    conferirPapel(dados, autor.papel);
    if (superProtegido(usuario) && (dados.papel !== usuario.papel || dados.email !== usuario.email)) {
      throw new ErroDominio("REGRA_NEGOCIO", "O perfil e o login de superadministradores são protegidos.");
    }
    if (id === autorId && dados.papel !== autor.papel) {
      throw new ErroDominio("REGRA_NEGOCIO", "Você não pode alterar seu próprio perfil.");
    }
    await tx.usuario.update({ where: { id }, data: {
      ...dados, permissoes: administrador(dados.papel) ? TUDO_LIBERADO() : dados.permissoes,
    } });
    // A própria conta mantém o perfil; as demais devem entrar novamente.
    if (id !== autorId) await tx.sessao.deleteMany({ where: { usuarioId: id } });
    return { id };
  }, isolamento);
}
export async function mudarSituacaoUsuario(autorId: string, { id, ativo }: SituacaoUsuario) {
  return prisma.$transaction(async (tx) => {
    const autor = await gestor(tx, autorId);
    const usuario = await alvo(tx, id, autor.papel);
    if (!ativo && (id === autorId || superProtegido(usuario))) {
      throw new ErroDominio("REGRA_NEGOCIO", "Não é possível desativar sua conta ou um superadministrador.");
    }
    await tx.usuario.update({ where: { id }, data: { ativo } });
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    return { id };
  }, isolamento);
}
export async function redefinirSenhaUsuario(autorId: string, { id, senha }: SenhaUsuario) {
  const senhaHash = await bcrypt.hash(senha, 12);
  return prisma.$transaction(async (tx) => {
    const autor = await gestor(tx, autorId);
    await alvo(tx, id, autor.papel);
    await tx.usuario.update({ where: { id }, data: { senhaHash } });
    await tx.sessao.deleteMany({ where: { usuarioId: id } });
    return { id };
  }, isolamento);
}
