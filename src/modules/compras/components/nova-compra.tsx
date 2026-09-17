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
  buscarCarteirasAction,
  buscarFornecedoresAction,
  buscarItensAction,
  registrarCompraAction,
} from "../compra.actions";
import type { CarteiraSaldo } from "@/modules/financeiro/financeiro.tipos";

/*
 * Nova compra. Peças e insumos entram pelo MESMO fluxo — decisão do João.
 *
 * A regra 2.12 manda que dar entrada em peça seja também uma saída de caixa,
 * então o bloco de pagamento não é opcional: ou sai da carteira agora, ou
 * vira conta a pagar. Não existe "comprar sem dizer como pagou".
 *
 * O custo sugerido vem da última compra da peça — a pessoa corrige se o
 * fornecedor reajustou. Quando a peça tem código e fator, mostro os dois para
 * conferência, porque é assim que o custo nasce no cadastro.
 */

type Item = {
  id: string;
  sku: string;
  nome: string;
  insumo: boolean;
  unidade: string;
  custo: number;
  codigoFornecedor: number | null;
  fator: number | null;
  saldo: number;
};

type NoCarrinho = Item & { quantidade: number; custoUnit: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

export function NovaCompra() {
  const router = useRouter();

  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([]);
  const [fornecedorId, setFornecedorId] = useState("");
  const [carteiras, setCarteiras] = useState<CarteiraSaldo[]>([]);

  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<Item[]>([]);
  const [buscando, buscar] = useTransition();
  const [itens, setItens] = useState<NoCarrinho[]>([]);
  const [observacao, setObservacao] = useState("");

  const [forma, setForma] = useState<"avista" | "prazo">("avista");
  const [carteiraId, setCarteiraId] = useState("");
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
    buscarFornecedoresAction().then((r) => {
      if (r.ok) {
        setFornecedores(r.data);
        if (r.data.length === 1) setFornecedorId(r.data[0].id);
      }
    });
    buscarCarteirasAction().then((r) => {
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
    if (v.trim().length < 2) setAchados([]);
  }

  useEffect(() => {
    if (termo.trim().length < 2) return;
    const t = setTimeout(() => {
      buscar(async () => {
        const r = await buscarItensAction(termo);
        if (r.ok) setAchados(r.data);
      });
    }, 250);
    return () => clearTimeout(t);
  }, [termo]);

  const total = useMemo(
    () => r2(itens.reduce((s, i) => s + i.custoUnit * i.quantidade, 0)),
    [itens],
  );

  function adicionar(p: Item) {
    setItens((a) => {
      const ja = a.find((x) => x.id === p.id);
      if (ja) return a.map((x) => (x.id === p.id ? { ...x, quantidade: x.quantidade + 1 } : x));
      return [...a, { ...p, quantidade: 1, custoUnit: p.custo }];
    });
    setTermo("");
    setAchados([]);
  }

  function enviar() {
    setAviso(null);
    if (!fornecedorId) return setAviso("Escolha o fornecedor.");
    if (itens.length === 0) return setAviso("Adicione ao menos um item.");
    if (total <= 0) return setAviso("O total precisa ser maior que zero.");
    if (forma === "avista" && !carteiraId) {
      return setAviso("Escolha de qual carteira o dinheiro saiu.");
    }

    salvar(async () => {
      const r = await registrarCompraAction({
        fornecedorId,
        observacao: observacao || null,
        itens: itens.map((i) => ({
          pecaId: i.id,
          quantidade: i.quantidade,
          custoUnit: i.custoUnit,
        })),
        pagamento:
          forma === "avista"
            ? { tipo: "avista", carteiraId }
            : {
                tipo: "prazo",
                parcelas: Number(parcelas) || 1,
                intervalo,
                primeiroVencimento: new Date(primeiro + "T12:00:00"),
              },
      });

      if (r.ok) {
        router.push(`/compras/${r.data.id}`);
        router.refresh();
      } else {
        setAviso(r.error.message);
      }
    });
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1.5fr_1fr] lg:items-start">
      <div className="space-y-4">
        <section className="space-y-4 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="fornecedor">Fornecedor</Label>
            <select
              id="fornecedor"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={fornecedorId}
              onChange={(e) => setFornecedorId(e.target.value)}
            >
              <option value="">Escolha…</option>
              {fornecedores.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.nome}
                </option>
              ))}
            </select>
            {fornecedores.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum fornecedor cadastrado — cadastre em Cadastros › Fornecedores.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="busca-item">Adicionar peça ou insumo</Label>
            <div className="relative">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <Input
                id="busca-item"
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
          </div>

          {achados.length > 0 && (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {achados.map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => adicionar(p)}
                    className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">
                        {p.nome}
                        {p.insumo && (
                          <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                            insumo
                          </span>
                        )}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {p.sku} · {p.saldo} {p.unidade} em estoque
                        {p.codigoFornecedor && p.fator
                          ? ` · cód. ${p.codigoFornecedor} × ${p.fator}`
                          : ""}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm tabular-nums text-muted-foreground">
                      {p.custo > 0 ? brl(p.custo) : "sem custo"}
                    </span>
                    <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </button>
                </li>
              ))}
            </ul>
          )}
          {!buscando && termo.length >= 2 && achados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nada encontrado. Cadastre a peça no Estoque antes de comprar.
            </p>
          )}
        </section>

        <section className="rounded-xl border bg-card">
          <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            No pedido
          </h2>
          {itens.length === 0 ? (
            <p className="px-6 py-10 text-center text-sm text-muted-foreground">
              Busque o item acima para começar.
            </p>
          ) : (
            <ul className="divide-y">
              {itens.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-3 px-4 py-3">
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium">{i.nome}</span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {i.sku} · tem {i.saldo} {i.unidade}
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
                    <span className="w-8 text-center text-sm font-medium tabular-nums">
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
                    aria-label={`Custo de ${i.nome}`}
                    inputMode="decimal"
                    className="w-24 text-right text-base"
                    value={i.custoUnit ? String(i.custoUnit).replace(".", ",") : ""}
                    placeholder="0,00"
                    onChange={(e) =>
                      setItens((a) =>
                        a.map((x) =>
                          x.id === i.id ? { ...x, custoUnit: paraNumero(e.target.value) } : x,
                        ),
                      )
                    }
                  />

                  <span className="w-24 shrink-0 text-right text-sm font-semibold tabular-nums">
                    {brl(i.custoUnit * i.quantidade)}
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

      <div className="space-y-4 lg:sticky lg:top-4">
        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Total da compra</span>
            <span className="text-xl font-bold tabular-nums">{brl(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {itens.reduce((s, i) => s + i.quantidade, 0)} unidades em {itens.length}{" "}
            {itens.length === 1 ? "item" : "itens"}
          </p>
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Como pagou o fornecedor
          </h2>
          <p className="text-xs leading-relaxed text-muted-foreground">
            Dar entrada em peça é uma saída de caixa. À vista sai da carteira agora; a prazo vira
            conta a pagar.
          </p>

          <div className="grid grid-cols-2 gap-1 rounded-lg border p-1">
            {(
              [
                ["avista", "À vista"],
                ["prazo", "A prazo"],
              ] as const
            ).map(([v, r]) => (
              <button
                key={v}
                type="button"
                aria-pressed={forma === v}
                onClick={() => setForma(v)}
                className={cn(
                  "rounded-md px-3 py-2 text-sm font-medium transition-colors",
                  forma === v
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {r}
              </button>
            ))}
          </div>

          {forma === "avista" ? (
            <div className="space-y-1.5">
              <Label htmlFor="carteira-compra">De qual carteira saiu</Label>
              <select
                id="carteira-compra"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                value={carteiraId}
                onChange={(e) => setCarteiraId(e.target.value)}
              >
                {carteiras.length === 0 && <option value="">Nenhuma carteira cadastrada</option>}
                {carteiras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {brl(c.saldo)}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="parcelas-compra" className="text-xs">
                    Em quantas vezes
                  </Label>
                  <Input
                    id="parcelas-compra"
                    inputMode="numeric"
                    value={parcelas}
                    onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "") || "1")}
                    className="text-base"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="intervalo-compra" className="text-xs">
                    A cada
                  </Label>
                  <select
                    id="intervalo-compra"
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
                <Label htmlFor="venc-compra" className="text-xs">
                  Primeiro vencimento
                </Label>
                <Input
                  id="venc-compra"
                  type="date"
                  value={primeiro}
                  onChange={(e) => setPrimeiro(e.target.value)}
                  className="text-base"
                />
              </div>
              {total > 0 && (
                <p className="text-xs text-muted-foreground">
                  {parcelas}× de <strong>{brl(total / (Number(parcelas) || 1))}</strong>
                </p>
              )}
            </div>
          )}
        </section>

        <section className="space-y-3 rounded-xl border bg-card p-4">
          <div className="space-y-1.5">
            <Label htmlFor="obs-compra">Observação</Label>
            <Input
              id="obs-compra"
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
            disabled={salvando || itens.length === 0 || !fornecedorId}
            onClick={enviar}
          >
            {salvando ? "Registrando…" : `Registrar compra · ${brl(total)}`}
          </Button>

          <p className="text-center text-xs text-muted-foreground">
            O estoque entra e o custo das peças é atualizado.
          </p>
        </section>
      </div>
    </div>
  );
}
