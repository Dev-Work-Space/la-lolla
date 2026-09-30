import { z } from "zod";

/*
 * Schemas do módulo assistente — SEM "use server".
 * Módulos neutros entre servidor e cliente nunca importam server-only.
 */

/* ─── Mensagem de chat ────────────────────────────────────────── */

export const papelSchema = z.enum(["user", "model"]);
export type Papel = z.infer<typeof papelSchema>;

export const mensagemSchema = z.object({
  papel: papelSchema,
  texto: z.string(),
});
export type Mensagem = z.infer<typeof mensagemSchema>;

/* ─── Entrada da action de chat ──────────────────────────────── */

export const chatInputSchema = z.object({
  /** Mensagem atual do usuário. Limite generoso mas não ilimitado. */
  mensagem: z
    .string()
    .trim()
    .min(1, "Digite uma mensagem.")
    .max(800, "Mensagem muito longa (máximo 800 caracteres)."),

  /**
   * Histórico anterior (client-side memory). Só as últimas N mensagens são
   * enviadas ao modelo para controlar custo e contexto.
   */
  historico: z.array(mensagemSchema).default([]),
});
export type ChatInput = z.infer<typeof chatInputSchema>;

/* ─── Entrada da action de resumo ────────────────────────────── */

export const telaSchema = z.enum([
  "inicio",
  "vendas",
  "orcamentos",
  "financeiro",
  "estoque",
  "compras",
]);
export type Tela = z.infer<typeof telaSchema>;

export const resumoInputSchema = z.object({
  tela: telaSchema,
  /** Id do registro aberto, quando aplicável (venda, peça, etc.). */
  registroId: z.string().optional(),
});
export type ResumoInput = z.infer<typeof resumoInputSchema>;

/* ─── Saída ──────────────────────────────────────────────────── */

export type ChatOutput = {
  resposta: string;
};
