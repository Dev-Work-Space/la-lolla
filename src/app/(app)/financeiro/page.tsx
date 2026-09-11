import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import { Indicador, Indicadores, Segmentado } from "@/components/padrao/indicadores";
import { indicadoresFinanceiro } from "@/modules/financeiro/financeiro.service";
import { PainelCaixa } from "@/modules/financeiro/components/painel-caixa";
import { PainelContas } from "@/modules/financeiro/components/painel-contas";
import { PainelCarteiras } from "@/modules/financeiro/components/painel-carteiras";
import type { FiltroConta } from "@/modules/financeiro/financeiro.service";

export const runtime = "nodejs";
export const metadata = { title: "Financeiro · LaLolla" };

/*
 * Financeiro em quatro sub-abas. No app antigo isto era espalhado por cinco
 * telas (viewCaixa, viewMovimento, viewPagar, viewReceber, viewPrevisao) e
 * os quatro números de cima não apareciam juntos em lugar nenhum.
 *
 * Os indicadores ficam FORA das abas de propósito: "quanto tenho" e "quanto
 * devo" são a pergunta de abertura, independente do que se vá fazer depois.
 */
export default async function FinanceiroPage({
  searchParams,
}: {
  searchParams: Promise<{ aba?: string; filtro?: string; de?: string; ate?: string }>;
}) {
  const sessao = await exigirPermissao("financeiro", "ver");
  if (!sessao.ok) notFound();

  const { aba, filtro, de, ate } = await searchParams;
  const qual = ["pagar", "receber", "carteiras"].includes(aba ?? "")
    ? (aba as "pagar" | "receber" | "carteiras")
    : "caixa";

  const ind = await indicadoresFinanceiro();

  const admin = sessao.data.papel !== "VENDEDOR";
  const pode = {
    criar: admin || sessao.data.permissoes.financeiro.criar,
    editar: admin || sessao.data.permissoes.financeiro.editar,
    excluir: admin || sessao.data.permissoes.financeiro.excluir,
  };

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <h1 className="mb-4 text-xl font-bold tracking-tight">Financeiro</h1>

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

      <div className="mt-5">
        <Segmentado
          opcoes={[
            ["caixa", "Caixa"],
            ["pagar", "A pagar"],
            ["receber", "A receber"],
            ["carteiras", "Carteiras"],
          ]}
          atual={qual}
          href={(v) => `/financeiro?aba=${v}`}
        />
      </div>

      <div className="mt-5">
        {qual === "caixa" && (
          <PainelCaixa de={de} ate={ate} carteiras={ind.carteiras} pode={pode} />
        )}
        {qual === "pagar" && (
          <PainelContas
            tipo="PAGAR"
            filtro={(filtro as FiltroConta) ?? "abertas"}
            carteiras={ind.carteiras}
            pode={pode}
          />
        )}
        {qual === "receber" && (
          <PainelContas
            tipo="RECEBER"
            filtro={(filtro as FiltroConta) ?? "abertas"}
            carteiras={ind.carteiras}
            pode={pode}
          />
        )}
        {qual === "carteiras" && (
          <PainelCarteiras carteiras={ind.carteiras} naoAtribuido={ind.naoAtribuido} pode={pode} />
        )}
      </div>
    </main>
  );
}
