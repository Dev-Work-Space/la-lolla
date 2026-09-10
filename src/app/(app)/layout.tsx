import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { BarraNavegacao } from "@/components/layout/barra-navegacao";
import { Cabecalho } from "@/components/layout/cabecalho";

/*
 * Layout da área autenticada. A checagem de sessão vive aqui e não no
 * middleware porque aqui temos banco: o middleware só viu que existe um
 * cookie, este layout confirma que a sessão é válida e o usuário está ativo.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho sessao={sessao} />

      {/* pb-20 no celular reserva o espaço da barra fixa de baixo */}
      <div className="flex-1 pb-20 md:pb-0">{children}</div>

      <BarraNavegacao permissoes={sessao.permissoes} papel={sessao.papel} />
    </div>
  );
}
