"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";

/* Período do extrato, na URL — link compartilhável e botão voltar funciona. */
export function PeriodoCaixa({ de, ate }: { de: string; ate: string }) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();

  function ir(novoDe: string, novoAte: string) {
    iniciar(() => router.push(`/financeiro?aba=caixa&de=${novoDe}&ate=${novoAte}`));
  }

  const hoje = new Date();
  const iso = (d: Date) => d.toISOString().slice(0, 10);

  const atalhos: Array<[string, () => void]> = [
    ["Hoje", () => ir(iso(hoje), iso(hoje))],
    [
      "7 dias",
      () => ir(iso(new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - 6)), iso(hoje)),
    ],
    ["Este mês", () => ir(iso(new Date(hoje.getFullYear(), hoje.getMonth(), 1)), iso(hoje))],
    [
      "Mês passado",
      () =>
        ir(
          iso(new Date(hoje.getFullYear(), hoje.getMonth() - 1, 1)),
          iso(new Date(hoje.getFullYear(), hoje.getMonth(), 0)),
        ),
    ],
  ];

  return (
    <div className="flex flex-wrap items-end gap-2">
      <div className="flex items-end gap-2">
        <span className="space-y-1">
          <label htmlFor="de" className="block text-xs text-muted-foreground">
            De
          </label>
          <Input
            id="de"
            type="date"
            defaultValue={de}
            className="text-base"
            onChange={(e) => ir(e.target.value, ate)}
            disabled={pendente}
          />
        </span>
        <span className="space-y-1">
          <label htmlFor="ate" className="block text-xs text-muted-foreground">
            Até
          </label>
          <Input
            id="ate"
            type="date"
            defaultValue={ate}
            className="text-base"
            onChange={(e) => ir(de, e.target.value)}
            disabled={pendente}
          />
        </span>
      </div>
      <div className="flex flex-wrap gap-1">
        {atalhos.map(([rotulo, fn]) => (
          <Button key={rotulo} type="button" variant="ghost" size="sm" onClick={fn} disabled={pendente}>
            {rotulo}
          </Button>
        ))}
      </div>
    </div>
  );
}
