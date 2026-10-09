-- Pagamento flexível: taxa da maquininha (opcional) no recebimento e entrada
-- + intervalo das parcelas no orçamento. Só colunas novas e anuláveis.

ALTER TABLE "pagamentos" ADD COLUMN "taxaPct" DECIMAL(5,2);
ALTER TABLE "pagamentos" ADD COLUMN "taxaLancamentoId" TEXT;
CREATE UNIQUE INDEX "pagamentos_taxaLancamentoId_key" ON "pagamentos"("taxaLancamentoId");
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_taxaLancamentoId_fkey"
  FOREIGN KEY ("taxaLancamentoId") REFERENCES "lancamentos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "orcamentos" ADD COLUMN "entrada" DECIMAL(10,2);
ALTER TABLE "orcamentos" ADD COLUMN "intervaloParcelas" TEXT;
