import { Suspense } from "react";
import Image from "next/image";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata = { title: "LaLolla · entrar" };

/*
 * A logo e o texto saem na hora; o formulário espera o pedido (quem já está
 * logado vai direto ao Início, e o "de" diz para onde voltar depois de entrar).
 */
export default function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  return (
    <main className="grid min-h-dvh place-items-center px-4 py-8">
      <div className="w-full max-w-sm">
        {/*
          A LOGO de verdade, não a marca redesenhada em fonte serifada. Era o
          mesmo problema do "L" da barra lateral: parecido de longe, errado de
          perto — outro traço, outra espessura, outra serifa.

          `priority` porque é a primeira coisa que aparece na primeira tela do
          app: carregar depois faria o bloco pular.
        */}
        <div className="mb-7 flex flex-col items-center gap-2">
          <Image
            src="/logo-lalolla.png"
            alt="LaLolla"
            width={353}
            height={90}
            priority
            className="h-12 w-auto sm:h-14"
          />
          <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-(--ll-brand)">
            <span className="pl-[0.5em] -mr-[0.5em]">semijoias</span>
          </span>
        </div>

        <Suspense fallback={<FormularioEsqueleto />}>
          <Formulario searchParams={searchParams} />
        </Suspense>

        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Sistema de gestão da loja.
        </p>
      </div>
    </main>
  );
}

async function Formulario({ searchParams }: { searchParams: Promise<{ de?: string }> }) {
  // Quem já está logado não vê a tela de login.
  if (await sessaoAtual()) redirect("/");
  const { de } = await searchParams;
  return <LoginForm destino={de} />;
}

/** Mesma altura do formulário (dois campos e o botão), para nada pular. */
function FormularioEsqueleto() {
  return (
    <div aria-hidden className="space-y-4">
      {[0, 1].map((i) => (
        <div key={i} className="space-y-1.5">
          <div className="h-4 w-24 animate-pulse rounded bg-muted" />
          <div className="h-10 animate-pulse rounded-lg bg-muted" />
        </div>
      ))}
      <div className="h-10 animate-pulse rounded-lg bg-muted" />
    </div>
  );
}
