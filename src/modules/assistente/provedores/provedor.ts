import type { NomeProvedor } from "../assistente.config";

export type ChamadaFerramenta = { id: string; nome: string; argumentos: unknown };
export type RespostaProvedor = { papel: "assistente"; texto: string; chamadas: ChamadaFerramenta[] };
export type MensagemProvedor =
  | { papel: "usuario"; texto: string }
  | { papel: "contexto"; nome: string; resultado: string }
  | RespostaProvedor
  | { papel: "ferramenta"; id: string; nome: string; resultado: string };
export type DefinicaoFerramenta = { nome: string; descricao: string; parametros: Record<string, unknown> };
export type PedidoProvedor = {
  instrucao: string;
  mensagens: MensagemProvedor[];
  ferramentas: DefinicaoFerramenta[];
  sinal: AbortSignal;
  tokensSaida: number;
};
export interface Provedor {
  nome: NomeProvedor;
  responder(pedido: PedidoProvedor): Promise<RespostaProvedor>;
}
export class FalhaProvedor extends Error {
  constructor(readonly motivo: "http" | "rede" | "timeout" | "resposta_invalida" | "resposta_vazia" | "limite", readonly status?: number) {
    super(motivo);
    this.name = "FalhaProvedor";
  }
}
export function normalizarFalha(erro: unknown): FalhaProvedor {
  if (erro instanceof FalhaProvedor) return erro;
  if (erro instanceof Error && ["AbortError", "TimeoutError"].includes(erro.name)) return new FalhaProvedor("timeout");
  return new FalhaProvedor("rede");
}

/** Impõe o prazo mesmo se o transporte não respeitar AbortSignal. */
export async function comPrazo<T>(operacao: (sinal: AbortSignal) => Promise<T>, ms: number, sinal?: AbortSignal): Promise<T> {
  if (ms <= 0 || sinal?.aborted) throw new FalhaProvedor("timeout");
  const controle = new AbortController();
  let rejeitar: (erro: FalhaProvedor) => void = () => {};
  const cancelar = () => { controle.abort(); rejeitar(new FalhaProvedor("timeout")); };
  const limite = new Promise<never>((_, reject) => { rejeitar = reject; });
  sinal?.addEventListener("abort", cancelar, { once: true });
  const timer = setTimeout(cancelar, ms);
  try {
    return await Promise.race([operacao(controle.signal), limite]);
  } finally {
    clearTimeout(timer);
    sinal?.removeEventListener("abort", cancelar);
  }
}
