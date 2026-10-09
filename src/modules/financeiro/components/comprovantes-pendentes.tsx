"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PaperclipIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl, data as fData } from "@/lib/formato";
import { CampoComprovante } from "./campo-comprovante";
import { anexarAoMovimentoAction } from "../comprovante.actions";
import type { PendenteDeComprovante } from "../comprovante.service";

/*
 * ESPERANDO COMPROVANTE.
 *
 * Pedido do João (08/10/2026): venda e compra se fecham sem o papel, mas o
 * dinheiro só entra — ou sai — do caixa quando ele é anexado. Esta lista é o
 * lugar onde isso acontece: cada linha é um valor que o caixa ainda não
 * enxerga, e o botão resolve na hora, com foto ou galeria.
 */

export function AnexarComprovante({
  tipo,
  id,
  descricao,
  valor,
  entrada,
  rotulo = "Anexar comprovante",
  compacto = false,
}: {
  tipo: "pagamento" | "lancamento";
  id: string;
  descricao: string;
  valor: number;
  /** Dinheiro que entra (true) ou que sai (false) do caixa, para a frase do aviso. */
  entrada: boolean;
  rotulo?: string;
  compacto?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [comprovanteId, setComprovanteId] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  return (
    <>
      <Button
        type="button"
        variant={compacto ? "ghost" : "outline"}
        size="sm"
        aria-label={`${rotulo}: ${descricao}`}
        onClick={() => {
          setComprovanteId(null);
          setAviso(null);
          setAberto(true);
        }}
      >
        <PaperclipIcon className="mr-1.5 size-4" aria-hidden />
        {rotulo}
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Anexar o comprovante</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{descricao}</strong> · {brl(valor)}.{" "}
              {entrada
                ? "Ao anexar, esse valor entra no caixa."
                : "Ao anexar, esse valor sai do caixa."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <CampoComprovante valor={comprovanteId} aoMudar={setComprovanteId} obrigatorio />

            {aviso && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {aviso}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button
                type="button"
                disabled={salvando || !comprovanteId}
                onClick={() =>
                  salvar(async () => {
                    const r = await anexarAoMovimentoAction({ tipo, id, comprovanteId });
                    if (r.ok) {
                      setAberto(false);
                      router.refresh();
                    } else {
                      setAviso(r.error.message);
                    }
                  })
                }
              >
                {salvando ? "Anexando…" : entrada ? "Anexar e lançar no caixa" : "Anexar e baixar do caixa"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function ComprovantesPendentes({
  itens,
  entrada,
  pode,
}: {
  itens: PendenteDeComprovante[];
  entrada: boolean;
  pode: boolean;
}) {
  if (itens.length === 0) return null;
  const total = Math.round(itens.reduce((s, i) => s + i.valor, 0) * 100) / 100;

  return (
    <section
      aria-label="Esperando comprovante"
      className="space-y-2 rounded-xl border border-(--ll-accent-line) bg-(--ll-accent-soft) p-3"
    >
      <div className="flex flex-wrap items-baseline justify-between gap-x-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wide text-(--ll-accent)">
          Esperando comprovante · {itens.length}
        </h2>
        <span className="text-sm font-semibold tabular-nums">{brl(total)}</span>
      </div>
      <p className="text-xs text-muted-foreground">
        {entrada
          ? "Estes recebimentos já foram registrados, mas o dinheiro só entra no caixa quando o comprovante for anexado."
          : "Estas saídas já foram registradas, mas o dinheiro só sai do caixa quando o comprovante for anexado."}
      </p>
      <ul className="space-y-1.5">
        {itens.map((i) => (
          <li key={`${i.tipo}-${i.id}`} className="flex items-center gap-2 rounded-lg bg-card px-3 py-2">
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">
                {i.vendaId ? (
                  <Link href={`/vendas/${i.vendaId}`} className="hover:underline">
                    {i.descricao}
                  </Link>
                ) : (
                  i.descricao
                )}
              </span>
              <span className="block truncate text-xs text-muted-foreground">
                {fData(i.quando)}
                {i.carteira ? ` · ${i.carteira}` : ""}
              </span>
            </span>
            <span className="shrink-0 text-sm font-semibold tabular-nums">{brl(i.valor)}</span>
            {pode && (
              <AnexarComprovante
                tipo={i.tipo}
                id={i.id}
                descricao={i.descricao}
                valor={i.valor}
                entrada={entrada}
                rotulo="Anexar"
              />
            )}
          </li>
        ))}
      </ul>
    </section>
  );
}
