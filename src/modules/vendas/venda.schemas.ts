import { z } from "zod";
import { ETAPAS_VENDA } from "./crm.tipos";

/*
 * Schemas de venda no padrão novo — sem "use server": a tela e as actions
 * usam os mesmos. Os schemas antigos ainda moram em `venda.actions.ts`.
 */

export const mudarEtapaSchema = z.object({
  id: z.string().trim().min(1, "Venda não informada.").max(40),
  etapa: z.enum(ETAPAS_VENDA, { error: "Escolha Vendido, A entregar ou Entregue." }),
});

export type MudarEtapa = z.input<typeof mudarEtapaSchema>;

/* ── PDV ── */

export const codigoPdvSchema = z
  .string()
  .trim()
  .min(1, "Leia a etiqueta ou digite o código.")
  .max(40, "Esse código é grande demais para ser de etiqueta.");

/*
 * Os itens que o PDV manda para a tela de cobrar, no endereço:
 * `?pdv=<id>:<qtd>,<id>:<qtd>`. O endereço é editável por qualquer um, então
 * o servidor relê preço e estoque do banco — daqui só vêm o QUE e QUANTOS.
 */
export const itensPdvSchema = z
  .string()
  .max(4000)
  .transform((s) =>
    s
      .split(",")
      .filter(Boolean)
      .map((par) => {
        const [id, qtd] = par.split(":");
        return { id: id ?? "", quantidade: Number(qtd) };
      }),
  )
  .pipe(
    z
      .array(
        z.object({
          id: z.string().trim().min(1).max(40),
          quantidade: z.number().int().min(1).max(999),
        }),
      )
      .min(1)
      .max(100),
  );
