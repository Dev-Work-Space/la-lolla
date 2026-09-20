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
import { comprarNoCartaoAction } from "../cartao.actions";
import { vencimentoDaFatura } from "../cartao.regras";
import { CATEGORIAS_SAIDA, CATEGORIA_LIVRE, type CartaoResumo } from "../financeiro.tipos";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Lançar uma compra no crédito.
 *
 * Não pede carteira nem comprovante de propósito: no crédito nada sai do
 * caixa hoje. A compra vira parcela na fatura, e o dinheiro só sai no dia em
 * que a fatura for paga.
 */
export function ComprarNoCartao({
  cartoes,
  cartaoId,
}: {
  cartoes: CartaoResumo[];
  /** Quando o botão está dentro do cartão, ele já vem escolhido. */
  cartaoId?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const [qual, setQual] = useState(cartaoId ?? cartoes[0]?.id ?? "");
  const [valor, setValor] = useState("");
  const [parcelas, setParcelas] = useState("1");
  const [categoria, setCategoria] = useState(CATEGORIAS_SAIDA[0]);
  const [categoriaLivre, setCategoriaLivre] = useState("");

  const cartao = cartoes.find((c) => c.id === qual) ?? cartoes[0];
  const total = Number(String(valor).replace(/\./g, "").replace(",", ".")) || 0;
  const n = Math.max(1, Number(parcelas) || 1);
  const passa = cartao ? total > cartao.disponivel : false;

  if (cartoes.length === 0) return null;

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setErros({});
          setAviso(null);
        }
      }}
    >
      <DialogTrigger
        render={
          <Button
            variant="outline"
            size="sm"
            aria-label={cartao ? `Lançar compra em ${cartao.nome}` : "Lançar compra"}
          />
        }
      >
        Lançar compra
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compra no cartão</DialogTitle>
          <DialogDescription>
            Nada sai do caixa hoje — a compra vira conta a pagar na fatura, e o dinheiro sai quando
            você pagar a fatura.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set(
              "categoria",
              categoria === CATEGORIA_LIVRE ? categoriaLivre.trim() || CATEGORIA_LIVRE : categoria,
            );
            salvar(async () => {
              const r = await comprarNoCartaoAction(fd);
              if (r.ok) {
                setAberto(false);
                setValor("");
                setParcelas("1");
                router.refresh();
                return;
              }
              if (r.error.fields) setErros(r.error.fields);
              else setAviso(r.error.message);
            });
          }}
          className="space-y-4"
        >
          <div className="space-y-1.5">
            <Label htmlFor="compra-cartao">Cartão</Label>
            <select
              id="compra-cartao"
              name="cartaoId"
              value={qual}
              onChange={(e) => setQual(e.target.value)}
              className="h-10 w-full rounded-md border bg-transparent px-3 text-base"
            >
              {cartoes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.disponivel)} livres
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="compra-desc">Do que é a compra</Label>
            <Input
              id="compra-desc"
              name="descricao"
              placeholder="ex.: embalagens, anúncio, pedido do fornecedor"
              className="text-base"
              autoFocus
              aria-invalid={!!erros.descricao}
            />
            {erros.descricao && <p className="text-sm text-destructive">{erros.descricao[0]}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="compra-valor">Valor total</Label>
              <Input
                id="compra-valor"
                name="valor"
                inputMode="decimal"
                value={valor}
                onChange={(e) => setValor(e.target.value)}
                placeholder="0,00"
                className="text-base"
                aria-invalid={!!erros.valor}
              />
              {erros.valor && <p className="text-sm text-destructive">{erros.valor[0]}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compra-cat">Categoria</Label>
              <select
                id="compra-cat"
                className="h-10 w-full rounded-md border bg-transparent px-3 text-base"
                value={categoria}
                onChange={(e) => setCategoria(e.target.value)}
              >
                {CATEGORIAS_SAIDA.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {categoria === CATEGORIA_LIVRE && (
            <div className="space-y-1.5">
              <Label htmlFor="compra-cat-livre">Qual categoria?</Label>
              <Input
                id="compra-cat-livre"
                value={categoriaLivre}
                onChange={(e) => setCategoriaLivre(e.target.value)}
                placeholder="ex.: manutenção, brinde"
                className="text-base"
                maxLength={40}
              />
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="compra-parcelas">Em quantas vezes</Label>
              <Input
                id="compra-parcelas"
                name="parcelas"
                inputMode="numeric"
                value={parcelas}
                onChange={(e) => setParcelas(e.target.value.replace(/\D/g, "") || "1")}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="compra-data">Data da compra</Label>
              <Input
                id="compra-data"
                name="dataCompra"
                type="date"
                defaultValue={campoDaData()}
                className="text-base"
              />
            </div>
          </div>

          {total > 0 && cartao && (
            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {n > 1 ? (
                <>
                  {n}× de <strong className="text-foreground">{brl(total / n)}</strong>, uma por
                  fatura.
                </>
              ) : (
                <>
                  Uma parcela de <strong className="text-foreground">{brl(total)}</strong>.
                </>
              )}{" "}
              A primeira cai na fatura que vence em{" "}
              <strong className="text-foreground">{fData(vencimentoDaFatura(cartao))}</strong>.
            </p>
          )}

          {passa && cartao && (
            <p className="rounded-lg border border-(--ll-danger) px-3 py-2.5 text-xs text-destructive">
              Passa do limite livre de {brl(cartao.disponivel)}.
            </p>
          )}

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Lançando…" : "Lançar compra"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
