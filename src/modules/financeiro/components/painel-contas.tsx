import Link from "next/link";
import { brl, data as fData } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { BlocoVazio, Chips, Linha, Lista, Pilula, Vazio } from "@/components/padrao/indicadores";
import {
  FILTROS_CONTA,
  listarContas,
  ORDENS_CONTA,
  type CarteiraSaldo,
  type ContaLinha,
  type FiltroConta,
  type OrdemConta,
} from "../financeiro.service";
import { datasDaBarra, grupoDe, periodoDaUrl, rotuloDoPeriodo } from "../periodo";
import { FiltroPeriodo } from "./filtro-periodo";
import { BaixarPlanilha, BuscaFiltro, SeletorFiltro } from "./filtros";
import { FormConta } from "./form-conta";
import { BaixarConta } from "./baixar-conta";
import { PagarFatura } from "./pagar-fatura";
import { faturaDoCartao } from "../cartao.service";

/*
 * Contas a pagar e a receber. É a MESMA tela para os dois: muda o rótulo e o
 * sinal do dinheiro, não a lógica.
 *
 * As parcelas de venda a prazo aparecem aqui, em "A receber" — porque elas
 * SÃO contas a receber. Não existem duas listas para conciliar.
 *
 * Período pelo VENCIMENTO, busca por descrição, fornecedor ou cliente, ordem
 * à escolha e três quadros no topo (a vencer, vencido, baixado) — tudo do
 * mesmo período e da mesma busca, para os quadros baterem com a lista.
 */
const ehFiltro = (v: string | undefined): v is FiltroConta =>
  v === "abertas" || v === "vencidas" || v === "pagas" || v === "todas" || v === "semana";
const ehOrdem = (v: string | undefined): v is OrdemConta => ORDENS_CONTA.some(([o]) => o === v);

export async function PainelContas({
  tipo,
  params,
  carteiras,
  pode,
}: {
  tipo: "PAGAR" | "RECEBER";
  params: Record<string, string>;
  carteiras: CarteiraSaldo[];
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const filtro: FiltroConta = ehFiltro(params.filtro) ? params.filtro : "abertas";
  const ordem: OrdemConta = ehOrdem(params.ordem) ? params.ordem : "vencimento";
  const agruparPor = params.agrupar === "semana" || params.agrupar === "mes" ? params.agrupar : null;
  const periodo = periodoDaUrl(params, "tudo");

  /* Uma consulta com TODAS as situações do período: os três quadros e a lista
     saem dela, e a situação escolhida filtra em memória. */
  const doPeriodo = await listarContas(tipo, "todas", {
    de: periodo.de,
    ate: periodo.ate,
    busca: params.busca,
    ordem,
  });
  const abertas = (c: ContaLinha) => !c.paga && !c.cancelada;
  const naSituacao = (c: ContaLinha) =>
    filtro === "abertas"
      ? abertas(c)
      : filtro === "vencidas"
        ? c.vencida
        : filtro === "pagas"
          ? c.paga
          : filtro === "semana"
            ? abertas(c) && c.diasAteVencer >= 0 && c.diasAteVencer <= 7
            : true;
  const contas = doPeriodo.filter(naSituacao);

  const somaDe = (l: ContaLinha[]) => Math.round(l.reduce((t, c) => t + c.valor, 0) * 100) / 100;
  const quadros = {
    aVencer: doPeriodo.filter((c) => abertas(c) && !c.vencida),
    vencido: doPeriodo.filter((c) => c.vencida),
    baixado: doPeriodo.filter((c) => c.paga),
  };
  /* Vencida de antes do período entra junto quando o período inclui hoje —
     e a tela diz isso, para ninguém achar que o filtro está errado. */
  const vencidasDeAntes = periodo.de ? contas.filter((c) => c.vencida && c.vencimento < periodo.de!).length : 0;

  /*
   * Uma fatura chega aqui como VÁRIAS contas — uma por compra. Listadas
   * assim, a tela parece três vezes maior que a dívida real e o botão "Pagar"
   * fica em cima da coisa errada: ninguém paga uma compra do cartão, paga a
   * fatura. Então tudo do mesmo cartão que vence no mesmo dia vira uma linha.
   */
  const faturas = new Map<
    string,
    {
      cartaoId: string;
      cartaoNome: string;
      vencimento: Date;
      valor: number;
      compras: number;
      vencida: boolean;
      diasAteVencer: number;
      primeira: number;
    }
  >();
  const soltas: typeof contas = [];

  contas.forEach((c, ix) => {
    if (!c.cartaoId || c.paga || c.cancelada) {
      soltas.push(c);
      return;
    }
    const chave = `${c.cartaoId}|${c.vencimento.toISOString()}`;
    const ja = faturas.get(chave);
    if (ja) {
      ja.valor = Math.round((ja.valor + c.valor) * 100) / 100;
      ja.compras += 1;
      return;
    }
    faturas.set(chave, {
      cartaoId: c.cartaoId,
      cartaoNome: c.cartaoNome ?? "Cartão",
      vencimento: c.vencimento,
      valor: c.valor,
      compras: 1,
      vencida: c.vencida,
      diasAteVencer: c.diasAteVencer,
      primeira: ix,
    });
  });

  /* As compras de dentro de cada fatura, para o diálogo mostrar o que tem lá
     sem uma segunda viagem quando a pessoa clicar. */
  const itensPorFatura = new Map(
    await Promise.all(
      [...faturas.entries()].map(
        async ([chave, f]) =>
          [chave, await faturaDoCartao(f.cartaoId, f.vencimento)] as const,
      ),
    ),
  );

  /* Ordem de vencimento, misturando conta solta e fatura: a lista responde
     "o que vence primeiro", e o cartão não é exceção a isso. */
  const linhas = [
    ...soltas.map((c) => ({ tipo: "conta" as const, quando: c.vencimento, conta: c })),
    ...[...faturas.entries()].map(([chave, f]) => ({
      tipo: "fatura" as const,
      quando: f.vencimento,
      chave,
      fatura: f,
    })),
  ].sort((a, b) => {
    const va = a.tipo === "fatura" ? a.fatura.valor : a.conta.valor;
    const vb = b.tipo === "fatura" ? b.fatura.valor : b.conta.valor;
    if (ordem === "valor-desc") return vb - va;
    if (ordem === "valor") return va - vb;
    if (ordem === "vencimento-desc") return b.quando.getTime() - a.quando.getTime();
    return a.quando.getTime() - b.quando.getTime();
  });
  const pagar = tipo === "PAGAR";

  const link = (v: string) => {
    const p = new URLSearchParams(params);
    if (v === "abertas") p.delete("filtro");
    else p.set("filtro", v);
    return `/financeiro?${p.toString()}`;
  };

  const total = contas.filter((c) => !c.paga && !c.cancelada).reduce((s, c) => s + c.valor, 0);
  const vazia = linhas.length === 0;

  type LinhaDaLista = (typeof linhas)[number];

  function desenhar(linha: LinhaDaLista) {
    if (linha.tipo === "fatura") {
      const f = linha.fatura;
      const sub: string[] = [
        `vence ${fData(f.vencimento)}`,
        `${f.compras} compra${f.compras === 1 ? "" : "s"} no cartão`,
      ];
      if (f.vencida) sub.push(`${Math.abs(f.diasAteVencer)} dias atrasada`);
      else if (f.diasAteVencer === 0) sub.push("vence hoje");
      else if (f.diasAteVencer <= 7) sub.push(`em ${f.diasAteVencer} dias`);

      return (
        <Linha
          key={linha.chave}
          nome={`Fatura · ${f.cartaoNome}`}
          pilulas={
            <>
              {f.vencida && <Pilula tom="due">vencida</Pilula>}
              {!f.vencida && f.diasAteVencer === 0 && <Pilula tom="accent">hoje</Pilula>}
            </>
          }
          sub={sub.join(" · ")}
          valor={brl(f.valor)}
          acoes={
            pode.editar ? (
              <PagarFatura
                cartaoId={f.cartaoId}
                cartaoNome={f.cartaoNome}
                vencimento={f.vencimento}
                total={f.valor}
                itens={itensPorFatura.get(linha.chave) ?? []}
                carteiras={carteiras}
                rotulo="Pagar fatura"
                variante="outline"
              />
            ) : undefined
          }
        />
      );
    }

    const c = linha.conta;
    const sub: string[] = [`vence ${fData(c.vencimento)}`];
    if (c.fornecedor) sub.push(c.fornecedor);
    if (c.parcela) sub.push(`parcela ${c.parcela}`);
    if (!c.paga && !c.cancelada) {
      if (c.diasAteVencer < 0) sub.push(`${Math.abs(c.diasAteVencer)} dias atrasada`);
      else if (c.diasAteVencer === 0) sub.push("vence hoje");
      else if (c.diasAteVencer <= 7) sub.push(`em ${c.diasAteVencer} dias`);
    }

    return (
      <Linha
        key={c.id}
        nome={c.descricao}
        pilulas={
          <>
            {c.cancelada && <Pilula>cancelada</Pilula>}
            {c.paga && <Pilula>baixada</Pilula>}
            {c.vencida && <Pilula tom="due">vencida</Pilula>}
            {!c.paga && !c.cancelada && c.diasAteVencer === 0 && <Pilula tom="accent">hoje</Pilula>}
          </>
        }
        sub={sub.join(" · ")}
        valor={brl(c.valor)}
        onClickHref={c.vendaId ? `/vendas/${c.vendaId}` : undefined}
        acoes={
          pode.editar && !c.paga && !c.cancelada ? (
            <BaixarConta
              contaId={c.id}
              descricao={c.descricao}
              valor={c.valor}
              tipo={tipo}
              carteiras={carteiras}
              deVenda={Boolean(c.vendaId)}
            />
          ) : undefined
        }
      />
    );
  }

  /*
   * Em aberto, a lista vem AGRUPADA por urgência, com o total de cada grupo:
   * "quanto vence esta semana?" é a pergunta de quem abre esta tela, e uma
   * lista corrida obrigava a somar de cabeça. Nos outros filtros (baixadas,
   * todas…) a urgência não diz nada, e a lista continua corrida.
   */
  const diasDe = (l: LinhaDaLista) => (l.tipo === "fatura" ? l.fatura.diasAteVencer : l.conta.diasAteVencer);
  const valorDe = (l: LinhaDaLista) => (l.tipo === "fatura" ? l.fatura.valor : l.conta.valor);
  const hoje = new Date();
  const fimDoMes = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0, 23, 59, 59);
  /* Agrupar por semana ou mês (do vencimento) vale para qualquer situação;
     sem escolha, as abertas vêm por urgência e o resto corrido. */
  const porData = agruparPor
    ? linhas.reduce<Array<{ rotulo: string; itens: LinhaDaLista[]; alerta: boolean; total: number }>>((gs, l) => {
        const { rotulo } = grupoDe(l.quando, agruparPor);
        const g = gs.find((x) => x.rotulo === rotulo);
        if (g) {
          g.itens.push(l);
          g.total = Math.round((g.total + valorDe(l)) * 100) / 100;
        } else gs.push({ rotulo, itens: [l], alerta: false, total: valorDe(l) });
        return gs;
      }, [])
    : null;
  const grupos = porData
    ? porData
    : filtro === "abertas"
      ? (
          [
            ["Vencidas", (l: LinhaDaLista) => diasDe(l) < 0, true],
            ["Hoje", (l: LinhaDaLista) => diasDe(l) === 0, false],
            ["Próximos 7 dias", (l: LinhaDaLista) => diasDe(l) >= 1 && diasDe(l) <= 7, false],
            ["Ainda este mês", (l: LinhaDaLista) => diasDe(l) > 7 && l.quando <= fimDoMes, false],
            ["Mais para frente", (l: LinhaDaLista) => diasDe(l) > 7 && l.quando > fimDoMes, false],
          ] as const
        )
          .map(([rotulo, pertence, alerta]) => {
            const itens = linhas.filter(pertence);
            return { rotulo, itens, alerta, total: Math.round(itens.reduce((t, l) => t + valorDe(l), 0) * 100) / 100 };
          })
          .filter((g) => g.itens.length > 0)
      : null;

  return (
    <div className="space-y-4">
      <FiltroPeriodo params={params} {...datasDaBarra(periodo)} rotuloDatas="Vencimento" />

      {/* Os três quadros, do período e da busca escolhidos. Tocar num deles
          mostra só aquela situação. */}
      <div className="grid grid-cols-3 gap-2">
        <Quadro
          href={link("abertas")}
          ativo={filtro === "abertas"}
          rotulo={pagar ? "A pagar (a vencer)" : "A receber (a vencer)"}
          valor={somaDe(quadros.aVencer)}
          qtd={quadros.aVencer.length}
        />
        <Quadro href={link("vencidas")} ativo={filtro === "vencidas"} rotulo="Vencido" valor={somaDe(quadros.vencido)} qtd={quadros.vencido.length} alerta />
        <Quadro href={link("pagas")} ativo={filtro === "pagas"} rotulo="Baixado" valor={somaDe(quadros.baixado)} qtd={quadros.baixado.length} />
      </div>

      <div className="flex flex-wrap items-end gap-2">
        <BuscaFiltro params={params} valor={params.busca ?? ""} placeholder={pagar ? "Descrição ou fornecedor" : "Descrição ou cliente"} />
        <SeletorFiltro
          params={params}
          chave="ordem"
          rotulo="Ordem"
          valor={ordem}
          rotuloTodos={null}
          opcoes={ORDENS_CONTA.map(([v, r]) => ({ value: v, label: r }))}
        />
        <SeletorFiltro
          params={params}
          chave="agrupar"
          rotulo="Agrupar por"
          valor={agruparPor ?? ""}
          rotuloTodos="Urgência"
          opcoes={[
            { value: "semana", label: "Semana" },
            { value: "mes", label: "Mês" },
          ]}
        />
        <BaixarPlanilha
          nome={`${pagar ? "contas-a-pagar" : "contas-a-receber"}-${rotuloDoPeriodo(periodo).replace(/[^\p{L}\d]+/gu, "-")}`}
          colunas={["Vencimento", "Descrição", pagar ? "Fornecedor" : "Cliente", "Parcela", "Situação", "Valor"]}
          linhas={contas.map((c) => [
            fData(c.vencimento),
            c.descricao,
            (pagar ? c.fornecedor : c.cliente) ?? c.fornecedor ?? c.cliente ?? "",
            c.parcela ?? "",
            c.cancelada ? "Cancelada" : c.paga ? "Baixada" : c.vencida ? "Vencida" : "Em aberto",
            c.valor,
          ])}
        />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <Chips opcoes={FILTROS_CONTA} atual={filtro === "semana" ? "abertas" : filtro} href={link} />
        {pode.criar && <FormConta tipo={tipo} rotulo={pagar ? "Nova conta a pagar" : "Novo recebimento"} />}
      </div>

      {vencidasDeAntes > 0 && (
        <p className="rounded-lg border border-(--ll-danger)/40 bg-(--ll-danger-soft) px-3 py-2 text-sm">
          Inclui {vencidasDeAntes} {vencidasDeAntes === 1 ? "conta vencida" : "contas vencidas"} antes deste período e
          ainda em aberto — conta vencida não some com o filtro.
        </p>
      )}

      {total > 0 && (
        <p className="text-sm text-muted-foreground">
          {pagar ? "A pagar" : "A receber"} nesta lista:{" "}
          <strong className="text-foreground tabular-nums">{brl(total)}</strong>
        </p>
      )}

      {vazia ? (
        <Lista>
          {filtro !== "abertas" ? (
            <Vazio texto="Nada nesta lista." />
          ) : (
            <BlocoVazio
              titulo={pagar ? "Nenhuma conta a pagar" : "Nada a receber"}
              texto={
                pagar
                  ? "Lance aqui o que a loja tem para pagar — aluguel, fornecedor, imposto. O app avisa quando o vencimento chegar."
                  : "As parcelas das vendas a prazo aparecem aqui sozinhas. Você também pode lançar um recebimento à mão."
              }
              acao={pode.criar ? <FormConta tipo={tipo} rotulo="Lançar a primeira" /> : undefined}
            />
          )}
        </Lista>
      ) : grupos ? (
        grupos.map((g) => (
          <section key={g.rotulo} className="space-y-1.5">
            <div className="flex items-baseline justify-between gap-3">
              <h2
                className={cn(
                  "text-[11px] font-bold uppercase tracking-wide",
                  g.alerta ? "text-destructive" : "text-muted-foreground",
                )}
              >
                {g.rotulo} · {g.itens.length}
              </h2>
              <span className={cn("text-sm font-semibold tabular-nums", g.alerta && "text-destructive")}>
                {brl(g.total)}
              </span>
            </div>
            <Lista>{g.itens.map(desenhar)}</Lista>
          </section>
        ))
      ) : (
        <Lista>{linhas.map(desenhar)}</Lista>
      )}
    </div>
  );
}

function Quadro({
  href,
  ativo,
  rotulo,
  valor,
  qtd,
  alerta,
}: {
  href: string;
  ativo: boolean;
  rotulo: string;
  valor: number;
  qtd: number;
  alerta?: boolean;
}) {
  return (
    <Link
      href={href}
      aria-current={ativo ? "true" : undefined}
      className={cn(
        "block rounded-xl border bg-card p-3 transition-colors hover:border-foreground/40",
        ativo && "border-foreground ring-1 ring-foreground",
      )}
    >
      <p className="truncate text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{rotulo}</p>
      <p className={cn("mt-1 truncate text-lg font-bold tabular-nums", alerta && valor > 0 && "text-destructive")}>
        {brl(valor)}
      </p>
      <p className="text-xs text-muted-foreground">
        {qtd} {qtd === 1 ? "conta" : "contas"}
      </p>
    </Link>
  );
}
