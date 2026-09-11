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
import { criarContaAction } from "../financeiro.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Lançar uma conta. Com mais de uma parcela, cria uma conta por mês — e a
 * sobra de centavos vai na PRIMEIRA, não na última, mesma regra do
 * parcelamento de venda.
 */
export function FormConta({
  tipo,
  rotulo,
}: {
  tipo: "PAGAR" | "RECEBER";
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const pagar = tipo === "PAGAR";
  const hoje = new Date();
  const proximo = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() + 7)
    .toISOString()
    .slice(0, 10);

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
      <DialogTrigger render={rotulo ? <Button /> : <Button className="w-full" />}>
        {rotulo ?? (pagar ? "Nova conta a pagar" : "Novo recebimento")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pagar ? "Nova conta a pagar" : "Novo recebimento"}</DialogTitle>
          <DialogDescription>
            {pagar
              ? "O que a loja tem para pagar. O app avisa quando o vencimento chegar."
              : "Algo a receber que não veio de uma venda do app."}
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            fd.set("tipo", tipo);
            salvar(async () => {
              const r = await criarContaAction(fd);
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
            <Label htmlFor="descricao-c">Do que se trata</Label>
            <Input
              id="descricao-c"
              name="descricao"
              placeholder={pagar ? "ex.: aluguel de outubro" : "ex.: acerto com a consultora"}
              className="text-base"
              autoFocus
              aria-invalid={!!erros.descricao}
            />
            {erros.descricao && <p className="text-sm text-destructive">{erros.descricao[0]}</p>}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="valor-c">Valor total</Label>
              <Input
                id="valor-c"
                name="valor"
                inputMode="decimal"
                placeholder="0,00"
                className="text-base"
                aria-invalid={!!erros.valor}
              />
              {erros.valor && <p className="text-sm text-destructive">{erros.valor[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="parcelas-c">Parcelas</Label>
              <Input
                id="parcelas-c"
                name="parcelas"
                inputMode="numeric"
                defaultValue="1"
                className="text-base"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="vencimento-c">Primeiro vencimento</Label>
            <Input
              id="vencimento-c"
              name="vencimento"
              type="date"
              defaultValue={proximo}
              className="text-base"
              aria-invalid={!!erros.vencimento}
            />
            {erros.vencimento && <p className="text-sm text-destructive">{erros.vencimento[0]}</p>}
            <p className="text-xs text-muted-foreground">
              Com mais de uma parcela, as seguintes vencem de mês em mês.
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
              {salvando ? "Lançando…" : "Lançar"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
