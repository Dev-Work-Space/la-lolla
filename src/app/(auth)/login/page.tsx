import Image from "next/image";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { LoginForm } from "@/modules/auth/components/login-form";

export const metadata = { title: "LaLolla · entrar" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ de?: string }>;
}) {
  // Quem já está logado não vê a tela de login.
  if (await sessaoAtual()) redirect("/");

  const { de } = await searchParams;

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

        <LoginForm destino={de} />

        <p className="mt-5 text-center text-xs leading-relaxed text-muted-foreground">
          Sistema de gestão da loja.
        </p>
      </div>
    </main>
  );
}
