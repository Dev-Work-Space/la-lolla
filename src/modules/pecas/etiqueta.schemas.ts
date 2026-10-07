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

/* ─────────────── modelos desenhados (Ajustes › Criação de etiquetas) ─────────────── */

const mm = (max: number) => z.number().finite().min(0).max(max);

export const elementoSchema = z.object({
  id: z.string().trim().min(1).max(40),
  tipo: z.enum(["marca", "nome", "codigo", "tamanho", "preco", "precoDe", "desconto", "qr", "texto", "linha", "moldura"]),
  x: mm(120),
  y: mm(60),
  w: mm(120).refine((n) => n >= 0.2, "Elemento pequeno demais"),
  h: mm(60).refine((n) => n >= 0.1, "Elemento pequeno demais"),
  alinhar: z.enum(["esquerda", "centro", "direita"]),
  negrito: z.boolean(),
  maiusculas: z.boolean(),
  letra: mm(20),
  linhas: z.union([z.literal(1), z.literal(2)]),
  texto: z.string().max(80, "O texto livre vai até 80 letras"),
  rotulo: z.string().max(12, "O prefixo vai até 12 letras"),
});

export const desenhoSchema = z.object({
  id: z.string().trim().min(1).max(40),
  nome: z.string().trim().min(1, "Dê um nome ao modelo").max(40, "Use até 40 letras no nome"),
  largura: z.number().finite().min(10, "O comprimento vai de 10 a 120 mm").max(120, "O comprimento vai de 10 a 120 mm"),
  altura: z.number().finite().min(8, "A altura vai de 8 a 60 mm").max(60, "A altura vai de 8 a 60 mm"),
  dobra: z.boolean(),
  elementos: z.array(elementoSchema).max(30, "No máximo 30 elementos numa etiqueta"),
});

export type DesenhoEntrada = z.input<typeof desenhoSchema>;
export const idDesenhoSchema = z.string().trim().min(1).max(40);
