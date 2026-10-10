import "server-only";
import { z } from "zod";
import type { ConfiguracaoProvedor } from "../assistente.config";
import { FalhaProvedor, normalizarFalha, type MensagemProvedor, type Provedor, type RespostaProvedor } from "./provedor";

const itemSchema = z.looseObject({ type: z.string() });
const respostaSchema = z.object({ status: z.literal("completed"), output: z.array(itemSchema).max(40) });
const chamadaSchema = z.object({
  call_id: z.string().min(1).max(200), name: z.string().min(1).max(100), arguments: z.string().max(8_000),
});
const textoSchema = z.object({ content: z.array(z.object({ type: z.string(), text: z.string().max(30_000).optional() })).max(20) });

export function criarGrok(config: ConfiguracaoProvedor): Provedor {
  // Continuação opaca fica apenas neste adaptador/turno. Nunca cruza o fallback.
  const originais = new WeakMap<RespostaProvedor, z.infer<typeof itemSchema>[]>();
  function converter(m: MensagemProvedor): unknown[] {
    if (m.papel === "ferramenta") return [{ type: "function_call_output", call_id: m.id, output: m.resultado }];
    if (m.papel === "contexto") return [{ role: "user", content: `Resultado da consulta ${m.nome} executada pelo servidor:\n${m.resultado}` }];
    if (m.papel === "usuario") return [{ role: "user", content: m.texto }];
    const original = originais.get(m);
    if (original) return original;
    return [
      ...(m.texto ? [{ role: "assistant", content: m.texto }] : []),
      ...m.chamadas.map((c) => ({ type: "function_call", call_id: c.id, name: c.nome, arguments: JSON.stringify(c.argumentos) })),
    ];
  }
  return {
    nome: "grok",
    async responder(pedido) {
      try {
        const resposta = await fetch("https://api.x.ai/v1/responses", {
          method: "POST", cache: "no-store", signal: pedido.sinal,
          headers: { Authorization: `Bearer ${config.chave}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: config.modelo, instructions: pedido.instrucao,
            input: pedido.mensagens.flatMap(converter),
            tools: pedido.ferramentas.map((f) => ({ type: "function", name: f.nome, description: f.descricao, parameters: f.parametros, strict: false })),
            stream: false, store: false, include: ["reasoning.encrypted_content"],
            max_output_tokens: pedido.tokensSaida,
          }),
        });
        if (!resposta.ok) {
          await resposta.body?.cancel();
          throw new FalhaProvedor("http", resposta.status);
        }
        const dados = respostaSchema.safeParse(await resposta.json());
        if (!dados.success) throw new FalhaProvedor("resposta_invalida");
        const saida: RespostaProvedor = { papel: "assistente", texto: "", chamadas: [] };
        for (const item of dados.data.output) {
          if (item.type === "function_call") {
            const chamada = chamadaSchema.safeParse(item);
            if (!chamada.success) throw new FalhaProvedor("resposta_invalida");
            let argumentos: unknown;
            try { argumentos = JSON.parse(chamada.data.arguments); } catch { throw new FalhaProvedor("resposta_invalida"); }
            saida.chamadas.push({ id: chamada.data.call_id, nome: chamada.data.name, argumentos });
          } else if (item.type === "message") {
            const mensagem = textoSchema.safeParse(item);
            if (!mensagem.success) throw new FalhaProvedor("resposta_invalida");
            saida.texto += mensagem.data.content.filter((c) => c.type === "output_text").map((c) => c.text ?? "").join("");
          }
        }
        saida.texto = saida.texto.trim();
        if (!saida.texto && !saida.chamadas.length) throw new FalhaProvedor("resposta_vazia");
        if (new Set(saida.chamadas.map((c) => c.id)).size !== saida.chamadas.length) throw new FalhaProvedor("resposta_invalida");
        originais.set(saida, dados.data.output);
        return saida;
      } catch (erro) {
        throw normalizarFalha(erro);
      }
    },
  };
}
