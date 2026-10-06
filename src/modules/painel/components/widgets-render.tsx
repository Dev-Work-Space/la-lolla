import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { brl, brlCompacto } from "@/lib/formato";
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

  return (
    /*
     * O "herói" do app antigo: fundo com um brilho dourado no canto e o
     * degradê suave da marca, o nome em dourado, a margem numa caixinha e a
     * linha dos 6 meses. O João pediu de volta o "gráfico bonitinho" — e
     * depois, o gráfico GRANDE, com o resto das informações em cima dele.
     */
    <Card
      as="section"
      className="block overflow-hidden border-(--ll-accent-line) p-5 text-base"
      style={{
        background:
          "radial-gradient(120% 140% at 100% 0%, color-mix(in srgb, var(--ll-accent) 14%, transparent) 0%, transparent 58%), linear-gradient(168deg, var(--ll-accent-soft) 0%, var(--card) 55%)",
      }}
    >
      <div className="grid gap-5 lg:grid-cols-12 lg:gap-6">
        {/* ── quem é você ── */}
        <div className="min-w-0 lg:col-span-5">
          <p className="text-lg font-bold tracking-tight">
            {saudacao(ctx.agora)}
            {ctx.nome && (
              <>
                , <span className="font-extrabold text-(--ll-accent)">{primeiroNome(ctx.nome)}</span>
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
            <Button nativeButton={false} variant="outline" className="bg-card/80" render={<Link href="/estoque" />}>
              Nova peça
            </Button>
            <Button nativeButton={false} variant="outline" className="bg-card/80" render={<Link href="/financeiro" />}>
              Faturamento
            </Button>
          </div>
        </div>

        {/* ── quanto faturou, e a margem ao lado ── */}
        <div className="flex min-w-0 items-start justify-between gap-4 lg:col-span-7 lg:border-l lg:border-(--ll-accent-line) lg:pl-6">
          {temVendas ? (
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Faturado em {ctx.ano}
              </p>
              <p className="mt-0.5 overflow-hidden whitespace-nowrap text-3xl font-extrabold tracking-tight tabular-nums">
                {brl(ctx.fatAno)}
              </p>

              <div className="mt-3 flex flex-wrap gap-1.5">
                {veFinanceiro && <Chip>{brl(ctx.margemAno)} de margem bruta</Chip>}
                {/* O lucro de verdade do ano: margem menos o que a loja gastou. */}
                {veFinanceiro && (
                  <Chip tom={ctx.resultadoAno >= 0 ? "ok" : "ruim"}>{brl(ctx.resultadoAno)} de resultado</Chip>
                )}
                <Chip>
                  {ctx.vendasAno} {ctx.vendasAno === 1 ? "venda" : "vendas"}
                </Chip>
                <Chip>ticket {brl(ctx.ticketAno)}</Chip>
              </div>
            </div>
          ) : (
            <div>
              <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
                Primeiro passo
              </p>
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                Nenhuma venda em {ctx.ano} ainda. Comece lançando a primeira — o resto do painel se
                preenche sozinho.
              </p>
            </div>
          )}
          {temVendas && veFinanceiro && (
            <div className="shrink-0 rounded-md border border-(--ll-accent-line) bg-card/70 px-3 py-2 text-center">
              <span className="block text-2xl leading-none font-extrabold tracking-tight text-(--ll-accent) tabular-nums">
                {ctx.margemPct}%
              </span>
              <span className="mt-1 block text-[10px] uppercase tracking-wide text-muted-foreground">margem</span>
            </div>
          )}
        </div>
      </div>

      {/* ── como vem indo: o gráfico, grande, embaixo de tudo ── */}
      {temVendas && (
        <div className="mt-5 border-t border-(--ll-accent-line) pt-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            Faturamento dos últimos 6 meses
          </p>
          <Grafico serie={serie} />
        </div>
      )}
    </Card>
  );
}

/*
 * Curva lisa pelos pontos (spline "monótona", de Fritsch–Carlson).
 *
 * Uma curva comum (Catmull-Rom, Bézier livre) passa ABAIXO de zero entre um
 * mês zerado e um mês bom — o desenho mostraria faturamento negativo que nunca
 * existiu. A monótona nunca ultrapassa o vizinho: entre dois pontos, ela só
 * sobe ou só desce, e um trecho plano continua plano.
 */
function curvaLisa(pts: Array<{ x: number; y: number }>) {
  const n = pts.length;
  const d = pts.slice(0, -1).map((p, i) => (pts[i + 1].y - p.y) / (pts[i + 1].x - p.x));
  const m = pts.map((_, i) =>
    i === 0 ? d[0] : i === n - 1 ? d[n - 2] : d[i - 1] * d[i] <= 0 ? 0 : (d[i - 1] + d[i]) / 2,
  );
  for (let i = 0; i < n - 1; i++) {
    if (d[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / d[i];
    const b = m[i + 1] / d[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * d[i];
      m[i + 1] = t * b * d[i];
    }
  }
  let caminho = `M${pts[0].x.toFixed(1)} ${pts[0].y.toFixed(1)}`;
  for (let i = 0; i < n - 1; i++) {
    const h = (pts[i + 1].x - pts[i].x) / 3;
    caminho +=
      ` C${(pts[i].x + h).toFixed(1)} ${(pts[i].y + m[i] * h).toFixed(1)}` +
      ` ${(pts[i + 1].x - h).toFixed(1)} ${(pts[i + 1].y - m[i + 1] * h).toFixed(1)}` +
      ` ${pts[i + 1].x.toFixed(1)} ${pts[i + 1].y.toFixed(1)}`;
  }
  return caminho;
}

/*
 * O gráfico dos 6 meses: a linha dourada do `sparkline` do app antigo, com a
 * área em degradê e o ponto no mês atual — crescida e LISA, como o João pediu,
 * e com as linhas-guia dos gráficos de lá (zero, metade e topo, com o valor
 * escrito na ponta).
 *
 * Cada mês ocupa uma coluna igual e o ponto fica no MEIO dela: assim o mês
 * escrito embaixo cai exatamente sob o ponto, em qualquer largura de tela.
 *
 * O SVG estica (preserveAspectRatio="none"), então pontos e textos moram FORA
 * dele, em HTML: dentro, o círculo viraria elipse e o texto sairia achatado.
 */
function Grafico({ serie }: { serie: Array<{ rotulo: string; valor: number }> }) {
  const W = 600;
  const H = 200;
  const topo = 14;
  const base = 2;
  const n = serie.length;
  if (n < 2) return null;

  const valores = serie.map((s) => s.valor);
  const max = Math.max(...valores, 1);
  const yDe = (v: number) => topo + (H - topo - base) * (1 - v / max);
  const pts = valores.map((v, i) => ({ x: ((i + 0.5) / n) * W, y: yDe(v) }));
  const linha = curvaLisa(pts);
  const area = `${linha} L${pts[n - 1].x.toFixed(1)} ${H} L${pts[0].x.toFixed(1)} ${H} Z`;
  const guias = [1, 0.5, 0].map((f) => ({ y: yDe(max * f), valor: max * f }));
  const fim = pts[n - 1];

  return (
    <div className="mt-3">
      <div className="relative h-44 sm:h-52">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Faturamento dos últimos 6 meses: ${serie.map((s) => `${s.rotulo} ${brl(s.valor)}`).join(", ")}`}
          className="block size-full overflow-visible"
        >
          <defs>
            <linearGradient id="inicio-grafico" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ll-accent)" stopOpacity={0.26} />
              <stop offset="100%" stopColor="var(--ll-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          {guias.map((g) => (
            <line
              key={g.y}
              x1={0}
              y1={g.y}
              x2={W}
              y2={g.y}
              stroke="var(--ll-accent-line)"
              strokeDasharray={g.valor === 0 ? undefined : "4 4"}
              vectorEffect="non-scaling-stroke"
            />
          ))}
          <path d={area} fill="url(#inicio-grafico)" stroke="none" />
          <path
            d={linha}
            fill="none"
            stroke="var(--ll-accent)"
            strokeWidth={2.5}
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        </svg>

        {/* O valor de cada linha-guia, na ponta esquerda, em cima dela. */}
        {guias
          .filter((g) => g.valor > 0)
          .map((g) => (
            <span
              key={g.y}
              aria-hidden
              className="pointer-events-none absolute left-0 -translate-y-full pb-0.5 text-[10px] text-muted-foreground tabular-nums"
              style={{ top: `${(g.y / H) * 100}%` }}
            >
              {brlCompacto(g.valor)}
            </span>
          ))}

        {/* Só o mês atual ganha ponto e valor, como no app antigo. */}
        <div
          aria-hidden
          className="pointer-events-none absolute"
          style={{ left: `${(fim.x / W) * 100}%`, top: `${(fim.y / H) * 100}%` }}
        >
          <span className="absolute size-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-card bg-(--ll-accent)" />
          <span className="absolute bottom-3 -translate-x-1/2 whitespace-nowrap rounded bg-card/85 px-1 text-[11px] font-bold text-(--ll-accent) tabular-nums">
            {brl(serie[n - 1].valor)}
          </span>
        </div>

        {/* Uma faixa por mês, invisível, para o valor exato aparecer ao apontar. */}
        <div className="absolute inset-0 flex">
          {serie.map((mes, i) => (
            <span key={i} className="flex-1" title={`${mes.rotulo}: ${brl(mes.valor)}`} />
          ))}
        </div>
      </div>

      <div className="mt-2 flex text-[11px] uppercase tracking-wide text-muted-foreground">
        {serie.map((mes, i) => (
          <span key={i} className={cn("flex-1 text-center", i === n - 1 && "font-bold text-(--ll-accent)")}>
            {mes.rotulo}
          </span>
        ))}
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
