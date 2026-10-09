import { z } from "zod";

/* Anexar o comprovante a um recebimento de venda ou a uma saída do caixa que ficou esperando. */
export const anexarAoMovimentoSchema = z.object({
  tipo: z.enum(["pagamento", "lancamento"]),
  id: z.string().trim().min(1).max(40),
  comprovanteId: z.string().trim().min(1, "Anexe a foto ou o PDF do comprovante.").max(40),
});
export type AnexarAoMovimentoEntrada = z.input<typeof anexarAoMovimentoSchema>;
