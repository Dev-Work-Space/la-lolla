import Link from "next/link";
import { WarningIcon } from "@phosphor-icons/react/ssr";
import { brl, brlCompacto, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Lista, Pilula, Vazio } from "@/components/padrao/indicadores";
import { entradasPrevistas } from "../agenda.service";
import { ORIGENS_ENTRADA, type CarteiraSaldo, type EntradaPrevista } from "../financeiro.tipos";
import { datasDaBarra, ehAgrupar, grupoDe, periodoDaUrl, rotuloDoPeriodo, type Atalho } from "../periodo";
import { BaixarConta } from "./baixar-conta";
import { FiltroPeriodo } from "./filtro-periodo";
import { BaixarPlanilha, BuscaFiltro } from "./filtros";

/*
 * A ENTRAR — tudo o que vai entrar no caixa, de qualquer fonte, numa tela só.
 *
 * Pedido do João (07/10/2026): "uma tela que dê para ver tudo que vai
 * entrar". Antes isso estava em três lugares (a receber, o calendário e a
 * previsão) e ainda faltava um pedaço: a entrada lançada no caixa com data
 * futura não aparecia em nenhum deles. Aqui entram:
 *   - as parcelas das vendas no crediário;
 *   - os recebimentos lançados em contas a receber;
 *   - as entradas lançadas com data marcada.
 *
 * O atrasado vem à parte e em primeiro: é o dinheiro que já devia estar no
 * caixa, e a ação é cobrar, não esperar.
 */

const ATALHOS_A_ENTRAR: Atalho[] = ["hoje", "semana", "mes", "proximo-mes", "proximos-30", "ano", "tudo"];

const NOME_ORIGEM: Record<EntradaPrevista["origem"], string> = {
  crediario: "crediário",
  recebimento: "recebimento",
  lancamento: "data marcada",
};

export async function PainelAEntrar({
  params,
  carteiras,
  pode,
}: {
  params: Record<string, string>;
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const periodo = periodoDaUrl(params, "tudo");
  const agrupar = ehAgrupar(params.agrupar) ? params.agrupar : "semana";
  const origem = ORIGENS_ENTRADA.some(([o]) => o === params.origem) ? params.origem : "";
  const busca = (params.busca ?? "").trim().toLowerCase();

  const todas = await entradasPrevistas(periodo.de, periodo.ate);
  const buscadas = busca
    ? todas.filter((e) => `${e.titulo} ${e.quem ?? ""}`.toLowerCase().includes(busca))
    : todas;
  const lista = origem ? buscadas.filter((e) => e.origem === origem) : buscadas;

  const soma = (l: EntradaPrevista[]) => Math.round(l.reduce((t, e) => t + e.valor, 0) * 100) / 100;
  const atrasadas = lista.filter((e) => e.atrasado);
  const emDia = lista.filter((e) => !e.atrasado);

  /* Os quadros por fonte usam a busca mas não o filtro de fonte: tocar num
     deles troca de fonte sem precisar desmarcar o outro antes. */
  const porOrigem = ORIGENS_ENTRADA.map(([o, rotulo]) => {
    const itens = buscadas.filter((e) => e.origem === o);
    return { origem: o, rotulo, total: soma(itens), qtd: itens.length };
  });

  const grupos: Array<{ chave: string; rotulo: string; itens: EntradaPrevista[]; total: number }> = [];
  for (const e of emDia) {
    const { chave, rotulo } = grupoDe(e.quando, agrupar);
    const g = grupos.find((x) => x.chave === chave);
    if (g) {
      g.itens.push(e);
      g.total = Math.round((g.total + e.valor) * 100) / 100;
    } else grupos.push({ chave, rotulo, itens: [e], total: e.valor });
  }
  const maior = Math.max(1, ...grupos.map((g) => g.total));

  const link = (mudanca: Record<string, string>) => {
    const p = new URLSearchParams(params);
    for (const [k, v] of Object.entries(mudanca)) {
      if (v) p.set(k, v);
      else p.delete(k);
    }
    return `/financeiro?${p.toString()}`;
  };

  return (
    <div className="space-y-4">
      <FiltroPeriodo
        params={params}
        {...datasDaBarra(periodo)}
        agrupar={agrupar}
        atalhos={ATALHOS_A_ENTRAR}
        agrupamentos={["dia", "semana", "mes"]}
      />

      <section className="rounded-xl border bg-card p-4">
        <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
          Vai entrar · <span className="normal-case">{rotuloDoPeriodo(periodo)}</span>
        </p>
        <p className="mt-1 text-3xl font-extrabold tracking-tight tabular-nums text-(--ll-ok)">+ {brl(soma(lista))}</p>
        <p className="text-xs text-muted-foreground">
          {lista.length} {lista.length === 1 ? "entrada" : "entradas"}
          {atrasadas.length > 0 ? `, das quais ${brl(soma(atrasadas))} já deviam ter entrado` : ""}
        </p>
      </section>

      <div className="grid gap-2 sm:grid-cols-3">
        {porOrigem.map((o) => (
          <Link
            key={o.origem}
            href={link({ origem: origem === o.origem ? "" : o.origem })}
            aria-current={origem === o.origem ? "true" : undefined}
            className={cn(
              "block rounded-xl border bg-card p-3 transition-colors hover:border-foreground/40",
              origem === o.origem && "border-foreground ring-1 ring-foreground",
            )}
          >
            <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{o.rotulo}</p>
            <p className="mt-1 text-lg font-bold tabular-nums">{brl(o.total)}</p>
            <p className="text-xs text-muted-foreground">
              {o.qtd} {o.qtd === 1 ? "entrada" : "entradas"} · {origem === o.origem ? "toque para ver tudo" : "toque para filtrar"}
            </p>
          </Link>
        ))}
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <BuscaFiltro params={params} valor={params.busca ?? ""} placeholder="Cliente ou descrição" />
        <BaixarPlanilha
          nome={`a-entrar-${rotuloDoPeriodo(periodo).replace(/[^\p{L}\d]+/gu, "-")}`}
          colunas={["Data", "Descrição", "Cliente / detalhe", "Fonte", "Situação", "Valor"]}
          linhas={lista.map((e) => [
            fData(e.quando),
            e.titulo,
            e.quem ?? "",
            NOME_ORIGEM[e.origem],
            e.atrasado ? "Atrasado" : "A entrar",
            e.valor,
          ])}
        />
      </div>

      {/* Quanto entra em cada semana (ou dia, ou mês): uma série só, a altura
          é o valor. Apontar a barra mostra o número exato. */}
      {grupos.length > 1 && (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Quanto entra em cada {agrupar === "dia" ? "dia" : agrupar === "semana" ? "semana" : "mês"}
          </h2>
          <div className="flex h-32 items-end gap-1.5 overflow-x-auto">
            {grupos.map((g) => (
              <div key={g.chave} className="flex h-full min-w-8 flex-1 flex-col items-center justify-end gap-1" title={`${g.rotulo}: ${brl(g.total)}`}>
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {g.total < 1000 ? Math.round(g.total) : brlCompacto(g.total).replace("R$", "").trim()}
                </span>
                <span
                  className="block w-full max-w-10 rounded-t-[4px] bg-(--ll-ok)"
                  style={{ height: `${Math.max(3, (g.total / maior) * 78)}%` }}
                />
              </div>
            ))}
          </div>
          <div className="mt-1 flex gap-1.5 overflow-hidden text-[10px] text-muted-foreground">
            {grupos.map((g) => (
              <span key={g.chave} className="min-w-8 flex-1 truncate text-center">
                {g.chave.length === 7 ? g.rotulo.split(" ")[0].slice(0, 3) : g.chave.slice(8, 10) + "/" + g.chave.slice(5, 7)}
              </span>
            ))}
          </div>
        </section>
      )}

      {atrasadas.length > 0 && (
        <section className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wide text-destructive">
              <WarningIcon weight="fill" className="size-3.5" aria-hidden />
              Atrasado · já devia ter entrado · {atrasadas.length}
            </h2>
            <span className="text-sm font-semibold tabular-nums text-destructive">{brl(soma(atrasadas))}</span>
          </div>
          <Lista>
            {atrasadas.map((e) => (
              <LinhaEntrada key={e.origem + e.id} e={e} carteiras={carteiras} podeBaixar={pode.editar} />
            ))}
          </Lista>
        </section>
      )}

      {grupos.map((g) => (
        <section key={g.chave} className="space-y-1.5">
          <div className="flex items-baseline justify-between gap-3">
            <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground first-letter:uppercase">
              {g.rotulo} · {g.itens.length}
            </h2>
            <span className="text-sm font-semibold tabular-nums">{brl(g.total)}</span>
          </div>
          <Lista>
            {g.itens.map((e) => (
              <LinhaEntrada key={e.origem + e.id} e={e} carteiras={carteiras} podeBaixar={pode.editar} />
            ))}
          </Lista>
        </section>
      ))}

      {lista.length === 0 && (
        <Lista>
          <Vazio texto="Nada a entrar neste período e nestes filtros." />
        </Lista>
      )}

      <p className="text-xs leading-relaxed text-muted-foreground">
        Entram aqui as parcelas do crediário, os recebimentos lançados em contas a receber e as entradas
        lançadas no caixa com data futura. <strong>Venda que ainda não aconteceu não entra.</strong> O cartão
        parcelado entra no caixa no dia da venda, então não aparece aqui.
      </p>
    </div>
  );
}

function LinhaEntrada({
  e,
  carteiras,
  podeBaixar,
}: {
  e: EntradaPrevista;
  carteiras: CarteiraSaldo[];
  podeBaixar: boolean;
}) {
  const corpo = (
    <>
      <span className={cn("w-12 shrink-0 text-xs font-semibold tabular-nums", e.atrasado ? "text-destructive" : "text-muted-foreground")}>
        {fData(e.quando).slice(0, 5)}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5">
          <span className="truncate text-sm font-medium">{e.titulo}</span>
          <Pilula>{NOME_ORIGEM[e.origem]}</Pilula>
        </span>
        {e.quem && <span className="block truncate text-xs text-muted-foreground">{e.quem}</span>}
      </span>
      <span className="shrink-0 text-sm font-semibold tabular-nums text-(--ll-ok)">+ {brl(e.valor)}</span>
    </>
  );
  return (
    <div className="flex items-center gap-3 px-3 py-2.5">
      {e.href ? (
        <Link href={e.href} className="flex min-w-0 flex-1 items-center gap-3 hover:underline">
          {corpo}
        </Link>
      ) : (
        <div className="flex min-w-0 flex-1 items-center gap-3">{corpo}</div>
      )}
      {podeBaixar && e.contaId && (
        <BaixarConta
          contaId={e.contaId}
          descricao={e.titulo}
          valor={e.valor}
          tipo="RECEBER"
          carteiras={carteiras}
          deVenda={e.deVenda}
        />
      )}
    </div>
  );
}
