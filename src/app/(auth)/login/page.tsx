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
        <div className="mb-7 flex flex-col items-center gap-1.5">
          <span className="font-serif text-4xl font-bold tracking-tight">LaLolla</span>
          <span className="text-[10px] font-bold uppercase tracking-[0.5em] text-amber-700 dark:text-amber-500">
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
