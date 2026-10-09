"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Seletor } from "@/components/padrao/seletor";
import { EditorDeParcelas, useParcelamento, type Parcelamento } from "@/components/padrao/parcelamento";
import { CampoComprovante } from "@/modules/financeiro/components/campo-comprovante";
import type { CarteiraSaldo } from "@/modules/financeiro/financeiro.tipos";
import { campoDaData, somaMeses } from "@/lib/dia";
import { brl } from "@/lib/formato";
import { cn } from "@/lib/utils";

/*
 * "COMO PAGOU O FORNECEDOR" — três jeitos, e o terceiro é a mistura:
 *   - À VISTA: sai tudo da carteira agora;
 *   - A PRAZO: tudo vira conta a pagar, em parcelas;
 *   - ENTRADA + PARCELAS: uma parte sai agora e o resto vira parcelas.
 * Pedido do João (08/10/2026): o pagamento "bem ajustável, também na compra".
 *
 * O dinheiro que sai AGORA pede o comprovante (foto ou galeria), a menos que
 * saia da gaveta (carteira espécie). O que fica para depois pede o
 * comprovante só quando for pago, na baixa da conta.
 */

export type ModoCompra = "avista" | "prazo" | "entrada";

const ATALHOS_ENTRADA = [20, 30, 50];
const r2 = (n: number) => Math.round(n * 100) / 100;
const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;

export function usePlanoDaCompra(total: number, carteiras: CarteiraSaldo[]) {
  const [modo, setModo] = useState<ModoCompra>("avista");
  const [carteiraEscolhida, setCarteiraEscolhida] = useState("");
  const [entrada, setEntrada] = useState("");
  const [comprovanteId, setComprovanteId] = useState<string | null>(null);
  const [faltaComprovante, setFaltaComprovante] = useState(false);

  const carteiraId = carteiraEscolhida || carteiras[0]?.id || "";
  const agora = modo === "prazo" ? 0 : modo === "avista" ? total : r2(paraNumero(entrada));
  const aPrazo = r2(total - agora);
  const tipoDaCarteira = carteiras.find((c) => c.id === carteiraId)?.tipo;
  /* Só o dinheiro vivo dispensa o comprovante. */
  const precisaComprovante = agora > 0 && tipoDaCarteira !== "ESPECIE";

  const parc = useParcelamento({
    total: aPrazo,
    parcelasIniciais: "2",
    primeiroInicial: campoDaData(somaMeses(new Date(), 1)),
  });

  return {
    modo,
    setModo,
    carteiraId,
    setCarteiraId: setCarteiraEscolhida,
    entrada,
    setEntrada,
    comprovanteId,
    setComprovanteId,
    faltaComprovante,
    setFaltaComprovante,
    agora,
    aPrazo,
    precisaComprovante,
    parc,
    /** Confere tudo e devolve o texto do problema, ou nulo se está certo. */
    problema(): string | null {
      if (total <= 0) return "O total precisa ser maior que zero.";
      if (agora > 0 && !carteiraId) return "Escolha de qual carteira o dinheiro saiu.";
      if (modo === "entrada" && (agora <= 0 || agora >= total - 0.005)) {
        return "Na entrada + parcelas, a entrada tem de ser maior que zero e menor que o total.";
      }
      if (precisaComprovante && !comprovanteId) {
        setFaltaComprovante(true);
        return "Anexe o comprovante do pagamento de agora (foto ou galeria).";
      }
      if (aPrazo > 0.005 && !parc.confere) {
        return "As parcelas não fecham com o que falta pagar. Ajuste os valores até a diferença zerar.";
      }
      return null;
    },
    /** O que vai para o servidor. */
    montar() {
      return {
        agora: agora > 0 ? { valor: agora, carteiraId, comprovanteId: precisaComprovante ? comprovanteId : null } : null,
        prazo:
          aPrazo > 0.005
            ? {
                parcelas: parc.n,
                intervalo: parc.intervalo,
                primeiroVencimento: new Date(parc.primeiro + "T12:00:00"),
                vencimentos: parc.lista.map((x) => new Date(x.vencimento + "T12:00:00")),
                valores: parc.lista.map((x) => x.valor),
              }
            : null,
      };
    },
  };
}

export type PlanoDaCompra = ReturnType<typeof usePlanoDaCompra>;

const MODOS: Array<[ModoCompra, string]> = [
  ["avista", "À vista"],
  ["prazo", "A prazo"],
  ["entrada", "Entrada + parcelas"],
];

export function PagamentoDaCompra({
  total,
  carteiras,
  plano: p,
}: {
  total: number;
  carteiras: CarteiraSaldo[];
  plano: PlanoDaCompra;
}) {
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-1 rounded-lg border p-1">
        {MODOS.map(([v, r]) => (
          <Button
            variant="ghost"
            key={v}
            type="button"
            aria-pressed={p.modo === v}
            onClick={() => p.setModo(v)}
            className={cn(
              "h-auto gap-0 rounded-md border-0 p-0 px-2 py-2 text-xs leading-tight font-medium whitespace-normal sm:text-sm",
              p.modo === v ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
            )}
          >
            {r}
          </Button>
        ))}
      </div>

      {p.modo === "entrada" && (
        <div className="space-y-2 rounded-xl border p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs text-muted-foreground">Entrada de</span>
            {ATALHOS_ENTRADA.map((pct) => (
              <button
                key={pct}
                type="button"
                onClick={() => p.setEntrada(String(r2((total * pct) / 100)).replace(".", ","))}
                className="rounded-full border px-2.5 py-1 text-xs font-medium text-muted-foreground transition-colors hover:border-(--ll-accent-line) hover:bg-(--ll-accent-soft) hover:text-(--ll-accent)"
              >
                {pct}% · {brl(r2((total * pct) / 100))}
              </button>
            ))}
          </div>
          <div className="space-y-1">
            <Label htmlFor="entrada-compra" className="text-xs">
              Valor da entrada
            </Label>
            <Input
              id="entrada-compra"
              inputMode="decimal"
              value={p.entrada}
              onChange={(e) => p.setEntrada(e.target.value.replace(/[^0-9,.]/g, ""))}
              placeholder="0,00"
              className="text-base"
            />
          </div>
        </div>
      )}

      {p.agora > 0 && (
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="carteira-compra">
              {p.modo === "entrada" ? `De qual carteira sai a entrada (${brl(p.agora)})` : "De qual carteira saiu"}
            </Label>
            <Seletor
              id="carteira-compra"
              className="h-10 w-full rounded-lg border bg-card px-3 text-sm"
              value={p.carteiraId}
              onValueChange={p.setCarteiraId}
              opcoes={[
                ...(carteiras.length === 0 ? [{ value: "", label: "Nenhuma carteira cadastrada" }] : []),
                ...carteiras.map((c) => ({ value: c.id, label: `${c.nome} · ${brl(c.saldo)}` })),
              ]}
            />
          </div>

          {p.precisaComprovante ? (
            <CampoComprovante
              valor={p.comprovanteId}
              aoMudar={(id) => {
                p.setComprovanteId(id);
                p.setFaltaComprovante(false);
              }}
              obrigatorio
              erro={p.faltaComprovante ? "Anexe o comprovante antes de registrar a compra." : null}
            />
          ) : (
            <p className="text-xs text-muted-foreground">Dinheiro vivo (da gaveta) não precisa de comprovante.</p>
          )}
        </div>
      )}

      {p.aPrazo > 0.005 && (
        <div className="space-y-3 rounded-xl border border-dashed p-3">
          <div>
            <p className="text-sm font-semibold">{p.modo === "entrada" ? "O resto em parcelas" : "Parcelas"}</p>
            <p className="text-xs text-muted-foreground">
              {brl(p.aPrazo)} vão para contas a pagar. O comprovante vem na hora de pagar cada parcela.
            </p>
          </div>
          <EditorDeParcelas p={p.parc as Parcelamento} idBase="compra" max={36} />
        </div>
      )}

      <dl className="space-y-1 border-t pt-3 text-sm">
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Sai da carteira agora</dt>
          <dd className="tabular-nums">{brl(p.agora)}</dd>
        </div>
        <div className="flex justify-between">
          <dt className="text-muted-foreground">Vai para contas a pagar</dt>
          <dd className="tabular-nums">{brl(p.aPrazo)}</dd>
        </div>
      </dl>
    </div>
  );
}
