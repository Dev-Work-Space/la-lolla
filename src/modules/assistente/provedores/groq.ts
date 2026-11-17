import "server-only";
import { z } from "zod";
import type { ConfiguracaoProvedor } from "../assistente.config";
import { FalhaProvedor, normalizarFalha, type MensagemProvedor, type Provedor, type RespostaProvedor } from "./provedor";

const chamadaSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1).max(100),
    arguments: z.string().max(8_000),
  }),
});
const respostaSchema = z.object({
  choices: z.array(z.object({
    finish_reason: z.enum(["stop", "tool_calls"]),
    message: z.object({
      role: z.literal("assistant"),
      content: z.string().max(30_000).nullable().optional(),
      tool_calls: z.array(chamadaSchema).max(20).optional(),
    }),
  })).length(1),
});

function converter(m: MensagemProvedor) {
  if (m.papel === "usuario") return { role: "user", content: m.texto };
  if (m.papel === "contexto") return {
    role: "user", content: `Resultado da consulta ${m.nome} executada pelo servidor:\n${m.resultado}`,
  };
  if (m.papel === "ferramenta") return { role: "tool", tool_call_id: m.id, content: m.resultado };
  return {
    role: "assistant",
    content: m.texto || null,
    ...(m.chamadas.length ? {
      tool_calls: m.chamadas.map((c) => ({
        id: c.id, type: "function", function: { name: c.nome, arguments: JSON.stringify(c.argumentos) },
      })),
    } : {}),
  };
}

/** Groq (console.groq.com) é um serviço distinto do Grok/xAI. */
export function criarGroq(config: ConfiguracaoProvedor): Provedor {
  return {
    nome: "groq",
    async responder(pedido) {
      try {
        const resposta = await fetch("https://api.groq.com/openai/v1/chat/completions", {
          method: "POST", cache: "no-store", signal: pedido.sinal,
          headers: { Authorization: `Bearer ${config.chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.modelo,
            messages: [{ role: "system", content: pedido.instrucao }, ...pedido.mensagens.map(converter)],
            tools: pedido.ferramentas.map((f) => ({
              type: "function", function: { name: f.nome, description: f.descricao, parameters: f.parametros },
            })),
            stream: false,
            max_completion_tokens: pedido.tokensSaida,
          }),
        });
        if (!resposta.ok) {
          await resposta.body?.cancel();
          throw new FalhaProvedor("http", resposta.status);
        }
        let bruto: unknown;
        try { bruto = await resposta.json(); } catch (erro) {
          if (erro instanceof SyntaxError) throw new FalhaProvedor("resposta_invalida");
          throw erro;
        }
        const dados = respostaSchema.safeParse(bruto);
        if (!dados.success) throw new FalhaProvedor("resposta_invalida");
        const escolha = dados.data.choices[0];
        const saida: RespostaProvedor = {
          papel: "assistente", texto: escolha.message.content?.trim() ?? "", chamadas: [],
        };
        for (const chamada of escolha.message.tool_calls ?? []) {
          let argumentos: unknown;
          try { argumentos = JSON.parse(chamada.function.arguments); } catch {
            throw new FalhaProvedor("resposta_invalida");
          }
          saida.chamadas.push({ id: chamada.id, nome: chamada.function.name, argumentos });
        }
        if (escolha.finish_reason === "tool_calls" && !saida.chamadas.length) throw new FalhaProvedor("resposta_invalida");
        if (!saida.texto && !saida.chamadas.length) throw new FalhaProvedor("resposta_vazia");
        if (new Set(saida.chamadas.map((c) => c.id)).size !== saida.chamadas.length) throw new FalhaProvedor("resposta_invalida");
        return saida;
      } catch (erro) {
        throw normalizarFalha(erro);
      }
    },
  };
}
