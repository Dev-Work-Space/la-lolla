import "server-only";
import type { ConfiguracaoProvedor } from "../assistente.config";
import { criarGroq } from "./groq";
import { criarGrok } from "./grok";
import { criarGemini } from "./gemini";

export function criarProvedores(configuracoes: ConfiguracaoProvedor[]) {
  return configuracoes.map((p) => ({
    nome: p.nome,
    criar: () => {
      switch (p.nome) {
        case "groq": return criarGroq(p);
        case "grok": return criarGrok(p);
        case "gemini": return criarGemini(p);
      }
    },
  }));
}
