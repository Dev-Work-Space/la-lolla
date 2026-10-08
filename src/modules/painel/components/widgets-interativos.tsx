"use client";

import { useState } from "react";
import Link from "next/link";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  CakeIcon,
  WarningIcon,
  WhatsappLogoIcon,
} from "@phosphor-icons/react/ssr";
import { Card } from "@/components/ui/card";
import { telefoneWhats, primeiroNome } from "@/components/padrao/enviar-pdf";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";
import type { DadosPainel } from "./widgets-render";

/*
 * Os blocos do Início que se mexem: trocar o período, a régua, tocar num dia.
 *
 * Pedido do João (07/10/2026): "deixe essa tela melhor, mais opções, faça
 * interativo" — tudo abaixo do gráfico principal, que fica como está.
 *
 * Toda troca aqui é só de VISTA: os números de todos os recortes já vêm
 * prontos do servidor (somar em memória é barato, ir ao banco não), então
 * trocar de aba é instantâneo e não recarrega nada.
 */

const rotuloMini = "text-[11px] font-medium uppercase tracking-wide text-muted-foreground";

/** As abinhas de troca local: só mudam a vista, sem mexer na URL. */
function Abinhas<T extends string>({
  opcoes,
  atual,
  mudar,
  rotulo,
}: {
  opcoes: ReadonlyArray<readonly [T, React.ReactNode]>;
  atual: T;
  mudar: (v: T) => void;
  rotulo: string;
}) {
  return (
    <div role="radiogroup" aria-label={rotulo} className="inline-flex max-w-full overflow-x-auto rounded-xl border bg-(--ll-surface-2) p-0.5">
      {opcoes.map(([valor, conteudo]) => (
        <button
          key={valor}
          type="button"
          role="radio"
          aria-checked={atual === valor}
          onClick={() => mudar(valor)}
          className={cn(
            "shrink-0 rounded-lg px-2.5 py-1 text-xs font-medium transition-all duration-200 ease-(--ll-ease)",
            atual === valor
              ? "bg-card text-foreground shadow-[0_1px_3px_rgba(26,24,20,.10)]"
              : "text-muted-foreground hover:text-foreground",
          )}
        >
          {conteudo}
        </button>
      ))}
    </div>
  );
}

/** "+12%" com seta: a cor ajuda, mas a seta é que diz para que lado foi. */
function Variacao({ agora, antes }: { agora: number; antes: number }) {
  if (antes <= 0) return null;
  const pct = Math.round(((agora - antes) / antes) * 100);
  const subiu = pct >= 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums",
        subiu ? "bg-(--ll-ok-soft) text-ok" : "bg-destructive/10 text-destructive",
      )}
    >
      {subiu ? <ArrowUpIcon weight="bold" className="size-3" aria-hidden /> : <ArrowDownIcon weight="bold" className="size-3" aria-hidden />}
      {subiu ? "+" : ""}
      {pct}%
    </span>
  );
}

/* ─────────────────────────── números ─────────────────────────── */

export function Numeros({ periodos, ctx, caixaFuturo, veFinanceiro }: DadosPainel) {
  const [qual, setQual] = useState<(typeof periodos)[number]["id"]>("hoje");
  const p = periodos.find((x) => x.id === qual) ?? periodos[0];
  const margemPct = p.margem !== null && p.faturado > 0 ? Math.round((p.margem / p.faturado) * 100) : null;

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
      <Card as="section" className="block p-4 text-base lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className={rotuloMini}>Vendas</p>
          {/* Cada aba já mostra o seu total: dá para comparar os quatro de
              relance, e tocar abre o detalhe. */}
          <Abinhas
            rotulo="Período das vendas"
            atual={qual}
            mudar={setQual}
            opcoes={periodos.map((x) => [
              x.id,
              <span key={x.id} className="flex flex-col items-center leading-tight sm:flex-row sm:gap-1.5">
                <span>{x.rotulo}</span>
                <span className="text-[10px] tabular-nums opacity-70 sm:text-xs">{x.curto}</span>
              </span>,
            ])}
          />
        </div>

        <div className="mt-3 flex flex-wrap items-baseline gap-x-2.5 gap-y-1">
          <p className="text-3xl font-extrabold tracking-tight tabular-nums">{brl(p.faturado)}</p>
          <Variacao agora={p.faturado} antes={p.anterior} />
        </div>
        <p className="mt-0.5 text-xs text-muted-foreground">
          {p.anterior > 0 ? `contra ${brl(p.anterior)} ${p.contra}` : `nada vendido ${p.contra}`}
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Mini titulo="Vendas" valor={String(p.vendas)} />
          <Mini titulo="Peças" valor={String(p.pecas)} />
          <Mini titulo="Ticket médio" valor={p.vendas ? brl(p.ticket) : "—"} />
          {p.margem !== null ? (
            <Mini titulo="Margem" valor={brl(p.margem)} sub={margemPct !== null ? `${margemPct}% do vendido` : undefined} />
          ) : (
            <Mini titulo="Por venda" valor={p.vendas ? (p.pecas / p.vendas).toLocaleString("pt-BR", { maximumFractionDigits: 1 }) : "—"} sub="peças" />
          )}
        </dl>
      </Card>

      {veFinanceiro && (
        <Card as="section" className="block p-4 text-base">
          <Link href="/financeiro" className="group block">
            <p className={rotuloMini}>Em caixa</p>
            <p
              className={cn(
                "mt-1 text-3xl font-extrabold tracking-tight tabular-nums group-hover:underline",
                ctx.emCaixa < 0 ? "text-destructive" : "text-amber-700 dark:text-amber-500",
              )}
            >
              {brl(ctx.emCaixa)}
            </p>
            <p className="text-xs text-muted-foreground">todas as carteiras, agora</p>
          </Link>

          {caixaFuturo && (
            <div className="mt-4 border-t pt-3">
              <p className={rotuloMini}>Próximas 4 semanas</p>
              <dl className="mt-1.5 space-y-1 text-sm tabular-nums">
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Vai entrar</dt>
                  <dd className="font-semibold text-(--ll-ok)">+ {brl(caixaFuturo.entra)}</dd>
                </div>
                <div className="flex justify-between gap-3">
                  <dt className="text-muted-foreground">Vai sair</dt>
                  <dd className="font-semibold text-destructive">− {brl(caixaFuturo.sai)}</dd>
                </div>
                <div className="flex justify-between gap-3 border-t pt-1">
                  <dt className="font-medium">Fica em caixa</dt>
                  <dd className={cn("font-bold", caixaFuturo.fica < 0 && "text-destructive")}>{brl(caixaFuturo.fica)}</dd>
                </div>
              </dl>
              {caixaFuturo.piorSemana && (
                <p className="mt-2 flex items-start gap-1.5 text-xs text-destructive">
                  <WarningIcon weight="fill" className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                  {/* A conta sai antes de o dinheiro entrar: o fim das 4 semanas
                      pode fechar positivo e o caixa ainda assim furar no meio. */}
                  {caixaFuturo.fica >= 0
                    ? `Na semana de ${caixaFuturo.piorSemana} o caixa fica negativo antes de o dinheiro entrar.`
                    : `Na semana de ${caixaFuturo.piorSemana} o caixa já fica negativo.`}
                </p>
              )}
              <Link href="/financeiro?aba=fluxo&ver=previsto" className="mt-2 inline-block text-xs font-medium text-(--ll-accent) hover:underline">
                Ver a previsão →
              </Link>
            </div>
          )}
        </Card>
      )}
    </div>
  );
}

function Mini({ titulo, valor, sub }: { titulo: string; valor: string; sub?: string }) {
  return (
    <div className="min-w-0 rounded-lg bg-(--ll-surface-2) px-3 py-2">
      <dt className="truncate text-[10px] font-medium uppercase tracking-wide text-muted-foreground">{titulo}</dt>
      <dd className="truncate text-base font-bold tabular-nums">{valor}</dd>
      {sub && <dd className="truncate text-[11px] text-muted-foreground">{sub}</dd>}
    </div>
  );
}

/* ─────────────────────────── meta ─────────────────────────── */

export function Meta({ ctx }: DadosPainel) {
  if (!(ctx.meta > 0)) return null; // some quando não há meta — regra do app antigo

  const pct = Math.min(100, Math.round((ctx.fatMes / ctx.meta) * 100));
  /* Onde o mês devia estar hoje para fechar na meta, andando por igual. */
  const ideal = Math.round((ctx.diaDoMes / ctx.diasNoMes) * 100);
  const restam = ctx.diasNoMes - ctx.diaDoMes + 1;
  const falta = Math.max(0, ctx.meta - ctx.fatMes);
  const projecao = ctx.diaDoMes > 0 ? (ctx.fatMes / ctx.diaDoMes) * ctx.diasNoMes : 0;
  const batida = ctx.fatMes >= ctx.meta;
  const noRitmo = pct >= ideal;

  return (
    <Card as="section" className="block p-4 text-base">
      <div className="flex items-center justify-between gap-2">
        <p className={rotuloMini}>
          Meta de <span className="first-letter:uppercase">{ctx.nomeMes}</span>
        </p>
        {!batida && (
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[11px] font-semibold",
              noRitmo ? "bg-(--ll-ok-soft) text-ok" : "bg-(--ll-accent-soft) text-(--ll-accent)",
            )}
          >
            {noRitmo ? "no ritmo" : "abaixo do ritmo"}
          </span>
        )}
      </div>

      <p className="mt-1 text-sm tabular-nums">
        <span className="text-xl font-bold">{brl(ctx.fatMes)}</span>{" "}
        <span className="text-muted-foreground">de {brl(ctx.meta)}</span>
      </p>

      {/* A marquinha é o "hoje": quanto do mês já passou. A barra à frente
          dela é folga; atrás, atraso. */}
      <div className="relative mt-2.5">
        <div className="h-2.5 overflow-hidden rounded-full bg-muted">
          <div
            className={cn("h-full rounded-full transition-all", batida ? "bg-(--ll-ok)" : "bg-foreground")}
            style={{ width: `${pct}%` }}
          />
        </div>
        {!batida && (
          <span
            aria-hidden
            className="absolute -top-1 h-4.5 w-0.5 -translate-x-1/2 rounded-full bg-(--ll-accent)"
            style={{ left: `${ideal}%` }}
            title={`Hoje: ${ideal}% do mês já passou`}
          />
        )}
      </div>
      <p className="mt-1 flex justify-between text-[10px] text-muted-foreground tabular-nums">
        <span>{pct}% feito</span>
        {!batida && <span className="text-(--ll-accent)">▲ hoje, {ideal}% do mês</span>}
      </p>

      <ul className="mt-3 space-y-1 text-xs leading-relaxed text-muted-foreground">
        {batida ? (
          <li className="font-medium text-ok">Meta batida. O que vier agora é acima do combinado.</li>
        ) : (
          <>
            <li>
              Faltam <strong className="text-foreground tabular-nums">{brl(falta)}</strong>: dá{" "}
              <strong className="text-foreground tabular-nums">{brl(falta / restam)}</strong> por dia nos {restam}{" "}
              {restam === 1 ? "dia que resta" : "dias que restam"}.
            </li>
            {ctx.fatMes > 0 && (
              <li>
                Neste ritmo, o mês fecha em <strong className="text-foreground tabular-nums">{brl(projecao)}</strong> (
                {Math.round((projecao / ctx.meta) * 100)}% da meta).
              </li>
            )}
          </>
        )}
      </ul>
    </Card>
  );
}

/* ─────────────────────────── ritmo ─────────────────────────── */

export function Ritmo({ ritmo30 }: DadosPainel) {
  const [dias, setDias] = useState<"14" | "30">("14");
  const [regua, setRegua] = useState<"valor" | "vendas">("valor");
  const lista = dias === "14" ? ritmo30.slice(-14) : ritmo30;
  /* Sem escolha, o detalhe mostra hoje — a pergunta mais comum no balcão. */
  const [escolhido, setEscolhido] = useState<string | null>(null);
  const dia = lista.find((d) => d.chave === escolhido) ?? lista[lista.length - 1];

  const medida = (d: (typeof lista)[number]) => (regua === "valor" ? d.valor : d.vendas);
  const maior = Math.max(...lista.map(medida), 1);
  const total = lista.reduce((s, d) => s + d.valor, 0);
  const vendas = lista.reduce((s, d) => s + d.vendas, 0);
  const comVenda = lista.filter((d) => d.vendas > 0).length;
  const melhor = lista.reduce((a, d) => (d.valor > a.valor ? d : a), lista[0]);

  return (
    <Card as="section" className="block p-4 text-base">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={rotuloMini}>Ritmo das vendas</p>
        <div className="flex flex-wrap gap-1.5">
          <Abinhas rotulo="Quantos dias" atual={dias} mudar={setDias} opcoes={[["14", "14 dias"], ["30", "30 dias"]]} />
          <Abinhas rotulo="Medir por" atual={regua} mudar={setRegua} opcoes={[["valor", "R$"], ["vendas", "Vendas"]]} />
        </div>
      </div>

      <dl className="mt-3 grid grid-cols-3 gap-2 text-sm">
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Total</dt>
          <dd className="truncate font-bold tabular-nums">{brl(total)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Média/dia</dt>
          <dd className="truncate font-bold tabular-nums">{brl(total / lista.length)}</dd>
        </div>
        <div className="min-w-0">
          <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">Dias com venda</dt>
          <dd className="truncate font-bold tabular-nums">
            {comVenda} <span className="font-normal text-muted-foreground">de {lista.length}</span>
          </dd>
        </div>
      </dl>

      {/*
        Cada dia é um BOTÃO da altura toda, com a barra dentro: o alvo do
        toque fica grande mesmo quando a barra é um risco. A barra mede em
        porcentagem do botão, que tem altura — sem isso o gráfico some.
      */}
      <div className={cn("mt-4 flex h-28 items-end", dias === "14" ? "gap-1" : "gap-0.5")}>
        {lista.map((d, i) => {
          const ativo = d.chave === dia.chave;
          const hoje = i === lista.length - 1;
          return (
            <button
              key={d.chave}
              type="button"
              onClick={() => setEscolhido(d.chave)}
              aria-pressed={ativo}
              aria-label={`${d.data}: ${brl(d.valor)}, ${d.vendas} ${d.vendas === 1 ? "venda" : "vendas"}`}
              title={`${d.data}: ${brl(d.valor)} · ${d.vendas} ${d.vendas === 1 ? "venda" : "vendas"}`}
              className="group flex h-full min-w-0 flex-1 items-end rounded-sm focus-visible:outline-2 focus-visible:outline-(--ll-accent)"
            >
              <span
                className={cn(
                  "block w-full rounded-t-[4px] transition-colors",
                  medida(d) <= 0
                    ? "bg-muted"
                    : ativo
                      ? "bg-(--ll-accent)"
                      : "bg-foreground/65 group-hover:bg-foreground/85",
                  hoje && !ativo && medida(d) <= 0 && "bg-foreground/20",
                )}
                style={{ height: `${Math.max(3, (medida(d) / maior) * 100)}%` }}
              />
            </button>
          );
        })}
      </div>
      <div className={cn("mt-1 flex", dias === "14" ? "gap-1" : "gap-0.5")}>
        {lista.map((d, i) => (
          <span
            key={d.chave}
            className={cn(
              "min-w-0 flex-1 truncate text-center text-[9px] tabular-nums text-muted-foreground",
              d.chave === dia.chave && "font-bold text-(--ll-accent)",
            )}
          >
            {/* Em 30 dias, um rótulo sim e outro não; o escolhido sempre. */}
            {dias === "30" && i % 3 !== 2 && d.chave !== dia.chave ? "" : d.dia}
          </span>
        ))}
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-lg bg-(--ll-surface-2) px-3 py-2">
        <p className="min-w-0 truncate text-sm">
          <span className="font-medium first-letter:uppercase">{dia.data}</span>
          {dia.chave === lista[lista.length - 1].chave && <span className="text-muted-foreground"> (hoje)</span>}
        </p>
        <p className="shrink-0 text-sm tabular-nums">
          <strong>{brl(dia.valor)}</strong>{" "}
          <span className="text-muted-foreground">
            · {dia.vendas} {dia.vendas === 1 ? "venda" : "vendas"}
          </span>
        </p>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground">
        {vendas > 0 ? (
          <>
            Melhor dia: <span className="first-letter:uppercase">{melhor.data}</span>, com {brl(melhor.valor)}.
          </>
        ) : (
          "Nenhuma venda nestes dias."
        )}{" "}
        Toque numa barra para ver o dia.
      </p>
    </Card>
  );
}

/* ─────────────────────────── mais vendidas ─────────────────────────── */

export function MaisVendidas({ ranking }: DadosPainel) {
  const [periodo, setPeriodo] = useState<"mes" | "ano">(ranking.mes.qtd.length ? "mes" : "ano");
  const [regua, setRegua] = useState<"qtd" | "valor">("qtd");
  const [todas, setTodas] = useState(false);
  if (ranking.ano.qtd.length === 0) return null; // sem venda no ano, o bloco some

  const lista = ranking[periodo][regua];
  const vistas = todas ? lista : lista.slice(0, 5);
  const maior = Math.max(...lista.map((p) => (regua === "qtd" ? p.qtd : p.valor)), 1);

  return (
    <Card as="section" className="block p-4 text-base">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className={rotuloMini}>Mais vendidas</p>
        <div className="flex flex-wrap gap-1.5">
          <Abinhas rotulo="Período" atual={periodo} mudar={setPeriodo} opcoes={[["mes", "Mês"], ["ano", "Ano"]]} />
          <Abinhas rotulo="Ordenar por" atual={regua} mudar={setRegua} opcoes={[["qtd", "Unidades"], ["valor", "R$"]]} />
        </div>
      </div>

      {lista.length === 0 ? (
        <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma peça vendida neste mês ainda.</p>
      ) : (
        <ol className="mt-3 space-y-1">
          {vistas.map((p, i) => {
            const v = regua === "qtd" ? p.qtd : p.valor;
            return (
              <li key={p.id}>
                <Link href={`/estoque/${p.id}`} className="flex items-center gap-3 rounded-lg px-2 py-1.5 hover:bg-accent/40">
                  <span
                    className={cn(
                      "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold tabular-nums",
                      i === 0 ? "bg-(--ll-accent) text-(--ll-accent-ink)" : "bg-muted text-muted-foreground",
                    )}
                  >
                    {i + 1}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-2">
                      <span className="truncate text-sm font-medium">{p.nome}</span>
                      <span className="shrink-0 text-sm font-semibold tabular-nums">
                        {regua === "qtd" ? `${p.qtd} un.` : brl(p.valor)}
                      </span>
                    </span>
                    <span className="mt-1 flex items-center gap-2">
                      <span className="h-1 flex-1 overflow-hidden rounded-full bg-muted">
                        <span className="block h-full rounded-full bg-foreground/60" style={{ width: `${(v / maior) * 100}%` }} />
                      </span>
                      <span className="shrink-0 text-[11px] tabular-nums text-muted-foreground">
                        {p.sku} · {regua === "qtd" ? brl(p.valor) : `${p.qtd} un.`}
                      </span>
                    </span>
                  </span>
                </Link>
              </li>
            );
          })}
        </ol>
      )}
      {lista.length > 5 && (
        <button type="button" onClick={() => setTodas((t) => !t)} className="mt-2 text-xs font-medium text-(--ll-accent) hover:underline">
          {todas ? "Ver só as 5 primeiras" : `Ver as ${lista.length} primeiras`}
        </button>
      )}
    </Card>
  );
}

/* ─────────────────────────── últimas vendas ─────────────────────────── */

export function UltimasVendas({ ultimas }: DadosPainel) {
  if (ultimas.length === 0) return null;

  return (
    <Card as="section" className="block p-4 text-base">
      <div className="flex items-center justify-between gap-2">
        <p className={rotuloMini}>Últimas vendas</p>
        <Link href="/vendas" className="text-xs font-medium text-(--ll-accent) hover:underline">
          Ver todas →
        </Link>
      </div>
      <ul className="mt-2 divide-y">
        {ultimas.map((v) => (
          <li key={v.id}>
            <Link href={`/vendas/${v.id}`} className="-mx-2 flex items-center gap-3 rounded-lg px-2 py-2 hover:bg-accent/40">
              <span className="w-12 shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">#{v.numero}</span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{v.cliente ?? "Sem cliente"}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {v.quando} · {v.pecas} {v.pecas === 1 ? "peça" : "peças"}
                </span>
              </span>
              <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(v.valor)}</span>
            </Link>
          </li>
        ))}
      </ul>
    </Card>
  );
}

/* ─────────────────────────── clientes ─────────────────────────── */

/** Atalho para a conversa no WhatsApp, já com a mensagem escrita. */
function Zap({ telefone, texto, nome }: { telefone: string | null; texto: string; nome: string }) {
  const numero = telefoneWhats(telefone);
  if (!numero) return <span className="shrink-0 text-[11px] text-muted-foreground">sem telefone</span>;
  return (
    <a
      href={`https://wa.me/${numero}?text=${encodeURIComponent(texto)}`}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={`Mandar mensagem para ${nome} no WhatsApp`}
      className="inline-flex shrink-0 items-center gap-1 rounded-full border border-(--ll-ok)/30 px-2.5 py-1 text-xs font-semibold text-(--ll-ok) hover:bg-(--ll-ok-soft)"
    >
      <WhatsappLogoIcon weight="fill" className="size-3.5" aria-hidden />
      Chamar
    </a>
  );
}

export function Clientes({ clientes }: DadosPainel) {
  const { aniversarios, paradas, totalParadas, limite } = clientes;
  if (aniversarios.length === 0 && totalParadas === 0) return null;

  return (
    <Card as="section" className="block p-4 text-base">
      <p className={rotuloMini}>Clientes para chamar</p>
      <div className="mt-3 grid gap-4 sm:grid-cols-2">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <CakeIcon weight="duotone" className="size-4 text-(--ll-accent)" aria-hidden />
            Aniversários da semana
          </p>
          {aniversarios.length === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Nenhum nos próximos 7 dias.</p>
          ) : (
            <ul className="mt-1.5 divide-y">
              {aniversarios.map((c) => (
                <li key={c.id} className="flex items-center gap-3 py-2">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{c.nome}</span>
                    <span className={cn("block text-xs", c.emDias === 0 ? "font-semibold text-(--ll-accent)" : "text-muted-foreground")}>
                      {c.emDias === 0 ? "é hoje!" : c.emDias === 1 ? `amanhã · ${c.dia}` : `em ${c.emDias} dias · ${c.dia}`}
                    </span>
                  </span>
                  <Zap
                    nome={c.nome}
                    telefone={c.telefone}
                    texto={`Oi, ${primeiroNome(c.nome)}! ${c.emDias === 0 ? "Feliz aniversário" : "Seu aniversário está chegando"}! Um beijo de toda a LaLolla.`}
                  />
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Sumidas há mais de {limite} dias{" "}
            <span className="font-normal text-muted-foreground">· {totalParadas}</span>
          </p>
          {totalParadas === 0 ? (
            <p className="mt-2 text-sm text-muted-foreground">Todas compraram há pouco tempo.</p>
          ) : (
            <>
              <ul className="mt-1.5 divide-y">
                {paradas.map((c) => (
                  <li key={c.id} className="flex items-center gap-3 py-2">
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{c.nome}</span>
                      <span className="block text-xs text-muted-foreground">última compra há {c.dias} dias</span>
                    </span>
                    <Zap
                      nome={c.nome}
                      telefone={c.telefone}
                      texto={`Oi, ${primeiroNome(c.nome)}! Chegaram novidades na LaLolla e lembrei de você. Quer que eu mande umas fotos?`}
                    />
                  </li>
                ))}
              </ul>
              <Link href="/cadastros?filtro=parado" className="mt-1 inline-block text-xs font-medium text-(--ll-accent) hover:underline">
                {totalParadas > paradas.length ? `Ver as ${totalParadas} →` : "Ver na lista de clientes →"}
              </Link>
            </>
          )}
        </div>
      </div>
    </Card>
  );
}
