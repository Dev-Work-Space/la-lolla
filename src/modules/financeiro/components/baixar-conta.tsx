"use client";

import { Seletor } from "@/components/padrao/seletor";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CheckIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { CampoComprovante } from "./campo-comprovante";
import { campoDaData } from "@/lib/dia";
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
 * Dar baixa. O comprovante é regra rígida — decisão do João: dar baixa é ato
 * de CONFERÊNCIA, e sem o papel não se confere nada depois. Foto da câmera ou
 * da galeria, anexada aqui mesmo. Só o DINHEIRO VIVO dispensa: parcela de
 * venda paga em dinheiro, ou carteira "espécie" (a gaveta).
 *
 * O campo aparece só quando é exigido; quem barra de verdade é o servidor.
 */
export function BaixarConta({
  contaId,
  descricao,
  valor,
  tipo,
  carteiras,
  deVenda = false,
}: {
  contaId: string;
  descricao: string;
  valor: number;
  tipo: "PAGAR" | "RECEBER";
  carteiras: CarteiraSaldo[];
  /** Parcela de uma venda a prazo: a baixa vira pagamento DA VENDA. */
  deVenda?: boolean;
}) {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [salvando, salvar] = useTransition();
  const [carteiraId, setCarteiraId] = useState(carteiras[0]?.id ?? "");
  const [forma, setForma] = useState("DINHEIRO");
  const [comprovanteId, setComprovanteId] = useState<string | null>(null);
  const [faltou, setFaltou] = useState(false);

  const pagar = tipo === "PAGAR";
  const tipoDaCarteira = carteiras.find((c) => c.id === carteiraId)?.tipo;
  /* Mesma regra do servidor: parcela de venda olha a FORMA, o resto olha a carteira. */
  const precisaComprovante = deVenda ? forma !== "DINHEIRO" : tipoDaCarteira !== "ESPECIE";

  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        aria-label={`Dar baixa em ${descricao}`}
        onClick={() => {
          setAviso(null);
          setFaltou(false);
          setComprovanteId(null);
          setAberto(true);
        }}
      >
        <CheckIcon weight="regular" className="size-4 text-muted-foreground" />
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
              if (precisaComprovante && !comprovanteId) {
                setFaltou(true);
                return;
              }
              fd.set("contaId", contaId);
              if (comprovanteId) fd.set("comprovanteId", comprovanteId);
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
              <Label htmlFor={`data-${contaId}`}>Data</Label>
              <Input
                id={`data-${contaId}`}
                name="data"
                type="date"
                defaultValue={campoDaData()}
                className="text-base"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor={`cart-${contaId}`}>
                {pagar ? "De qual carteira saiu" : "Em qual carteira entrou"}
              </Label>
              <Seletor
                id={`cart-${contaId}`}
                name="carteiraId"
                className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                value={carteiraId}
                onValueChange={setCarteiraId}
                required
                opcoes={[
                  ...(carteiras.length === 0 ? [{ value: "", label: "Nenhuma carteira cadastrada" }] : []),
                  ...carteiras.map((c) => ({ value: c.id, label: <>{c.nome} · {brl(c.saldo)}</> }))
                ]}
              />
            </div>

            {/*
              Parcela de venda pergunta COMO a cliente pagou. Não é detalhe: a
              baixa aqui vira o pagamento da venda, e pagamento tem forma — é
              ela que decide se o comprovante fica pendente (Pix, débito e
              crédito pedem; dinheiro não).
            */}
            {deVenda && (
              <div className="space-y-1.5">
                <Label htmlFor={`forma-${contaId}`}>Como a cliente pagou</Label>
                <Seletor
                  id={`forma-${contaId}`}
                  name="forma"
                  className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
                  value={forma}
                  onValueChange={setForma}
                  opcoes={[
                    { value: "DINHEIRO", label: "Dinheiro" },
                    { value: "PIX", label: "Pix" },
                    { value: "DEBITO", label: "Débito" },
                    { value: "CREDITO", label: "Crédito" }
                  ]}
                />
              </div>
            )}

            <p className="rounded-lg border border-dashed px-3 py-2.5 text-xs leading-relaxed text-muted-foreground">
              {deVenda ? (
                <>
                  O dinheiro entra na carteira escolhida <strong>e a venda é baixada junto</strong> —
                  ela deixa de aparecer como “a receber”.
                </>
              ) : (
                <>A baixa vira um lançamento na carteira escolhida — o saldo muda de verdade.</>
              )}
            </p>

            {/* Só o dinheiro vivo dispensa o papel. */}
            {precisaComprovante ? (
              <CampoComprovante
                valor={comprovanteId}
                aoMudar={(id) => {
                  setComprovanteId(id);
                  setFaltou(false);
                }}
                obrigatorio
                erro={faltou ? "Anexe o comprovante para dar baixa." : null}
              />
            ) : (
              <p className="text-xs text-muted-foreground">Dinheiro vivo não precisa de comprovante.</p>
            )}

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
