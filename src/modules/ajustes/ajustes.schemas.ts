import { z } from "zod";

/*
 * Schemas dos Ajustes — sem "use server": extraídos de `ajustes.actions.ts`
 * (migração gradual para o padrão `<domínio>.schemas.ts`).
 */

/** "2,9", "1.234,56" ou número — o jeito que a pessoa digita no Brasil. */
export const numeroBr = z
  .union([z.string(), z.number()])
  .transform((v) =>
    typeof v === "number" ? v : Number(String(v).replace(/\./g, "").replace(",", ".")),
  )
  .refine((n) => Number.isFinite(n), { message: "Valor inválido" });

const precificacaoSchema = z
  .object({
    fator: numeroBr.refine((n) => n >= 0 && n <= 100, "Use um multiplicador entre 0 e 100"),
    modoPreco: z.enum(["MULTIPLICADOR", "PERCENTUAL"], { message: "Escolha multiplicar ou somar %" }),
    valorPreco: numeroBr.refine((n) => n >= 0 && n <= 1000, "Use um valor entre 0 e 1000"),
  })
  .superRefine((v, ctx) => {
    // × 0,8 venderia abaixo do custo: quase sempre é o "80%" digitado no campo errado.
    if (v.modoPreco === "MULTIPLICADOR" && v.valorPreco > 0 && v.valorPreco < 1) {
      ctx.addIssue({
        code: "custom",
        path: ["valorPreco"],
        message: "Multiplicar por menos de 1 vende abaixo do custo. Para somar %, escolha “+ %”.",
      });
    }
  });

export const ajustesSchema = z.object({
  precificacao: z.object({
    // Semijoia vem com código: multiplicador zerado zeraria o custo de toda peça nova.
    SEMIJOIA: precificacaoSchema.refine((v) => v.fator > 0, {
      path: ["fator"],
      message: "Semijoia precisa de multiplicador maior que zero",
    }),
    PERFUMARIA: precificacaoSchema,
    OUTROS: precificacaoSchema,
  }),
  meta: numeroBr.refine((n) => n >= 0, "A meta não pode ser negativa"),
  diasParado: z.coerce.number().int().min(1, "Informe pelo menos 1 dia").max(3650),
  descontoVista: numeroBr.refine((n) => n >= 0 && n <= 100, "O desconto vai de 0 a 100"),
  urlApp: z.union([z.literal(""), z.string().trim().url("Endereço inválido")]),
});

export type AjustesEntrada = z.input<typeof ajustesSchema>;
