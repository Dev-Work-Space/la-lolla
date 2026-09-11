"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil } from "lucide-react";
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
import { salvarCarteiraAction } from "../financeiro.actions";
import type { ErrosDeCampo } from "@/lib/result";

export function FormCarteira({
  carteira,
  rotulo,
}: {
  carteira?: { id: string; nome: string; saldoInicial: number; cofrinho: boolean };
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const editando = !!carteira;

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
          editando ? (
            <Button variant="ghost" size="icon" aria-label={`Editar ${carteira.nome}`} />
          ) : rotulo ? (
            <Button />
          ) : (
            <Button className="w-full" />
          )
        }
      >
        {editando ? (
          <Pencil className="size-4 text-muted-foreground" />
        ) : (
          (rotulo ?? "Nova carteira")
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar carteira" : "Nova carteira"}</DialogTitle>
          <DialogDescription>
            Onde o dinheiro fica: Espécie, Conta do banco, Reserva.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            salvar(async () => {
              const r = await salvarCarteiraAction(carteira?.id ?? null, fd);
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
            <Label htmlFor="nome">Nome</Label>
            <Input
              id="nome"
              name="nome"
              defaultValue={carteira?.nome}
              placeholder="ex.: Conta do banco"
              className="text-base"
              autoFocus
              aria-invalid={!!erros.nome}
            />
            {erros.nome && <p className="text-sm text-destructive">{erros.nome[0]}</p>}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="saldoInicial">Saldo inicial</Label>
            <Input
              id="saldoInicial"
              name="saldoInicial"
              inputMode="decimal"
              defaultValue={carteira ? String(carteira.saldoInicial).replace(".", ",") : ""}
              placeholder="0,00"
              className="text-base"
            />
            <p className="text-xs text-muted-foreground">
              Quanto já havia aqui quando você criou. Sem isso o saldo começa em zero e nunca bate
              com a realidade.
            </p>
          </div>

          <label className="flex items-start gap-2.5">
            <input
              type="checkbox"
              name="cofrinho"
              defaultChecked={carteira?.cofrinho}
              className="mt-0.5 size-4 accent-foreground"
            />
            <span>
              <span className="block text-sm font-medium">É reserva (cofrinho)</span>
              <span className="block text-xs text-muted-foreground">
                Conta no total, mas não é caixa do dia a dia.
              </span>
            </span>
          </label>

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
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
