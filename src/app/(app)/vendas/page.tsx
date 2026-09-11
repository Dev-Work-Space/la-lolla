import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { exigirPermissao, veFinanceiro } from "@/lib/auth/guard";
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
import { EsqueletoIndicadores, EsqueletoLista } from "@/components/padrao/esqueleto";
import { Button } from "@/components/ui/button";
import {
  FILTROS_VENDA,
  indicadoresVendas,
  listarVendas,
  type FiltroVenda,
} from "@/modules/vendas/venda.service";
import { BuscaVendas } from "@/modules/vendas/components/busca-vendas";

export const runtime = "nodejs";

export const metadata = { title: "Portal de vendas · LaLolla" };

type ListaDeVendas = Awaited<ReturnType<typeof listarVendas>>;

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/*
 * Portal de vendas.
 *
 * A tela entra ANTES do banco responder: título, botão "Nova venda", busca e
 * filtros são desenhados na hora, e os três blocos que dependem de consulta
 * (contagem, indicadores e lista) chegam depois, cada um no seu <Suspense>.
 *
 * A lista é pedida UMA vez e a mesma promessa vai para os dois blocos que
 * precisam dela — a contagem do cabeçalho e a lista em si. Chamar
 * `listarVendas` duas vezes seria uma segunda viagem ao banco pela mesma
 * resposta; `cache()` do React não serviria aqui porque a função recebe um
 * objeto, e objeto novo a cada chamada nunca bate na memoização.
 */
export default async function VendasPage({
  searchParams,
}: {
  searchParams: Promise<{ filtro?: string; busca?: string }>;
}) {
  const sessao = await exigirPermissao("vendas", "ver");
  if (!sessao.ok) notFound();

  const { filtro, busca } = await searchParams;
  const atual = (filtro as FiltroVenda) ?? "todas";
  const fin = veFinanceiro(sessao.data);

  // Sem `await`: a consulta começa agora e a página continua sendo montada.
  const pVendas = listarVendas({ filtro: atual, busca, veFinanceiro: fin });

  const podeCriar = sessao.data.papel !== "VENDEDOR" || sessao.data.permissoes.vendas.criar;

  const link = (v: string) => {
    const p = new URLSearchParams();
    if (v !== "todas") p.set("filtro", v);
    if (busca) p.set("busca", busca);
    const q = p.toString();
    return q ? `/vendas?${q}` : "/vendas";
  };

  const chave = `${atual}:${busca ?? ""}`;

  return (
    <main className="ll-entra-tela mx-auto w-full max-w-7xl px-4 py-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold tracking-tight">Portal de vendas</h1>
          <Suspense
            key={chave}
            fallback={<div className="mt-1 h-4 w-28 animate-pulse rounded bg-muted" />}
          >
            <ContagemVendas promessa={pVendas} busca={busca} />
          </Suspense>
        </div>
        {podeCriar && (
          <Button nativeButton={false} render={<Link href="/vendas/nova" />}>
            Nova venda
          </Button>
        )}
      </div>

      <Suspense fallback={<EsqueletoIndicadores quantos={4} />}>
        <IndicadoresDeVendas veFinanceiro={fin} />
      </Suspense>

      <div className="mt-4 space-y-4">
        <BuscaVendas valor={busca} filtro={atual} />
        <Chips opcoes={FILTROS_VENDA} atual={atual} href={link} />

        <Suspense key={chave} fallback={<EsqueletoLista linhas={6} />}>
          <ListaDasVendas
            promessa={pVendas}
            busca={busca}
            filtro={atual}
            podeCriar={podeCriar}
          />
        </Suspense>
      </div>
    </main>
  );
}

/* "12 vendas para 'ana'" — a linha sob o título. */
async function ContagemVendas({
  promessa,
  busca,
}: {
  promessa: Promise<ListaDeVendas>;
  busca?: string;
}) {
  const vendas = await promessa;
  return (
    <p className="ll-entra text-sm text-muted-foreground">
      {plural(vendas.length, "venda", "vendas")}
      {busca ? ` para “${busca}”` : ""}
    </p>
  );
}

async function IndicadoresDeVendas({ veFinanceiro: fin }: { veFinanceiro: boolean }) {
  const ind = await indicadoresVendas(fin);
  return (
    <div className="ll-entra">
      <Indicadores>
        <Indicador
          titulo="Vendido hoje"
          valor={brl(ind.vendidoHoje)}
          sub={plural(ind.vendasHoje, "venda", "vendas")}
          tom={ind.vendidoHoje > 0 ? "accent" : "neutro"}
        />
        <Indicador
          titulo="Faturado no mês"
          valor={brl(ind.faturadoMes)}
          sub={
            fin && ind.margemMes !== null
              ? `margem de ${ind.margemMes.toFixed(1).replace(".", ",")}%`
              : `ticket ${brl(ind.ticketMes)}`
          }
        />
        <Indicador
          titulo="A receber"
          valor={brl(ind.aReceber)}
          sub={plural(ind.vendasAbertas, "venda em aberto", "vendas em aberto")}
          tom={ind.aReceber > 0 ? "neg" : "neutro"}
        />
        <Indicador
          titulo="Sem comprovante"
          valor={ind.semComprovante}
          sub={ind.semComprovante ? "pendente de anexo" : "tudo anexado"}
          tom={ind.semComprovante ? "neg" : "neutro"}
        />
      </Indicadores>
    </div>
  );
}

async function ListaDasVendas({
  promessa,
  busca,
  filtro,
  podeCriar,
}: {
  promessa: Promise<ListaDeVendas>;
  busca?: string;
  filtro: FiltroVenda;
  podeCriar: boolean;
}) {
  const vendas = await promessa;

  return (
    <div className="ll-entra ll-entra-2">
      <Lista>
        {vendas.length > 0 ? (
          vendas.map((v) => {
            const sub = [
              v.criadoEm.toLocaleDateString("pt-BR"),
              plural(v.itens.length, "peça", "peças"),
            ];
            if (v.desconto > 0) sub.push(`desconto ${brl(v.desconto)}`);
            if (v.devolvido > 0) sub.push(`devolvido ${brl(v.devolvido)}`);
            if (v.vendedor) sub.push(v.vendedor.nome);

            return (
              <Linha
                key={v.id}
                nome={`#${v.numero} · ${v.cliente?.nome ?? "Sem cliente"}`}
                pilulas={
                  <>
                    {v.cancelada && <Pilula tom="due">cancelada</Pilula>}
                    {!v.cancelada && v.saldo > 0 && <Pilula tom="due">a receber</Pilula>}
                    {!v.cancelada && v.comprovantesPendentes > 0 && (
                      <Pilula tom="accent">sem comprovante</Pilula>
                    )}
                  </>
                }
                sub={sub.join(" · ")}
                valor={brl(v.total)}
                valorSub={v.saldo > 0 ? `falta ${brl(v.saldo)}` : "quitada"}
                onClickHref={`/vendas/${v.id}`}
              />
            );
          })
        ) : busca || filtro !== "todas" ? (
          <Vazio texto="Nenhuma venda com esse filtro." />
        ) : (
          <BlocoVazio
            titulo="Nenhuma venda ainda"
            texto="Lance a primeira venda: escolha as peças, informe como a cliente pagou e o app cuida do estoque, do caixa e das parcelas."
            acao={
              podeCriar ? (
                <Button nativeButton={false} render={<Link href="/vendas/nova" />}>
                  Lançar a primeira venda
                </Button>
              ) : undefined
            }
          />
        )}
      </Lista>
    </div>
  );
}
