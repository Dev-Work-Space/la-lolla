"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { data } from "@/lib/formato";
import { cn } from "@/lib/utils";
import { ETAPAS_VENDA, ROTULO_ETAPA_VENDA, type EtapaVenda } from "../crm.tipos";
import { mudarEtapaVendaAction } from "../venda.actions";

/*
 * A entrega do pedido na tela da venda. É a MESMA etapa do quadro de pedidos:
 * mudar aqui move o cartão lá, e vice-versa (João, 18/11: "pra tudo se
 * comunicar"). Não mexe em estoque nem em dinheiro.
 */
export function EtapaEntrega({
  vendaId,
  etapa,
  entregueEm,
  podeEditar,
}: {
  vendaId: string;
  etapa: EtapaVenda;
  entregueEm: Date | null;
  podeEditar: boolean;
}) {
  const router = useRouter();
  const [atual, setAtual] = useState(etapa);
  const [pendente, iniciar] = useTransition();

  function mudar(nova: EtapaVenda) {
    if (nova === atual) return;
    const antes = atual;
    setAtual(nova);
    iniciar(async () => {
      const r = await mudarEtapaVendaAction({ id: vendaId, etapa: nova });
      if (!r.ok) {
        setAtual(antes);
        toast.error(r.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Card as="section" className="block overflow-visible py-0 text-base">
      <h2 className="border-b px-4 py-3 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        Entrega
      </h2>
      <div className="space-y-2 px-4 py-3">
        <div
          role="radiogroup"
          aria-label="Etapa da entrega"
          className="flex gap-1 rounded-xl border bg-(--ll-surface-2) p-1"
        >
          {ETAPAS_VENDA.map((e) => (
            <button
              key={e}
              type="button"
              role="radio"
              aria-checked={atual === e}
              disabled={!podeEditar || pendente}
              onClick={() => mudar(e)}
              className={cn(
                "flex-1 rounded-lg px-2 py-1.5 text-sm font-medium transition-colors disabled:cursor-default",
                atual === e ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground",
              )}
            >
              {ROTULO_ETAPA_VENDA[e]}
            </button>
          ))}
        </div>
        <p className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
          <span>
            {atual === "ENTREGUE" && entregueEm && etapa === "ENTREGUE"
              ? `Entregue em ${data(entregueEm)}`
              : pendente
                ? "Salvando…"
                : "O pagamento anda à parte, no Financeiro."}
          </span>
          <Link href="/vendas/quadro" className="hover:text-foreground hover:underline">
            Ver no quadro de pedidos
          </Link>
        </p>
      </div>
    </Card>
  );
}
