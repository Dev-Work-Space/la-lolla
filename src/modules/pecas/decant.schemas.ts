import { z } from "zod";

/*
 * Envasar decants — sem "use server": a tela e a action usam o mesmo schema.
 *
 * Ou escolhe um decant que já existe (`decantId`), ou cria um tamanho novo
 * (`volumeMl`). Os dois juntos seria ambíguo: qual vale?
 */

const decimalBr = z
  .union([z.literal(""), z.undefined(), z.string(), z.number()])
  .transform((v) =>
    v === "" || v === undefined ? undefined : typeof v === "number" ? v : Number(v.trim().replace(/\./g, "").replace(",", ".")),
  )
  .refine((n) => n === undefined || (Number.isFinite(n) && n >= 0), { message: "Valor inválido" })
  // Campo que a tela não mostra não é enviado: sem `.optional()` o Zod 4 exige a chave.
  .optional();

export const envaseSchema = z
  .object({
    perfumeId: z.string().trim().min(1, "Perfume não informado. Atualize a tela.").max(40),
    decantId: z.string().trim().max(40).optional().or(z.literal("")),
    volumeMl: z
      .union([z.literal(""), z.undefined(), z.coerce.number().int("Use ml inteiros").min(1, "Maior que zero").max(500, "Decant de até 500 ml")])
      .transform((v) => (v === "" || v === undefined ? undefined : v))
      .optional(),
    quantidade: z.coerce.number().int("Quantidade inteira").min(1, "Pelo menos 1").max(500, "No máximo 500 por vez"),
    // Marcado = abriu um frasco agora: sai 1 do estoque do perfume.
    baixarFrasco: z.enum(["true", "false"]).default("false").transform((v) => v === "true"),
    // Custo do frasquinho vazio, por unidade. Entra no custo do decant.
    custoFrasquinho: decimalBr,
    // Só para tamanho novo: o preço de venda dele.
    precoTabela: decimalBr,
  })
  .superRefine((v, ctx) => {
    if (!v.decantId && v.volumeMl === undefined) {
      ctx.addIssue({ code: "custom", path: ["volumeMl"], message: "Escolha um tamanho ou informe os ml do novo." });
    }
    if (v.decantId && v.volumeMl !== undefined) {
      ctx.addIssue({ code: "custom", path: ["volumeMl"], message: "Escolha um tamanho existente OU crie um novo." });
    }
  });

export type EnvaseEntrada = z.input<typeof envaseSchema>;
export type EnvaseDados = z.output<typeof envaseSchema>;
