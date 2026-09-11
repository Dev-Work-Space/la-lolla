"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { brl } from "@/lib/formato";
import { baixarContaAction } from "../financeiro.actions";
import type { CarteiraSaldo } from "../financeiro.tipos";

/*
 * Dar baixa. Diferente da venda, aqui o comprovante é regra rígida — foi
 * decisão do João: na venda a cliente está esperando e o comprovante vira
 * pendência; dar baixa é ato de CONFERÊNCIA, e sem o papel não se confere
 * nada depois.
 *
 * O upload de arquivo ainda não existe no app novo. Até existir, a baixa
 * exige escolher a carteira (de onde o dinheiro saiu ou para onde entrou) e
 * avisa em texto que o comprovante ainda será obrigatório. Prefiro a tela
 * dizer a verdade sobre o que ainda falta a fingir que a regra já está inteira.
 */
export function BaixarConta({
  contaId,
  descricao,
  valor,
  tipo,
  carteiras,
}: {
  contaId: string;
  descricao: string;
  valor: number;
  tipo: "PAGAR" | "RECEBER";
  carteiras: CarteiraSaldo[];
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();

  const pagar = tipo === "PAGAR";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Dar baixa em ${descricao}`}
        onClick={() => {
          setAviso(null);
          setAberto(true);
        }}
      >
        <Check className="size-4 text-muted-foreground" />
      </Button>

      <Dialog open={aberto} onOpenChange={setAberto}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{pagar ? "Dar baixa no pagamento" : "Registrar o recebimento"}</DialogTitle>
            <DialogDescription>
              <strong className="text-foreground">{descricao}</strong> · {brl(valor)}
            </DialogDescription>
          </DialogHeader>

          <form
            action={(fd) => {
              fd.set("contaId", contaId);
              salvar(async () => {
                const r = await baixarContaAction(fd);
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
              <Label htmlFor={`cart-${contaId}`}>
                {pagar ? "De qual carteira saiu" : "Em qual carteira entrou"}
              </Label>
              <select
                id={`cart-${contaId}`}
                name="carteiraId"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                defaultValue={carteiras[0]?.id ?? ""}
                required
              >
                {carteiras.length === 0 && <option value="">Nenhuma carteira cadastrada</option>}
                {carteiras.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nome} · {brl(c.saldo)}
                  </option>
                ))}
              </select>
            </div>

            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              A baixa vira um lançamento na carteira escolhida — o saldo muda de verdade.
              <br />
              <strong className="text-foreground">Anexar comprovante</strong> ainda não está pronto
              no app novo; quando estiver, passa a ser obrigatório aqui.
            </p>

            {aviso && (
              <p role="alert" className="text-sm font-medium text-destructive">
                {aviso}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={() => setAberto(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={salvando || carteiras.length === 0}>
                {salvando ? "Gravando…" : pagar ? "Dar baixa" : "Registrar"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
