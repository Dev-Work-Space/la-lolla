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
