import { z } from "zod";

/*
 * Uma fonte só de verdade. Este schema é usado em três lugares:
 *   1. formulário (react-hook-form + zodResolver) — feedback instantâneo
 *   2. Server Action (safeParse) — a validação que VALE
 *   3. tipos (z.infer) — sem duplicar tipo à mão ao lado do schema
 */

/** Aceita "12,50" (vírgula do teclado brasileiro) e "12.50". */
const decimalBr = z
  .union([z.string(), z.number()])
  .transform((v) => (typeof v === "number" ? v : Number(v.trim().replace(/\./g, "").replace(",", "."))))
  .refine((n) => Number.isFinite(n), { message: "Valor inválido" });

const opcionalDecimal = z
  .union([z.literal(""), z.undefined(), z.null(), decimalBr])
  .transform((v) => (v === "" || v === undefined || v === null ? undefined : (v as number)));

export const criarPecaSchema = z
  .object({
    nome: z.string().trim().min(2, "Informe o nome da peça").max(120),
    // Vazio = "Sem categoria", como no app antigo.
    categoria: z.string().trim().max(60).default(""),
    // Texto livre: aro 17, 45 cm, P/M/G, "único".
    tamanho: z.string().trim().max(30, "Use no máximo 30 letras no tamanho").optional().or(z.literal("")),
    tipo: z.enum(["PECA", "INSUMO"]).default("PECA"),

    // Regra 2.1: custo = codigoFornecedor × fator.
    // Só quem tem permissão "financeiro" envia estes dois — a action confere.
    codigoFornecedor: opcionalDecimal,
    fator: opcionalDecimal,

    precoTabela: opcionalDecimal,
    // Menor que o de tabela vira o preço da venda e o "DE" riscado na etiqueta.
    precoPromocional: opcionalDecimal,
    minimo: z
      .union([z.literal(""), z.undefined(), z.coerce.number().int().min(0, "Não pode ser negativo")])
      .transform((v) => (v === "" || v === undefined ? 0 : v)),
    /* Obrigatório, como no app antigo: é o fornecedor que liga a peça à
       reposição e ao saldo a pagar. */
    fornecedorId: z.string().trim().min(1, "Escolha o fornecedor. É ele que liga a peça à reposição e ao saldo a pagar."),
  })
  .superRefine((v, ctx) => {
    // Custo pela metade é custo errado: ou vêm os dois, ou nenhum.
    const temCodigo = v.codigoFornecedor !== undefined;
    const temFator = v.fator !== undefined;
    if (temCodigo !== temFator) {
      ctx.addIssue({
        code: "custom",
        path: [temCodigo ? "fator" : "codigoFornecedor"],
        message: "Código do fornecedor e fator andam juntos.",
      });
    }
    if (temCodigo && v.codigoFornecedor !== undefined && v.codigoFornecedor <= 0) {
      ctx.addIssue({ code: "custom", path: ["codigoFornecedor"], message: "Deve ser maior que zero." });
    }
    if (temFator && v.fator !== undefined && v.fator <= 0) {
      ctx.addIssue({ code: "custom", path: ["fator"], message: "Deve ser maior que zero." });
    }
    for (const campo of ["precoTabela", "precoPromocional"] as const) {
      const n = v[campo];
      if (n !== undefined && n <= 0) {
        ctx.addIssue({ code: "custom", path: [campo], message: "Deve ser maior que zero, ou deixe em branco." });
      }
    }
  });

export type CriarPecaInput = z.input<typeof criarPecaSchema>;
export type CriarPecaDados = z.output<typeof criarPecaSchema>;

export const editarPecaSchema = criarPecaSchema;

export const idPecaSchema = z.string().trim().min(1, "Peça não informada.").max(40);

/** O código do fornecedor digitado no cadastro, para avisar se ele já existe. */
export const codigoFornecedorSchema = decimalBr.refine((n) => n > 0, "Código inválido");

/*
 * Insumo (`formInsumo`). Mais simples que peça: sem fornecedor, sem tamanho,
 * sem foto. O custo é DIGITADO — saquinho não tem código de fornecedor para
 * multiplicar por fator.
 */
export const insumoSchema = z.object({
  nome: z.string().trim().min(2, "Informe o nome do insumo").max(120),
  unidade: z
    .union([z.literal(""), z.string().trim().max(10)])
    .transform((v) => (v === "" ? "un" : v)),
  minimo: z
    .union([z.literal(""), z.coerce.number().int().min(0, "Não pode ser negativo")])
    .transform((v) => (v === "" ? 0 : (v as number))),
  custo: opcionalDecimal,
});

export type InsumoDados = z.output<typeof insumoSchema>;

/*
 * Movimento de estoque feito à mão — os dois do app antigo (`formMovimento`).
 * ENTRADA não está aqui de propósito: peça só entra pela compra, onde passam
 * o fornecedor, a nota e o pagamento.
 */
export const movimentoSchema = z
  .object({
    pecaId: z.string().trim().min(1).max(40),
    tipo: z.enum(["devolucao", "ajuste"]),
    // Só no ajuste: baixa tira da prateleira, acréscimo põe.
    sentido: z.enum(["baixa", "acrescimo"]).optional(),
    quantidade: z.coerce.number().int().positive("Informe uma quantidade maior que zero"),
    data: z.union([z.literal(""), z.coerce.date()]).optional(),
    observacao: z.string().trim().max(200).default(""),
    credito: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
  })
  .superRefine((v, ctx) => {
    if (v.tipo === "ajuste" && !v.sentido) {
      ctx.addIssue({ code: "custom", path: ["sentido"], message: "Escolha se é baixa ou acréscimo." });
    }
    // Ajuste sem motivo é número mudado sem explicação — o que o histórico existe para evitar.
    if (v.tipo === "ajuste" && !v.observacao) {
      ctx.addIssue({ code: "custom", path: ["observacao"], message: "Descreva o motivo do ajuste." });
    }
    if (v.tipo === "ajuste" && v.credito) {
      ctx.addIssue({ code: "custom", path: ["credito"], message: "Crédito no caixa só existe na devolução." });
    }
  });

export type MovimentoDados = z.output<typeof movimentoSchema>;

/*
 * SAÍDA. Duas formas deliberadamente diferentes:
 * quem não vê financeiro recebe um objeto em que `custo` NÃO EXISTE — não é
 * `null`, não é `0`, não existe. Assim é impossível vazar por engano: se o
 * campo não está no tipo, o componente não consegue nem tentar mostrar.
 */
export type PecaPublica = {
  id: string;
  sku: string;
  nome: string;
  categoria: string;
  tamanho: string | null;
  tipo: "PECA" | "INSUMO";
  precoTabela: number | null;
  saldo: number;
  imagemThumb: string | null;
};

export type PecaComCusto = PecaPublica & {
  codigoFornecedor: number | null;
  fator: number | null;
  custo: number | null;
  margem: number | null;
};

export type PecaVisivel = PecaPublica | PecaComCusto;

export function temCusto(p: PecaVisivel): p is PecaComCusto {
  return "custo" in p;
}
