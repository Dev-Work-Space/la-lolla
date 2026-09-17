"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import { buscarClientesAction, buscarPecasAction } from "@/modules/vendas/venda.actions";
import { salvarOrcamentoAction } from "../orcamento.actions";

/*
 * Montar um orçamento.
 *
 * Tela ÚNICA, como a da venda — e não as 3 etapas do app antigo. O motivo é o
 * mesmo que está escrito lá: aqui o total e a validade ficam sempre à vista
 * enquanto se mexe nas peças, e não há o vai-e-volta entre etapas para
 * conferir um número. As regras são as mesmas; o que muda é a moldura.
 *
 * Três diferenças em relação à venda, todas da documentação:
 *   · não confere estoque — dá para orçar o que ainda não chegou;
 *   · não tem insumo — embalagem é custo da venda, não item da proposta;
 *   · não recebe dinheiro — no máximo COMBINA como será pago.
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

type Item = {
  pecaId: string;
  sku: string;
  nome: string;
  tamanho: string | null;
  saldo: number | null;
  quantidade: number;
  precoUnit: number;
};

type Modo = "A_COMBINAR" | "A_VISTA" | "PARCELADO";
type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";

const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

const MODOS: Array<[Modo, string]> = [
  ["A_COMBINAR", "A combinar"],
  ["A_VISTA", "À vista"],
  ["PARCELADO", "Parcelado"],
];

const VALIDADES = [3, 7, 15, 30];
const ATALHOS_DESCONTO = [0, 5, 10, 15];

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export type OrcamentoParaEditar = {
  id: string;
  numero: number;
  clienteId: string | null;
  data: string; // "AAAA-MM-DD"
  validadeDias: number;
  desconto: number;
  subtotal: number;
  observacao: string | null;
  modoPagamento: Modo;
  formaPagamento: Forma | null;
  parcelas: number | null;
  primeiroVencimento: string | null;
  itens: Item[];
};

export function EditorOrcamento({ orcamento }: { orcamento?: OrcamentoParaEditar }) {
  const router = useRouter();
  const editando = !!orcamento;

  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<Peca[]>([]);
  const [buscando, buscar] = useTransition();

  const [itens, setItens] = useState<Item[]>(orcamento?.itens ?? []);
  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [clienteId, setClienteId] = useState(orcamento?.clienteId ?? "");
  const [data, setData] = useState(orcamento?.data ?? campoDaData());
  const [validadeDias, setValidadeDias] = useState(String(orcamento?.validadeDias ?? 7));
  const [observacao, setObservacao] = useState(orcamento?.observacao ?? "");

  /* Desconto é percentual na tela e reais no banco (documentação, seção 15).
     Ao editar, volto do valor gravado para o percentual que o gerou. */
  const [descontoPct, setDescontoPct] = useState(() => {
    if (!orcamento || orcamento.subtotal <= 0) return "0";
    return String(r2((orcamento.desconto / orcamento.subtotal) * 100)).replace(".", ",");
  });

  const [modo, setModo] = useState<Modo>(orcamento?.modoPagamento ?? "A_COMBINAR");
  const [forma, setForma] = useState<Forma>(orcamento?.formaPagamento ?? "PIX");
  const [parcelas, setParcelas] = useState(String(orcamento?.parcelas ?? 2));
  const [primeiro, setPrimeiro] = useState(
    orcamento?.primeiroVencimento ??
      (() => {
        const d = new Date();
        d.setMonth(d.getMonth() + 1);
        return campoDaData(d);
      })(),
  );

  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  useEffect(() => {
    buscarClientesAction("").then((r) => {
      if (r.ok) setClientes(r.data);
    });
  }, []);

  /* Limpar a lista é consequência do que a pessoa DIGITOU, então acontece no
     próprio manipulador. Fazer isso dentro do efeito dispara um render extra
     a cada tecla e é o que o lint acusa em `set-state-in-effect`. */
  function mudarTermo(v: string) {
    setTermo(v);
    if (v.trim().length < 2) setAchadas([]);
  }

  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(() => {
      buscar(async () => {
        const r = await buscarPecasAction(termo);
        // Insumo não entra em orçamento: a embalagem é custo da loja, não
        // item que a cliente escolhe.
        if (r.ok) setAchadas(r.data.filter((p) => !p.insumo));
      });
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  const contas = useMemo(() => {
    const subtotal = r2(itens.reduce((s, i) => s + i.precoUnit * i.quantidade, 0));
    const pct = Math.min(Math.max(paraNumero(descontoPct), 0), 100);
    const desc = r2((subtotal * pct) / 100);
    const total = r2(Math.max(0, subtotal - desc));
    const n = Math.max(1, Number(parcelas) || 1);
    return { subtotal, desc, total, porParcela: r2(total / n) };
  }, [itens, descontoPct, parcelas]);

  const validoAte = useMemo(() => {
    const base = new Date(data + "T12:00:00");
    if (Number.isNaN(base.getTime())) return null;
    base.setDate(base.getDate() + (Number(validadeDias) || 7));
    return base;
  }, [data, validadeDias]);

  function adicionar(p: Peca) {
    setItens((a) => {
      const ja = a.find((x) => x.pecaId === p.id);
      if (ja) {
        return a.map((x) => (x.pecaId === p.id ? { ...x, quantidade: x.quantidade + 1 } : x));
      }
      return [
        ...a,
        {
          pecaId: p.id,
          sku: p.sku,
          nome: p.nome,
          tamanho: p.tamanho,
          saldo: p.saldo,
          quantidade: 1,
          precoUnit: p.preco,
        },
      ];
    });
    setTermo("");
    setAchadas([]);
  }

  function enviar() {
    setAviso(null);
    if (itens.length === 0) {
      setAviso("Adicione ao menos uma peça ao orçamento.");
      return;
    }
    const semPreco = itens.find((i) => !(i.precoUnit > 0));
    if (semPreco) {
      setAviso(`Defina o preço de “${semPreco.nome}”. O orçamento é uma proposta de preço.`);
      return;
    }

    salvar(async () => {
      const r = await salvarOrcamentoAction(orcamento?.id ?? null, {
        clienteId: clienteId || null,
        data: new Date(data + "T12:00:00"),
        validadeDias: Number(validadeDias) || 7,
        desconto: contas.desc,
        observacao: observacao || null,
        itens: itens.map((i) => ({
          pecaId: i.pecaId,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        })),
        modoPagamento: modo,
        formaPagamento: modo === "A_COMBINAR" ? null : forma,
        parcelas: modo === "PARCELADO" ? Number(parcelas) || 2 : null,
        primeiroVencimento: modo === "PARCELADO" ? new Date(primeiro + "T12:00:00") : null,
      });

      if (r.ok) {
        router.push(`/orcamentos/${r.data.id}`);
        router.refresh();
      } else {
        setAviso(r.error.message);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      {/* ─────────── peças ─────────── */}
      <div className="space-y-4">
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
                        {/* Estoque aqui é INFORMAÇÃO, não trava: orçar peça que
                            não tem é justamente como se decide encomendar. */}
                        {p.saldo > 0 ? `${p.saldo} em estoque` : "sem estoque"}
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

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Na proposta
          </h2>
          {itens.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Busque a peça acima para começar.
            </p>
          ) : (
            <ul className="divide-y">
              {itens.map((i) => (
                <li key={i.pecaId} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.sku}
                      {i.tamanho ? ` · tam. ${i.tamanho}` : ""}
                      {i.saldo !== null && i.quantidade > i.saldo && (
                        <span> · só {i.saldo} em estoque — dá para orçar assim mesmo</span>
                      )}
                    </span>
                  </span>

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
                              x.pecaId === i.pecaId ? { ...x, quantidade: x.quantidade - 1 } : x,
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
                            x.pecaId === i.pecaId ? { ...x, quantidade: x.quantidade + 1 } : x,
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
                          x.pecaId === i.pecaId
                            ? { ...x, precoUnit: paraNumero(e.target.value) }
                            : x,
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
                    onClick={() => setItens((a) => a.filter((x) => x.pecaId !== i.pecaId))}
                  >
                    <Trash2 className="size-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      {/* ─────────── condições ─────────── */}
      <div className="space-y-4 lg:sticky lg:top-4">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div>
            <Label htmlFor="orc-cliente">Cliente</Label>
            <select
              id="orc-cliente"
              value={clienteId}
              onChange={(e) => setClienteId(e.target.value)}
              className="mt-1.5 h-10 w-full rounded-md border bg-transparent px-3 text-base"
            >
              <option value="">Sem cliente</option>
              {clientes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label htmlFor="orc-data">Data</Label>
              <Input
                id="orc-data"
                type="date"
                value={data}
                onChange={(e) => setData(e.target.value)}
                className="mt-1.5 text-base"
              />
            </div>
            <div>
              <Label htmlFor="orc-validade">Validade</Label>
              <select
                id="orc-validade"
                value={validadeDias}
                onChange={(e) => setValidadeDias(e.target.value)}
                className="mt-1.5 h-10 w-full rounded-md border bg-transparent px-3 text-base"
              >
                {VALIDADES.map((d) => (
                  <option key={d} value={d}>
                    {d} dias
                  </option>
                ))}
              </select>
            </div>
          </div>

          {validoAte && (
            <p className="text-xs text-muted-foreground">
              Vale até <strong>{validoAte.toLocaleDateString("pt-BR")}</strong>. Enquanto isso, as
              peças ficam reservadas — sem baixar do estoque.
            </p>
          )}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label>Desconto</Label>
          <div className="flex flex-wrap items-center gap-2">
            {ATALHOS_DESCONTO.map((p) => (
              <Button
                key={p}
                type="button"
                size="sm"
                variant={paraNumero(descontoPct) === p ? "default" : "outline"}
                onClick={() => setDescontoPct(String(p))}
              >
                {p === 0 ? "sem desconto" : `${p}%`}
              </Button>
            ))}
            <Input
              aria-label="Outro desconto em porcentagem"
              inputMode="decimal"
              className="w-20 text-right text-base"
              value={descontoPct}
              onChange={(e) => setDescontoPct(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">%</span>
          </div>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label>Como a cliente vai pagar</Label>
          <div className="flex flex-wrap gap-2">
            {MODOS.map(([id, rotulo]) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant={modo === id ? "default" : "outline"}
                onClick={() => setModo(id)}
              >
                {rotulo}
              </Button>
            ))}
          </div>

          {modo === "A_COMBINAR" ? (
            <p className="text-xs text-muted-foreground">
              O PDF sai só com os valores, sem falar de pagamento — para negociar.
            </p>
          ) : (
            <div className="space-y-3">
              <div>
                <Label htmlFor="orc-forma">Forma</Label>
                <select
                  id="orc-forma"
                  value={forma}
                  onChange={(e) => setForma(e.target.value as Forma)}
                  className="mt-1.5 h-10 w-full rounded-md border bg-transparent px-3 text-base"
                >
                  {FORMAS.map(([id, rotulo]) => (
                    <option key={id} value={id}>
                      {rotulo}
                    </option>
                  ))}
                </select>
              </div>

              {modo === "PARCELADO" && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label htmlFor="orc-parcelas">Parcelas</Label>
                    <Input
                      id="orc-parcelas"
                      inputMode="numeric"
                      value={parcelas}
                      onChange={(e) => setParcelas(e.target.value)}
                      className="mt-1.5 text-base"
                    />
                  </div>
                  <div>
                    <Label htmlFor="orc-venc">1º vencimento</Label>
                    <Input
                      id="orc-venc"
                      type="date"
                      value={primeiro}
                      onChange={(e) => setPrimeiro(e.target.value)}
                      className="mt-1.5 text-base"
                    />
                  </div>
                  {contas.total > 0 && (
                    <p className="col-span-2 text-xs text-muted-foreground">
                      {parcelas}× de <strong>{brl(contas.porParcela)}</strong>
                    </p>
                  )}
                </div>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <Label htmlFor="orc-obs">Observação no PDF</Label>
          <textarea
            id="orc-obs"
            value={observacao}
            onChange={(e) => setObservacao(e.target.value)}
            rows={3}
            placeholder="condições, prazo de entrega, forma de envio…"
            className="w-full rounded-md border bg-transparent px-3 py-2 text-base"
          />
          <p className="text-xs text-muted-foreground">
            Este texto sai no orçamento que a cliente recebe.
          </p>
        </section>

        <section className="space-y-2 rounded-xl border bg-card p-4">
          <div className="flex justify-between text-sm">
            <span className="text-muted-foreground">Subtotal</span>
            <span className="tabular-nums">{brl(contas.subtotal)}</span>
          </div>
          {contas.desc > 0 && (
            <div className="flex justify-between text-sm">
              <span className="text-muted-foreground">Desconto</span>
              <span className="tabular-nums text-(--ll-ok)">− {brl(contas.desc)}</span>
            </div>
          )}
          <div className="flex justify-between border-t pt-2 text-base font-bold">
            <span>Total</span>
            <span className="tabular-nums">{brl(contas.total)}</span>
          </div>
        </section>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <Button type="button" className="w-full" onClick={enviar} disabled={salvando}>
          {salvando ? "Salvando…" : editando ? "Salvar alterações" : "Gerar orçamento"}
        </Button>
      </div>
    </div>
  );
}
