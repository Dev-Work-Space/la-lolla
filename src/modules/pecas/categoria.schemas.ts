import { z } from "zod";
import { LINHAS } from "./linha";

/*
 * Schemas das categorias de peça — sem "use server": a tela e as actions
 * usam os mesmos.
 */

export const nomeCategoriaSchema = z
  .string()
  .trim()
  .min(1, "Escreva o nome da categoria.")
  .max(40, "Use no máximo 40 letras no nome da categoria.");

export const linhaSchema = z.enum(LINHAS, { message: "Linha inválida. Atualize a tela." });

export const categoriaSchema = z.object({ linha: linhaSchema, nome: nomeCategoriaSchema });

export type CategoriaEntrada = z.input<typeof categoriaSchema>;

export const renomearCategoriaSchema = z.object({
  linha: linhaSchema,
  de: nomeCategoriaSchema,
  para: nomeCategoriaSchema,
});

export type RenomearCategoria = z.input<typeof renomearCategoriaSchema>;
