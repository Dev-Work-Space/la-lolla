import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { BarraNavegacao } from "@/components/layout/barra-navegacao";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Cabecalho } from "@/components/layout/cabecalho";
import { cn } from "@/lib/utils";

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

      {/*
        Reserva o espaço da barra fixa de baixo.

        `pb-20` fixo não bastava: a barra tem a própria altura MAIS a faixa de
        gestos do iPhone, e o que sobrava por baixo ficava escondido atrás
        dela. No Ajustes dava para ver o campo "Nova categoria" cortado pela
        metade — foi a foto que o João mandou.

        A conta usa a MESMA medida que a barra usa, então os dois não têm como
        discordar.
      */}
      <div
        className={cn(
          "flex-1",
          // por cima: o cabeçalho agora é fixo e sairia por cima do conteúdo
          "pt-[calc(var(--cabecalho-celular)+env(safe-area-inset-top))] md:pt-0",
          // por baixo: a barra de navegação mais a faixa de gestos
          "pb-[calc(var(--nav-inferior)+env(safe-area-inset-bottom))] md:pb-0",
        )}
      >
        {children}
      </div>

      <BarraNavegacao permissoes={sessao.permissoes} papel={sessao.papel} />
    </div>
  );
}
