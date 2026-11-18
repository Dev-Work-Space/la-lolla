import { z } from "zod";
import { LINHAS } from "./linha";

/*
 * Schemas da central de promoções — sem "use server": a tela e as actions
 * usam os mesmos.
 */

export const ALVOS_PROMOCAO = ["categoria", "linha", "material", "fornecedor", "produtos"] as const;
export type AlvoPromocao = (typeof ALVOS_PROMOCAO)[number];

export const ROTULO_ALVO: Record<AlvoPromocao, string> = {
  categoria: "Categoria",
  linha: "Linha",
  material: "Material",
  fornecedor: "Fornecedor",
  produtos: "Escolher produtos",
};

const id = z.string().trim().min(1).max(40);

export const promocaoSchema = z
  .object({
    alvo: z.enum(ALVOS_PROMOCAO),
    /* A categoria, a linha, o material ou o id do fornecedor. */
    qual: z.string().trim().max(80).optional(),
    ids: z.array(id).max(500).optional(),
    modo: z.enum(["PERCENTUAL", "FIXO"]),
    valor: z.number().finite(),
    /* "AAAA-MM-DD" do último dia; vazio = sem data para acabar. */
    ate: z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")]).optional(),
  })
  .superRefine((v, ctx) => {
    if (v.alvo === "produtos" ? !v.ids?.length : !v.qual) {
      ctx.addIssue({
        code: "custom",
        path: [v.alvo === "produtos" ? "ids" : "qual"],
        message: v.alvo === "produtos" ? "Marque ao menos um produto." : `Escolha ${ROTULO_ALVO[v.alvo].toLowerCase()}.`,
      });
    }
    if (v.alvo === "linha" && v.qual && !(LINHAS as readonly string[]).includes(v.qual)) {
      ctx.addIssue({ code: "custom", path: ["qual"], message: "Linha desconhecida." });
    }
    if (v.modo === "PERCENTUAL" && (v.valor < 1 || v.valor > 90)) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Use um desconto de 1% a 90%." });
    }
    if (v.modo === "FIXO" && v.valor <= 0) {
      ctx.addIssue({ code: "custom", path: ["valor"], message: "Digite o preço da promoção." });
    }
  });

export type PromocaoInput = z.input<typeof promocaoSchema>;
export type PromocaoDados = z.output<typeof promocaoSchema>;

export const tirarPromocaoSchema = z.object({ ids: z.array(id).min(1, "Marque ao menos um produto.").max(500) });
