"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownToLine, ArrowUpFromLine, ClipboardCheck } from "lucide-react";
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
import { movimentarAction, saldoAtualAction } from "../peca.actions";
import type { ErrosDeCampo } from "@/lib/result";

/*
 * Mexer no estoque. Três modos, e a diferença entre eles importa:
 *
 *   Entrada    — chegou peça (compra, devolução do cliente)
 *   Saída      — saiu peça sem ser venda (perda, uso, brinde)
 *   Inventário — contei a prateleira e o número é ESTE
 *
 * Nos dois primeiros a pessoa informa QUANTAS unidades. No inventário informa
 * o TOTAL contado, e o app grava a diferença — assim o histórico continua
 * explicando de onde saiu cada unidade, em vez de um saldo sobrescrito.
 *
 * Este é o ponto em que a regra "estoque só muda por movimento" vira tela:
 * não existe campo "saldo" editável em lugar nenhum do app.
 */

type Modo = "entrada" | "saida" | "inventario";

const MOTIVOS: Record<Modo, Array<[string, string]>> = {
  entrada: [
    ["COMPRA", "Compra de fornecedor"],
    ["DEVOLUCAO", "Devolução de cliente"],
    ["AJUSTE", "Ajuste"],
  ],
  saida: [
    ["PERDA", "Perda, quebra ou roubo"],
    ["AJUSTE", "Ajuste"],
    ["VENDA", "Venda fora do app"],
  ],
  inventario: [["INVENTARIO", "Contagem de prateleira"]],
};

export function FormMovimento({
  pecaId,
  nome,
  saldo: saldoInicial,
  unidade = "un",
}: {
  pecaId: string;
  nome: string;
  saldo: number;
  unidade?: string;
}) {
  // O saldo da prop é o do último render do servidor. Ao abrir, buscamos o
  // de agora — ver o comentário de `saldoAtualAction`.
  const [saldo, setSaldo] = useState(saldoInicial);
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<Modo>("entrada");
  const [quantidade, setQuantidade] = useState("");
  const [erros, setErros] = useState<ErrosDeCampo>({});
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const n = Number(quantidade.replace(",", ".")) || 0;
  const novoSaldo =
    modo === "inventario" ? n : modo === "entrada" ? saldo + n : saldo - n;
  const diferenca = novoSaldo - saldo;

  function enviar(fd: FormData) {
    fd.set("pecaId", pecaId);
    fd.set("tipo", modo);
    salvar(async () => {
      const r = await movimentarAction(fd);
      if (r.ok) {
        setAberto(false);
        setQuantidade("");
        router.refresh();
        return;
      }
      if (r.error.fields) setErros(r.error.fields);
      else setAviso(r.error.message);
    });
  }

  const MODOS: Array<[Modo, string, typeof ArrowDownToLine]> = [
    ["entrada", "Entrada", ArrowDownToLine],
    ["saida", "Saída", ArrowUpFromLine],
    ["inventario", "Inventário", ClipboardCheck],
  ];

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setModo("entrada");
          setQuantidade("");
          setErros({});
          setAviso(null);
          setSaldo(saldoInicial);
          saldoAtualAction(pecaId).then((r) => {
            if (r.ok) setSaldo(r.data.saldo);
          });
        }
      }}
    >
      <DialogTrigger render={<Button />}>Mexer no estoque</DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Mexer no estoque</DialogTitle>
          <DialogDescription>
            {nome} · saldo atual {saldo} {unidade}
          </DialogDescription>
        </DialogHeader>

        <form action={enviar} className="space-y-4">
          <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
            {MODOS.map(([valor, rotulo, Icone]) => (
              <button
                key={valor}
                type="button"
                aria-pressed={modo === valor}
                onClick={() => {
                  setModo(valor);
                  setAviso(null);
                }}
                className={cn(
                  "flex flex-col items-center gap-1 rounded-md px-2 py-2 text-xs font-medium transition-colors",
                  modo === valor
                    ? "bg-accent text-accent-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                <Icone className="size-4" aria-hidden />
                {rotulo}
              </button>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="quantidade">
              {modo === "inventario" ? "Quantas você contou" : "Quantas unidades"}
            </Label>
            <Input
              id="quantidade"
              name="quantidade"
              inputMode="numeric"
              value={quantidade}
              onChange={(e) => {
                setQuantidade(e.target.value.replace(/\D/g, ""));
                setErros({});
                setAviso(null);
              }}
              placeholder="0"
              autoFocus
              aria-invalid={!!erros.quantidade}
              className="text-base"
            />
            {erros.quantidade && (
              <p className="text-sm text-destructive">{erros.quantidade[0]}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="motivo">Motivo</Label>
            <select
              id="motivo"
              name="motivo"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              defaultValue={MOTIVOS[modo][0][0]}
              key={modo}
            >
              {MOTIVOS[modo].map(([v, r]) => (
                <option key={v} value={v}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="observacao">Observação</Label>
            <Input
              id="observacao"
              name="observacao"
              placeholder="opcional"
              className="text-base"
            />
          </div>

          {/* Mostra o resultado ANTES de gravar: o número que vai ficar. */}
          {quantidade !== "" && (
            <div className="rounded-lg border bg-muted/40 px-3 py-2.5 text-sm">
              <span className="text-muted-foreground">Saldo depois: </span>
              <strong className={cn("tabular-nums", novoSaldo < 0 && "text-destructive")}>
                {novoSaldo} {unidade}
              </strong>
              {modo === "inventario" && diferenca !== 0 && (
                <span className="text-muted-foreground">
                  {" "}
                  ({diferenca > 0 ? "+" : ""}
                  {diferenca} de diferença)
                </span>
              )}
              {novoSaldo < 0 && (
                <p className="mt-1 text-xs text-destructive">
                  Vai ficar negativo. Confira a quantidade.
                </p>
              )}
            </div>
          )}

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={salvando || n <= 0}>
              {salvando ? "Gravando…" : "Gravar movimento"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
