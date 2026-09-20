import Link from "next/link";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { ContextoInicio, Pendencia } from "../painel.service";
import type { IdWidget } from "../widgets";

/*
 * Os 7 widgets do Início, portados um a um do app antigo.
 *
 * Regra herdada de lá: um widget que não tem nada a mostrar devolve `null` e
 * SOME da tela, sem deixar buraco. É por isso que "Meta do mês" desaparece
 * quando não há meta definida.
 */

export type DadosPainel = {
  ctx: ContextoInicio;
  serie: Array<{ rotulo: string; valor: number }>;
  ritmo: Array<{ dia: string; data: string; valor: number; vendas: number }>;
  mais: Array<{ id: string; nome: string; sku: string; qtd: number; valor: number }>;
  pend: Pendencia[];
  veFinanceiro: boolean;
};

function saudacao(d: Date) {
  const h = d.getHours();
  return h < 12 ? "Bom dia" : h < 18 ? "Boa tarde" : "Boa noite";
}

const primeiroNome = (n: string) => n.trim().split(/\s+/)[0] ?? "";

/* ─────────────────────────── saudação ─────────────────────────── */

function Saudacao({ ctx, serie, veFinanceiro }: DadosPainel) {
  const dataLonga = ctx.agora.toLocaleDateString("pt-BR", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  const temVendas = ctx.fatAno > 0;
  const maior = Math.max(...serie.map((s) => s.valor), 1);

  return (
    /*
     * Largura toda, em três colunas no monitor: quem é você · quanto faturou ·
     * como vem indo. Antes o bloco tinha 8 de 12 colunas e empilhava tudo numa
     * coluna só, deixando metade da faixa vazia — o João pediu que ele
     * completasse a linha, e completar não é esticar: é usar o espaço.
     */
    <section className="rounded-xl border bg-card p-5">
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        {/* ── quem é você ── */}
        <div className="min-w-0 lg:col-span-4">
          <p className="text-lg font-bold tracking-tight">
            {saudacao(ctx.agora)}
            {ctx.nome && (
              <>
                , <span className="font-extrabold">{primeiroNome(ctx.nome)}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-xs text-muted-foreground first-letter:uppercase">{dataLonga}</p>

          <div className="mt-4 flex flex-wrap gap-2">
            {/* nativeButton={false}: o Base UI avisa (com razão) que trocar o
                <button> por <a> tira a semântica nativa. Aqui é intencional —
                são links de navegação com aparência de botão. */}
            <Button nativeButton={false} render={<Link href="/vendas/nova" />}>
              Nova venda
            </Button>
            <Button nativeButton={false} variant="secondary" render={<Link href="/estoque" />}>
              Nova peça
            </Button>
            <Button nativeButton={false} variant="ghost" render={<Link href="/financeiro" />}>
              Faturamento
            </Button>
          </div>
        </div>

        {/* ── quanto faturou ── */}
        <div className="min-w-0 lg:col-span-4 lg:border-l lg:pl-6">
          {temVendas ? (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Faturado em {ctx.ano}
              </p>
              <p className="mt-0.5 overflow-hidden whitespace-nowrap text-3xl font-bold tabular-nums">
                {brl(ctx.fatAno)}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {veFinanceiro && <Chip>{brl(ctx.margemAno)} de margem bruta</Chip>}
                <Chip>
                  {ctx.vendasAno} {ctx.vendasAno === 1 ? "venda" : "vendas"}
                </Chip>
                <Chip>ticket {brl(ctx.ticketAno)}</Chip>
              </div>
            </>
          ) : (
            <>
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Primeiro passo
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Nenhuma venda em {ctx.ano} ainda. Comece lançando a primeira — o resto do painel se
                preenche sozinho.
              </p>
            </>
          )}
        </div>

        {/* ── como vem indo ── */}
        {temVendas && (
          <div className="min-w-0 lg:col-span-4 lg:border-l lg:pl-6">
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                Últimos 6 meses
              </p>
              {veFinanceiro && (
                <p className="text-right">
                  <span className="text-2xl font-bold tabular-nums">{ctx.margemPct}%</span>{" "}
                  <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                    margem
                  </span>
                </p>
              )}
            </div>

            {/* Mini-gráfico dos 6 meses, em CSS puro — sem biblioteca. */}
            <div className="mt-3">
              <div className="flex h-16 items-end gap-1.5">
                {serie.map((mes, i) => (
                  <div
                    key={i}
                    title={`${mes.rotulo}: ${brl(mes.valor)}`}
                    className="flex-1 rounded-sm bg-foreground/15"
                    style={{ height: `${Math.max(4, (mes.valor / maior) * 100)}%` }}
                  />
                ))}
              </div>
              {/* Um rótulo por barra: com só o primeiro e o último, ninguém
                  sabia de que mês era a barra do meio. */}
              <div className="mt-1 flex gap-1.5 text-[10px] text-muted-foreground">
                {serie.map((mes, i) => (
                  <span key={i} className="flex-1 truncate text-center first-letter:uppercase">
                    {mes.rotulo}
                  </span>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-muted px-2.5 py-1 text-xs text-muted-foreground">
      {children}
    </span>
  );
}

/* ─────────────────────────── pendências ─────────────────────────── */

function Pendencias({ pend }: DadosPainel) {
  const urgente = pend.some((p) => p.p <= 1);

  return (
    <section className={cn("rounded-xl border bg-card p-4", urgente && "border-destructive/40")}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Precisa de você
        </p>
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-xs font-bold",
            pend.length === 0 && "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
            pend.length > 0 && !urgente && "bg-muted text-muted-foreground",
            urgente && "bg-destructive/10 text-destructive",
          )}
        >
          {pend.length === 0 ? "✓" : pend.length}
        </span>
      </div>

      {pend.length > 0 ? (
        /* Lado a lado no monitor: a faixa agora atravessa a tela, e uma lista
           empilhada dentro dela deixaria três quartos do espaço vazios. */
        <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {pend.map((x) => (
            <Link
              key={x.nome}
              href={x.href}
              className="flex items-center gap-2.5 rounded-lg border px-3 py-2 hover:bg-accent/40"
            >
              <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: x.cor }} />
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{x.nome}</span>
                <span className="block truncate text-xs text-muted-foreground">{x.sub}</span>
              </span>
              <span className="shrink-0 font-medium tabular-nums">{x.valor}</span>
            </Link>
          ))}
        </div>
      ) : (
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Nada vencido, nenhuma peça zerada e nenhum orçamento expirando. Bom dia para vender.
        </p>
      )}
    </section>
  );
}

/* ─────────────────────────── números ─────────────────────────── */

function Numeros({ ctx, veFinanceiro }: DadosPainel) {
  const variacao =
    ctx.fatMesAnterior > 0
      ? Math.round(((ctx.fatMes - ctx.fatMesAnterior) / ctx.fatMesAnterior) * 100)
      : null;
  const mesAnt = ctx.mesAnt0.toLocaleDateString("pt-BR", { month: "short" }).replace(".", "");

  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
      <Cartao
        titulo="Vendido hoje"
        valor={brl(ctx.fatHoje)}
        sub={`${ctx.vendasHoje} ${ctx.vendasHoje === 1 ? "venda" : "vendas"}`}
        href="/vendas"
        tom={ctx.fatHoje > 0 ? "pos" : "neutro"}
      />
      <Cartao
        titulo="Este mês"
        selo={variacao === null ? undefined : `${variacao >= 0 ? "+" : ""}${variacao}%`}
        seloBom={variacao !== null && variacao >= 0}
        valor={brl(ctx.fatMes)}
        sub={`contra ${brl(ctx.fatMesAnterior)} em ${mesAnt}`}
        href="/financeiro"
      />
      {veFinanceiro && (
        <Cartao
          titulo="Em caixa"
          valor={brl(ctx.emCaixa)}
          sub="todas as carteiras"
          href="/financeiro"
          tom={ctx.emCaixa < 0 ? "neg" : "accent"}
        />
      )}
    </div>
  );
}

function Cartao({
  titulo,
  valor,
  sub,
  href,
  tom = "neutro",
  selo,
  seloBom,
}: {
  titulo: string;
  valor: string;
  sub: string;
  href: string;
  tom?: "neutro" | "pos" | "neg" | "accent";
  selo?: string;
  seloBom?: boolean;
}) {
  return (
    <Link href={href} className="min-w-0 rounded-xl border bg-card p-4 transition-colors hover:bg-accent/30">
      <div className="flex items-center gap-1.5">
        <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          {titulo}
        </p>
        {selo && (
          <span
            className={cn(
              "shrink-0 rounded px-1 py-0.5 text-[10px] font-bold",
              seloBom
                ? "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400"
                : "bg-destructive/10 text-destructive",
            )}
          >
            {selo}
          </span>
        )}
      </div>
      <p
        className={cn(
          "mt-1 overflow-hidden whitespace-nowrap text-2xl font-bold tabular-nums",
          tom === "pos" && "text-emerald-700 dark:text-emerald-400",
          tom === "neg" && "text-destructive",
          tom === "accent" && "text-amber-700 dark:text-amber-500",
        )}
      >
        {valor}
      </p>
      <p className="mt-0.5 truncate text-xs text-muted-foreground">{sub}</p>
    </Link>
  );
}

/* ─────────────────────────── meta ─────────────────────────── */

function Meta({ ctx }: DadosPainel) {
  if (!(ctx.meta > 0)) return null; // some quando não há meta — regra do app antigo

  const pct = Math.min(100, Math.round((ctx.fatMes / ctx.meta) * 100));
  const nomeMes = ctx.mes0.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Meta de <span className="first-letter:uppercase">{nomeMes}</span>
        </p>
        <p className="overflow-hidden whitespace-nowrap text-sm font-medium tabular-nums">
          {brl(ctx.fatMes)} <span className="text-muted-foreground">de {brl(ctx.meta)}</span>
        </p>
      </div>
      <div className="mt-2.5 h-2 overflow-hidden rounded-full bg-muted">
        <div className="h-full rounded-full bg-foreground transition-all" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        {ctx.fatMes >= ctx.meta
          ? "Meta batida. O que vier agora é acima do combinado."
          : `Faltam ${brl(ctx.meta - ctx.fatMes)} · ${pct}% do caminho`}
      </p>
    </section>
  );
}

/* ─────────────────────────── ritmo 14 dias ─────────────────────────── */

function Ritmo14({ ritmo }: DadosPainel) {
  const maior = Math.max(...ritmo.map((r) => r.valor), 1);
  const total = ritmo.reduce((s, r) => s + r.valor, 0);

  return (
    <section className="rounded-xl border bg-card p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Ritmo dos últimos 14 dias
        </p>
        <p className="overflow-hidden whitespace-nowrap text-sm font-medium tabular-nums">
          {brl(total)}
        </p>
      </div>

{/*
        A barra mede em PORCENTAGEM da altura do pai — então o pai precisa ter
        altura. Antes a coluna de cada dia era um `flex-col` sem altura
        definida dentro do `h-24`, e `height: 100%` não resolvia para nada:
        o gráfico aparecia vazio mesmo com venda no dia. O rótulo saiu para
        fora da área da barra pelo mesmo motivo — dentro, ele comia a altura.
      */}
      <div className="mt-4 flex h-24 items-end gap-1">
        {ritmo.map((r) => (
          <div
            key={r.data}
            title={`${r.data}: ${brl(r.valor)} · ${r.vendas} ${r.vendas === 1 ? "venda" : "vendas"}`}
            className={cn(
              "min-w-0 flex-1 rounded-sm",
              r.valor > 0 ? "bg-foreground/70" : "bg-muted",
            )}
            style={{ height: `${Math.max(3, (r.valor / maior) * 100)}%` }}
          />
        ))}
      </div>
      <div className="mt-1 flex gap-1">
        {ritmo.map((r) => (
          <span
            key={r.data}
            className="min-w-0 flex-1 truncate text-center text-[9px] tabular-nums text-muted-foreground"
          >
            {r.dia}
          </span>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── mais vendidas ─────────────────────────── */

function MaisVendidas({ mais }: DadosPainel) {
  if (mais.length === 0) return null; // sem venda no mês, o bloco some

  return (
    <section className="rounded-xl border bg-card">
      <p className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Mais vendidas no mês
      </p>
      <div className="divide-y">
        {mais.map((p) => (
          <div key={p.id} className="flex items-center gap-3 px-4 py-2.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{p.nome}</p>
              <p className="truncate text-xs text-muted-foreground">{p.sku}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className="text-sm font-medium tabular-nums">{brl(p.valor)}</p>
              <p className="text-xs text-muted-foreground">
                {p.qtd} {p.qtd === 1 ? "unidade" : "unidades"}
              </p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ─────────────────────────── resumo ─────────────────────────── */

function Resumo() {
  return (
    <Link
      href="/financeiro"
      className="flex items-center justify-between gap-3 rounded-xl border border-dashed px-5 py-4 transition-colors hover:bg-accent/30"
    >
      <span>
        <span className="block font-medium">Ver o resumo completo</span>
        <span className="block text-sm text-muted-foreground">
          Faturamento, margem e resultado, mês a mês.
        </span>
      </span>
      <span aria-hidden className="shrink-0 text-muted-foreground">
        →
      </span>
    </Link>
  );
}

/* ─────────────────────────── despachante ─────────────────────────── */

const MAPA: Record<IdWidget, (d: DadosPainel) => React.ReactNode> = {
  saudacao: Saudacao,
  pendencias: Pendencias,
  numeros: Numeros,
  meta: Meta,
  ritmo14: Ritmo14,
  maisvendidas: MaisVendidas,
  resumo: Resumo,
};

/*
 * Quem NÃO tem conteúdo em determinado dia. O app antigo fazia
 * `if(!corpo) return;` e não desenhava a seção — sem isso sobra um buraco na
 * grade, porque a coluna continua reservada mesmo com o bloco vazio.
 *
 * Esta lista precisa acompanhar os `return null` dos widgets acima.
 */
export function widgetTemConteudo(id: IdWidget, d: DadosPainel): boolean {
  if (id === "meta") return d.ctx.meta > 0;
  if (id === "maisvendidas") return d.mais.length > 0;
  return true;
}

export function RenderWidget({ id, dados }: { id: IdWidget; dados: DadosPainel }) {
  const Componente = MAPA[id];
  if (!Componente) return null;
  return <>{Componente(dados)}</>;
}
