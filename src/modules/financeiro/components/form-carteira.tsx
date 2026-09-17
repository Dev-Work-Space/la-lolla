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
import { TIPOS_CARTEIRA, type TipoCarteira } from "../financeiro.tipos";
import type { ErrosDeCampo } from "@/lib/result";

export function FormCarteira({
  carteira,
  rotulo,
}: {
  carteira?: { id: string; nome: string; saldoInicial: number; tipo: TipoCarteira };
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

          {/* Cartão de crédito NÃO entra nesta lista: ele pede limite,
              fechamento e vencimento, e tem formulário próprio. Aqui só o que
              de fato guarda dinheiro. */}
          <div className="space-y-1.5">
            <Label htmlFor="carteira-tipo">Tipo</Label>
            <select
              id="carteira-tipo"
              name="tipo"
              defaultValue={carteira?.tipo ?? "CONTA"}
              className="h-10 w-full rounded-md border bg-transparent px-3 text-base"
            >
              {TIPOS_CARTEIRA.filter(([id]) => id !== "CARTAO").map(([id, nome]) => (
                <option key={id} value={id}>
                  {nome}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Carteira é onde o dinheiro está, não como o cliente pagou. A reserva conta no total,
              mas não é caixa do dia a dia.
            </p>
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
              {salvando ? "Salvando…" : "Salvar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
