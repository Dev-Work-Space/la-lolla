import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "@phosphor-icons/react/ssr";
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
  // "Quinta · 03/09/2026", como no app antigo: o dia da semana sem o "-feira".
  const diaSemana = ctx.agora.toLocaleDateString("pt-BR", { weekday: "long" }).split("-")[0];
  const data = `${diaSemana.charAt(0).toUpperCase()}${diaSemana.slice(1)} · ${ctx.agora.toLocaleDateString("pt-BR")}`;
  const temVendas = ctx.fatAno > 0;

  return (
    /*
     * O "herói" do app antigo, no mesmo arranjo — o João mandou o print de lá:
     * saudação com a margem numa caixinha ao lado, o faturado do ano GRANDE,
     * os chips, o gráfico na largura toda e os botões embaixo. O fundo tem o
     * brilho dourado no canto e o degradê suave da marca.
     */
    <Card
      as="section"
      className="block overflow-hidden border-(--ll-accent-line) px-5 pt-6 pb-5 text-base shadow-sm sm:px-6"
      style={{
        background:
          "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--ll-accent) 14%, transparent) 0%, transparent 58%), linear-gradient(168deg, var(--ll-accent-soft) 0%, var(--card) 55%)",
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xl font-bold tracking-tight">
            {saudacao(ctx.agora)}
            {ctx.nome && (
              <>
                , <span className="font-extrabold text-(--ll-accent)">{primeiroNome(ctx.nome)}</span>
              </>
            )}
          </p>
          <p className="mt-0.5 text-sm text-muted-foreground">{data}</p>
        </div>
        {temVendas && veFinanceiro && (
          <div className="shrink-0 rounded-md border border-(--ll-accent-line) bg-card/70 px-3.5 py-2 text-center">
            <span className="block text-2xl leading-none font-extrabold tracking-tight text-(--ll-accent) tabular-nums">
              {ctx.margemPct}%
            </span>
            <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">margem</span>
          </div>
        )}
      </div>

      <div className="mt-6">
        {temVendas ? (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
              Faturado em {ctx.ano}
            </p>
            <p className="mt-1 text-[clamp(30px,8.4vw,52px)] leading-none font-extrabold tracking-tight tabular-nums">
              {brl(ctx.fatAno)}
            </p>

            <div className="mt-3 flex flex-wrap gap-1.5">
              {/* O lucro de verdade do ano: margem menos o que a loja gastou. */}
              {veFinanceiro && (
                <Chip tom={ctx.resultadoAno >= 0 ? "ok" : "ruim"}>
                  {brl(ctx.resultadoAno)} de {ctx.resultadoAno >= 0 ? "lucro" : "prejuízo"}
                </Chip>
              )}
              <Chip>
                {ctx.vendasAno} {ctx.vendasAno === 1 ? "venda" : "vendas"}
              </Chip>
              <Chip>ticket {brl(ctx.ticketAno)}</Chip>
            </div>

            <Sparkline serie={serie} />
          </>
        ) : (
          <>
            <p className="text-xs font-bold uppercase tracking-wide text-muted-foreground">Primeiro passo</p>
            <p className="mt-1 max-w-[44ch] text-base leading-relaxed text-muted-foreground">
              Nenhuma venda em {ctx.ano} ainda. Comece lançando a primeira — o resto do painel se
              preenche sozinho.
            </p>
          </>
        )}
      </div>

      {/* Os botões fecham o bloco, grandes, como no app antigo. nativeButton={false}:
          são links de navegação com aparência de botão, de propósito. */}
      <div className="mt-6 flex flex-wrap gap-2 sm:max-w-md [&>*]:h-11 [&>*]:flex-[1_1_128px]">
        <Button
          nativeButton={false}
          className="bg-foreground font-semibold text-background hover:bg-foreground/90"
          render={<Link href="/vendas/nova" />}
        >
          Nova venda
        </Button>
        <Button nativeButton={false} variant="outline" className="bg-card/80 font-semibold" render={<Link href="/estoque" />}>
          Nova peça
        </Button>
        <Button nativeButton={false} variant="outline" className="bg-card/80 font-semibold" render={<Link href="/financeiro" />}>
          Faturamento
        </Button>
      </div>
    </Card>
  );
}

/*
 * A linha dos 6 meses — o `sparkline` do app antigo, igual: linha dourada
 * fina, área em degradê embaixo, um ponto no mês atual e só o primeiro e o
 * último mês escritos. Sem eixo e sem valor de propósito: o número exato está
 * logo acima; aqui interessa só a forma ("a coisa vem subindo?").
 *
 * Como lá, a escala vai do menor ao maior mês (não do zero): numa loja que
 * fatura parecido todo mês, partir do zero achataria a linha numa reta.
 *
 * O SVG estica na largura (preserveAspectRatio="none"), então o ponto final
 * mora FORA dele, em HTML: dentro, o círculo viraria uma elipse esticada.
 * Apontar um mês mostra o valor dele.
 */
function Sparkline({ serie }: { serie: Array<{ rotulo: string; valor: number }> }) {
  const W = 260;
  const H = 46;
  const pad = 3;
  const n = serie.length;
  if (n < 2) return null;

  const valores = serie.map((s) => s.valor);
  let max = Math.max(...valores);
  let min = Math.min(...valores);
  if (max === min) {
    max = max || 1;
    min = 0;
  }
  const pts = valores.map((v, i) => ({
    x: pad + ((W - pad * 2) * i) / (n - 1),
    y: pad + (H - pad * 2) - ((H - pad * 2) * (v - min)) / (max - min),
  }));
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const area = `${linha} L${pts[n - 1].x.toFixed(1)} ${H - pad} L${pts[0].x.toFixed(1)} ${H - pad} Z`;
  const fim = pts[n - 1];

  return (
    <div className="mt-5">
      <div className="relative h-[46px]">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Faturamento dos últimos 6 meses: ${serie.map((s) => `${s.rotulo} ${brl(s.valor)}`).join(", ")}`}
          className="block size-full overflow-visible"
        >
          <defs>
            <linearGradient id="inicio-spark" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ll-accent)" stopOpacity={0.22} />
              <stop offset="100%" stopColor="var(--ll-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#inicio-spark)" stroke="none" />
          <path
            d={linha}
            fill="none"
            stroke="var(--ll-accent)"
            strokeWidth={2}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>
        <span
          aria-hidden
          className="absolute size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-(--ll-accent)"
          style={{ left: `${(fim.x / W) * 100}%`, top: `${(fim.y / H) * 100}%` }}
        />
        {/* Uma faixa por mês, invisível, só para o valor aparecer ao apontar. */}
        <div className="absolute inset-0 flex">
          {serie.map((mes, i) => (
            <span key={i} className="flex-1" title={`${mes.rotulo}: ${brl(mes.valor)}`} />
          ))}
        </div>
      </div>
      <div className="mt-0.5 flex justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
        <span>{serie[0].rotulo}</span>
        <span>{serie[n - 1].rotulo}</span>
      </div>
    </div>
  );
}

function Chip({ children, tom }: { children: React.ReactNode; tom?: "ok" | "ruim" }) {
  return (
    <Badge
      variant="outline"
      className={cn(
        "h-auto rounded-full bg-card/70 px-2.5 py-1 text-xs font-semibold tabular-nums text-muted-foreground",
        tom === "ok" && "border-(--ll-ok)/30 text-(--ll-ok)",
        tom === "ruim" && "border-(--ll-danger)/30 text-(--ll-danger)",
      )}
    >
      {children}
    </Badge>
  );
}

/* ─────────────────────────── pendências ─────────────────────────── */

function Pendencias({ pend }: DadosPainel) {
  const urgente = pend.some((p) => p.p <= 1);

  return (
    <Card as="section" className={cn("block overflow-visible p-4 text-base", urgente && "ring-destructive/40")}>
      <div className="flex items-center justify-between">
        <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Precisa de você
        </p>
        <Badge
          variant="outline"
          className={cn(
            "h-auto",
            "rounded-full px-2 py-0.5 text-xs font-bold",
            pend.length === 0 && "bg-(--ll-ok-soft) text-ok",
            pend.length > 0 && !urgente && "bg-muted text-muted-foreground",
            urgente && "bg-destructive/10 text-destructive",
          )}
        >
          {pend.length === 0 ? <CheckIcon weight="regular" className="inline-block size-3 align-middle" aria-label="Sem pendências" /> : pend.length}
        </Badge>
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
    </Card>
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
    <Link href={href} className="min-w-0">
      <Card className="block h-full p-4 text-base hover:bg-accent/30">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {titulo}
          </p>
          {selo && (
            <Badge
              variant="outline"
              className={cn(
                "h-auto",
                "shrink-0 rounded px-1 py-0.5 text-[10px] font-bold",
                seloBom
                  ? "bg-(--ll-ok-soft) text-ok"
                  : "bg-destructive/10 text-destructive",
              )}
            >
              {selo}
            </Badge>
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
      </Card>
    </Link>
  );
}

/* ─────────────────────────── meta ─────────────────────────── */

function Meta({ ctx }: DadosPainel) {
  if (!(ctx.meta > 0)) return null; // some quando não há meta — regra do app antigo

  const pct = Math.min(100, Math.round((ctx.fatMes / ctx.meta) * 100));
  const nomeMes = ctx.mes0.toLocaleDateString("pt-BR", { month: "long" });

  return (
    <Card as="section" className="block overflow-visible py-0 text-base p-4">
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
    </Card>
  );
}

/* ─────────────────────────── ritmo 14 dias ─────────────────────────── */

function Ritmo14({ ritmo }: DadosPainel) {
  const maior = Math.max(...ritmo.map((r) => r.valor), 1);
  const total = ritmo.reduce((s, r) => s + r.valor, 0);

  return (
    <Card as="section" className="block overflow-visible py-0 text-base p-4">
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
    </Card>
  );
}

/* ─────────────────────────── mais vendidas ─────────────────────────── */

function MaisVendidas({ mais }: DadosPainel) {
  if (mais.length === 0) return null; // sem venda no mês, o bloco some

  return (
    <Card as="section" className="block overflow-visible py-0 text-base">
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
    </Card>
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
