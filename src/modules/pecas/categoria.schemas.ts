import { z } from "zod";

/*
 * Schemas das categorias de peça — sem "use server": a tela e as actions
 * usam os mesmos.
 */

export const nomeCategoriaSchema = z
  .string()
  .trim()
  .min(1, "Escreva o nome da categoria.")
  .max(40, "Use no máximo 40 letras no nome da categoria.");

export const renomearCategoriaSchema = z.object({
  de: nomeCategoriaSchema,
  para: nomeCategoriaSchema,
});

export type RenomearCategoria = z.input<typeof renomearCategoriaSchema>;
