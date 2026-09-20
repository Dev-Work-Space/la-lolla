"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import { brl } from "@/lib/formato";
import {
  buscarCarteirasDaVendaAction,
  buscarClientesAction,
  buscarInsumosDaVendaAction,
  buscarPecasAction,
  editarVendaAction,
  fecharVendaAction,
  ultimosInsumosAction,
} from "../venda.actions";
import { campoDaData, somaDias, somaMeses } from "@/lib/dia";

/*
 * O carrinho. Tela nova — no app antigo a venda era um formulário em etapas
 * dentro de um painel.
 *
 * Mudei porque vender é a operação mais frequente da loja e acontece com a
 * cliente esperando: aqui tudo fica numa tela só, com o total sempre visível
 * e o que falta pagar calculado ao vivo. Nenhuma regra mudou — quem decide
 * total, saldo e parcelas continua sendo o servidor.
 */

type Peca = {
  id: string;
  sku: string;
  nome: string;
  tamanho: string | null;
  insumo: boolean;
  preco: number;
  saldo: number;
};

type ItemCarrinho = Peca & { quantidade: number; precoUnit: number };

/*
 * O insumo é a embalagem que sai com a venda — o saquinho, a caixinha, o laço.
 * Não tem preço aqui: ninguém cobra pela caixinha. Tem CUSTO, e é o custo que
 * some quando não se registra.
 *
 * `custo` vem nulo para quem não vê financeiro: ela registra o que saiu sem
 * ver quanto vale, igual ao resto do app.
 */
type Insumo = { id: string; nome: string; unidade: string; custo: number | null; saldo: number };
type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";
type Pago = { forma: Forma; valor: number };

const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

/* Atalhos de desconto. O 5% é o padrão à vista dos Ajustes. */
const ATALHOS_DESCONTO = [0, 5, 10, 15];

/*
 * Quando a venda nasce de um orçamento aprovado.
 *
 * Peças, preços, desconto e cliente vêm TRAVADOS: eles têm de bater com o PDF
 * que a cliente aprovou. Mudar qualquer um aqui faria a loja cobrar uma coisa
 * e o papel dizer outra — e o caminho certo para mudar é gerar uma revisão do
 * orçamento, não editar no fechamento.
 *
 * A condição de pagamento vem preenchida, mas continua editável: ela foi
 * COMBINADA na proposta, e no balcão a cliente pode pagar de outro jeito.
 */
export type VendaDeOrcamento = {
  id: string;
  rotulo: string;
  clienteId: string | null;
  clienteNome: string | null;
  desconto: number;
  subtotal: number;
  parcelas: number | null;
  primeiroVencimento: string | null;
  itens: Array<{
    pecaId: string;
    sku: string;
    nome: string;
    tamanho: string | null;
    quantidade: number;
    precoUnit: number;
    saldo: number;
  }>;
};

/*
 * A venda que está sendo EDITADA.
 *
 * Os recebimentos não vêm: dinheiro que entrou não se edita aqui. Vem só
 * quanto já foi recebido (`pago`), porque é ele que decide se ainda sobra
 * saldo a parcelar depois da mudança.
 */
export type VendaParaEditar = {
  id: string;
  numero: number;
  clienteId: string | null;
  /** "AAAA-MM-DD", do jeito que o campo de data usa. */
  data: string;
  desconto: number;
  subtotal: number;
  observacao: string | null;
  pago: number;
  itens: Array<{
    pecaId: string;
    sku: string;
    nome: string;
    tamanho: string | null;
    quantidade: number;
    precoUnit: number;
    /** Saldo em estoque JÁ somando o que esta venda tirou. */
    saldo: number;
  }>;
  insumos: Array<{ pecaId: string; quantidade: number }>;
};

export function NovaVenda({
  orcamento,
  edicao,
}: {
  orcamento?: VendaDeOrcamento;
  edicao?: VendaParaEditar;
}) {
  const router = useRouter();
  const travado = !!orcamento;
  const editando = !!edicao;

  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<Peca[]>([]);
  const [buscando, buscar] = useTransition();

  const [itens, setItens] = useState<ItemCarrinho[]>(
    edicao
      ? edicao.itens.map((i) => ({
          id: i.pecaId,
          sku: i.sku,
          nome: i.nome,
          tamanho: i.tamanho,
          insumo: false,
          preco: i.precoUnit,
          saldo: i.saldo,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        }))
      : orcamento
      ? orcamento.itens.map((i) => ({
          id: i.pecaId,
          sku: i.sku,
          nome: i.nome,
          tamanho: i.tamanho,
          insumo: false,
          preco: i.precoUnit,
          saldo: i.saldo,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        }))
      : [],
  );
  /*
   * Desconto é PERCENTUAL sobre o subtotal (documentação, seção 15). Guardo o
   * percentual aqui e mando o valor em reais já calculado para o servidor —
   * quem manda no dinheiro é o número, mas quem a pessoa digita é o "%".
   */
  const [descontoPct, setDescontoPct] = useState(() => {
    const base = edicao ?? orcamento;
    if (!base || base.subtotal <= 0) return "0";
    return String(r2((base.desconto / base.subtotal) * 100)).replace(".", ",");
  });
  const [observacao, setObservacao] = useState(
    edicao?.observacao ?? (orcamento ? `Do orçamento ${orcamento.rotulo}` : ""),
  );

  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [clienteId, setClienteId] = useState(edicao?.clienteId ?? orcamento?.clienteId ?? "");

  /* A data da venda. A de sábado lançada na segunda tem de faturar no sábado. */
  const [dataVenda, setDataVenda] = useState(() => edicao?.data ?? campoDaData());

  /*
   * As carteiras vêm vazias para quem não vê financeiro — e aí o seletor nem
   * aparece. O pagamento dela cai em "sem carteira" e o João atribui depois,
   * que é como o app antigo se comportava.
   */
  const [carteiras, setCarteiras] = useState<Array<{ id: string; nome: string; saldo: number }>>([]);
  const [carteiraId, setCarteiraId] = useState("");

  /* Embalagem: catálogo à esquerda, o que foi usado à direita. */
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [usados, setUsados] = useState<Array<{ pecaId: string; quantidade: number }>>(
    edicao?.insumos ?? [],
  );
  const [ultimos, setUltimos] = useState<Array<{ pecaId: string; quantidade: number }>>([]);

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [formaNova, setFormaNova] = useState<Forma>("DINHEIRO");
  const [valorNovo, setValorNovo] = useState("");

  const [parcelas, setParcelas] = useState(String(orcamento?.parcelas ?? 1));
  const [intervalo, setIntervalo] = useState<"mes" | "quinzena" | "semana">("mes");
  /* Um mês a partir de hoje, em hora LOCAL. Com `toISOString` o vencimento
     saltava um dia toda noite depois das 21h — é o fuso de Brasília virando o
     dia em UTC antes de virar aqui. */
  const [primeiro, setPrimeiro] = useState(
    orcamento?.primeiroVencimento ?? campoDaData(somaMeses(new Date(), 1)),
  );
  /*
   * As datas escolhidas parcela a parcela.
   *
   * Vazio = seguir o atalho (primeiro vencimento + intervalo). Quando a
   * pessoa mexe numa data, ela passa a mandar naquela parcela — a cliente
   * combina "uma em dezembro e outra só em fevereiro" e o app tem de
   * conseguir escrever isso.
   */
  const [datas, setDatas] = useState<Record<number, string>>({});

  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  useEffect(() => {
    buscarClientesAction("").then((r) => {
      if (r.ok) setClientes(r.data);
    });
    buscarInsumosDaVendaAction().then((r) => {
      if (r.ok) setInsumos(r.data);
    });
    ultimosInsumosAction().then((r) => {
      if (r.ok) setUltimos(r.data);
    });
    buscarCarteirasDaVendaAction().then((r) => {
      if (r.ok) {
        setCarteiras(r.data);
        if (r.data[0]) setCarteiraId(r.data[0].id);
      }
    });
  }, []);

  /* Limpar a lista é consequência do que a pessoa DIGITOU, então acontece no
     próprio manipulador. Dentro do efeito, dispara um render extra a cada
     tecla — é o que o lint acusa em `set-state-in-effect`. */
  function mudarTermo(v: string) {
    setTermo(v);
    if (v.trim().length < 2) setAchadas([]);
  }

  // Busca com espera: não dispara a cada tecla.
  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(() => {
      buscar(async () => {
        const r = await buscarPecasAction(termo);
        if (r.ok) setAchadas(r.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  const contas = useMemo(() => {
    const subtotal = r2(itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0));
    const pct = Math.min(Math.max(paraNumero(descontoPct), 0), 100);
    const desc = r2((subtotal * pct) / 100);
    const total = r2(Math.max(0, subtotal - desc));
    /* Editando, o "pago" é o que JÁ ENTROU na venda — a tela não recebe
       dinheiro aqui. Lançar, o pago é o que a pessoa está digitando agora. */
    const pago = edicao ? r2(edicao.pago) : r2(pagos.reduce((s, p) => s + p.valor, 0));
    const saldo = r2(Math.max(0, total - pago));
    return { subtotal, desc, total, pago, saldo, troco: r2(Math.max(0, pago - total)) };
  }, [itens, descontoPct, pagos, edicao]);

  /* Só quem vê financeiro tem `custo`; para a vendedora o total fica nulo e
     a linha de custo nem aparece. */
  const custoEmbalagem = useMemo(() => {
    let temCusto = false;
    let soma = 0;
    for (const u of usados) {
      const i = insumos.find((x) => x.id === u.pecaId);
      if (i?.custo != null) {
        temCusto = true;
        soma += i.custo * u.quantidade;
      }
    }
    return temCusto ? r2(soma) : null;
  }, [usados, insumos]);

  /* A data da parcela k: a escolhida à mão, ou a do atalho. */
  function dataDaParcela(k: number): string {
    const escolhida = datas[k];
    if (escolhida) return escolhida;
    const base = new Date(primeiro + "T12:00:00");
    if (k === 0) return campoDaData(base);
    if (intervalo === "semana") return campoDaData(somaDias(base, 7 * k));
    if (intervalo === "quinzena") return campoDaData(somaDias(base, 15 * k));
    return campoDaData(somaMeses(base, k));
  }

  /* O valor de cada parcela, com a sobra de centavos na ÚLTIMA — a mesma
     conta que o servidor refaz na hora de gravar. */
  function valorDaParcela(k: number, n: number): number {
    const base = Math.floor((contas.saldo / n) * 100) / 100;
    const sobra = r2(contas.saldo - base * n);
    return k === n - 1 ? r2(base + sobra) : base;
  }

  function mexerInsumo(pecaId: string, delta: number) {
    setUsados((a) => {
      const ja = a.find((x) => x.pecaId === pecaId);
      if (!ja) return delta > 0 ? [...a, { pecaId, quantidade: delta }] : a;
      const q = ja.quantidade + delta;
      if (q <= 0) return a.filter((x) => x.pecaId !== pecaId);
      return a.map((x) => (x.pecaId === pecaId ? { ...x, quantidade: q } : x));
    });
  }

  function adicionar(p: Peca) {
    setItens((a) => {
      const ja = a.find((x) => x.id === p.id);
      if (ja) {
        return a.map((x) => (x.id === p.id ? { ...x, quantidade: x.quantidade + 1 } : x));
      }
      return [...a, { ...p, quantidade: 1, precoUnit: p.preco }];
    });
    setTermo("");
    setAchadas([]);
  }

  function enviar() {
    setAviso(null);
    if (itens.length === 0) {
      setAviso("Adicione ao menos uma peça.");
      return;
    }
    if (contas.saldo > 0.005 && Number(parcelas) < 1) {
      setAviso("Informe em quantas vezes o saldo será pago.");
      return;
    }

    salvar(async () => {
      const comuns = {
        clienteId: clienteId || null,
        observacao: observacao || null,
        desconto: contas.desc,
        itens: itens.map((i) => ({
          pecaId: i.id,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        })),
        insumos: usados,
        data: new Date(dataVenda + "T12:00:00"),
        aPrazo:
          contas.saldo > 0.005
            ? {
                parcelas: Number(parcelas) || 1,
                intervalo,
                primeiroVencimento: new Date(primeiro + "T12:00:00"),
                vencimentos: Array.from(
                  { length: Number(parcelas) || 1 },
                  (_, k) => new Date(dataDaParcela(k) + "T12:00:00"),
                ),
              }
            : null,
      };

      if (edicao) {
        const r = await editarVendaAction({ ...comuns, vendaId: edicao.id });
        if (r.ok) {
          router.push(`/vendas/${r.data.id}`);
          router.refresh();
        } else {
          setAviso(r.error.message);
        }
        return;
      }

      const r = await fecharVendaAction({
        clienteId: clienteId || null,
        observacao: observacao || null,
        desconto: contas.desc,
        itens: itens.map((i) => ({
          pecaId: i.id,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        })),
        insumos: usados,
        data: new Date(dataVenda + "T12:00:00"),
        // O troco não vira pagamento: registramos no máximo o total.
        pagamentos: pagos.map((p, ix) => ({
          forma: p.forma,
          valor: ix === pagos.length - 1 ? r2(p.valor - contas.troco) : p.valor,
          carteiraId: carteiraId || null,
        })).filter((p) => p.valor > 0),
        aPrazo:
          contas.saldo > 0.005
            ? {
                parcelas: Number(parcelas) || 1,
                intervalo,
                primeiroVencimento: new Date(primeiro + "T12:00:00"),
                vencimentos: Array.from(
                  { length: Number(parcelas) || 1 },
                  (_, k) => new Date(dataDaParcela(k) + "T12:00:00"),
                ),
              }
            : null,
        // O orçamento vira Aprovado na MESMA transação da venda.
        orcamentoId: orcamento?.id ?? null,
      });

      if (r.ok) {
        router.push(`/vendas/${r.data.id}`);
        router.refresh();
      } else {
        setAviso(r.error.message);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      {/* ─────────── carrinho ─────────── */}
      <div className="space-y-4">
        {edicao && (
          <p className="rounded-xl border border-dashed px-4 py-3 text-sm">
            Editando a <strong>venda #{edicao.numero}</strong>. As peças voltam ao estoque e saem
            de novo — o histórico da peça mostra a edição. Os{" "}
            <strong>recebimentos não mudam aqui</strong>: para desfazer um valor, use “remover
            recebimento” na ficha da venda.
          </p>
        )}

        {orcamento && (
          <p className="rounded-xl border border-(--ll-accent-line) bg-(--ll-accent-soft) px-4 py-3 text-sm">
            Venda do orçamento <strong>{orcamento.rotulo}</strong>
            {orcamento.clienteNome ? ` · ${orcamento.clienteNome}` : ""}. As peças, os preços, o
            desconto e a cliente vêm travados para bater com o PDF aprovado. Precisa mudar algo?
            Volte e crie uma <strong>revisão</strong> do orçamento.
          </p>
        )}

        {!travado && (
        <section className="rounded-xl border bg-card p-4">
          <Label htmlFor="busca-peca">Adicionar peça</Label>
          <div className="relative mt-1.5">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              aria-hidden
            />
            <Input
              id="busca-peca"
              value={termo}
              onChange={(e) => mudarTermo(e.target.value)}
              placeholder="Nome, código ou LL-…"
              className="pl-9 text-base"
              autoComplete="off"
            />
            {termo && (
              <button
                type="button"
                onClick={() => mudarTermo("")}
                aria-label="Limpar busca"
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          {achadas.length > 0 && (
            <ul className="mt-2 max-h-72 divide-y overflow-y-auto rounded-lg border">
              {achadas.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => adicionar(p)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{p.nome}</span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.sku}
                        {p.tamanho ? ` · tam. ${p.tamanho}` : ""} ·{" "}
                        <span className={p.saldo <= 0 ? "text-destructive" : ""}>
                          {p.saldo} em estoque
                        </span>
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular-nums">
                      {p.preco > 0 ? brl(p.preco) : "sem preço"}
                    </span>
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {buscando && termo.length >= 2 && achadas.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Procurando…</p>
          )}
          {!buscando && termo.length >= 2 && achadas.length === 0 && (
            <p className="mt-2 text-sm text-muted-foreground">Nenhuma peça encontrada.</p>
          )}
        </section>
        )}

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {travado ? "Peças do orçamento" : "No carrinho"}
          </h2>
          {itens.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Busque a peça acima para começar.
            </p>
          ) : (
            <ul className="divide-y">
              {itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.sku}
                      {i.quantidade > i.saldo && (
                        <span className="text-destructive"> · só {i.saldo} em estoque</span>
                      )}
                    </span>
                  </span>

                  {travado ? (
                    <>
                      <span className="text-sm tabular-nums text-muted-foreground">
                        {i.quantidade} × {brl(i.precoUnit)}
                      </span>
                      <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                        {brl(i.precoUnit * i.quantidade)}
                      </span>
                    </>
                  ) : (
                    <>
                  <span className="flex items-center gap-1">
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Menos um ${i.nome}`}
                      onClick={() =>
                        setItens((a) =>
                          a
                            .map((x) =>
                              x.id === i.id ? { ...x, quantidade: x.quantidade - 1 } : x,
                            )
                            .filter((x) => x.quantidade > 0),
                        )
                      }
                    >
                      −
                    </Button>
                    <span className="w-7 text-center text-sm font-medium tabular-nums">
                      {i.quantidade}
                    </span>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      aria-label={`Mais um ${i.nome}`}
                      onClick={() =>
                        setItens((a) =>
                          a.map((x) =>
                            x.id === i.id ? { ...x, quantidade: x.quantidade + 1 } : x,
                          ),
                        )
                      }
                    >
                      +
                    </Button>
                  </span>

                  <Input
                    aria-label={`Preço de ${i.nome}`}
                    inputMode="decimal"
                    className="w-24 text-right text-base"
                    value={i.precoUnit ? String(i.precoUnit).replace(".", ",") : ""}
                    placeholder="0,00"
                    onChange={(e) =>
                      setItens((a) =>
                        a.map((x) =>
                          x.id === i.id ? { ...x, precoUnit: paraNumero(e.target.value) } : x,
                        ),
                      )
                    }
                  />

                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {brl(i.precoUnit * i.quantidade)}
                  </span>

                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label={`Remover ${i.nome}`}
                    onClick={() => setItens((a) => a.filter((x) => x.id !== i.id))}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          )}
        </section>

        {/* ─────────── embalagem ─────────── */}
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div>
            <h2 className="text-sm font-semibold">Embalagem e insumos</h2>
            <p className="text-xs text-muted-foreground">
              O que saiu junto com a peça. Não entra no preço — baixa do estoque e conta no custo.
            </p>
          </div>

          {insumos.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhum insumo cadastrado. Cadastre em <strong>Estoque › Insumos</strong> para lançar
              aqui o saquinho e a caixinha que saíram com a venda.
            </p>
          ) : (
            <>
              {usados.length > 0 && (
                <ul className="divide-y rounded-lg border">
                  {usados.map((u) => {
                    const i = insumos.find((x) => x.id === u.pecaId);
                    if (!i) return null;
                    return (
                      <li key={u.pecaId} className="flex items-center gap-2 px-3 py-2">
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm">{i.nome}</span>
                          <span className="block text-xs text-muted-foreground">
                            {i.custo != null ? `${brl(i.custo)} por ${i.unidade}` : i.unidade}
                          </span>
                        </span>
                        <span className="flex items-center gap-1">
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Menos um ${i.nome}`}
                            onClick={() => mexerInsumo(i.id, -1)}
                          >
                            −
                          </Button>
                          <span className="w-6 text-center text-sm tabular-nums">
                            {u.quantidade}
                          </span>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            aria-label={`Mais um ${i.nome}`}
                            onClick={() => mexerInsumo(i.id, 1)}
                          >
                            +
                          </Button>
                        </span>
                        {i.custo != null && (
                          <span className="w-20 shrink-0 text-right text-sm tabular-nums">
                            {brl(r2(i.custo * u.quantidade))}
                          </span>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}

              <div className="flex flex-wrap items-center gap-2">
                <select
                  id="insumo-venda"
                  aria-label="Escolher insumo"
                  value=""
                  onChange={(e) => {
                    if (e.target.value) mexerInsumo(e.target.value, 1);
                  }}
                  className="h-10 min-w-0 flex-1 rounded-lg border bg-card px-3 text-sm"
                >
                  <option value="">Escolher insumo…</option>
                  {insumos
                    .filter((i) => !usados.some((u) => u.pecaId === i.id))
                    .map((i) => (
                      <option key={i.id} value={i.id}>
                        {i.nome}
                        {i.custo != null ? ` · ${brl(i.custo)}` : ""} · {i.saldo} {i.unidade}
                      </option>
                    ))}
                </select>

                {/*
                  Repetir a última: o uso é quase sempre o mesmo saquinho, e
                  redigitar a cada venda é o que faz controle de insumo ser
                  abandonado na segunda semana. Veio do app antigo.
                */}
                {usados.length === 0 && ultimos.length > 0 && (
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() =>
                      setUsados(ultimos.filter((u) => insumos.some((i) => i.id === u.pecaId)))
                    }
                  >
                    Repetir da última venda
                  </Button>
                )}
              </div>

              {custoEmbalagem != null && usados.length > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Custo de embalagem</span>
                  <span className="font-semibold tabular-nums">{brl(custoEmbalagem)}</span>
                </div>
              )}
            </>
          )}
        </section>
      </div>

      {/* ─────────── fechamento ─────────── */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="cliente">Cliente</Label>
            <select
              id="cliente"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm disabled:opacity-70"
              value={clienteId}
              disabled={travado}
              onChange={(e) => setClienteId(e.target.value)}
            >
              <option value="">Sem cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="data-venda">Data da venda</Label>
            <Input
              id="data-venda"
              type="date"
              value={dataVenda}
              onChange={(e) => setDataVenda(e.target.value)}
              className="text-base"
            />
            {dataVenda !== campoDaData() && (
              <p className="text-xs text-muted-foreground">
                Esta venda vai faturar em {new Date(dataVenda + "T12:00:00").toLocaleDateString("pt-BR")}.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="desconto">Desconto</Label>
            {travado ? (
              <p className="text-sm text-muted-foreground">
                {contas.desc > 0
                  ? `${descontoPct}% · ${brl(contas.desc)} — como no orçamento aprovado`
                  : "Sem desconto, como no orçamento aprovado"}
              </p>
            ) : (
              <>
            <div className="flex flex-wrap gap-1">
              {ATALHOS_DESCONTO.map((p) => (
                <button
                  key={p}
                  type="button"
                  aria-pressed={paraNumero(descontoPct) === p}
                  onClick={() => setDescontoPct(String(p))}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                    paraNumero(descontoPct) === p
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {p === 0 ? "Sem desconto" : `${p}%`}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2">
              <Input
                id="desconto"
                inputMode="decimal"
                value={descontoPct}
                onChange={(e) => setDescontoPct(e.target.value.replace(/[^0-9,.]/g, ""))}
                placeholder="0"
                className="w-20 text-base"
                aria-label="Desconto em porcento"
              />
              <span className="text-sm text-muted-foreground">
                % sobre o subtotal
                {contas.desc > 0 ? ` · ${brl(contas.desc)}` : ""}
              </span>
            </div>
              </>
            )}
          </div>

          <dl className="space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Subtotal</dt>
              <dd className="tabular-nums">{brl(contas.subtotal)}</dd>
            </div>
            {contas.desc > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Desconto</dt>
                <dd className="tabular-nums text-destructive">− {brl(contas.desc)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t pt-2">
              <dt className="font-semibold">Total</dt>
              <dd className="text-xl font-bold tabular-nums">{brl(contas.total)}</dd>
            </div>
          </dl>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            {editando ? "Pagamento" : "Como pagou"}
          </h2>

          {/* Na edição o dinheiro é FATO CONSUMADO: ele já entrou, já caiu numa
              carteira e já tem comprovante pendente ou não. Mexer nele aqui
              seria reescrever a história do caixa. */}
          {editando && (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs text-muted-foreground">
              Já recebido: <strong className="text-foreground">{brl(contas.pago)}</strong>. Para
              desfazer um valor, use “remover recebimento” na ficha da venda.
            </p>
          )}

          {!editando && (
          <>
          {/* Só aparece quando há dinheiro entrando AGORA e a pessoa pode ver
              o financeiro. Perguntar "onde entrou" antes de existir entrada
              seria pergunta sem assunto. */}
          {carteiras.length > 0 && contas.pago > 0 && (
            <div className="space-y-1.5">
              <Label htmlFor="carteira-venda">Onde o dinheiro entrou</Label>
              <select
                id="carteira-venda"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
              >
                {carteiras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {brl(c.saldo)}
                  </option>
                ))}
              </select>
              <p className="text-xs text-muted-foreground">
                Carteira é onde o dinheiro está, não como a cliente pagou.
              </p>
            </div>
          )}

          {pagos.length > 0 && (
            <ul className="divide-y rounded-lg border">
              {pagos.map((p, ix) => (
                <li key={ix} className="flex items-center gap-2 px-3 py-2 text-sm">
                  <span className="flex-1">{FORMAS.find((f) => f[0] === p.forma)?.[1]}</span>
                  <span className="tabular-nums">{brl(p.valor)}</span>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    aria-label="Remover pagamento"
                    onClick={() => setPagos((a) => a.filter((_, i) => i !== ix))}
                  >
                    <X className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex flex-wrap gap-1">
            {FORMAS.map(([v, r]) => (
              <button
                key={v}
                type="button"
                aria-pressed={formaNova === v}
                onClick={() => setFormaNova(v)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",
                  formaNova === v
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <Input
              aria-label="Valor pago"
              inputMode="decimal"
              value={valorNovo}
              onChange={(e) => setValorNovo(e.target.value)}
              placeholder={contas.saldo > 0 ? brl(contas.saldo).replace("R$ ", "") : "0,00"}
              className="flex-1 text-base"
            />
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const v = paraNumero(valorNovo) || contas.saldo;
                if (v <= 0) return;
                setPagos((a) => [...a, { forma: formaNova, valor: v }]);
                setValorNovo("");
              }}
            >
              Adicionar
            </Button>
          </div>

          {/*
            O caminho mais comum da loja é "pagou tudo agora". Digitar o valor
            que a própria tela já mostra logo acima é trabalho à toa — e é onde
            nasce o centavo errado.
          */}
          {contas.saldo > 0.005 && (
            <Button
              type="button"
              variant="outline"
              className="w-full"
              onClick={() => {
                setPagos((a) => [...a, { forma: formaNova, valor: contas.saldo }]);
                setValorNovo("");
              }}
            >
              Pagou tudo · {brl(contas.saldo)} em{" "}
              {FORMAS.find((x) => x[0] === formaNova)?.[1].toLowerCase()}
            </Button>
          )}

          </>
          )}

          <dl className="space-y-1.5 border-t pt-3 text-sm">
            <div className="flex justify-between">
              <dt className="text-muted-foreground">Pago</dt>
              <dd className="tabular-nums">{brl(contas.pago)}</dd>
            </div>
            {contas.troco > 0 && (
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Troco</dt>
                <dd className="tabular-nums">{brl(contas.troco)}</dd>
              </div>
            )}
            <div className="flex items-baseline justify-between border-t pt-2">
              <dt className="font-semibold">Falta</dt>
              <dd
                className={cn(
                  "text-lg font-bold tabular-nums",
                  contas.saldo > 0 && "text-destructive",
                )}
              >
                {brl(contas.saldo)}
              </dd>
            </div>
          </dl>

          {/* O parcelamento só aparece quando de fato sobrou saldo. */}
          {contas.saldo > 0.005 && (
            <div className="space-y-3 rounded-lg border border-dashed p-3">
              <p className="text-xs text-muted-foreground">
                Sobrou {brl(contas.saldo)}. Combine as parcelas — elas entram em contas a receber.
              </p>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="parcelas" className="text-xs">
                    Em quantas vezes
                  </Label>
                  <Input
                    id="parcelas"
                    inputMode="numeric"
                    value={parcelas}
                    onChange={(e) => {
                      const n = e.target.value.replace(/\D/g, "") || "1";
                      setParcelas(n);
                      /* Mudou a quantidade: as datas escolhidas à mão para
                         parcelas que deixaram de existir vão junto, senão
                         ressuscitam quando ele aumentar o número de novo. */
                      setDatas((a) => {
                        const out: Record<number, string> = {};
                        for (const [k, v] of Object.entries(a)) {
                          if (Number(k) < (Number(n) || 1)) out[Number(k)] = v;
                        }
                        return out;
                      });
                    }}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="intervalo" className="text-xs">
                    A cada
                  </Label>
                  <select
                    id="intervalo"
                    className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
                    value={intervalo}
                    onChange={(e) => {
                      setIntervalo(e.target.value as typeof intervalo);
                      setDatas({});
                    }}
                  >
                    <option value="mes">Mês</option>
                    <option value="quinzena">15 dias</option>
                    <option value="semana">Semana</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="primeiro" className="text-xs">
                  Primeiro vencimento
                </Label>
                <Input
                  id="primeiro"
                  type="date"
                  value={primeiro}
                  onChange={(e) => {
                    setPrimeiro(e.target.value);
                    setDatas({});
                  }}
                  className="text-base"
                />
              </div>

              {/*
                Cada parcela com a SUA data, editável.
                Os campos de cima são o atalho ("3x, todo dia 10"); esta lista é
                a combinação de verdade. A cliente que pede "uma em dezembro e a
                outra só em fevereiro" existe, e o app tem de conseguir
                escrever isso sem inventar um intervalo que ninguém combinou.
              */}
              <div className="space-y-1.5 border-t pt-3">
                <p className="text-xs font-medium">
                  {parcelas}× de <strong>{brl(valorDaParcela(0, Number(parcelas) || 1))}</strong>
                  {Number(parcelas) > 1 && (
                    <span className="font-normal text-muted-foreground">
                      {" "}
                      · a última fica {brl(valorDaParcela(Number(parcelas) - 1, Number(parcelas)))}
                    </span>
                  )}
                </p>

                <ul className="max-h-64 space-y-1.5 overflow-y-auto">
                  {Array.from({ length: Number(parcelas) || 1 }, (_, k) => (
                    <li key={k} className="flex items-center gap-2">
                      <span className="w-14 shrink-0 text-xs text-muted-foreground">
                        {k + 1}/{parcelas}
                      </span>
                      <Input
                        type="date"
                        aria-label={`Vencimento da parcela ${k + 1}`}
                        value={dataDaParcela(k)}
                        onChange={(e) =>
                          setDatas((a) => ({ ...a, [k]: e.target.value }))
                        }
                        className="h-9 flex-1 text-sm"
                      />
                      <span className="w-24 shrink-0 text-right text-sm tabular-nums">
                        {brl(valorDaParcela(k, Number(parcelas) || 1))}
                      </span>
                    </li>
                  ))}
                </ul>

                {Object.keys(datas).length > 0 && (
                  <button
                    type="button"
                    onClick={() => setDatas({})}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    Voltar para as datas automáticas
                  </button>
                )}
              </div>
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="obs">Observação</Label>
            <Input
              id="obs"
              value={observacao}
              onChange={(e) => setObservacao(e.target.value)}
              placeholder="opcional"
              className="text-base"
            />
          </div>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <Button
            type="button"
            className="w-full"
            disabled={salvando || itens.length === 0}
            onClick={enviar}
          >
            {salvando
              ? editando
                ? "Salvando…"
                : "Fechando…"
              : `${editando ? "Salvar alterações" : "Fechar venda"} · ${brl(contas.total)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            {editando
              ? "As parcelas em aberto são refeitas com o novo saldo. As já pagas ficam como estão."
              : "Pix, débito e crédito ficam pendentes de comprovante — dá para anexar depois."}
          </p>
        </section>
      </div>
    </div>
  );
}
