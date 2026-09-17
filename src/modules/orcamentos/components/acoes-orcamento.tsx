"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  excluirOrcamentoAction,
  mudarStatusOrcamentoAction,
  revisarOrcamentoAction,
} from "../orcamento.actions";

/*
 * O que dá para fazer com um orçamento, e quando.
 *
 * A regra que organiza os botões: orçamento ABERTO é negociação viva — dá
 * para editar, revisar, recusar, converter e excluir. Depois que ele vira
 * venda ou é substituído, vira histórico: fica só o caminho para o que tomou
 * o lugar dele.
 */
export function AcoesOrcamento({
  orcamento,
  pode,
}: {
  orcamento: {
    id: string;
    rotulo: string;
    status: "ABERTO" | "CONVERTIDO" | "RECUSADO" | "SUBSTITUIDO";
    vencido: boolean;
    vendaId: string | null;
    substituidoPor: { id: string; numero: number } | null;
    itens: number;
  };
  pode: { criar: boolean; editar: boolean; excluir: boolean };
}) {
  const { status } = orcamento;

  if (status === "CONVERTIDO") {
    return (
      <div className="flex flex-wrap gap-2">
        {orcamento.vendaId && (
          <Button nativeButton={false} render={<Link href={`/vendas/${orcamento.vendaId}`} />}>
            Abrir a venda
          </Button>
        )}
      </div>
    );
  }

  if (status === "SUBSTITUIDO") {
    return (
      <div className="flex flex-wrap gap-2">
        {orcamento.substituidoPor && (
          <Button
            nativeButton={false}
            render={<Link href={`/orcamentos/${orcamento.substituidoPor.id}`} />}
          >
            Abrir a revisão
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {pode.criar && orcamento.itens > 0 && (
        <Button
          nativeButton={false}
          render={<Link href={`/vendas/nova?orcamento=${orcamento.id}`} />}
        >
          Converter em venda
        </Button>
      )}
      {pode.editar && (
        <Button
          variant="outline"
          nativeButton={false}
          render={<Link href={`/orcamentos/${orcamento.id}/editar`} />}
        >
          Editar
        </Button>
      )}
      {pode.criar && <Revisar id={orcamento.id} rotulo={orcamento.rotulo} />}
      {pode.editar && (
        <MudarStatus
          id={orcamento.id}
          para={status === "RECUSADO" ? "ABERTO" : "RECUSADO"}
        />
      )}
      {pode.excluir && <Excluir id={orcamento.id} rotulo={orcamento.rotulo} />}
    </div>
  );
}

/* ─────────────── revisar ─────────────── */

function Revisar({ id, rotulo }: { id: string; rotulo: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [indo, ir] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="outline">Revisar</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Revisar orçamento</DialogTitle>
          <DialogDescription>
            Nasce um orçamento novo, com número novo e as mesmas peças, e o {rotulo} fica marcado
            como substituído. O PDF que a cliente já recebeu continua valendo o que dizia — por
            isso ele não é alterado no lugar.
          </DialogDescription>
        </DialogHeader>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            disabled={indo}
            onClick={() =>
              ir(async () => {
                const r = await revisarOrcamentoAction(id);
                if (r.ok) {
                  setAberto(false);
                  router.push(`/orcamentos/${r.data.id}`);
                  router.refresh();
                } else {
                  setAviso(r.error.message);
                }
              })
            }
          >
            {indo ? "Criando…" : "Criar revisão"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── recusar / reabrir ─────────────── */

function MudarStatus({ id, para }: { id: string; para: "RECUSADO" | "ABERTO" }) {
  const router = useRouter();
  const [aviso, setAviso] = useState<string | null>(null);
  const [indo, ir] = useTransition();
  const recusando = para === "RECUSADO";

  return (
    <span className="inline-flex flex-col gap-1">
      <Button
        variant="outline"
        disabled={indo}
        onClick={() =>
          ir(async () => {
            const r = await mudarStatusOrcamentoAction(id, para);
            if (r.ok) router.refresh();
            else setAviso(r.error.message);
          })
        }
      >
        {indo ? "…" : recusando ? "Marcar como recusado" : "Reabrir"}
      </Button>
      {aviso && (
        <span role="alert" className="text-xs font-medium text-destructive">
          {aviso}
        </span>
      )}
    </span>
  );
}

/* ─────────────── excluir ─────────────── */

function Excluir({ id, rotulo }: { id: string; rotulo: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [indo, ir] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="ghost">Excluir</Button>} />
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Excluir o {rotulo}?</DialogTitle>
          <DialogDescription>
            O orçamento sai da lista e as peças que ele segurava voltam a ficar livres. Diferente
            da venda, o orçamento pode ser apagado: ele é papel de negociação, não histórico de
            dinheiro.
          </DialogDescription>
        </DialogHeader>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={indo}
            onClick={() =>
              ir(async () => {
                const r = await excluirOrcamentoAction(id);
                if (r.ok) {
                  setAberto(false);
                  router.push("/vendas?aba=orcamentos");
                  router.refresh();
                } else {
                  setAviso(r.error.message);
                }
              })
            }
          >
            {indo ? "Excluindo…" : "Excluir orçamento"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
