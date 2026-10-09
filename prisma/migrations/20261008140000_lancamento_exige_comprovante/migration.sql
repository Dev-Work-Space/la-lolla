-- Saída que só conta no caixa depois de anexado o comprovante. Linhas antigas
-- ficam false: o que já está no caixa continua nele.
ALTER TABLE "lancamentos" ADD COLUMN "exigeComprovante" BOOLEAN NOT NULL DEFAULT false;
