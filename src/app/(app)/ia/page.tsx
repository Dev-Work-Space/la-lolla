import { redirect } from "next/navigation";
import { exigirAcessoAssistente, telasPermitidas } from "@/modules/assistente/assistente.acesso";
import { assistenteConfigurado } from "@/modules/assistente/assistente.config";
import { TituloTela } from "@/components/padrao/indicadores";
import { ChatPagina } from "@/modules/assistente/components/chat-pagina";

export const metadata = { title: "IA · LaLolla" };

// Antecipa a moldura; o conteúdo que depende da sessão chega na navegação.
export const prefetch = "partial";

/*
 * Início › IA. A altura é a da tela menos cabeçalho e barra de baixo (no
 * celular) e menos o respiro da página: o chat rola por dentro, e o campo de
 * escrever fica sempre à vista, como em qualquer conversa.
 */
export default async function IaPage() {
  const sessao = await exigirAcessoAssistente();
  if (!sessao.ok) redirect(sessao.error.code === "NAO_AUTENTICADO" ? "/login" : "/");

  return (
    <main
      className={
        "mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 " +
        "h-[calc(100dvh-var(--cabecalho-celular)-var(--nav-inferior)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-dvh"
      }
    >
      <TituloTela secao="Assistente" titulo="IA" />
      {assistenteConfigurado() ? (
        <ChatPagina telas={telasPermitidas(sessao.data)} />
      ) : (
        <p className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          Assistente não configurado. Peça a quem cuida do app para habilitá-lo.
        </p>
      )}
    </main>
  );
}
