"use server";

import { exigirSessao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { chatInputSchema, resumoInputSchema } from "./assistente.schemas";
import { enviarMensagem, resumirTela } from "./assistente.service";
import type { ChatOutput } from "./assistente.schemas";

/*
 * Server Actions do assistente.
 *
 * Permissão: exigirSessao() — qualquer usuário autenticado pode conversar.
 * Cada ferramenta chamada internamente verifica a permissão do módulo
 * correspondente (ex.: financeiro.ver), garantindo que VENDEDOR sem acesso
 * financeiro simplesmente não receba dados de custo ou caixa.
 *
 * Segurança extra aplicada aqui:
 * - Limite de 10 requisições por usuário por minuto (rate limit em memória).
 *   Em produção multi-instância (Vercel functions) o contador não agrega
 *   entre replicas, mas ainda protege cada instância individualmente.
 */

/* ─── Rate limit simples em memória ─────────────────────────── */

const LIMITE_POR_MINUTO = 10;
const JANELA_MS = 60_000;

// Mapa userId → array de timestamps das chamadas recentes.
const _rateLimitMap = new Map<string, number[]>();

function verificarRateLimit(usuarioId: string): boolean {
  const agora = Date.now();
  const recentes = (_rateLimitMap.get(usuarioId) ?? []).filter(
    (t) => agora - t < JANELA_MS,
  );
  if (recentes.length >= LIMITE_POR_MINUTO) return false;
  _rateLimitMap.set(usuarioId, [...recentes, agora]);
  return true;
}

/* ─── Actions ────────────────────────────────────────────────── */

/**
 * Envia uma mensagem ao assistente e retorna a resposta.
 */
export async function enviarMensagemAction(
  input: unknown,
): Promise<Result<ChatOutput>> {
  try {
    const sessaoResult = await exigirSessao();
    if (!sessaoResult.ok) return sessaoResult;
    const sessao = sessaoResult.data;

    const parse = chatInputSchema.safeParse(input);
    if (!parse.success) {
      return fail("DADOS_INVALIDOS", parse.error.issues[0]?.message ?? "Dados inválidos.");
    }
    const { mensagem, historico } = parse.data;

    if (!verificarRateLimit(sessao.usuarioId)) {
      return ok({
        resposta:
          "Você enviou muitas mensagens em pouco tempo. Aguarde um momento antes de continuar.",
      });
    }

    const resposta = await enviarMensagem(mensagem, historico, sessao);
    return ok({ resposta });
  } catch (e) {
    return tratarErro(e, "enviarMensagemAction");
  }
}

/**
 * Gera um resumo automático da tela atual.
 */
export async function resumirTelaAction(
  input: unknown,
): Promise<Result<ChatOutput>> {
  try {
    const sessaoResult = await exigirSessao();
    if (!sessaoResult.ok) return sessaoResult;
    const sessao = sessaoResult.data;

    const parse = resumoInputSchema.safeParse(input);
    if (!parse.success) {
      return fail("DADOS_INVALIDOS", parse.error.issues[0]?.message ?? "Dados inválidos.");
    }
    const { tela } = parse.data;

    if (!verificarRateLimit(sessao.usuarioId)) {
      return ok({
        resposta:
          "Você enviou muitas mensagens em pouco tempo. Aguarde um momento antes de continuar.",
      });
    }

    const resposta = await resumirTela(tela, sessao);
    return ok({ resposta });
  } catch (e) {
    return tratarErro(e, "resumirTelaAction");
  }
}
