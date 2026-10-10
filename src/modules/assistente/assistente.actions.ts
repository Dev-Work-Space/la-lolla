"use server";

import { exigirPermissao } from "@/lib/auth/guard";
import { tratarErro } from "@/lib/errors";
import { ok, fail, type Result } from "@/lib/result";
import { entradaSchema, type ChatOutput } from "./assistente.schemas";
import { enviarMensagem } from "./assistente.service";
import { areaDaTela, exigirAcessoAssistente } from "./assistente.acesso";
import { configuracaoAssistente } from "./assistente.config";
import { reservarEnvio } from "./assistente.limites";

export async function enviarMensagemAction(input: unknown): Promise<Result<ChatOutput>> {
  let liberar: (() => void) | undefined;
  try {
    const sessao = await exigirAcessoAssistente();
    if (!sessao.ok) return sessao;
    const parse = entradaSchema.safeParse(input);
    if (!parse.success) return fail("DADOS_INVALIDOS", "Confira a mensagem, o histórico e a tela solicitada.");
    if (parse.data.modo === "resumo") {
      const area = areaDaTela[parse.data.tela];
      if (area) {
        const acesso = await exigirPermissao(area, "ver");
        if (!acesso.ok) return acesso;
      }
    }
    liberar = reservarEnvio(sessao.data.usuarioId, configuracaoAssistente().porMinuto);
    const resposta = await enviarMensagem(parse.data, sessao.data);
    return ok({ resposta });
  } catch (erro) {
    return tratarErro(erro, "enviarMensagemAction");
  } finally {
    liberar?.();
  }
}
