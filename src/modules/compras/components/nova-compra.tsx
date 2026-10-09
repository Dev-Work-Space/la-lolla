"use client";

import { Seletor } from "@/components/padrao/seletor";

import { Card } from "@/components/ui/card";
import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusIcon, MagnifyingGlassIcon, TrashIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brl } from "@/lib/formato";
import {
  buscarCarteirasAction,
  buscarFornecedoresAction,
  buscarItensAction,
  registrarCompraAction,
} from "../compra.actions";
import type { CarteiraSaldo } from "@/modules/financeiro/financeiro.tipos";
import { PagamentoDaCompra, usePlanoDaCompra } from "./pagamento-da-compra";

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

export type ItemCompra = {
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

type NoCarrinho = ItemCompra & { quantidade: number; custoUnit: number };

const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(s.replace(/\./g, "").replace(",", ".")) || 0;

export function NovaCompra({
  inicial,
}: {
  /** A peça que veio escolhida pelo botão Entrada da ficha, e o fornecedor dela. */
  inicial?: { item: ItemCompra; fornecedorId: string | null } | null;
}) {
  const router = useRouter();

  const [fornecedores, setFornecedores] = useState<Array<{ id: string; nome: string }>>([]);
  const [fornecedorId, setFornecedorId] = useState(inicial?.fornecedorId ?? "");
  const [carteiras, setCarteiras] = useState<CarteiraSaldo[]>([]);

  const [termo, setTermo] = useState("");
  const [achados, setAchados] = useState<ItemCompra[]>([]);
  const [buscando, buscar] = useTransition();
  const [itens, setItens] = useState<NoCarrinho[]>(() =>
    inicial ? [{ ...inicial.item, quantidade: 1, custoUnit: inicial.item.custo }] : [],
  );
  const [observacao, setObservacao] = useState("");

  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  useEffect(() => {
    buscarFornecedoresAction().then((r) => {
      if (r.ok) {
        setFornecedores(r.data);
        if (r.data.length === 1) setFornecedorId((atual) => atual || r.data[0].id);
      }
    });
    buscarCarteirasAction().then((r) => {
      if (r.ok) {
        setCarteiras(r.data);
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
  const plano = usePlanoDaCompra(total, carteiras);

  function adicionar(p: ItemCompra) {
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
    const problema = plano.problema();
    if (problema) return setAviso(problema);

    salvar(async () => {
      const r = await registrarCompraAction({
        fornecedorId,
        observacao: observacao || null,
        itens: itens.map((i) => ({
          pecaId: i.id,
          quantidade: i.quantidade,
          custoUnit: i.custoUnit,
        })),
        pagamento: plano.montar(),
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
        <Card as="section" className="block overflow-visible py-0 text-base space-y-4 p-4">
          <div className="space-y-1.5">
            <Label htmlFor="fornecedor">Fornecedor</Label>
            <Seletor
              id="fornecedor"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={fornecedorId}
              onValueChange={(valor) => setFornecedorId(valor)}
              opcoes={[
                { value: "", label: "Escolha…" },
                ...fornecedores.map((f) => ({ value: f.id, label: f.nome }))
              ]}
            />
            {fornecedores.length === 0 && (
              <p className="text-xs text-muted-foreground">
                Nenhum fornecedor cadastrado — cadastre em Cadastros › Fornecedores.
              </p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="busca-item">Adicionar peça ou insumo</Label>
            <div className="relative">
              <MagnifyingGlassIcon weight="regular"
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
                <Button
                  variant="ghost"
                  type="button"
                  onClick={() => mudarTermo("")}
                  aria-label="Limpar busca"
                  className="h-auto gap-0 border-0 p-0 font-normal whitespace-normal absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                >
                  <XIcon weight="regular" className="size-4" />
                </Button>
              )}
            </div>
          </div>

          {achados.length > 0 && (
            <ul className="max-h-72 divide-y overflow-y-auto rounded-lg border">
              {achados.map((p) => (
                <li key={p.id}>
                  <Button
                    variant="ghost"
                    type="button"
                    onClick={() => adicionar(p)}
                    className="h-auto gap-0 border-0 p-0 font-normal whitespace-normal flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-accent/40"
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
                    <PlusIcon weight="bold" className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                  </Button>
                </li>
              ))}
            </ul>
          )}
          {!buscando && termo.length >= 2 && achados.length === 0 && (
            <p className="text-sm text-muted-foreground">
              Nada encontrado. Cadastre a peça no Estoque antes de comprar.
            </p>
          )}
        </Card>

        <Card as="section" className="block overflow-visible py-0 text-base">
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
                    <TrashIcon weight="regular" className="size-4 text-muted-foreground" />
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card as="section" className="block overflow-visible py-0 text-base space-y-3 p-4">
          <div className="flex items-baseline justify-between">
            <span className="font-semibold">Total da compra</span>
            <span className="text-xl font-bold tabular-nums">{brl(total)}</span>
          </div>
          <p className="text-xs text-muted-foreground">
            {itens.reduce((s, i) => s + i.quantidade, 0)} unidades em {itens.length}{" "}
            {itens.length === 1 ? "item" : "itens"}
          </p>
        </Card>

        <Card as="section" className="block overflow-visible py-0 text-base space-y-3 p-4">
          <h2 className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
            Como pagou o fornecedor
          </h2>
          <PagamentoDaCompra total={total} carteiras={carteiras} plano={plano} />
        </Card>

        <Card as="section" className="block overflow-visible py-0 text-base space-y-3 p-4">
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
        </Card>
      </div>
    </div>
  );
}
