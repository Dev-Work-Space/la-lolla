import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { BarraNavegacao } from "@/components/layout/barra-navegacao";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Cabecalho } from "@/components/layout/cabecalho";

/*
 * Duas navegações, uma por tamanho de tela — como no app antigo:
 *   celular  → cabeçalho em cima + barra fixa embaixo
 *   monitor  → barra LATERAL expansiva, que abre no hover
 *
 * O `md:pl-(--nav-fechada)` reserva a tira de 68px. A barra aberta passa POR
 * CIMA do conteúdo em vez de empurrá-lo: o João pediu isso explicitamente
 * ("faça com que quando abre a aba, ele cobre a superfície") — empurrar
 * recalcularia a largura de tudo e as tabelas dançavam.
 */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");

  return (
    <div className="flex min-h-dvh flex-col md:pl-(--nav-fechada)">
      <Cabecalho sessao={sessao} />
      <BarraLateral permissoes={sessao.permissoes} papel={sessao.papel} nome={sessao.nome} />

      {/* pb-20 no celular reserva o espaço da barra fixa de baixo */}
      <div className="flex-1 pb-20 md:pb-0">{children}</div>

      <BarraNavegacao permissoes={sessao.permissoes} papel={sessao.papel} />
    </div>
  );
}
