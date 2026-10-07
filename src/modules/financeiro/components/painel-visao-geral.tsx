import Link from "next/link";
import { ArrowRightIcon, WarningIcon } from "@phosphor-icons/react/ssr";
import { brl, brlCompacto, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import {
  indicadoresFinanceiro,
  listarContas,
  nomeTipoCarteira,
  resumoMensal,
  saidasPorCategoria,
  type ContaLinha,
} from "../financeiro.service";
import { entradasPrevistas, previsao } from "../agenda.service";
import { cartoesComLimite } from "../cartao.service";
import { FormConta } from "./form-conta";
import { FormLancamento } from "./form-lancamento";
import { FormTransferencia } from "./form-transferencia";
import { ResumoCartoes } from "./resumo-cartoes";

/*
 * VISÃO GERAL — a primeira coisa ao abrir o Financeiro.
 *
 * O João achou o Financeiro "bem desorganizado" (07/10/2026), e tinha razão:
 * eram seis abas, e a pergunta de todo dia — o que está atrasado, o que vence
 * agora, quanto vai sobrar — não tinha resposta em lugar nenhum. Era preciso
 * pular entre A pagar, A receber, Agenda e Previsão e somar de cabeça.
 *
 * Aqui as respostas ficam juntas, da mais urgente para a mais calma:
 *   1. o que fazer agora (lançar, transferir, lançar conta);
 *   2. o que está atrasado;
 *   3. o que entra e o que sai nos próximos 30 dias;
 *   4. para onde o caixa vai (12 semanas) e de onde veio (6 meses);
 *   5. onde o dinheiro está e para onde ele foi no mês.
 *
 * Nenhuma conta nova: tudo sai dos mesmos serviços das outras abas, então os
 * números batem com elas por construção.
 */

type Compromisso = {
  id: string;
  titulo: string;
  sub: string | null;
  valor: number;
  vencimento: Date;
  dias: number;
  href: string;
};

const DIAS_JANELA = 30;
const NA_LISTA = 6;

/*
 * Contas em aberto → compromissos dos próximos 30 dias. As compras de um
 * mesmo cartão que vencem no mesmo dia viram UMA linha, a fatura: ninguém paga
 * uma compra do cartão, paga a fatura (mesma regra da lista de contas).
 */
function proximos(contas: ContaLinha[], tipo: "pagar" | "receber"): Compromisso[] {
  const listaDaAba = `/financeiro?aba=contas&tipo=${tipo}`;
  const faturas = new Map<string, Compromisso>();
  const saida: Compromisso[] = [];
  for (const c of contas) {
    if (c.vencida || c.diasAteVencer > DIAS_JANELA) continue;
    if (c.cartaoId) {
      const chave = `${c.cartaoId}|${c.vencimento.toISOString()}`;
      const ja = faturas.get(chave);
      if (ja) {
        ja.valor = Math.round((ja.valor + c.valor) * 100) / 100;
        continue;
      }
      faturas.set(chave, {
        id: chave,
        titulo: `Fatura · ${c.cartaoNome ?? "Cartão"}`,
        sub: "cartão de crédito",
        valor: c.valor,
        vencimento: c.vencimento,
        dias: c.diasAteVencer,
        href: listaDaAba,
      });
      continue;
    }
    saida.push({
      id: c.id,
      titulo: c.descricao,
      sub: c.fornecedor ?? (c.parcela ? `parcela ${c.parcela}` : null),
      valor: c.valor,
      vencimento: c.vencimento,
      dias: c.diasAteVencer,
      href: c.vendaId ? `/vendas/${c.vendaId}` : listaDaAba,
    });
  }
  return [...saida, ...faturas.values()].sort((a, b) => a.vencimento.getTime() - b.vencimento.getTime());
}

/** "Hoje", "Amanhã", "em 4 dias" — o quando importa mais que a data. */
function quando(dias: number, vencimento: Date) {
  if (dias <= 0) return "Hoje";
  if (dias === 1) return "Amanhã";
  if (dias <= 6) return vencimento.toLocaleDateString("pt-BR", { weekday: "long" }).split("-")[0];
  return fData(vencimento).slice(0, 5);
}

export async function PainelVisaoGeral({
  pode,
}: {
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const agora = new Date();
  const mes0 = new Date(agora.getFullYear(), agora.getMonth(), 1);
  const em30 = new Date(agora.getFullYear(), agora.getMonth(), agora.getDate() + DIAS_JANELA, 23, 59, 59);
  const [ind, receber, aEntrar, pagar, prev, meses, cartoes, categorias] = await Promise.all([
    indicadoresFinanceiro(),
    listarContas("RECEBER", "abertas"),
    /* O "vai entrar" é o mesmo da tela A entrar: parcelas, recebimentos e as
       entradas lançadas com data marcada — esta última ficava de fora. */
    entradasPrevistas(new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()), em30),
    listarContas("PAGAR", "abertas"),
    previsao(12),
    resumoMensal(6),
    cartoesComLimite(),
    saidasPorCategoria(mes0, agora),
  ]);

  const vencidasPagar = pagar.filter((c) => c.vencida);
  const vencidasReceber = receber.filter((c) => c.vencida);
  const soma = (l: Array<{ valor: number }>) => Math.round(l.reduce((s, c) => s + c.valor, 0) * 100) / 100;

  const vaiEntrar: Compromisso[] = aEntrar
    .filter((e) => !e.atrasado)
    .map((e) => ({
      id: e.origem + e.id,
      titulo: e.titulo,
      sub: e.quem,
      valor: e.valor,
      vencimento: e.quando,
      dias: Math.round(
        (new Date(e.quando.getFullYear(), e.quando.getMonth(), e.quando.getDate()).getTime() -
          new Date(agora.getFullYear(), agora.getMonth(), agora.getDate()).getTime()) /
          86_400_000,
      ),
      href: e.href ?? "/financeiro?aba=fluxo&ver=entrar",
    }));
  const vaiSair = proximos(pagar, "pagar");

  return (
    <div className="space-y-5">
      {pode.criar && (
        <div className="flex flex-wrap gap-2">
          <FormLancamento tipo="entrada" carteiras={ind.carteiras} />
          <FormLancamento tipo="saida" carteiras={ind.carteiras} />
          {ind.carteiras.length > 1 && <FormTransferencia carteiras={ind.carteiras} />}
          <FormConta tipo="PAGAR" rotulo="Conta a pagar" variante="outline" />
          <FormConta tipo="RECEBER" rotulo="Conta a receber" variante="outline" />
        </div>
      )}

      {(vencidasPagar.length > 0 || vencidasReceber.length > 0 || prev.pior) && (
        <div className="grid gap-2 md:grid-cols-2">
          {vencidasPagar.length > 0 && (
            <Alerta
              href="/financeiro?aba=contas&tipo=pagar&filtro=vencidas"
              titulo={`${vencidasPagar.length} ${vencidasPagar.length === 1 ? "conta vencida" : "contas vencidas"} a pagar`}
              texto={`${brl(soma(vencidasPagar))} em atraso — pague ou renegocie.`}
            />
          )}
          {vencidasReceber.length > 0 && (
            <Alerta
              href="/financeiro?aba=contas&tipo=receber&filtro=vencidas"
              titulo={`${vencidasReceber.length} ${vencidasReceber.length === 1 ? "recebimento atrasado" : "recebimentos atrasados"}`}
              texto={`${brl(soma(vencidasReceber))} que já devia ter entrado — hora de cobrar.`}
            />
          )}
          {prev.pior && (
            <Alerta
              href="/financeiro?aba=fluxo&ver=previsto"
              titulo="O caixa vai ficar negativo"
              texto={`Na semana de ${fData(prev.pior.inicio).slice(0, 5)} o saldo previsto é ${brl(prev.pior.saldo)}. Antecipe um recebimento ou adie um pagamento.`}
            />
          )}
        </div>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <Proximos
          titulo="Vai entrar"
          tipo="receber"
          verTudo="/financeiro?aba=fluxo&ver=entrar"
          itens={vaiEntrar}
          total={soma(vaiEntrar)}
          vazio="Nada a receber nos próximos 30 dias."
        />
        <Proximos
          titulo="Vai sair"
          tipo="pagar"
          itens={vaiSair}
          total={soma(vaiSair)}
          vazio="Nenhuma conta a pagar nos próximos 30 dias."
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco
          titulo="Caixa nas próximas 12 semanas"
          link={{ href: "/financeiro?aba=fluxo&ver=previsto", rotulo: "Previsão" }}
        >
          <SaldoPrevisto
            hoje={prev.saldoHoje}
            semanas={prev.linhas.map((l) => ({ inicio: l.inicio, saldo: l.saldo, entra: l.entra, sai: l.sai }))}
          />
        </Bloco>
        <Bloco
          titulo="Quanto sobrou em cada mês"
          link={{ href: "/financeiro?aba=fluxo", rotulo: "Extrato" }}
        >
          <ResultadoMensal meses={meses} />
        </Bloco>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Bloco titulo="Onde está o dinheiro" link={{ href: "/financeiro?aba=carteiras", rotulo: "Carteiras" }}>
          <ul className="divide-y">
            {ind.carteiras.map((c) => (
              <li key={c.id} className="flex items-baseline justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">{c.nome}</span>
                  <span className="block text-xs text-muted-foreground">{nomeTipoCarteira(c.tipo)}</span>
                </span>
                <span className={cn("shrink-0 text-sm font-semibold tabular-nums", c.saldo < 0 && "text-destructive")}>
                  {brl(c.saldo)}
                </span>
              </li>
            ))}
            {ind.naoAtribuido !== 0 && (
              <li className="flex items-baseline justify-between gap-3 py-2">
                <span className="text-sm text-muted-foreground">Sem carteira (revisar)</span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(ind.naoAtribuido)}</span>
              </li>
            )}
            {ind.carteiras.length === 0 && ind.naoAtribuido === 0 && (
              <li className="py-2 text-sm text-muted-foreground">Nenhuma carteira cadastrada.</li>
            )}
          </ul>
        </Bloco>

        <Bloco titulo="Para onde o dinheiro foi este mês" link={{ href: "/financeiro?aba=fluxo", rotulo: "Extrato" }}>
          {categorias.length > 0 ? (
            <ul className="space-y-2.5">
              {categorias.slice(0, 6).map((c) => (
                <li key={c.categoria} title={`${c.categoria}: ${brl(c.valor)} (${c.pct}% das saídas)`}>
                  <div className="flex items-baseline justify-between gap-2 text-sm">
                    <span className="truncate">{c.categoria}</span>
                    <span className="shrink-0 tabular-nums text-muted-foreground">{brl(c.valor)}</span>
                  </div>
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted">
                    <div className="h-full rounded-full bg-(--ll-accent)" style={{ width: `${Math.max(2, c.pct)}%` }} />
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">Nenhuma saída lançada neste mês.</p>
          )}
        </Bloco>
      </div>

      {cartoes.length > 0 && <ResumoCartoes cartoes={cartoes} carteiras={ind.carteiras} pode={pode} />}
    </div>
  );
}

function Alerta({ href, titulo, texto }: { href: string; titulo: string; texto: string }) {
  return (
    <Link
      href={href}
      className="flex items-start gap-3 rounded-xl border border-(--ll-danger)/40 bg-(--ll-danger-soft) px-4 py-3 transition-colors hover:border-(--ll-danger)"
    >
      <WarningIcon weight="fill" className="mt-0.5 size-5 shrink-0 text-(--ll-danger)" aria-hidden />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">{titulo}</span>
        <span className="block text-xs leading-relaxed text-muted-foreground">{texto}</span>
      </span>
      <ArrowRightIcon className="mt-1 size-4 shrink-0 text-muted-foreground" aria-hidden />
    </Link>
  );
}

function Bloco({
  titulo,
  link,
  children,
}: {
  titulo: string;
  link?: { href: string; rotulo: string };
  children: React.ReactNode;
}) {
  return (
    // min-w-0: item de grade não encolhe abaixo do conteúdo sem isto, e um
    // nome comprido empurrava o bloco para fora da tela no celular.
    <section className="min-w-0 rounded-xl border bg-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">{titulo}</h2>
        {link && (
          <Link href={link.href} className="text-xs font-medium text-(--ll-accent) hover:underline">
            {link.rotulo} →
          </Link>
        )}
      </div>
      {children}
    </section>
  );
}

function Proximos({
  titulo,
  tipo,
  itens,
  total,
  vazio,
  verTudo,
}: {
  titulo: string;
  tipo: "pagar" | "receber";
  /** Para onde o "ver todas" leva; sem isto, a lista de contas do tipo. */
  verTudo?: string;
  itens: Compromisso[];
  total: number;
  vazio: string;
}) {
  const entra = tipo === "receber";
  return (
    <section className="min-w-0 rounded-xl border bg-card">
      <div className="flex items-baseline justify-between gap-3 border-b px-4 py-3">
        <div>
          <h2 className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
            {titulo} · próximos {DIAS_JANELA} dias
          </h2>
          <p
            className={cn(
              "mt-0.5 text-xl font-bold tabular-nums",
              entra ? "text-(--ll-ok)" : "text-(--ll-danger)",
            )}
          >
            {entra ? "+ " : "− "}
            {brl(total)}
          </p>
        </div>
        <Link
          href={verTudo ?? `/financeiro?aba=contas&tipo=${tipo}`}
          className="shrink-0 text-xs font-medium text-(--ll-accent) hover:underline"
        >
          {itens.length > NA_LISTA ? `Ver todas (${itens.length}) →` : "Ver lista →"}
        </Link>
      </div>
      {itens.length > 0 ? (
        <ul className="divide-y">
          {itens.slice(0, NA_LISTA).map((c) => (
            <li key={c.id}>
              <Link href={c.href} className="flex items-center gap-3 px-4 py-2.5 hover:bg-accent/40">
                <span
                  className={cn(
                    "w-16 shrink-0 text-xs font-semibold first-letter:uppercase",
                    c.dias <= 0 ? "text-(--ll-accent)" : "text-muted-foreground",
                  )}
                >
                  {quando(c.dias, c.vencimento)}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{c.titulo}</span>
                  {c.sub && <span className="block truncate text-xs text-muted-foreground">{c.sub}</span>}
                </span>
                <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(c.valor)}</span>
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <p className="px-4 py-6 text-sm text-muted-foreground">{vazio}</p>
      )}
    </section>
  );
}

/*
 * O saldo previsto, semana a semana: uma linha só, partindo do caixa de hoje
 * e somando o que já está combinado. Quando ela cruza o zero, a linha do zero
 * aparece tracejada — é o aviso que importa. Apontar uma semana mostra o que
 * entra, o que sai e como fica.
 *
 * Os pontos e textos moram fora do SVG (que estica na largura) para não
 * virarem elipses e letras achatadas.
 */
export function SaldoPrevisto({
  hoje,
  semanas,
  rotuloFim = "em 12 semanas",
  porMes = false,
}: {
  hoje: number;
  semanas: Array<{ inicio: Date; saldo: number; entra: number; sai: number }>;
  rotuloFim?: string;
  porMes?: boolean;
}) {
  const W = 600;
  const H = 160;
  const topo = 10;
  const base = 10;
  const valores = [hoje, ...semanas.map((s) => s.saldo)];
  const max = Math.max(...valores, 0);
  const min = Math.min(...valores, 0);
  const faixa = max - min || 1;
  const n = valores.length;
  const pts = valores.map((v, i) => ({
    x: (i / (n - 1)) * W,
    y: topo + (H - topo - base) * (1 - (v - min) / faixa),
  }));
  const linha = pts.map((p, i) => `${i ? "L" : "M"}${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(" ");
  const yZero = topo + (H - topo - base) * (1 - (0 - min) / faixa);
  const area = `${linha} L${W} ${yZero.toFixed(1)} L0 ${yZero.toFixed(1)} Z`;
  const fim = valores[n - 1];
  const cruza = min < 0;

  return (
    <div>
      <p className="text-sm text-muted-foreground">
        Hoje <strong className="text-foreground tabular-nums">{brl(hoje)}</strong> → {rotuloFim}{" "}
        <strong className={cn("tabular-nums", fim < 0 ? "text-destructive" : "text-foreground")}>{brl(fim)}</strong>
      </p>
      <div className="relative mt-3 h-36">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          preserveAspectRatio="none"
          role="img"
          aria-label={`Saldo previsto: hoje ${brl(hoje)}; ${semanas
            .map((s) => `semana de ${fData(s.inicio).slice(0, 5)}, ${brl(s.saldo)}`)
            .join("; ")}`}
          className="block size-full overflow-visible"
        >
          <defs>
            <linearGradient id="fin-saldo" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--ll-accent)" stopOpacity={0.18} />
              <stop offset="100%" stopColor="var(--ll-accent)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <path d={area} fill="url(#fin-saldo)" stroke="none" />
          <line
            x1={0}
            y1={yZero}
            x2={W}
            y2={yZero}
            stroke={cruza ? "var(--ll-danger)" : "var(--ll-line)"}
            strokeDasharray={cruza ? "5 5" : undefined}
            vectorEffect="non-scaling-stroke"
          />
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
          style={{ left: "100%", top: `${(pts[n - 1].y / H) * 100}%` }}
        />
        {cruza && (
          <span
            aria-hidden
            className="absolute right-0 -translate-y-full pb-0.5 text-[10px] font-semibold text-(--ll-danger)"
            style={{ top: `${(yZero / H) * 100}%` }}
          >
            zero
          </span>
        )}
        {/* Uma faixa por semana, invisível, para o detalhe aparecer ao apontar. */}
        <div className="absolute inset-0 flex">
          {semanas.map((s) => (
            <span
              key={s.inicio.toISOString()}
              className="flex-1"
              title={`${porMes ? s.inicio.toLocaleDateString("pt-BR", { month: "long" }) : `Semana de ${fData(s.inicio).slice(0, 5)}`}: entra ${brl(s.entra)}, sai ${brl(s.sai)} → saldo ${brl(s.saldo)}`}
            />
          ))}
        </div>
      </div>
      <div className="mt-1 flex justify-between text-[10px] uppercase tracking-wide text-muted-foreground">
        <span>hoje</span>
        <span>{semanas.length ? fData(semanas[semanas.length - 1].inicio).slice(0, 5) : ""}</span>
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Só o que já está combinado: contas a pagar e parcelas a receber. Venda futura não entra.
      </p>
    </div>
  );
}

/*
 * O resultado de cada mês (entrou − saiu), em barras que sobem quando sobrou
 * e DESCEM quando faltou. A direção dá o recado sozinha: verde e vermelho
 * ficam quase iguais para quem tem daltonismo, então a cor só reforça.
 * Apontar o mês mostra quanto entrou e quanto saiu.
 */
export function ResultadoMensal({
  meses,
}: {
  meses: Array<{ mes: string; rotulo: string; entradas: number; saidas: number; saldo: number }>;
}) {
  if (!meses.some((m) => m.entradas > 0 || m.saidas > 0)) {
    return <p className="text-sm text-muted-foreground">Sem movimentação nos últimos meses.</p>;
  }
  const maior = Math.max(1, ...meses.map((m) => Math.abs(m.saldo)));
  const temNegativo = meses.some((m) => m.saldo < 0);
  const temPositivo = meses.some((m) => m.saldo > 0);
  /* O zero fica no meio só quando há os dois lados; senão a barra usa a altura
     toda. A barra nunca vai até a borda: sobra lugar para o valor escrito na
     ponta dela, que antes encavalava no nome do mês. */
  const alturaCima = temNegativo && temPositivo ? 50 : temPositivo ? 100 : 0;
  const alcance = temNegativo && temPositivo ? 38 : 82;
  const curto = (v: number) => (v < 1000 ? String(Math.round(v)) : brlCompacto(v).replace("R$", "").trim());

  return (
    <div>
      <div className="relative flex h-40 gap-2">
        <span
          aria-hidden
          className="absolute inset-x-0 border-t border-(--ll-line)"
          style={{ top: `${alturaCima}%` }}
        />
        {meses.map((m) => {
          const h = (Math.abs(m.saldo) / maior) * alcance;
          const sobe = m.saldo >= 0;
          return (
            <div
              key={m.mes}
              className="relative flex-1"
              title={`${m.rotulo}: entrou ${brl(m.entradas)}, saiu ${brl(m.saidas)} → ${sobe ? "sobrou" : "faltou"} ${brl(Math.abs(m.saldo))}`}
            >
              <span
                className={cn(
                  "absolute inset-x-1/4 block",
                  sobe ? "rounded-t-[4px] bg-(--ll-ok)" : "rounded-b-[4px] bg-(--ll-danger)",
                )}
                style={
                  sobe
                    ? { bottom: `${100 - alturaCima}%`, height: `${Math.max(h, m.saldo ? 1.5 : 0)}%` }
                    : { top: `${alturaCima}%`, height: `${Math.max(h, 1.5)}%` }
                }
              />
              <span
                className={cn(
                  "absolute inset-x-0 text-center text-[10px] tabular-nums",
                  sobe ? "text-muted-foreground" : "text-destructive",
                )}
                style={
                  sobe
                    ? { bottom: `calc(${100 - alturaCima + h}% + 2px)` }
                    : { top: `calc(${alturaCima + h}% + 2px)` }
                }
              >
                {m.saldo === 0 ? "" : `${sobe ? "+" : "−"}${curto(Math.abs(m.saldo))}`}
              </span>
            </div>
          );
        })}
      </div>
      <div className="mt-1 flex gap-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        {meses.map((m) => (
          <span key={m.mes} className="flex-1 text-center">
            {m.rotulo}
          </span>
        ))}
      </div>
      <p className="mt-2 text-xs text-muted-foreground">
        Barra para cima: o mês fechou com sobra. Para baixo: saiu mais do que entrou.
      </p>
    </div>
  );
}
