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

export const ajustesSchema = z.object({
  fator: numeroBr.refine((n) => n > 0, "O multiplicador precisa ser maior que zero"),
  meta: numeroBr.refine((n) => n >= 0, "A meta não pode ser negativa"),
  diasParado: z.coerce.number().int().min(1, "Informe pelo menos 1 dia").max(3650),
  descontoVista: numeroBr.refine((n) => n >= 0 && n <= 100, "O desconto vai de 0 a 100"),
  urlApp: z.union([z.literal(""), z.string().trim().url("Endereço inválido")]),
});

export type AjustesEntrada = z.input<typeof ajustesSchema>;
