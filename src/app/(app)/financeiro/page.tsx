import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import { Indicador, Indicadores, TituloTela } from "@/components/padrao/indicadores";
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
import { abaDaUrl, tituloDaAba, type Aba, type TipoContas } from "@/modules/financeiro/abas";


export const metadata = { title: "Financeiro · LaLolla" };

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
      <div className="mb-4">
        <TituloTela secao="Financeiro" titulo={tituloDaAba(qual, tipo, ver)} />
      </div>

      <Suspense fallback={<EsqueletoIndicadores quantos={4} />}>
        <IndicadoresDoCaixa />
      </Suspense>

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
