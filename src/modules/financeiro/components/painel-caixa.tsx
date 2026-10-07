import { Card } from "@/components/ui/card";
import Link from "next/link";
import { ArrowDownRightIcon, ArrowUpRightIcon, ArrowsLeftRightIcon, XIcon } from "@phosphor-icons/react/ssr";
import { brl, data as fData, hora } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Lista, Vazio } from "@/components/padrao/indicadores";
import { movimentoDoPeriodo, resumoMensal, type CarteiraSaldo, type MovimentoCaixa } from "../financeiro.service";
import { datasDaBarra, ehAgrupar, grupoDe, periodoDaUrl, type Atalho } from "../periodo";
import { FormLancamento } from "./form-lancamento";
import { FormTransferencia } from "./form-transferencia";
import { FiltroPeriodo } from "./filtro-periodo";
import { BaixarPlanilha, BuscaFiltro, SeletorFiltro } from "./filtros";
import { ResultadoMensal } from "./painel-visao-geral";

/*
 * O extrato. Lançamentos, pagamentos de venda e transferências na MESMA linha
 * do tempo.
 *
 * No app antigo os três viviam em listas separadas e o João tinha de somar de
 * cabeça para saber o que entrou no dia. Aqui a pergunta "o que aconteceu com
 * o dinheiro?" tem uma resposta só — e, com a barra de período e os filtros,
 * ela pode ser "nesta carteira", "só as saídas", "só o aluguel", "em março".
 *
 * Os filtros são aplicados em memória sobre o período: a lista de um período
 * cabe folgada, e assim os totais, as categorias e a planilha saem da MESMA
 * lista que está na tela.
 */

const ATALHOS_EXTRATO: Atalho[] = ["hoje", "semana", "mes", "mes-passado", "ultimos-30", "ano", "tudo"];

const TIPOS_MOV = [
  { value: "entrada", label: "Entradas" },
  { value: "saida", label: "Saídas" },
  { value: "transferencia", label: "Transferências" },
];

const ehTransf = (l: MovimentoCaixa) => l.origem === "transferencia";

export async function PainelCaixa({
  params,
  carteiras,
  pode,
}: {
  params: Record<string, string>;
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  /* "Este mês" vai do dia 1º até HOJE: um lançamento já marcado para o dia 25
     ainda não aconteceu, e entraria no "quanto sobrou" como se tivesse. */
  const periodo = periodoDaUrl(params, "mes", { ateHoje: true });
  const agrupar = ehAgrupar(params.agrupar) ? params.agrupar : "dia";
  const carteira = params.carteira ?? "";
  const mov = params.mov ?? "";
  const categoria = params.categoria ?? "";
  const busca = (params.busca ?? "").trim().toLowerCase();

  const [todas, serie] = await Promise.all([movimentoDoPeriodo(periodo.de, periodo.ate), resumoMensal(6)]);

  /* Tudo menos a categoria: a lista de categorias sai daqui, para dar para
     trocar de uma para outra sem antes desmarcar. */
  const semCategoria = todas.filter(
    (l) =>
      (!carteira || l.carteiraIds.includes(carteira)) &&
      (!mov || (mov === "transferencia" ? ehTransf(l) : !ehTransf(l) && l.tipo === mov)) &&
      (!busca || `${l.descricao} ${l.categoria ?? ""} ${l.carteira ?? ""}`.toLowerCase().includes(busca)),
  );
  const linhas = categoria ? semCategoria.filter((l) => (l.categoria ?? "Sem categoria") === categoria) : semCategoria;

  const saidasPorCat = new Map<string, number>();
  for (const l of semCategoria) {
    if (l.tipo !== "saida" || ehTransf(l)) continue;
    const c = l.categoria ?? "Sem categoria";
    saidasPorCat.set(c, Math.round(((saidasPorCat.get(c) ?? 0) + l.valor) * 100) / 100);
  }
  const totalSaidasCat = [...saidasPorCat.values()].reduce((s, v) => s + v, 0);
  const categorias = [...saidasPorCat.entries()]
    .map(([c, valor]) => ({ categoria: c, valor, pct: totalSaidasCat ? Math.round((valor / totalSaidasCat) * 100) : 0 }))
    .sort((a, b) => b.valor - a.valor);

  /*
   * Agrupado por dia, semana ou mês, com o resultado do grupo ao lado. Uma
   * lista corrida de trinta linhas responde "o que aconteceu"; agrupada ela
   * também responde "como foi terça" ou "como foi a semana passada".
   * Transferência não soma no resultado: o dinheiro só trocou de bolso.
   */
  const grupos: Array<{ chave: string; rotulo: string; itens: MovimentoCaixa[]; saldo: number }> = [];
  for (const l of linhas) {
    const { chave, rotulo } = grupoDe(l.quando, agrupar);
    const sinal = ehTransf(l) ? 0 : l.tipo === "entrada" ? l.valor : -l.valor;
    const ja = grupos.find((g) => g.chave === chave);
    if (ja) {
      ja.itens.push(l);
      ja.saldo = Math.round((ja.saldo + sinal) * 100) / 100;
    } else {
      grupos.push({ chave, rotulo, itens: [l], saldo: sinal });
    }
  }

  const totalEntrou = linhas.filter((l) => l.tipo === "entrada" && !ehTransf(l)).reduce((s, l) => s + l.valor, 0);
  const totalSaiu = linhas.filter((l) => l.tipo === "saida" && !ehTransf(l)).reduce((s, l) => s + l.valor, 0);

  const link = (mudanca: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/financeiro?${p.toString()}`;
  };
  const nomeCarteira = carteiras.find((c) => c.id === carteira)?.nome;

  return (
    <div className="space-y-4">
      {pode.criar && (
        <div className="flex flex-wrap gap-2">
          <FormLancamento tipo="entrada" carteiras={carteiras} />
          <FormLancamento tipo="saida" carteiras={carteiras} />
          {carteiras.length > 1 && <FormTransferencia carteiras={carteiras} />}
        </div>
      )}

      <FiltroPeriodo
        params={params}
        {...datasDaBarra(periodo)}
        agrupar={agrupar}
        atalhos={ATALHOS_EXTRATO}
        agrupamentos={["dia", "semana", "mes"]}
      />

      <div className="flex flex-wrap items-end gap-2">
        <SeletorFiltro
          params={params}
          chave="carteira"
          rotulo="Carteira"
          valor={carteira}
          rotuloTodos="Todas as carteiras"
          opcoes={carteiras.map((c) => ({ value: c.id, label: c.nome }))}
        />
        <SeletorFiltro params={params} chave="mov" rotulo="Tipo" valor={mov} rotuloTodos="Tudo" opcoes={TIPOS_MOV} />
        <BuscaFiltro params={params} valor={params.busca ?? ""} placeholder="Descrição, categoria ou carteira" />
        <BaixarPlanilha
          nome={`extrato-${datasDaBarra(periodo).de ?? "inicio"}-a-${datasDaBarra(periodo).ate ?? "hoje"}`}
          colunas={["Data", "Hora", "Descrição", "Categoria", "Carteira", "Tipo", "Valor"]}
          linhas={linhas.map((l) => [
            fData(l.quando),
            hora(l.quando),
            l.descricao,
            l.categoria ?? "",
            l.carteira ?? "sem carteira",
            ehTransf(l) ? "Transferência" : l.tipo === "entrada" ? "Entrada" : "Saída",
            ehTransf(l) ? l.valor : l.tipo === "entrada" ? l.valor : -l.valor,
          ])}
        />
      </div>

      {/* Os filtros ligados, à vista e cada um com o seu "x": filtro esquecido
          ligado é o jeito mais comum de achar que o dinheiro sumiu. */}
      {(nomeCarteira || categoria) && (
        <div className="flex flex-wrap gap-1.5">
          {nomeCarteira && (
            <Link href={link({ carteira: "" })} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
              Carteira: {nomeCarteira} <XIcon className="size-3" aria-label="tirar o filtro" />
            </Link>
          )}
          {categoria && (
            <Link href={link({ categoria: "" })} className="inline-flex items-center gap-1 rounded-full border bg-card px-2.5 py-1 text-xs">
              Categoria: {categoria} <XIcon className="size-3" aria-label="tirar o filtro" />
            </Link>
          )}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <Total rotulo="Entrou" valor={totalEntrou} classe="text-emerald-700 dark:text-emerald-400" />
        <Total rotulo="Saiu" valor={totalSaiu} classe="text-destructive" />
        <Total
          rotulo="Sobrou"
          valor={totalEntrou - totalSaiu}
          classe={totalEntrou - totalSaiu < 0 ? "text-destructive" : undefined}
        />
      </div>

      {/*
        O resultado dos últimos seis meses e para onde o dinheiro foi, lado a
        lado no computador. Uma coisa é saber que o mês fechou positivo, outra
        é ver que ele vem caindo há três.
      */}
      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Quanto sobrou em cada mês
          </h2>
          <ResultadoMensal meses={serie} />
        </section>

        {/* Para onde o dinheiro foi, no período e nos filtros. Tocar numa
            categoria filtra o extrato por ela; tocar de novo tira o filtro. */}
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Saídas por categoria · toque para filtrar
          </h2>
          {categorias.length > 0 ? (
            <ul className="space-y-1">
              {categorias.map((c) => (
                <li key={c.categoria}>
                  <Link
                    href={link({ categoria: categoria === c.categoria ? "" : c.categoria })}
                    aria-current={categoria === c.categoria ? "true" : undefined}
                    className={cn(
                      "block rounded-lg px-2 py-1.5 transition-colors hover:bg-accent/40",
                      categoria === c.categoria && "bg-accent",
                    )}
                    title={`${c.categoria}: ${brl(c.valor)} (${c.pct}% das saídas)`}
                  >
                    <div className="flex items-baseline justify-between gap-2 text-sm">
                      <span className="truncate">{c.categoria}</span>
                      <span className="shrink-0 tabular-nums text-muted-foreground">
                        {brl(c.valor)} · {c.pct}%
                      </span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-(--ll-accent)" style={{ width: `${Math.max(2, c.pct)}%` }} />
                    </div>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma saída no período.</p>
          )}
        </section>
      </div>

      <h2 className="pt-1 text-sm font-semibold">
        Extrato · {linhas.length} {linhas.length === 1 ? "movimento" : "movimentos"}
      </h2>

      {grupos.length === 0 && <Lista>{<Vazio texto="Nenhum movimento neste período e nestes filtros." />}</Lista>}

      {grupos.map((g) => (
        <section key={g.chave}>
          <div className="flex items-baseline justify-between gap-3">
            <h3 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{g.rotulo}</h3>
            <span className={cn("text-xs tabular-nums", g.saldo < 0 ? "text-destructive" : "text-muted-foreground")}>
              {g.saldo >= 0 ? "+" : "−"} {brl(Math.abs(g.saldo))}
            </span>
          </div>
          <Lista>
            {g.itens.map((l) => (
              <LinhaDoExtrato key={l.origem + l.id} l={l} comData={agrupar !== "dia"} />
            ))}
          </Lista>
        </section>
      ))}
    </div>
  );
}

function Total({ rotulo, valor, classe }: { rotulo: string; valor: number; classe?: string }) {
  return (
    <Card className="block overflow-visible py-0 text-base p-3">
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-1 overflow-hidden whitespace-nowrap text-lg font-bold tabular-nums", classe)}>{brl(valor)}</p>
    </Card>
  );
}

function LinhaDoExtrato({ l, comData }: { l: MovimentoCaixa; comData: boolean }) {
  const Icone = ehTransf(l) ? ArrowsLeftRightIcon : l.tipo === "entrada" ? ArrowDownRightIcon : ArrowUpRightIcon;
  const corpo = (
    <>
      <span
        className={cn(
          "grid size-8 shrink-0 place-items-center rounded-full",
          ehTransf(l)
            ? "bg-muted text-muted-foreground"
            : l.tipo === "entrada"
              ? "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400"
              : "bg-destructive/10 text-destructive",
        )}
      >
        <Icone weight="regular" className="size-4" aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{l.descricao}</span>
        <span className="block truncate text-xs text-muted-foreground">
          {/* Agrupado por semana ou mês, a hora sozinha não diz o dia. */}
          {comData ? `${fData(l.quando).slice(0, 5)} · ` : ""}
          {hora(l.quando)}
          {l.categoria ? ` · ${l.categoria}` : ""}
          {l.carteira ? ` · ${l.carteira}` : " · sem carteira"}
        </span>
      </span>
      <span
        className={cn(
          "shrink-0 text-sm font-semibold tabular-nums",
          ehTransf(l)
            ? "text-muted-foreground"
            : l.tipo === "entrada"
              ? "text-emerald-700 dark:text-emerald-400"
              : "text-destructive",
        )}
      >
        {ehTransf(l) ? "" : l.tipo === "entrada" ? "+ " : "− "}
        {brl(l.valor)}
      </span>
    </>
  );

  return l.href ? (
    <Link href={l.href} className="flex items-center gap-3 px-3 py-2.5 hover:bg-accent/40">
      {corpo}
    </Link>
  ) : (
    <div className="flex items-center gap-3 px-3 py-2.5">{corpo}</div>
  );
}
