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
  buscarClientesAction,
  buscarPecasAction,
  fecharVendaAction,
} from "../venda.actions";

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
type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";
type Pago = { forma: Forma; valor: number };

const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

export function NovaVenda() {
  const router = useRouter();

  const [termo, setTermo] = useState("");
  const [achadas, setAchadas] = useState<Peca[]>([]);
  const [buscando, buscar] = useTransition();

  const [itens, setItens] = useState<ItemCarrinho[]>([]);
  const [desconto, setDesconto] = useState("");
  const [observacao, setObservacao] = useState("");

  const [clientes, setClientes] = useState<Array<{ id: string; nome: string }>>([]);
  const [clienteId, setClienteId] = useState("");

  const [pagos, setPagos] = useState<Pago[]>([]);
  const [formaNova, setFormaNova] = useState<Forma>("DINHEIRO");
  const [valorNovo, setValorNovo] = useState("");

  const [parcelas, setParcelas] = useState("1");
  const [intervalo, setIntervalo] = useState<"mes" | "quinzena" | "semana">("mes");
  const [primeiro, setPrimeiro] = useState(() => {
    const d = new Date();
    d.setMonth(d.getMonth() + 1);
    return d.toISOString().slice(0, 10);
  });

  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  useEffect(() => {
    buscarClientesAction("").then((r) => {
      if (r.ok) setClientes(r.data);
    });
  }, []);

  // Busca com espera: não dispara a cada tecla.
  useEffect(() => {
    if (termo.trim().length < 2) {
      setAchadas([]);
      return;
    }
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
    const desc = Math.min(paraNumero(desconto), subtotal);
    const total = r2(Math.max(0, subtotal - desc));
    const pago = r2(pagos.reduce((s, p) => s + p.valor, 0));
    const saldo = r2(Math.max(0, total - pago));
    return { subtotal, desc, total, pago, saldo, troco: r2(Math.max(0, pago - total)) };
  }, [itens, desconto, pagos]);

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
      const r = await fecharVendaAction({
        clienteId: clienteId || null,
        observacao: observacao || null,
        desconto: contas.desc,
        itens: itens.map((i) => ({
          pecaId: i.id,
          quantidade: i.quantidade,
          precoUnit: i.precoUnit,
        })),
        // O troco não vira pagamento: registramos no máximo o total.
        pagamentos: pagos.map((p, ix) => ({
          forma: p.forma,
          valor: ix === pagos.length - 1 ? r2(p.valor - contas.troco) : p.valor,
        })).filter((p) => p.valor > 0),
        aPrazo:
          contas.saldo > 0.005
            ? {
                parcelas: Number(parcelas) || 1,
                intervalo,
                primeiroVencimento: new Date(primeiro + "T12:00:00"),
              }
            : null,
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
              onChange={(e) => setTermo(e.target.value)}
              placeholder="Nome, código ou LL-…"
              className="pl-9 text-base"
              autoComplete="off"
            />
            {termo && (
              <button
                type="button"
                onClick={() => setTermo("")}
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

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            No carrinho
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
                </li>
              ))}
            </ul>
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
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={clienteId}
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
            <Label htmlFor="desconto">Desconto</Label>
            <Input
              id="desconto"
              inputMode="decimal"
              value={desconto}
              onChange={(e) => setDesconto(e.target.value)}
              placeholder="0,00"
              className="text-base"
            />
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
            Como pagou
          </h2>

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
                    onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "") || "1")}
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
                    onChange={(e) => setIntervalo(e.target.value as typeof intervalo)}
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
                  onChange={(e) => setPrimeiro(e.target.value)}
                  className="text-base"
                />
              </div>
              <p className="text-xs text-muted-foreground">
                {parcelas}× de{" "}
                <strong>{brl(contas.saldo / (Number(parcelas) || 1))}</strong>
              </p>
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
            {salvando ? "Fechando…" : `Fechar venda · ${brl(contas.total)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            Pix, débito e crédito ficam pendentes de comprovante — dá para anexar depois.
          </p>
        </section>
      </div>
    </div>
  );
}
