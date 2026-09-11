import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao } from "@/lib/auth/guard";
import { brl } from "@/lib/formato";
import {
  BlocoVazio,
  Chips,
  Indicador,
  Indicadores,
  Linha,
  Lista,
  Pilula,
  Vazio,
} from "@/components/padrao/indicadores";
import { Button } from "@/components/ui/button";
import {
  FILTROS_COMPRA,
  indicadoresCompras,
  listarCompras,
  type FiltroCompra,
} from "@/modules/compras/compra.service";
import { BuscaCompras } from "@/modules/compras/components/busca-compras";

export const runtime = "nodejs";
export const metadata = { title: "Portal de compras · LaLolla" };

/*
 * Portal de compras. Saiu do Estoque e virou tela própria — decisão do João —
 * e leva peças E insumos no mesmo fluxo.
 *
 * Comprar é a operação que ABASTECE a loja; o Estoque mostra o que já está na
 * prateleira. São perguntas diferentes e por isso são telas diferentes.
 */
export default async function ComprasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; busca?: string }>;
}) {
  const sessao = await exigirPermissao("pecas", "ver");
  if (!sessao.ok) notFound();

  const { filtro, busca } = await searchParams;
  const atual = (filtro as FiltroCompra) ?? "todas";

  const [ind, compras] = await Promise.all([
    indicadoresCompras(),
    listarCompras({ filtro: atual, busca }),
  ]);

  const admin = sessao.data.papel !== "VENDEDOR";
  const podeComprar =
    (admin || sessao.data.permissoes.pecas.criar) &&
    (admin || sessao.data.permissoes.financeiro.criar);

  const link = (v: string) => {
    const p = new URLSearchParams();
    if (v !== "todas") p.set("filtro", v);
    if (busca) p.set("busca", busca);
    const q = p.toString();
    return q ? `/compras?${q}` : "/compras";
  };

  const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

  const variacao =
    ind.compradoMesAnterior > 0
      ? Math.round(
          ((ind.compradoMes - ind.compradoMesAnterior) / ind.compradoMesAnterior) * 100,
        )
      : null;

  return (
    <main className="mx-auto w-full max-w-7xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Portal de compras</h1>
          <p className="text-sm text-muted-foreground">
            {plural(compras.length, "compra", "compras")}
            {busca ? ` para “${busca}”` : ""}
          </p>
        </div>
        {podeComprar && (
          <Button nativeButton={false} render={<Link href="/compras/nova" />}>
            Nova compra
          </Button>
        )}
      </div>

      <Indicadores>
        <Indicador
          titulo="Comprado no mês"
          valor={brl(ind.compradoMes)}
          sub={
            variacao === null
              ? plural(ind.comprasMes, "pedido", "pedidos")
              : `${variacao >= 0 ? "+" : ""}${variacao}% sobre o mês passado`
          }
        />
        <Indicador
          titulo="Unidades no mês"
          valor={ind.unidadesMes}
          sub="peças e insumos que entraram"
        />
        <Indicador
          titulo="A pagar ao fornecedor"
          valor={brl(ind.aPagar)}
          sub={plural(ind.parcelasAbertas, "parcela em aberto", "parcelas em aberto")}
          tom={ind.aPagar > 0 ? "neg" : "neutro"}
        />
        <Indicador titulo="Pedidos no total" valor={ind.total} sub="desde o começo" />
      </Indicadores>

      <div className="mt-4 space-y-4">
        <BuscaCompras valor={busca} filtro={atual} />
        <Chips opcoes={FILTROS_COMPRA} atual={atual} href={link} />

        <Lista>
          {compras.length > 0 ? (
            compras.map((c) => {
              const sub = [
                c.criadoEm.toLocaleDateString("pt-BR"),
                `${c.unidades} un.`,
                plural(c.itens.length, "item", "itens"),
              ];
              if (c.observacao) sub.push(c.observacao);

              return (
                <Linha
                  key={c.id}
                  nome={`#${c.numero} · ${c.fornecedor.nome}`}
                  pilulas={
                    <>
                      {c.saldo > 0 && <Pilula tom="due">a pagar</Pilula>}
                      {!c.aPrazo && <Pilula>à vista</Pilula>}
                    </>
                  }
                  sub={sub.join(" · ")}
                  valor={brl(c.total)}
                  valorSub={c.saldo > 0 ? `falta ${brl(c.saldo)}` : "quitada"}
                  onClickHref={`/compras/${c.id}`}
                />
              );
            })
          ) : busca || atual !== "todas" ? (
            <Vazio texto="Nenhuma compra com esse filtro." />
          ) : (
            <BlocoVazio
              titulo="Nenhuma compra registrada"
              texto="Registre o pedido do fornecedor: o estoque entra, o custo das peças é atualizado e o pagamento aparece no caixa — tudo de uma vez."
              acao={
                podeComprar ? (
                  <Button nativeButton={false} render={<Link href="/compras/nova" />}>
                    Registrar a primeira compra
                  </Button>
                ) : undefined
              }
            />
          )}
        </Lista>
      </div>
    </main>
  );
}
