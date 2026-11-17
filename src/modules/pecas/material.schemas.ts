import { z } from "zod";

/*
 * Schemas dos materiais — sem "use server": a tela e as actions usam os mesmos.
 */

export const nomeMaterialSchema = z
  .string()
  .trim()
  .min(1, "Escreva o nome do material.")
  .max(40, "Use no máximo 40 letras no nome do material.");

export const renomearMaterialSchema = z.object({
  de: nomeMaterialSchema,
  para: nomeMaterialSchema,
});

export type RenomearMaterial = z.input<typeof renomearMaterialSchema>;
