"use server";

import { redirect } from "next/navigation";
import { headers } from "next/headers";
import bcrypt from "bcryptjs";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { criarSessao, encerrarSessao, limparSessoesVencidas } from "@/lib/auth/sessao";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";

const MIN_SENHA = Number(process.env.MIN_SENHA ?? 10);
const MAX_TENTATIVAS = 20;
const JANELA_MIN = 15;

const loginSchema = z.object({
  usuario: z.string().trim().min(1, "Informe seu e-mail ou usuário").toLowerCase(),
  senha: z.string().min(1, "Informe a senha"),
});

/*
 * Limite de tentativas por (usuário + IP), gravado no BANCO — e não em
 * memória, como no app antigo. Numa função serverless cada instância tem sua
 * própria memória, então um Map em memória simplesmente não limita nada.
 * Este é um dos 5 bloqueios que a migração para a Vercel exigia resolver.
 */
async function tentativasRecentes(chave: string) {
  const desde = new Date(Date.now() - JANELA_MIN * 60_000);
  await prisma.tentativaLogin.deleteMany({ where: { criadoEm: { lt: desde } } });
  return prisma.tentativaLogin.count({ where: { chave, criadoEm: { gte: desde } } });
}

export async function loginAction(formData: FormData): Promise<Result<{ primeiroAcesso: boolean }>> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const i of parsed.error.issues) (fields[String(i.path[0] ?? "_")] ??= []).push(i.message);
    return fail("DADOS_INVALIDOS", "Confira os campos.", fields);
  }

  const { usuario, senha } = parsed.data;

  try {
    const h = await headers();
    const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
    const chave = `${usuario}|${ip}`;

    if ((await tentativasRecentes(chave)) >= MAX_TENTATIVAS) {
      return fail("SEM_PERMISSAO", `Muitas tentativas. Espere ${JANELA_MIN} minutos e tente de novo.`);
    }
    await prisma.tentativaLogin.create({ data: { chave } });

    const conta = await prisma.usuario.findFirst({
      where: { OR: [{ email: usuario }, { nome: usuario }], ativo: true },
      select: { id: true, senhaHash: true },
    });

    // Mensagem IDÊNTICA para usuário inexistente e senha errada: dizer qual
    // dos dois falhou entrega ao atacante a lista de quem tem conta.
    const generico = fail<{ primeiroAcesso: boolean }>(
      "NAO_AUTENTICADO",
      "Usuário ou senha incorretos.",
    );
    if (!conta) return generico;

    // Primeiro acesso: quem ainda não tem senha define a dele agora.
    if (conta.senhaHash === null) {
      if (senha.length < MIN_SENHA) {
        return fail("DADOS_INVALIDOS", `Sua senha precisa de pelo menos ${MIN_SENHA} caracteres.`, {
          senha: [`Mínimo de ${MIN_SENHA} caracteres`],
        });
      }
      await prisma.usuario.update({
        where: { id: conta.id },
        data: { senhaHash: await bcrypt.hash(senha, 12) },
      });
      await prisma.tentativaLogin.deleteMany({ where: { chave } });
      await criarSessao(conta.id, ip, h.get("user-agent") ?? undefined);
      await limparSessoesVencidas();
      return ok({ primeiroAcesso: true });
    }

    if (!(await bcrypt.compare(senha, conta.senhaHash))) return generico;

    await prisma.tentativaLogin.deleteMany({ where: { chave } });
    await criarSessao(conta.id, ip, h.get("user-agent") ?? undefined);
    await limparSessoesVencidas();
    return ok({ primeiroAcesso: false });
  } catch (e) {
    return tratarErro(e, "loginAction");
  }
}

export async function logoutAction() {
  await encerrarSessao();
  redirect("/login");
}
