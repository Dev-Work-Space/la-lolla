import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { CheckIcon } from "@phosphor-icons/react/ssr";
import Link from "next/link";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import type { DadosInicio } from "../painel.service";
import type { IdWidget } from "../widgets";
import { Clientes, MaisVendidas, Meta, Numeros, Ritmo, UltimasVendas } from "./widgets-interativos";

/*
 * Os widgets do Início. Os 7 primeiros vieram do app antigo; em 07/10/2026
 * o João pediu tudo abaixo do gráfico principal "melhor, com mais opções e
 * interativo", e os que se mexem moram em `widgets-interativos.tsx`.
 *
 * Regra herdada de lá: um widget que não tem nada a mostrar devolve `null` e
 * SOME da tela, sem deixar buraco. É por isso que "Meta do mês" desaparece
 * quando não há meta definida.
 */

export type DadosPainel = DadosInicio & { veFinanceiro: boolean };

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

/* ─────────────────────────── resumo ─────────────────────────── */

/* O antigo "Ver o resumo completo" virou uma fileira de atalhos: o resumo
   continua aqui, ao lado dos outros lugares que se abrem todo dia. Quem não
   vê o Financeiro fica só com os que pode abrir. */
function Resumo({ veFinanceiro }: DadosPainel) {
  const atalhos = [
    ...(veFinanceiro
      ? [
          { href: "/financeiro", nome: "Resumo do mês", sub: "faturamento, margem e resultado" },
          { href: "/financeiro?aba=fluxo&ver=entrar", nome: "Vai entrar", sub: "tudo que a loja vai receber" },
          { href: "/financeiro?aba=contas&tipo=pagar", nome: "Contas a pagar", sub: "o que vence e quando" },
        ]
      : []),
    { href: "/vendas?aba=orcamentos", nome: "Orçamentos", sub: "os abertos e os que vencem" },
    { href: "/cadastros", nome: "Clientes", sub: "quem compra, quem deve, quem sumiu" },
  ];
  return (
    <div className="grid grid-cols-2 gap-2 lg:grid-cols-5">
      {atalhos.map((a) => (
        <Link
          key={a.href}
          href={a.href}
          className="group flex items-center justify-between gap-2 rounded-xl border border-dashed px-4 py-3 transition-colors hover:border-solid hover:bg-accent/30"
        >
          <span className="min-w-0">
            <span className="block truncate text-sm font-medium">{a.nome}</span>
            <span className="block truncate text-xs text-muted-foreground">{a.sub}</span>
          </span>
          <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5">
            →
          </span>
        </Link>
      ))}
    </div>
  );
}

/* ─────────────────────────── despachante ─────────────────────────── */

/* "ritmo14" continua sendo o id do ritmo — mudar o nome apagaria a escolha
   de quem já arrumou o painel. */
const MAPA: Record<IdWidget, (d: DadosPainel) => React.ReactNode> = {
  saudacao: Saudacao,
  pendencias: Pendencias,
  numeros: Numeros,
  meta: Meta,
  ritmo14: Ritmo,
  maisvendidas: MaisVendidas,
  ultimasvendas: UltimasVendas,
  clientes: Clientes,
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
  if (id === "maisvendidas") return d.ranking.ano.qtd.length > 0;
  if (id === "ultimasvendas") return d.ultimas.length > 0;
  if (id === "clientes") return d.clientes.aniversarios.length > 0 || d.clientes.totalParadas > 0;
  return true;
}

export function RenderWidget({ id, dados }: { id: IdWidget; dados: DadosPainel }) {
  const Componente = MAPA[id];
  if (!Componente) return null;
  /* Como elemento, e não chamando a função: os blocos interativos têm
     estado próprio, e hook só vale dentro de componente de verdade. */
  return <Componente {...dados} />;
}
