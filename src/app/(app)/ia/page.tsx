import { redirect } from "next/navigation";
import { exigirSessao } from "@/lib/auth/guard";
import { TituloTela } from "@/components/padrao/indicadores";
import { ChatPagina } from "@/modules/assistente/components/chat-pagina";

export const metadata = { title: "IA · LaLolla" };

/*
 * Início › IA. A altura é a da tela menos cabeçalho e barra de baixo (no
 * celular) e menos o respiro da página: o chat rola por dentro, e o campo de
 * escrever fica sempre à vista, como em qualquer conversa.
 */
export default async function IaPage() {
  const sessao = await exigirSessao();
  if (!sessao.ok) redirect("/login");

  return (
    <main
      className={
        "mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 py-5 " +
        "h-[calc(100dvh-var(--cabecalho-celular)-var(--nav-inferior)-env(safe-area-inset-top)-env(safe-area-inset-bottom))] md:h-dvh"
      }
    >
      <TituloTela secao="Assistente" titulo="IA" />
      {process.env.GEMINI_API_KEY ? (
        <ChatPagina />
      ) : (
        <p className="rounded-xl border border-dashed px-5 py-8 text-center text-sm text-muted-foreground">
          O assistente ainda não está ligado: falta a chave do Gemini no servidor. Peça a quem cuida do app
          para configurar <code>GEMINI_API_KEY</code>.
        </p>
      )}
    </main>
  );
}
