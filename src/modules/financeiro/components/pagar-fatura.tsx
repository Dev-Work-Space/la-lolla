"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl, data as fData } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import { pagarFaturaAction } from "../cartao.actions";
import type { CarteiraSaldo, FaturaLinha } from "../financeiro.tipos";

/*
 * Pagar a fatura.
 *
 * Mostra as compras de dentro antes de qualquer campo: a pergunta que a
 * pessoa faz ao olhar uma fatura é "do que é isso?", e no app antigo a
 * resposta exigia abrir outra tela.
 */
export function PagarFatura({
  cartaoId,
  cartaoNome,
  vencimento,
  total,
  itens,
  carteiras,
  rotulo = "Pagar fatura",
  variante = "default",
}: {
  cartaoId: string;
  cartaoNome: string;
  vencimento: Date;
  total: number;
  itens: FaturaLinha[];
  carteiras: CarteiraSaldo[];
  rotulo?: string;
  variante?: "default" | "outline";
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [valor, setValor] = useState(total.toFixed(2).replace(".", ","));

  const pago = Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
  const resto = Math.round((total - pago) * 100) / 100;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setAviso(null);
          setValor(total.toFixed(2).replace(".", ","));
        }
      }}
    >
      <DialogTrigger
        render={<Button size="sm" variant={variante} aria-label={`${rotulo} de ${cartaoNome}`} />}
      >
        {rotulo}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Fatura · {cartaoNome}</DialogTitle>
          <DialogDescription>
            Vence {fData(vencimento)} · {itens.length} compra{itens.length === 1 ? "" : "s"} ·{" "}
            <strong className="text-foreground">{brl(total)}</strong>
          </DialogDescription>
        </DialogHeader>

        <ul className="max-h-48 divide-y overflow-y-auto rounded-lg border">
          {itens.map((i) => (
            <li key={i.id} className="flex items-center gap-2 px-3 py-2 text-sm">
              <span className="min-w-0 flex-1">
                <span className="block truncate">{i.descricao}</span>
                <span className="block text-xs text-muted-foreground">
                  {i.parcela ? `parcela ${i.parcela}` : "à vista"}
                  {i.dataCompra ? ` · comprado em ${fData(i.dataCompra)}` : ""}
                </span>
              </span>
              <span className="shrink-0 tabular-nums">{brl(i.valor)}</span>
            </li>
          ))}
        </ul>

        <form
          action={(fd) => {
            fd.set("cartaoId", cartaoId);
            fd.set("vencimento", vencimento.toISOString());
            salvar(async () => {
              const r = await pagarFaturaAction(fd);
              if (r.ok) {
                setAberto(false);
                router.refresh();
              } else {
                setAviso(r.error.message);
              }
            });
          }}
          className="space-y-4"
        >
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="fatura-valor">Valor pago</Label>
              <Input
                id="fatura-valor"
                name="valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fatura-data">Data</Label>
              <Input
                id="fatura-data"
                name="data"
                type="date"
                defaultValue={campoDaData()}
                className="text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="fatura-carteira">De qual carteira saiu</Label>
            <select
              id="fatura-carteira"
              name="carteiraId"
              defaultValue={carteiras[0]?.id ?? ""}
              className="h-10 w-full rounded-md border bg-transparent px-3 text-base"
              required
            >
              {carteiras.length === 0 && <option value="">Nenhuma carteira cadastrada</option>}
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.saldo)}
                </option>
              ))}
            </select>
          </div>

          <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
            Gera uma saída no caixa e libera o limite do cartão.
            {resto > 0.005 && (
              <>
                {" "}
                Pagando <strong className="text-foreground">{brl(pago)}</strong>, os{" "}
                <strong className="text-foreground">{brl(resto)}</strong> que faltam continuam
                ocupando limite e vão para a próxima fatura.
              </>
            )}
          </p>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || carteiras.length === 0}>
              {salvando ? "Pagando…" : "Confirmar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
