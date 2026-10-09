import { z } from "zod";

export const MAX_MENSAGEM = 800;
export const MAX_HISTORICO = 20;
export const MAX_TEXTO_HISTORICO = 16_000;
export const MAX_RESPOSTA = 6_000;

export const mensagemSchema = z.strictObject({
  papel: z.enum(["user", "model"]),
  texto: z.string().trim().min(1).max(MAX_RESPOSTA),
});
export type Mensagem = z.infer<typeof mensagemSchema>;
export const telaSchema = z.enum(["inicio", "vendas", "orcamentos", "financeiro", "estoque", "compras"]);
export type Tela = z.infer<typeof telaSchema>;

export const entradaSchema = z.discriminatedUnion("modo", [
  z.strictObject({
    modo: z.literal("chat"),
    mensagem: z.string().trim().min(1, "Digite uma mensagem.").max(MAX_MENSAGEM),
    historico: z.array(mensagemSchema).max(MAX_HISTORICO).default([]).refine(
      (mensagens) => mensagens.reduce((total, m) => total + m.texto.length, 0) <= MAX_TEXTO_HISTORICO,
      "Histórico muito longo. Limpe a conversa.",
    ),
  }),
  z.strictObject({ modo: z.literal("resumo"), tela: telaSchema }),
]);
export type EntradaAssistente = z.infer<typeof entradaSchema>;
export type ChatOutput = { resposta: string };

const camposPeriodo = {
  periodo: z.enum(["hoje", "semana", "mes", "ano"]).default("mes"),
  de: z.iso.date().optional().describe("Início opcional YYYY-MM-DD; informe também ate."),
  ate: z.iso.date().optional().describe("Fim inclusivo YYYY-MM-DD, no máximo 366 dias após de."),
};
export const periodoSchema = z.strictObject(camposPeriodo).superRefine((p, ctx) => {
  if (Boolean(p.de) !== Boolean(p.ate)) {
    ctx.addIssue({ code: "custom", message: "Informe as duas datas." });
  } else if (p.de && p.ate) {
    const dias = (Date.parse(p.ate) - Date.parse(p.de)) / 86_400_000;
    if (dias < 0 || dias > 366) ctx.addIssue({ code: "custom", message: "Período inválido (máximo 366 dias)." });
  }
});
export type Periodo = z.infer<typeof periodoSchema>;

export const esquemasFerramentas = {
  buscarEstoque: z.strictObject({
    filtro: z.enum(["todos", "zeradas", "acabando", "insumos"]).default("todos"),
    busca: z.string().trim().max(100).optional(),
  }),
  detalharPeca: z.strictObject({ sku: z.string().trim().min(1).max(80) }),
  resumirVendas: periodoSchema,
  listarOrcamentosAbertos: periodoSchema.safeExtend({ incluirVencidos: z.boolean().default(true) }),
  resumirFinanceiro: periodoSchema,
  listarContas: periodoSchema.safeExtend({
    tipo: z.enum(["PAGAR", "RECEBER", "ambos"]).default("ambos"),
    situacao: z.enum(["periodo", "vencidas", "proximos7dias"]).default("periodo"),
  }),
  resumirCompras: periodoSchema,
};
export const nomeFerramentaSchema = z.object(esquemasFerramentas).keyof();
export type NomeFerramenta = z.infer<typeof nomeFerramentaSchema>;
