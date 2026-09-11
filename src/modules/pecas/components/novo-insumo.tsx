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
import { salvarInsumoAction } from "../peca.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * `formInsumo` do app antigo. Insumo é mais simples que peça: não tem
 * fornecedor, nem tamanho, nem foto — tem nome, unidade, custo e mínimo.
 *
 * O custo do insumo é digitado direto (não é código × fator): saquinho não
 * vem com código de fornecedor.
 */
export function NovoInsumo({
  insumo,
  rotulo,
}: {
  insumo?: { id: string; nome: string; unidade: string; minimo: number; custo: number | null };
  rotulo?: string;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  function enviar(fd: FormData) {
    salvar(async () => {
      const r = await salvarInsumoAction(insumo?.id ?? null, fd);
      if (r.ok) {
        setAberto(false);
        router.refresh();
        return;
      }
      if (r.error.fields) setErros(r.error.fields);
      else setAviso(r.error.message);
    });
  }

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
      <DialogTrigger render={rotulo ? <Button /> : <Button className="w-full sm:w-auto" />}>
        {rotulo ?? (insumo ? "Editar insumo" : "Novo insumo")}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{insumo ? "Editar insumo" : "Novo insumo"}</DialogTitle>
          <DialogDescription>
            O que a loja gasta para vender: saquinho, caixinha, laço, etiqueta.
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="space-y-4">
          <Campo
            id="nome"
            rotulo="Nome"
            defaultValue={insumo?.nome}
            erro={erros.nome?.[0]}
            placeholder="ex.: Caixinha de veludo"
            autoFocus
            required
          />

          <div className="grid grid-cols-2 gap-3">
            <Campo
              id="unidade"
              rotulo="Unidade"
              defaultValue={insumo?.unidade ?? "un"}
              erro={erros.unidade?.[0]}
              placeholder="un"
              dica="un, cx, m, par…"
            />
            <Campo
              id="minimo"
              rotulo="Estoque mínimo"
              defaultValue={insumo?.minimo ? String(insumo.minimo) : ""}
              erro={erros.minimo?.[0]}
              inputMode="numeric"
              placeholder="0"
              dica="avisa quando chegar aqui"
            />
          </div>

          <Campo
            id="custo"
            rotulo="Custo por unidade"
            defaultValue={insumo?.custo ? String(insumo.custo).replace(".", ",") : ""}
            erro={erros.custo?.[0]}
            inputMode="decimal"
            placeholder="0,00"
          />

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
              {salvando ? "Salvando…" : "Salvar insumo"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Campo({
  id,
  rotulo,
  erro,
  dica,
  ...props
}: { id: string; rotulo: string; erro?: string; dica?: string } & React.ComponentProps<
  typeof Input
>) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{rotulo}</Label>
      <Input id={id} name={id} aria-invalid={!!erro} className="text-base" {...props} />
      {erro && <p className="text-sm text-destructive">{erro}</p>}
      {!erro && dica && <p className="text-xs text-muted-foreground">{dica}</p>}
    </div>
  );
}
