import { z } from "zod";
import { permissoesSchema } from "./permissoes";
import { conferirSenha, MENSAGEM } from "@/modules/auth/senha";

export const usuarioIdSchema = z.string().cuid("Usuário inválido.");
export const usuarioSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome.").max(120),
  email: z.string().trim().min(1, "Informe o login.").max(120)
    .regex(/^\S+$/, "O login não pode conter espaços.").toLowerCase(),
  papel: z.enum(["VENDEDOR", "ADMIN", "SUPER_ADMIN"]),
  permissoes: permissoesSchema,
});
export const editarUsuarioSchema = usuarioSchema.extend({ id: usuarioIdSchema });
export const situacaoUsuarioSchema = z.object({ id: usuarioIdSchema, ativo: z.boolean() });
export const senhaUsuarioSchema = z.object({
  id: usuarioIdSchema,
  senha: z.string().max(72, "Use até 72 caracteres.").superRefine((senha, ctx) => {
    const problema = conferirSenha(senha);
    if (problema) ctx.addIssue({ code: "custom", message: MENSAGEM[problema] });
    if (new TextEncoder().encode(senha).length > 72) {
      ctx.addIssue({ code: "custom", message: "Senha muito longa. Use até 72 bytes." });
    }
  }),
});
export type DadosUsuario = z.output<typeof usuarioSchema>;
export type EntradaUsuario = z.input<typeof usuarioSchema>;
export type EdicaoUsuario = z.output<typeof editarUsuarioSchema>;
export type SituacaoUsuario = z.output<typeof situacaoUsuarioSchema>;
export type SenhaUsuario = z.output<typeof senhaUsuarioSchema>;
