import { Prisma } from "@prisma/client";
import { fail, type ErrorCode, type ErrosDeCampo, type Result } from "./result";

/*
 * ErroDominio é o erro ESPERADO: a mensagem pode ser mostrada ao usuário
 * porque foi escrita para ele. Qualquer outra exceção é um bug nosso e vira
 * ERRO_INTERNO com mensagem genérica — o detalhe vai para o log, não para a
 * tela (mensagem de erro técnica na tela é vazamento de informação).
 */
export class ErroDominio extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly fields?: ErrosDeCampo,
  ) {
    super(message);
    this.name = "ErroDominio";
  }
}

export class EstoqueInsuficiente extends ErroDominio {
  constructor(peca: string, disponivel: number) {
    super("REGRA_NEGOCIO", `"${peca}" tem apenas ${disponivel} em estoque.`);
    this.name = "EstoqueInsuficiente";
  }
}

export class NaoEncontrado extends ErroDominio {
  constructor(oQue: string) {
    super("NAO_ENCONTRADO", `${oQue} não encontrado.`);
    this.name = "NaoEncontrado";
  }
}

/**
 * Traduz qualquer exceção para um Result de falha.
 * Toda Server Action termina com isto no catch — assim o tratamento é o
 * mesmo em todo lugar e nenhuma exceção escapa para o cliente.
 */
export function tratarErro(e: unknown, contexto: string): Result<never> {
  if (e instanceof ErroDominio) {
    return fail(e.code, e.message, e.fields);
  }

  if (e instanceof Prisma.PrismaClientKnownRequestError) {
    // P2002: violação de unicidade. O campo vem em meta.target.
    if (e.code === "P2002") {
      const alvo = Array.isArray(e.meta?.target) ? (e.meta.target as string[]).join(", ") : "valor";
      return fail("CONFLITO", `Já existe um registro com esse ${alvo}.`);
    }
    // P2025: registro exigido pela operação não existe.
    if (e.code === "P2025") {
      return fail("NAO_ENCONTRADO", "Esse registro não existe mais.");
    }
    // P2003: chave estrangeira — normalmente tentativa de apagar algo em uso.
    if (e.code === "P2003") {
      return fail("CONFLITO", "Esse registro está em uso e não pode ser removido.");
    }
  }

  // Daqui para baixo é bug nosso: o detalhe fica no log do servidor.
  console.error(`[${contexto}]`, e);
  return fail("ERRO_INTERNO", "Algo deu errado. Tente de novo em instantes.");
}
