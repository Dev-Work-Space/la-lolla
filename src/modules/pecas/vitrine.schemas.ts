import { z } from "zod";

/*
 * A página é pública: qualquer um monta a URL que quiser. Valor estranho não
 * vira erro na tela da cliente, vira catálogo sem filtro.
 */
export const filtroVitrineSchema = z.object({
  busca: z.string().trim().max(60).optional(),
  categoria: z.string().trim().max(60).optional(),
});

export type FiltroVitrine = z.output<typeof filtroVitrineSchema>;
