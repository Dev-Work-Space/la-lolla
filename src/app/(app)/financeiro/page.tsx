import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import { Indicador, Indicadores, Segmentado } from "@/components/padrao/indicadores";
import { EsqueletoIndicadores, EsqueletoLista } from "@/components/padrao/esqueleto";
import { indicadoresFinanceiro, movimentoPorCarteira } from "@/modules/financeiro/financeiro.service";
import { datasDaBarra, paramsDoPeriodo, periodoDaUrl, rotuloDoPeriodo } from "@/modules/financeiro/periodo";
import { FiltroPeriodo } from "@/modules/financeiro/components/filtro-periodo";
import { PainelCaixa } from "@/modules/financeiro/components/painel-caixa";
import { PainelContas } from "@/modules/financeiro/components/painel-contas";
import { PainelCarteiras } from "@/modules/financeiro/components/painel-carteiras";
import { PainelCartoes } from "@/modules/financeiro/components/painel-cartoes";
import { PainelVisaoGeral } from "@/modules/financeiro/components/painel-visao-geral";
import { PainelAEntrar } from "@/modules/financeiro/components/painel-a-entrar";
import { PainelAgenda } from "@/modules/financeiro/components/painel-agenda";
import { PainelPrevisao } from "@/modules/financeiro/components/painel-previsao";
import { cartoesComLimite } from "@/modules/financeiro/cartao.service";


export const metadata = { title: "Financeiro · LaLolla" };

type Aba = "geral" | "contas" | "fluxo" | "carteiras";
type TipoContas = "receber" | "pagar" | "calendario";

/*
 * Financeiro em QUATRO abas, reorganizado a pedido do João (07/10/2026), que
 * achou as seis de antes "bem desorganizadas":
 *
 *   Visão geral — o que está atrasado, o que entra e sai nos próximos 30
 *                 dias, para onde o caixa vai e onde o dinheiro está;
 *   Contas      — a pagar e a receber agrupadas por urgência, e o calendário
 *                 do mês (a antiga Agenda);
 *   Fluxo       — o extrato do que já aconteceu, tudo o que vai entrar
 *                 (de qualquer fonte) e a previsão do caixa;
 *   Carteiras   — onde o dinheiro está, com os cartões.
 *
 * Os indicadores ficam FORA das abas de propósito: "quanto tenho" e "quanto
 * devo" são a pergunta de abertura, independente do que se vá fazer depois.
 *
 * Os endereços antigos (?aba=caixa, pagar, receber, agenda, previsao)
 * continuam valendo: caem na aba nova equivalente. Link salvo e aviso do
 * Início não quebram.
 */
function abaDaUrl(aba?: string, tipo?: string, ver?: string): { qual: Aba; tipo: TipoContas; ver: string } {
  const tipoOk: TipoContas = tipo === "pagar" || tipo === "calendario" ? tipo : "receber";
  switch (aba) {
    case "contas":
      return { qual: "contas", tipo: tipoOk, ver: "" };
    case "pagar":
    case "receber":
      return { qual: "contas", tipo: aba, ver: "" };
    case "agenda":
      return { qual: "contas", tipo: "calendario", ver: "" };
    case "fluxo":
    case "caixa":
      return { qual: "fluxo", tipo: tipoOk, ver: ver === "previsto" || ver === "entrar" ? ver : "realizado" };
    case "previsao":
      return { qual: "fluxo", tipo: tipoOk, ver: "previsto" };
    case "carteiras":
      return { qual: "carteiras", tipo: tipoOk, ver: "" };
    default:
      return { qual: "geral", tipo: tipoOk, ver: "" };
  }
}

export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sessao = await exigirPermissao("financeiro", "ver");
  if (!sessao.ok) notFound();

  /* Todos os filtros da URL, só os de texto, já com a aba no nome novo: as
     barras de filtro de cada aba recebem isto e preservam o que não mexem. */
  const crus = await searchParams;
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(crus)) if (typeof v === "string" && v) params[k] = v;
  const { qual, tipo, ver } = abaDaUrl(params.aba, params.tipo, params.ver);
  params.aba = qual;
  if (qual === "contas") params.tipo = tipo;
  else delete params.tipo;
  if (qual === "fluxo" && ver !== "realizado") params.ver = ver;
  else delete params.ver;

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.financeiro.criar,
    editar: admin || sessao.data.permissoes.financeiro.editar,
    excluir: admin || sessao.data.permissoes.financeiro.excluir,
  };

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <h1 className="ll-entra-cabecalho mb-4 text-xl font-bold tracking-tight">Financeiro</h1>

      <Suspense fallback={<EsqueletoIndicadores quantos={4} />}>
        <IndicadoresDoCaixa />
      </Suspense>

      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Segmentado
          opcoes={[
            ["geral", "Visão geral"],
            ["contas", "Contas"],
            ["fluxo", "Fluxo de caixa"],
            ["carteiras", "Carteiras"],
          ]}
          atual={qual}
          href={(v) => (v === "geral" ? "/financeiro" : `/financeiro?aba=${v}`)}
        />
        {/* O segundo nível fica ao lado, na mesma linha: a pessoa vê de uma vez
            em que aba está e qual recorte dela. */}
        {qual === "contas" && (
          <Segmentado
            opcoes={[
              ["receber", "A receber"],
              ["pagar", "A pagar"],
              ["calendario", "Calendário"],
            ]}
            atual={tipo}
            href={(v) => `/financeiro?aba=contas&tipo=${v}`}
          />
        )}
        {qual === "fluxo" && (
          <Segmentado
            opcoes={[
              ["realizado", "Extrato"],
              ["entrar", "A entrar"],
              ["previsto", "Previsão"],
            ]}
            atual={ver}
            href={(v) => (v === "realizado" ? "/financeiro?aba=fluxo" : `/financeiro?aba=fluxo&ver=${v}`)}
          />
        )}
      </div>

      <div className="mt-5">
        <Suspense
          key={new URLSearchParams(params).toString()}
          fallback={
            <div className="space-y-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <EsqueletoLista linhas={7} />
            </div>
          }
        >
          <PainelDaAba qual={qual} tipo={tipo} ver={ver} params={params} pode={pode} />
        </Suspense>
      </div>
    </main>
  );
}

/* Os quatro números de cima. Bloco próprio: chega antes da lista. */
async function IndicadoresDoCaixa() {
  const ind = await indicadoresFinanceiro();
  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <div>
      <Indicadores>
        <Indicador
          titulo="Em caixa"
          valor={brl(ind.emCaixa)}
          sub={
            ind.naoAtribuido !== 0
              ? `${brl(ind.naoAtribuido)} sem carteira`
              : plural(ind.carteiras.length, "carteira", "carteiras")
          }
          tom={ind.emCaixa < 0 ? "neg" : "accent"}
        />
        <Indicador
          titulo="A pagar"
          valor={brl(ind.aPagar)}
          sub={
            ind.vencidas > 0
              ? `${plural(ind.vencidas, "vencida", "vencidas")}`
              : plural(ind.contasAPagar, "conta em aberto", "contas em aberto")
          }
          tom={ind.vencidas > 0 ? "neg" : "neutro"}
        />
        <Indicador
          titulo="A receber"
          valor={brl(ind.aReceber)}
          sub={plural(ind.contasAReceber, "parcela em aberto", "parcelas em aberto")}
        />
        <Indicador
          titulo="Despesas do mês"
          valor={brl(ind.despesasMes)}
          sub="sem mercadoria nem retirada"
        />
      </Indicadores>
    </div>
  );
}

/*
 * O painel da aba escolhida. Precisa das carteiras, que vêm dos indicadores —
 * e é por isso que `indicadoresFinanceiro` é memoizado por requisição: este
 * bloco e o de cima pedem a mesma coisa e o banco responde uma vez só.
 */
async function PainelDaAba({
  qual,
  tipo,
  ver,
  params,
  pode,
}: {
  qual: Aba;
  tipo: TipoContas;
  ver: string;
  params: Record<string, string>;
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  if (qual === "geral") return <PainelVisaoGeral pode={pode} />;

  const ind = await indicadoresFinanceiro();

  if (qual === "contas") {
    if (tipo === "calendario") return <PainelAgenda params={params} />;
    return <PainelContas tipo={tipo === "pagar" ? "PAGAR" : "RECEBER"} params={params} carteiras={ind.carteiras} pode={pode} />;
  }

  if (qual === "fluxo") {
    if (ver === "previsto") return <PainelPrevisao params={params} />;
    if (ver === "entrar") return <PainelAEntrar params={params} carteiras={ind.carteiras} pode={pode} />;
    return <PainelCaixa params={params} carteiras={ind.carteiras} pode={pode} />;
  }

  /* Cartão vem junto das carteiras, como no app antigo: quem abre esta aba
     está perguntando "onde está o meu dinheiro", e o limite do cartão faz
     parte da resposta — pelo avesso. O saldo é o de hoje; o período só muda
     o "entrou / saiu" de cada carteira. */
  const periodo = periodoDaUrl(params, "mes", { ateHoje: true });
  const [cartoes, noPeriodo] = await Promise.all([cartoesComLimite(), movimentoPorCarteira(periodo.de, periodo.ate)]);
  const extratoDa = (id: string) =>
    `/financeiro?${new URLSearchParams({ aba: "fluxo", carteira: id, ...paramsDoPeriodo(periodo) }).toString()}`;
  return (
    <div className="space-y-6">
      <FiltroPeriodo
        params={params}
        {...datasDaBarra(periodo)}
        atalhos={["hoje", "semana", "mes", "mes-passado", "ultimos-30", "ano", "tudo"]}
      />
      <PainelCarteiras
        carteiras={ind.carteiras}
        naoAtribuido={ind.naoAtribuido}
        pode={pode}
        noPeriodo={noPeriodo}
        rotuloPeriodo={rotuloDoPeriodo(periodo)}
        extratoDa={extratoDa}
      />
      <PainelCartoes cartoes={cartoes} carteiras={ind.carteiras} pode={pode} />
    </div>
  );
}
