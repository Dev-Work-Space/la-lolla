import { Suspense } from "react";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import { Indicador, Indicadores, Segmentado } from "@/components/padrao/indicadores";
import { EsqueletoIndicadores, EsqueletoLista } from "@/components/padrao/esqueleto";
import { indicadoresFinanceiro } from "@/modules/financeiro/financeiro.service";
import { PainelCaixa } from "@/modules/financeiro/components/painel-caixa";
import { PainelContas } from "@/modules/financeiro/components/painel-contas";
import { PainelCarteiras } from "@/modules/financeiro/components/painel-carteiras";
import { PainelCartoes } from "@/modules/financeiro/components/painel-cartoes";
import { ResumoCartoes } from "@/modules/financeiro/components/resumo-cartoes";
import { PainelAgenda } from "@/modules/financeiro/components/painel-agenda";
import { PainelPrevisao } from "@/modules/financeiro/components/painel-previsao";
import { mesDaUrl } from "@/modules/financeiro/agenda.service";
import { cartoesComLimite } from "@/modules/financeiro/cartao.service";
import type { FiltroConta } from "@/modules/financeiro/financeiro.service";

export const runtime = "nodejs";

export const metadata = { title: "Financeiro · LaLolla" };

type Aba = "caixa" | "pagar" | "receber" | "agenda" | "previsao" | "carteiras";

/*
 * Financeiro em quatro sub-abas. No app antigo isto era espalhado por cinco
 * telas (viewCaixa, viewMovimento, viewPagar, viewReceber, viewPrevisao) e
 * os quatro números de cima não apareciam juntos em lugar nenhum.
 *
 * Os indicadores ficam FORA das abas de propósito: "quanto tenho" e "quanto
 * devo" são a pergunta de abertura, independente do que se vá fazer depois.
 *
 * A página devolve na hora o título e as abas — o que não depende do banco —
 * e entrega os indicadores e o painel em dois blocos separados. Eles chegam
 * quando ficam prontos, cada um por si: quem olha "quanto tenho em caixa"
 * não precisa esperar a lista de contas carregar para ler o número.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{
    aba?: string;
    filtro?: string;
    de?: string;
    ate?: string;
    mes?: string;
  }>;
}) {
  const sessao = await exigirPermissao("financeiro", "ver");
  if (!sessao.ok) notFound();

  const { aba, filtro, de, ate, mes } = await searchParams;
  const qual: Aba = (
    ["pagar", "receber", "agenda", "previsao", "carteiras"] as const
  ).includes(aba as never)
    ? (aba as Aba)
    : "caixa";

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.financeiro.criar,
    editar: admin || sessao.data.permissoes.financeiro.editar,
    excluir: admin || sessao.data.permissoes.financeiro.excluir,
  };

  return (
    <main className="ll-entra-tela mx-auto w-full max-w-7xl px-4 py-5">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Financeiro</h1>

      <Suspense fallback={<EsqueletoIndicadores quantos={4} />}>
        <IndicadoresDoCaixa />
      </Suspense>

      <div className="mt-5">
        <Segmentado
          /* As seis sub-abas do app antigo, na mesma ordem: o caixa de hoje,
             o que se deve, o que se tem a receber, o calendário do mês, a
             projeção e onde o dinheiro está. */
          opcoes={[
            ["caixa", "Caixa"],
            ["pagar", "A pagar"],
            ["receber", "A receber"],
            ["agenda", "Agenda"],
            ["previsao", "Previsão"],
            ["carteiras", "Carteiras"],
          ]}
          atual={qual}
          href={(v) => `/financeiro?aba=${v}`}
        />
      </div>

      <div className="mt-5">
        <Suspense
          key={`${qual}:${filtro ?? ""}:${de ?? ""}:${ate ?? ""}:${mes ?? ""}`}
          fallback={
            <div className="space-y-4">
              <div className="h-10 animate-pulse rounded bg-muted" />
              <EsqueletoLista linhas={7} />
            </div>
          }
        >
          <PainelDaAba qual={qual} filtro={filtro} de={de} ate={ate} mes={mes} pode={pode} />
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
    <div className="ll-entra">
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
  filtro,
  de,
  ate,
  mes,
  pode,
}: {
  qual: Aba;
  filtro?: string;
  de?: string;
  ate?: string;
  mes?: string;
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const ind = await indicadoresFinanceiro();

  if (qual === "caixa") {
    /* O cartão aparece no Caixa, como no app antigo: quem abre o Financeiro
       quer ver o dinheiro que tem E quanto ainda dá para gastar. A ficha
       completa continua na aba Carteiras. */
    const cartoes = await cartoesComLimite();
    return (
      <div className="space-y-4">
        <PainelCaixa de={de} ate={ate} carteiras={ind.carteiras} pode={pode} />
        <ResumoCartoes cartoes={cartoes} carteiras={ind.carteiras} pode={pode} />
      </div>
    );
  }
  if (qual === "agenda") return <PainelAgenda mes={mesDaUrl(mes)} />;
  if (qual === "previsao") return <PainelPrevisao />;

  if (qual === "carteiras") {
    /* Cartão vem junto das carteiras, como no app antigo: quem abre esta aba
       está perguntando "onde está o meu dinheiro", e o limite do cartão faz
       parte da resposta — pelo avesso. */
    const cartoes = await cartoesComLimite();
    return (
      <div className="space-y-6">
        <PainelCarteiras carteiras={ind.carteiras} naoAtribuido={ind.naoAtribuido} pode={pode} />
        <PainelCartoes cartoes={cartoes} carteiras={ind.carteiras} pode={pode} />
      </div>
    );
  }
  return (
    <PainelContas
      tipo={qual === "pagar" ? "PAGAR" : "RECEBER"}
      filtro={(filtro as FiltroConta) ?? "abertas"}
      carteiras={ind.carteiras}
      pode={pode}
    />
  );
}
