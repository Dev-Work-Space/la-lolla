import "server-only";
import { z } from "zod";

export const nomeProvedorSchema = z.enum(["groq", "grok", "gemini"]);
export type NomeProvedor = z.infer<typeof nomeProvedorSchema>;
export type ConfiguracaoProvedor = { nome: NomeProvedor; chave: string; modelo: string };

function inteiro(valor: string | undefined, padrao: number, minimo: number, maximo: number) {
  const n = Number(valor);
  return Number.isInteger(n) && n >= minimo && n <= maximo ? n : padrao;
}
export function configuracaoAssistente(ambiente: Readonly<Record<string, string | undefined>> = process.env) {
  const disponiveis: Record<NomeProvedor, { chave?: string; modelo?: string }> = {
    groq: { chave: ambiente.GROQ_API_KEY, modelo: ambiente.GROQ_MODEL },
    grok: { chave: ambiente.GROK_API_KEY, modelo: ambiente.GROK_MODEL },
    gemini: { chave: ambiente.GEMINI_API_KEY, modelo: ambiente.GEMINI_MODEL },
  };
  const provedores: ConfiguracaoProvedor[] = [];
  for (const item of (ambiente.ASSISTENTE_PROVEDORES ?? "groq,gemini").split(",")) {
    const nome = nomeProvedorSchema.safeParse(item.trim());
    if (!nome.success || provedores.some((p) => p.nome === nome.data)) continue;
    const { chave, modelo } = disponiveis[nome.data];
    if (chave?.trim() && modelo?.trim()) provedores.push({ nome: nome.data, chave: chave.trim(), modelo: modelo.trim() });
  }
  return {
    provedores,
    chamadaMs: inteiro(ambiente.ASSISTENTE_TIMEOUT_CHAMADA_MS, 15_000, 1_000, 30_000),
    totalMs: inteiro(ambiente.ASSISTENTE_TIMEOUT_TOTAL_MS, 60_000, 5_000, 120_000),
    cooldownMs: inteiro(ambiente.ASSISTENTE_COOLDOWN_MS, 30_000, 1_000, 120_000),
    rodadas: inteiro(ambiente.ASSISTENTE_MAX_RODADAS, 4, 1, 6),
    chamadasFerramentas: inteiro(ambiente.ASSISTENTE_MAX_FERRAMENTAS, 12, 1, 20),
    porMinuto: inteiro(ambiente.ASSISTENTE_MENSAGENS_POR_MINUTO, 10, 1, 30),
    tokensSaida: inteiro(ambiente.ASSISTENTE_MAX_TOKENS, 2_000, 256, 4_000),
  };
}
export function assistenteConfigurado() {
  return configuracaoAssistente().provedores.length > 0;
}
