"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeftRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { campoDaData } from "@/lib/dia";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { brl } from "@/lib/formato";
import { transferirAction } from "../financeiro.actions";
import type { CarteiraSaldo } from "../financeiro.tipos";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Mover dinheiro entre carteiras. Não é entrada nem saída da loja: o total
 * não muda, só o lugar onde o dinheiro está. Por isso a transferência aparece
 * no extrato sem sinal de mais nem de menos.
 */
export function FormTransferencia({ carteiras }: { carteiras: CarteiraSaldo[] }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

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
      <DialogTrigger render={<Button variant="ghost" />}>
        <ArrowLeftRight className="mr-1.5 size-4" aria-hidden />
        Transferir
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transferir entre carteiras</DialogTitle>
          <DialogDescription>
            O dinheiro muda de lugar. O total da loja não muda.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            salvar(async () => {
              const r = await transferirAction(fd);
              if (r.ok) {
                setAberto(false);
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
            <Label htmlFor="origemId">De</Label>
            <select
              id="origemId"
              name="origemId"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              defaultValue={carteiras[0]?.id}
            >
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.saldo)}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="destinoId">Para</Label>
            <select
              id="destinoId"
              name="destinoId"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              defaultValue={carteiras[1]?.id}
              aria-invalid={!!erros.destinoId}
            >
              {carteiras.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nome} · {brl(c.saldo)}
                </option>
              ))}
            </select>
            {erros.destinoId && <p className="text-sm text-destructive">{erros.destinoId[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="valor-tr">Valor</Label>
            <Input
              id="valor-tr"
              name="valor"
              inputMode="decimal"
              placeholder="0,00"
              className="text-base"
              aria-invalid={!!erros.valor}
            />
            {erros.valor && <p className="text-sm text-destructive">{erros.valor[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="data-tr">Data</Label>
            <Input
              id="data-tr"
              name="data"
              type="date"
              defaultValue={campoDaData()}
              className="text-base"
            />
          </div>

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
              {salvando ? "Transferindo…" : "Transferir"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
