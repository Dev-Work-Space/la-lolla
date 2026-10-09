"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Seletor } from "@/components/padrao/seletor";
import { Button } from "@/components/ui/button";
import { brl } from "@/lib/formato";
import { campoDaData } from "@/lib/dia";
import { cn } from "@/lib/utils";
import { INTERVALOS, resolverParcelas, vencimentoParcela, type Intervalo } from "@/lib/parcelas";

/*
 * O PARCELAMENTO que a venda, a compra e o orçamento compartilham.
 *
 * Quantas vezes, de quanto em quanto tempo e quando vence a primeira — e, se
 * a combinação não for "tudo igual", cada parcela com a SUA data e o SEU
 * valor. O João pediu o pagamento "bem ajustável": a cliente que paga uma
 * parcela maior agora e o resto depois existe, e o app tem de conseguir
 * escrever isso.
 *
 * Mexer no valor de uma parcela NÃO desmonta as outras: o que sobra do total
 * se divide entre as parcelas que ninguém tocou. Se todas foram tocadas e a
 * soma não fecha, a tela diz quanto falta ou passa — e quem grava recusa.
 */

const ATALHOS = Array.from({ length: 12 }, (_, k) => k + 1);

const paraNumero = (s: string) => Number(String(s).replace(/\./g, "").replace(",", ".")) || 0;
const numeroBr = (n: number) => n.toFixed(2).replace(".", ",");

export type Parcelamento = ReturnType<typeof useParcelamento>;

export function useParcelamento({
  total,
  parcelasIniciais = "2",
  intervaloInicial = "mes",
  primeiroInicial,
}: {
  /** O valor que as parcelas dividem. */
  total: number;
  parcelasIniciais?: string;
  intervaloInicial?: Intervalo;
  primeiroInicial: string;
}) {
  const [parcelas, setParcelas] = useState(parcelasIniciais);
  const [intervalo, setIntervaloBruto] = useState<Intervalo>(intervaloInicial);
  const [primeiro, setPrimeiroBruto] = useState(primeiroInicial);
  /* O que a pessoa escolheu à mão, por posição. Vazio = segue o atalho. */
  const [datas, setDatas] = useState<Record<number, string>>({});
  const [valores, setValores] = useState<Record<number, string>>({});

  const n = Math.max(1, Number(parcelas) || 1);

  const resolvidas = useMemo(() => {
    const manuais: Record<number, number> = {};
    for (const [k, v] of Object.entries(valores)) {
      if (v.trim() !== "") manuais[Number(k)] = paraNumero(v);
    }
    return resolverParcelas(total, n, manuais);
  }, [total, n, valores]);

  const dataDe = (k: number): string => {
    if (datas[k]) return datas[k];
    const base = new Date(primeiro + "T12:00:00");
    return campoDaData(k === 0 ? base : vencimentoParcela(base, k, intervalo));
  };

  /* Mudar a quantidade, o intervalo ou o primeiro vencimento refaz o que foi
     combinado "por padrão"; o que a pessoa escolheu à mão para parcelas que
     deixaram de existir vai junto, senão ressuscita quando ela aumentar o
     número de novo. */
  const podar = <T,>(a: Record<number, T>, ate: number) => {
    const fora: Record<number, T> = {};
    for (const [k, v] of Object.entries(a)) if (Number(k) < ate) fora[Number(k)] = v;
    return fora;
  };

  return {
    parcelas,
    n,
    intervalo,
    primeiro,
    total,
    setParcelas: (v: string) => {
      setParcelas(v);
      const novo = Math.max(1, Number(v) || 1);
      setDatas((a) => podar(a, novo));
      setValores((a) => podar(a, novo));
    },
    setIntervalo: (v: Intervalo) => {
      setIntervaloBruto(v);
      setDatas({});
    },
    setPrimeiro: (v: string) => {
      setPrimeiroBruto(v);
      setDatas({});
    },
    setData: (k: number, v: string) => setDatas((a) => ({ ...a, [k]: v })),
    setValor: (k: number, v: string) => setValores((a) => ({ ...a, [k]: v.replace(/[^0-9,.]/g, "") })),
    /** Volta a dividir por igual. */
    dividirPorIgual: () => setValores({}),
    valorEscolhido: (k: number) => valores[k] !== undefined && valores[k].trim() !== "",
    valorTexto: (k: number) => (valores[k] !== undefined ? valores[k] : numeroBr(resolvidas.valores[k] ?? 0)),
    dataDe,
    /** O que vai para o servidor: uma data e um valor por parcela. */
    lista: Array.from({ length: n }, (_, k) => ({ vencimento: dataDe(k), valor: resolvidas.valores[k] ?? 0 })),
    /** Falta (positivo) ou passa (negativo) para fechar o total. */
    diferenca: resolvidas.diferenca,
    confere: resolvidas.confere,
    algumaEscolhida: Object.values(valores).some((v) => v.trim() !== ""),
  };
}

/*
 * Em quantas vezes: atalhos de 1x a 12x e um campo para qualquer número. Serve
 * ao parcelamento do cartão (a maquininha parcela) e ao do crediário (a loja
 * parcela) — coisas diferentes no dinheiro, iguais na tela.
 */
export function SeletorDeVezes({
  id,
  rotulo,
  valor,
  aoMudar,
  max = 60,
}: {
  id: string;
  rotulo: string;
  valor: string;
  aoMudar: (n: string) => void;
  max?: number;
}) {
  const n = Number(valor) || 1;
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id} className="text-xs">
        {rotulo}
      </Label>
      <div className="flex flex-wrap items-center gap-1">
        {ATALHOS.filter((k) => k <= max).map((k) => (
          <button
            key={k}
            type="button"
            aria-pressed={n === k}
            onClick={() => aoMudar(String(k))}
            className={cn(
              "min-w-9 rounded-full border px-2 py-1 text-xs font-medium tabular-nums transition-colors",
              n === k
                ? "border-foreground bg-foreground text-background"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {k}x
          </button>
        ))}
        <Input
          id={id}
          inputMode="numeric"
          aria-label={`${rotulo}: outro número`}
          value={valor}
          onChange={(e) => {
            const v = Math.min(max, Number(e.target.value.replace(/\D/g, "").slice(0, 3)) || 1);
            aoMudar(String(v));
          }}
          className="h-8 w-16 text-center text-base"
        />
      </div>
    </div>
  );
}

/** A tela do parcelamento: atalho de cima e uma linha por parcela, com data e valor editáveis. */
export function EditorDeParcelas({
  p,
  idBase,
  max = 60,
  rotuloVezes = "Em quantas vezes",
}: {
  p: Parcelamento;
  idBase: string;
  max?: number;
  rotuloVezes?: string;
}) {
  return (
    <div className="space-y-3">
      <SeletorDeVezes id={`${idBase}-vezes`} rotulo={rotuloVezes} valor={p.parcelas} aoMudar={p.setParcelas} max={max} />

      <div className="grid grid-cols-2 gap-2">
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-intervalo`} className="text-xs">
            A cada
          </Label>
          <Seletor
            id={`${idBase}-intervalo`}
            className="h-10 w-full rounded-lg border bg-card px-2 text-sm"
            value={p.intervalo}
            onValueChange={(v) => p.setIntervalo(v as Intervalo)}
            opcoes={INTERVALOS.map(([value, label]) => ({ value, label }))}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor={`${idBase}-primeiro`} className="text-xs">
            Primeiro vencimento
          </Label>
          <Input
            id={`${idBase}-primeiro`}
            type="date"
            value={p.primeiro}
            onChange={(e) => p.setPrimeiro(e.target.value)}
            className="text-base"
          />
        </div>
      </div>

      {/* Cada parcela com a SUA data e o SEU valor. Os campos de cima são o
          atalho ("3x, todo dia 10"); esta lista é a combinação de verdade. */}
      <div className="space-y-1.5 border-t pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-medium">
            {p.n}× de <strong>{brl(p.lista[0]?.valor ?? 0)}</strong>
            {p.n > 1 && !p.algumaEscolhida && (p.lista[p.n - 1]?.valor ?? 0) !== (p.lista[0]?.valor ?? 0) && (
              <span className="font-normal text-muted-foreground"> · a última fica {brl(p.lista[p.n - 1].valor)}</span>
            )}
          </p>
          {p.algumaEscolhida && (
            <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={p.dividirPorIgual}>
              Dividir por igual
            </Button>
          )}
        </div>

        <ul className="max-h-72 space-y-1.5 overflow-y-auto pr-1">
          {p.lista.map((it, k) => (
            <li key={k} className="flex items-center gap-2">
              <span className="w-10 shrink-0 text-xs text-muted-foreground tabular-nums">
                {k + 1}/{p.n}
              </span>
              <Input
                type="date"
                aria-label={`Vencimento da parcela ${k + 1}`}
                value={it.vencimento}
                onChange={(e) => p.setData(k, e.target.value)}
                className="h-9 min-w-0 flex-1 text-sm"
              />
              <div className="relative w-28 shrink-0">
                <span aria-hidden className="pointer-events-none absolute top-1/2 left-2 -translate-y-1/2 text-xs text-muted-foreground">
                  R$
                </span>
                <Input
                  inputMode="decimal"
                  aria-label={`Valor da parcela ${k + 1}`}
                  value={p.valorTexto(k)}
                  onChange={(e) => p.setValor(k, e.target.value)}
                  className={cn("h-9 pl-7 text-right text-sm tabular-nums", p.valorEscolhido(k) && "border-(--ll-accent)")}
                />
              </div>
            </li>
          ))}
        </ul>

        {!p.confere && (
          <p role="alert" className="text-xs font-medium text-destructive">
            {p.diferenca > 0
              ? `Faltam ${brl(p.diferenca)} para fechar o valor. Aumente uma parcela ou volte para “Dividir por igual”.`
              : `Passam ${brl(Math.abs(p.diferenca))} do valor. Diminua uma parcela.`}
          </p>
        )}
      </div>
    </div>
  );
}
