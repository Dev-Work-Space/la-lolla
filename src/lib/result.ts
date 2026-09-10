/*
 * O contrato de retorno de TODA Server Action.
 *
 * Por que não lançar exceção: em produção o Next.js apaga a mensagem de
 * qualquer erro que atravesse a fronteira servidor→cliente e entrega
 * "an error occurred in the Server Components render". O usuário fica sem
 * saber o que aconteceu e nós ficamos sem saber o que ele viu.
 *
 * Com Result, o erro é um VALOR: atravessa a fronteira intacto, é
 * type-safe, e o componente decide como mostrar.
 */

export type ErrorCode =
  | "NAO_AUTENTICADO"
  | "SEM_PERMISSAO"
  | "DADOS_INVALIDOS"
  | "NAO_ENCONTRADO"
  | "CONFLITO"
  | "REGRA_NEGOCIO"
  | "ERRO_INTERNO";

/** Erros por campo, no formato que o formulário consome direto. */
export type ErrosDeCampo = Record<string, string[]>;

export type Falha = {
  code: ErrorCode;
  message: string;
  fields?: ErrosDeCampo;
};

export type Result<T> = { ok: true; data: T } | { ok: false; error: Falha };

export const ok = <T>(data: T): Result<T> => ({ ok: true, data });

export const fail = <T = never>(
  code: ErrorCode,
  message: string,
  fields?: ErrosDeCampo,
): Result<T> => ({ ok: false, error: { code, message, fields } });

/** Status HTTP correspondente — usado só pelos Route Handlers. */
export function statusDe(code: ErrorCode): number {
  switch (code) {
    case "NAO_AUTENTICADO":
      return 401;
    case "SEM_PERMISSAO":
      return 403;
    case "NAO_ENCONTRADO":
      return 404;
    case "CONFLITO":
      return 409;
    case "DADOS_INVALIDOS":
    case "REGRA_NEGOCIO":
      return 422;
    case "ERRO_INTERNO":
      return 500;
  }
}
