import { Suspense } from "react";
import { redirect } from "next/navigation";
import { sessaoAtual } from "@/lib/auth/sessao";
import { BarraNavegacao } from "@/components/layout/barra-navegacao";
import { BarraLateral } from "@/components/layout/barra-lateral";
import { Cabecalho } from "@/components/layout/cabecalho";
import { BarraProgresso } from "@/components/layout/barra-progresso";
import {
  BarraLateralEsqueleto,
  BarraNavegacaoEsqueleto,
  CabecalhoEsqueleto,
} from "@/components/layout/molduras";
import { cn } from "@/lib/utils";
import { assistenteConfigurado } from "@/modules/assistente/assistente.config";
import { podeUsarAssistente } from "@/modules/assistente/assistente.acesso";

/*
 * Duas navegações, uma por tamanho de tela — como no app antigo:
 *   celular  → cabeçalho em cima + barra fixa embaixo
 *   monitor  → barra LATERAL expansiva, que abre no hover
 *
 * O `md:pl-(--nav-largura)` reserva o trilho da barra lateral e, quando o
 * painel de opções está aberto (o João o deixa aberto enquanto trabalha), o
 * painel também: ele EMPURRA a página em vez de cobri-la. Antes a barra
 * abria por cima ("faça com que quando abre a aba, ele cobre a superfície");
 * agora que o painel não fecha sozinho, cobrir deixaria o conteúdo escondido.
 *
 * A SESSÃO NÃO SEGURA MAIS A TELA. Antes o layout esperava a sessão (cookie +
 * banco) antes de mandar qualquer coisa, e o app inteiro ficava em branco
 * enquanto a Vercel acordava. Agora a moldura sai na hora com os esqueletos
 * das barras, e só o que depende da sessão — o nome e os itens de cada perfil
 * — entra depois, cada barra no seu <Suspense>. As três leem a MESMA sessão
 * (o `cache` de sessaoAtual faz uma consulta só por pedido), e o conteúdo da
 * tela não espera por elas.
 */
export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col transition-[padding-left] duration-200 ease-(--ll-ease) md:pl-(--nav-largura)">
      {/* Lê o endereço da tela, então mora no seu <Suspense>; sem esqueleto,
          porque sem clique não há o que mostrar. */}
      <Suspense fallback={null}>
        <BarraProgresso />
      </Suspense>
      <Suspense fallback={<CabecalhoEsqueleto />}>
        <CabecalhoDaSessao />
      </Suspense>
      <Suspense fallback={<BarraLateralEsqueleto />}>
        <BarraLateralDaSessao />
      </Suspense>

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
        data-conteudo
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

      <Suspense fallback={<BarraNavegacaoEsqueleto />}>
        <BarraNavegacaoDaSessao />
      </Suspense>

    </div>
  );
}

/** Sem sessão válida não há app: volta para o login (o proxy só confere se o cookie existe). */
async function sessaoOuLogin() {
  const sessao = await sessaoAtual();
  if (!sessao) redirect("/login");
  return sessao;
}

async function CabecalhoDaSessao() {
  return <Cabecalho sessao={await sessaoOuLogin()} />;
}

async function BarraLateralDaSessao() {
  const s = await sessaoOuLogin();
  return <BarraLateral permissoes={s.permissoes} papel={s.papel} nome={s.nome} temIA={assistenteConfigurado() && podeUsarAssistente(s)} />;
}

async function BarraNavegacaoDaSessao() {
  const s = await sessaoOuLogin();
  return <BarraNavegacao permissoes={s.permissoes} papel={s.papel} temIA={assistenteConfigurado() && podeUsarAssistente(s)} />;
}
