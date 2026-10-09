import "server-only";
import type { ConfiguracaoProvedor } from "../assistente.config";
import { criarGrok } from "./grok";
import { criarGemini } from "./gemini";

export function criarProvedores(configuracoes: ConfiguracaoProvedor[]) {
  return configuracoes.map((p) => ({ nome: p.nome, criar: () => p.nome === "grok" ? criarGrok(p) : criarGemini(p) }));
}
