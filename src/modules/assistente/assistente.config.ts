import "server-only";
import { z } from "zod";

export const nomeProvedorSchema = z.enum(["grok", "gemini"]);
export type NomeProvedor = z.infer<typeof nomeProvedorSchema>;
export type ConfiguracaoProvedor = { nome: NomeProvedor; chave: string; modelo: string };

function inteiro(valor: string | undefined, padrao: number, minimo: number, maximo: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao;
}
export function configuracaoAssistente() {
  const disponiveis: Record<NomeProvedor, { chave?: string; modelo?: string }> = {
    grok: { chave: process.env.GROK_API_KEY, modelo: process.env.GROK_MODEL },
    gemini: { chave: process.env.GEMINI_API_KEY, modelo: process.env.GEMINI_MODEL },
  };
  const provedores: ConfiguracaoProvedor[] = [];
  for (const item of (process.env.ASSISTENTE_PROVEDORES ?? "grok,gemini").split(",")) {
    const nome = nomeProvedorSchema.safeParse(item.trim());
    if (!nome.success || provedores.some((p) => p.nome === nome.data)) continue;
    const { chave, modelo } = disponiveis[nome.data];
    if (chave?.trim() && modelo?.trim()) provedores.push({ nome: nome.data, chave: chave.trim(), modelo: modelo.trim() });
  }
  return {
    provedores,
    chamadaMs: inteiro(process.env.ASSISTENTE_TIMEOUT_CHAMADA_MS, 15_000, 1_000, 30_000),
    totalMs: inteiro(process.env.ASSISTENTE_TIMEOUT_TOTAL_MS, 60_000, 5_000, 120_000),
    cooldownMs: inteiro(process.env.ASSISTENTE_COOLDOWN_MS, 30_000, 1_000, 120_000),
    rodadas: inteiro(process.env.ASSISTENTE_MAX_RODADAS, 4, 1, 6),
    chamadasFerramentas: inteiro(process.env.ASSISTENTE_MAX_FERRAMENTAS, 12, 1, 20),
    porMinuto: inteiro(process.env.ASSISTENTE_MENSAGENS_POR_MINUTO, 10, 1, 30),
    tokensSaida: inteiro(process.env.ASSISTENTE_MAX_TOKENS, 2_000, 256, 4_000),
  };
}
export function assistenteConfigurado() {
  return configuracaoAssistente().provedores.length > 0;
}
