import "server-only";
import { ApiError, GoogleGenAI, type Content } from "@google/genai";
import type { ConfiguracaoProvedor } from "../assistente.config";
import { FalhaProvedor, normalizarFalha, type MensagemProvedor, type Provedor, type RespostaProvedor } from "./provedor";

export function criarGemini(config: ConfiguracaoProvedor): Provedor {
  const cliente = new GoogleGenAI({ apiKey: config.chave, httpOptions: { retryOptions: { attempts: 1 } } });
  const originais = new WeakMap<RespostaProvedor, Content>();
  const idsOriginais = new Map<string, string | undefined>();
  function converter(m: MensagemProvedor): Content {
    if (m.papel === "contexto") return { role: "user", parts: [{ text: `Resultado da consulta ${m.nome} executada pelo servidor:\n${m.resultado}` }] };
    if (m.papel === "usuario") return { role: "user", parts: [{ text: m.texto }] };
    if (m.papel === "ferramenta") return {
      role: "user", parts: [{ functionResponse: { id: idsOriginais.get(m.id), name: m.nome, response: { resultado: m.resultado } } }],
    };
    // Preserva thoughtSignature e a ordem original dos parts no mesmo provedor.
    return originais.get(m) ?? { role: "model", parts: [
      ...(m.texto ? [{ text: m.texto }] : []),
      ...m.chamadas.map((c) => ({ functionCall: { name: c.nome, args: typeof c.argumentos === "object" && c.argumentos !== null ? Object.fromEntries(Object.entries(c.argumentos)) : {} } })),
    ] };
  }
  return {
    nome: "gemini",
    async responder(pedido) {
      try {
        const contents: Content[] = [];
        for (const [indice, mensagem] of pedido.mensagens.entries()) {
          const convertido = converter(mensagem);
          // Chamadas paralelas exigem todas as respostas no MESMO conteúdo.
          if (mensagem.papel === "ferramenta" && pedido.mensagens[indice - 1]?.papel === "ferramenta") {
            const anterior = contents[contents.length - 1];
            anterior.parts = [...(anterior.parts ?? []), ...(convertido.parts ?? [])];
          } else {
            contents.push(convertido);
          }
        }
        const resposta = await cliente.models.generateContent({
          model: config.modelo,
          contents,
          config: {
            systemInstruction: pedido.instrucao,
            tools: [{ functionDeclarations: pedido.ferramentas.map((f) => ({ name: f.nome, description: f.descricao, parametersJsonSchema: f.parametros })) }],
            abortSignal: pedido.sinal, maxOutputTokens: pedido.tokensSaida,
            httpOptions: { retryOptions: { attempts: 1 } },
          },
        });
        const candidato = resposta.candidates?.[0];
        if (!candidato?.content || (candidato.finishReason && candidato.finishReason !== "STOP")) throw new FalhaProvedor("resposta_invalida");
        const saida: RespostaProvedor = { papel: "assistente", texto: "", chamadas: [] };
        for (const parte of candidato.content.parts ?? []) {
          if (parte.functionCall) {
            const chamada = parte.functionCall;
            if (!chamada.name) throw new FalhaProvedor("resposta_invalida");
            const id = chamada.id ?? crypto.randomUUID();
            idsOriginais.set(id, chamada.id);
            saida.chamadas.push({ id, nome: chamada.name, argumentos: chamada.args ?? {} });
          } else if (parte.text && !parte.thought) {
            saida.texto += parte.text;
          }
        }
        saida.texto = saida.texto.trim();
        if (!saida.texto && !saida.chamadas.length) throw new FalhaProvedor("resposta_vazia");
        if (new Set(saida.chamadas.map((c) => c.id)).size !== saida.chamadas.length) throw new FalhaProvedor("resposta_invalida");
        originais.set(saida, candidato.content);
        return saida;
      } catch (erro) {
        if (erro instanceof ApiError) throw new FalhaProvedor("http", erro.status);
        throw normalizarFalha(erro);
      }
    },
  };
}
