-- CreateEnum
CREATE TYPE "TipoPessoa" AS ENUM ('PF', 'PJ');

-- DropIndex
DROP INDEX "clientes_cpf_key";

-- DropIndex
DROP INDEX "fornecedores_cnpj_key";

-- AlterTable
ALTER TABLE "clientes" DROP COLUMN "cpf",
DROP COLUMN "observacao",
ADD COLUMN     "bairro" TEXT,
ADD COLUMN     "cep" TEXT,
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "complemento" TEXT,
ADD COLUMN     "doc" TEXT,
ADD COLUMN     "fantasia" TEXT,
ADD COLUMN     "logradouro" TEXT,
ADD COLUMN     "nascimento" TEXT,
ADD COLUMN     "numero" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "tipo" "TipoPessoa" NOT NULL DEFAULT 'PF',
ADD COLUMN     "uf" TEXT;

-- AlterTable
ALTER TABLE "contas" ADD COLUMN     "fornecedorId" TEXT;

-- AlterTable
ALTER TABLE "fornecedores" DROP COLUMN "cnpj",
DROP COLUMN "observacao",
ADD COLUMN     "cidade" TEXT,
ADD COLUMN     "doc" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "fantasia" TEXT,
ADD COLUMN     "observacoes" TEXT,
ADD COLUMN     "tipo" "TipoPessoa" NOT NULL DEFAULT 'PJ',
ADD COLUMN     "uf" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "clientes_doc_key" ON "clientes"("doc");

-- CreateIndex
CREATE UNIQUE INDEX "fornecedores_doc_key" ON "fornecedores"("doc");

-- AddForeignKey
ALTER TABLE "contas" ADD CONSTRAINT "contas_fornecedorId_fkey" FOREIGN KEY ("fornecedorId") REFERENCES "fornecedores"("id") ON DELETE SET NULL ON UPDATE CASCADE;

