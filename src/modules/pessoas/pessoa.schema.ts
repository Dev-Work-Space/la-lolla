import { z } from "zod";
import { soDig, validaDoc } from "@/lib/documento";

/*
 * Portado do assistente do app antigo (`formCliente` / `formFornecedor`).
 * As três etapas do cliente são: "Quem é" · "Contato" · "Endereço".
 * O fornecedor tem duas: "Quem é" · "Contato".
 *
 * Regras que vieram de lá e NÃO podem mudar:
 *  - documento é opcional; se vier, tem de ser válido
 *  - documento é guardado SÓ COM DÍGITOS; a máscara é coisa de tela
 *  - trocar PF↔PJ limpa o documento (CPF não vira CNPJ)
 *  - "fantasia" só existe para PJ
 */

const vazioVira = <T extends z.ZodTypeAny>(s: T) =>
  z.preprocess((v) => (v === "" || v === null ? undefined : v), s.optional());

const texto = (max: number) => vazioVira(z.string().trim().max(max));

const baseComum = {
  tipo: z.enum(["PF", "PJ"]).default("PF"),
  nome: z.string().trim().min(2, "Informe o nome").max(120),
  fantasia: texto(120),
  doc: z.preprocess((v) => (typeof v === "string" ? soDig(v) : v), vazioVira(z.string())),
  telefone: z.preprocess((v) => (typeof v === "string" ? soDig(v) : v), vazioVira(z.string().max(11))),
  email: vazioVira(z.string().trim().email("E-mail inválido").max(120)),
  observacoes: texto(600),
};

function conferirDoc(v: { doc?: string; tipo: "PF" | "PJ" }, ctx: z.RefinementCtx) {
  if (v.doc && !validaDoc(v.doc, v.tipo)) {
    ctx.addIssue({
      code: "custom",
      path: ["doc"],
      message: v.tipo === "PJ" ? "CNPJ inválido" : "CPF inválido",
    });
  }
}

export const clienteSchema = z
  .object({
    ...baseComum,
    // "AAAA-MM-DD". Alimenta o filtro "Aniversariantes do mês".
    nascimento: vazioVira(z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")),
    cep: z.preprocess((v) => (typeof v === "string" ? soDig(v) : v), vazioVira(z.string().max(8))),
    logradouro: texto(160),
    numero: texto(20),
    complemento: texto(80),
    bairro: texto(80),
    cidade: texto(80),
    uf: vazioVira(z.string().trim().length(2, "UF tem 2 letras").toUpperCase()),
  })
  .superRefine(conferirDoc);

export const fornecedorSchema = z
  .object({
    ...baseComum,
    tipo: z.enum(["PF", "PJ"]).default("PJ"),
    cidade: texto(80),
    uf: vazioVira(z.string().trim().length(2, "UF tem 2 letras").toUpperCase()),
  })
  .superRefine(conferirDoc);

export type ClienteInput = z.input<typeof clienteSchema>;
export type ClienteDados = z.output<typeof clienteSchema>;
export type FornecedorInput = z.input<typeof fornecedorSchema>;
export type FornecedorDados = z.output<typeof fornecedorSchema>;

/* ── Filtros da tela de clientes (as 6 "chips" do app antigo) ── */
export const FILTROS_CLIENTE = [
  ["todos", "Todos"],
  ["devendo", "Devendo"],
  ["parado", "Parados"],
  ["aniversario", "Aniversariantes"],
  ["pf", "Pessoa física"],
  ["pj", "Empresa"],
] as const;

export type FiltroCliente = (typeof FILTROS_CLIENTE)[number][0];

/* ── O que a tela recebe ── */
export type ClienteLinha = {
  id: string;
  nome: string;
  tipo: "PF" | "PJ";
  doc: string | null;
  telefone: string | null;
  nascimento: string | null;
  /** dias desde a última compra; null = nunca comprou */
  diasSemComprar: number | null;
  /** total já comprado (soma das vendas não canceladas) */
  totalComprado: number;
  /** tem venda a prazo em aberto */
  devendo: boolean;
  aniversarianteNoMes: boolean;
};

export type FornecedorLinha = {
  id: string;
  nome: string;
  fantasia: string | null;
  doc: string | null;
  telefone: string | null;
  cidade: string | null;
  uf: string | null;
  /** total em contas ainda não pagas deste fornecedor */
  aPagar: number;
  compras: number;
};
