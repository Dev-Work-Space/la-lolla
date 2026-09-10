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
    categoria: z.string().trim().min(1, "Escolha uma categoria").max(60),
    tamanho: z.string().trim().max(20).optional().or(z.literal("")),
    tipo: z.enum(["PECA", "INSUMO"]).default("PECA"),

    // Regra 2.1: custo = codigoFornecedor × fator.
    // Só quem tem permissão "financeiro" envia estes dois — a action confere.
    codigoFornecedor: opcionalDecimal,
    fator: opcionalDecimal,

    precoTabela: opcionalDecimal,
    fornecedorId: z.string().min(1).optional().or(z.literal("")),
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
  });

export type CriarPecaInput = z.input<typeof criarPecaSchema>;
export type CriarPecaDados = z.output<typeof criarPecaSchema>;

export const editarPecaSchema = criarPecaSchema;

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
