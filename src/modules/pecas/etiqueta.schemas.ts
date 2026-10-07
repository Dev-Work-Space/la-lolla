import { z } from "zod";

/*
 * Schemas das etiquetas — sem "use server": a tela e a action usam os mesmos.
 */

/** Um PDF com mais que isso trava o celular e a fila da NIIMBOT; melhor em lotes. */
export const MAX_ETIQUETAS = 500;

export const pedidoEtiquetasSchema = z
  .object({
    itens: z
      .array(
        z.object({
          pecaId: z.string().trim().min(1).max(40),
          quantidade: z
            .number()
            .int("Quantidade precisa ser um número inteiro")
            .min(1, "Pelo menos 1 etiqueta por peça escolhida")
            .max(200, "No máximo 200 etiquetas da mesma peça por vez"),
        }),
      )
      .min(1, "Escolha ao menos uma peça.")
      .max(MAX_ETIQUETAS),
  })
  .refine((d) => d.itens.reduce((s, i) => s + i.quantidade, 0) <= MAX_ETIQUETAS, {
    path: ["itens"],
    message: `No máximo ${MAX_ETIQUETAS} etiquetas por vez — divida em mais de um lote.`,
  });

export type PedidoEtiquetas = z.input<typeof pedidoEtiquetasSchema>;

export const codigoEtiquetaSchema = z
  .string()
  .trim()
  .min(2, "Leia o QR ou digite o código da peça.")
  .max(40, "Esse código é comprido demais para ser de uma peça.");

/**
 * "ll-0001-03" → "LL-0001". A série identifica a UNIDADE; a peça é o SKU.
 * Aceita também o que um leitor de código digita com espaço ou minúscula.
 */
export function skuDoCodigo(codigo: string): string {
  const c = codigo.trim().toUpperCase().replace(/\s+/g, "");
  const m = /^([A-Z]{2}-\d+)(?:-\d+)?$/.exec(c);
  return m ? m[1] : c;
}
