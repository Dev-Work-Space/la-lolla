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
import { cn } from "@/lib/utils";
import { brl } from "@/lib/formato";
import { cancelarVendaAction, devolverAction, receberAction } from "../venda.actions";

type Forma = "DINHEIRO" | "PIX" | "DEBITO" | "CREDITO";
const FORMAS: Array<[Forma, string]> = [
  ["DINHEIRO", "Dinheiro"],
  ["PIX", "Pix"],
  ["DEBITO", "Débito"],
  ["CREDITO", "Crédito"],
];

export function AcoesVenda({
  vendaId,
  numero,
  saldo,
  pode,
  itens,
}: {
  vendaId: string;
  numero: number;
  saldo: number;
  pode: { editar: boolean; cancelar: boolean };
  itens: Array<{ id: string; nome: string; podeVoltar: number }>;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {pode.editar && saldo > 0 && <Receber vendaId={vendaId} saldo={saldo} />}
      {pode.editar && itens.some((i) => i.podeVoltar > 0) && <Devolver itens={itens} />}
      {pode.cancelar && <Cancelar vendaId={vendaId} numero={numero} />}
    </div>
  );
}

/* ─────────────── receber ─────────────── */

function Receber({ vendaId, saldo }: { vendaId: string; saldo: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [forma, setForma] = useState<Forma>("PIX");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button />}>Receber</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Receber pagamento</DialogTitle>
          <DialogDescription>Falta {brl(saldo)} nesta venda.</DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("vendaId", vendaId);
            fd.set("forma", forma);
            salvar(async () => {
              const r = await receberAction(fd);
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
          <div className="space-y-1.5">
            <Label>Forma</Label>
            <div className="flex flex-wrap gap-1">
              {FORMAS.map(([v, r]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={forma === v}
                  onClick={() => setForma(v)}
                  className={cn(
                    "rounded-full border px-3 py-1.5 text-xs font-medium",
                    forma === v
                      ? "border-foreground bg-foreground text-background"
                      : "text-muted-foreground",
                  )}
                >
                  {r}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valor">Valor</Label>
            <Input
              id="valor"
              name="valor"
              inputMode="decimal"
              defaultValue={String(saldo).replace(".", ",")}
              className="text-base"
              autoFocus
            />
          </div>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando}>
              {salvando ? "Registrando…" : "Registrar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── devolver ─────────────── */

function Devolver({ itens }: { itens: Array<{ id: string; nome: string; podeVoltar: number }> }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [qtds, setQtds] = useState<Record<string, string>>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const disponiveis = itens.filter((i) => i.podeVoltar > 0);

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="secondary" />}>Devolver</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Devolver peça</DialogTitle>
          <DialogDescription>
            A peça volta ao estoque e o valor abate do total. O item continua no histórico da
            venda.
          </DialogDescription>
        </DialogHeader>

        <div className="divide-y rounded-lg border">
          {disponiveis.map((i) => (
            <div key={i.id} className="flex items-center gap-3 px-3 py-2.5">
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{i.nome}</span>
                <span className="block text-xs text-muted-foreground">
                  até {i.podeVoltar} unidade{i.podeVoltar === 1 ? "" : "s"}
                </span>
              </span>
              <Input
                aria-label={`Devolver de ${i.nome}`}
                inputMode="numeric"
                className="w-16 text-center text-base"
                placeholder="0"
                value={qtds[i.id] ?? ""}
                onChange={(e) =>
                  setQtds((a) => ({ ...a, [i.id]: e.target.value.replace(/\D/g, "") }))
                }
              />
            </div>
          ))}
        </div>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Cancelar
          </Button>
          <Button
            disabled={salvando}
            onClick={() =>
              salvar(async () => {
                setAviso(null);
                const alvos = Object.entries(qtds).filter(([, q]) => Number(q) > 0);
                if (alvos.length === 0) {
                  setAviso("Informe quantas unidades voltar.");
                  return;
                }
                for (const [itemId, q] of alvos) {
                  const r = await devolverAction(itemId, Number(q));
                  if (!r.ok) {
                    setAviso(r.error.message);
                    return;
                  }
                }
                setAberto(false);
                setQtds({});
                router.refresh();
              })
            }
          >
            {salvando ? "Devolvendo…" : "Confirmar devolução"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ─────────────── cancelar ─────────────── */

function Cancelar({ vendaId, numero }: { vendaId: string; numero: number }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [motivo, setMotivo] = useState("");
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  return (
    <Dialog open={aberto} onOpenChange={setAberto}>
      <DialogTrigger render={<Button variant="ghost" />}>Cancelar venda</DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Cancelar a venda #{numero}</DialogTitle>
          <DialogDescription>
            A venda <strong className="text-foreground">não é apagada</strong>: fica no histórico,
            some de todo cálculo de dinheiro, e as peças voltam ao estoque. As parcelas em aberto
            são canceladas.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1.5">
          <Label htmlFor="motivo">Por quê?</Label>
          <Input
            id="motivo"
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="ex.: cliente desistiu"
            className="text-base"
            autoFocus
          />
          <p className="text-xs text-muted-foreground">Fica registrado no histórico.</p>
        </div>

        {aviso && (
          <p role="alert" className="text-sm font-medium text-destructive">
            {aviso}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setAberto(false)}>
            Voltar
          </Button>
          <Button
            variant="destructive"
            disabled={salvando || motivo.trim().length < 3}
            onClick={() =>
              salvar(async () => {
                const r = await cancelarVendaAction(vendaId, motivo);
                if (r.ok) {
                  setAberto(false);
                  router.refresh();
                } else {
                  setAviso(r.error.message);
                }
              })
            }
          >
            {salvando ? "Cancelando…" : "Cancelar venda"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
