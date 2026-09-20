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
import { arquivarCartaoAction, salvarCartaoAction } from "../cartao.actions";
import type { CartaoResumo } from "../financeiro.tipos";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Cadastro do cartão.
 *
 * Formulário próprio, separado do de carteira, porque as perguntas são
 * outras: cartão não tem saldo, tem LIMITE; e precisa do dia do vencimento
 * para saber em que fatura cada compra cai.
 */
export function FormCartao({ cartao, rotulo }: { cartao?: CartaoResumo; rotulo?: string }) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const editando = !!cartao;

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
            <Button variant="ghost" size="sm" aria-label={`Editar ${cartao.nome}`} />
          ) : rotulo ? (
            <Button variant="outline" />
          ) : (
            <Button className="w-full" />
          )
        }
      >
        {editando ? (
          <>
            <Pencil className="mr-1 size-3.5" aria-hidden />
            Editar
          </>
        ) : (
          (rotulo ?? "Novo cartão")
        )}
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editando ? "Editar cartão" : "Novo cartão de crédito"}</DialogTitle>
          <DialogDescription>
            Limite é quanto dá para gastar, não dinheiro em caixa. Cada compra vira uma conta a
            pagar na fatura certa.
          </DialogDescription>
        </DialogHeader>

        <form
          action={(fd) => {
            salvar(async () => {
              const r = await salvarCartaoAction(cartao?.id ?? null, fd);
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
            <Label htmlFor="cartao-nome">Nome</Label>
            <Input
              id="cartao-nome"
              name="nome"
              defaultValue={cartao?.nome}
              placeholder="ex.: Nubank, Itaú Gold"
              className="text-base"
              autoFocus
              aria-invalid={!!erros.nome}
            />
            {erros.nome && <p className="text-sm text-destructive">{erros.nome[0]}</p>}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="cartao-limite">Limite</Label>
              <Input
                id="cartao-limite"
                name="limite"
                inputMode="decimal"
                defaultValue={cartao ? String(cartao.limite).replace(".", ",") : ""}
                placeholder="0,00"
                className="text-base"
                aria-invalid={!!erros.limite}
              />
              {erros.limite && <p className="text-sm text-destructive">{erros.limite[0]}</p>}
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="cartao-usado">Já comprometido</Label>
              <Input
                id="cartao-usado"
                name="usadoInicial"
                inputMode="decimal"
                defaultValue={cartao ? String(cartao.usadoInicial).replace(".", ",") : ""}
                placeholder="0,00"
                className="text-base"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            “Já comprometido” é o que você devia no cartão antes de começar a usar o app. Sem isso o
            limite aparece inteiro no primeiro dia.
          </p>

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="space-y-1.5">
              <Label htmlFor="cartao-venc">Vence dia</Label>
              <Input
                id="cartao-venc"
                name="diaVencimento"
                inputMode="numeric"
                defaultValue={String(cartao?.diaVencimento ?? 10)}
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cartao-fech">Fecha dia</Label>
              <Input
                id="cartao-fech"
                name="diaFechamento"
                inputMode="numeric"
                defaultValue={cartao?.diaFechamento ? String(cartao.diaFechamento) : ""}
                placeholder="opcional"
                className="text-base"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="cartao-validade">Validade</Label>
              <Input
                id="cartao-validade"
                name="validade"
                type="month"
                defaultValue={cartao?.validade ?? ""}
                className="text-base"
              />
            </div>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            O dia do fechamento é o que decide se a compra de hoje cai nesta fatura ou na próxima.
            Sem ele, vale o próximo vencimento.
          </p>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex items-center justify-between gap-2 pt-1">
            {editando ? (
              <Button
                type="button"
                variant="ghost"
                className="text-destructive"
                disabled={salvando}
                onClick={() =>
                  salvar(async () => {
                    const r = await arquivarCartaoAction(cartao.id);
                    if (r.ok) {
                      setAberto(false);
                      router.refresh();
                    } else {
                      setAviso(r.error.message);
                    }
                  })
                }
              >
                Arquivar
              </Button>
            ) : (
              <span />
            )}
            <span className="flex gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando}>
                {salvando ? "Salvando…" : "Salvar"}
              </Button>
            </span>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
