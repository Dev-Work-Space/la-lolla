"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { DownloadSimpleIcon, MagnifyingGlassIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Seletor } from "@/components/padrao/seletor";

/*
 * Os filtros das listas do Financeiro (carteira, tipo, categoria, ordem,
 * busca) e o "Baixar planilha". Como a barra de período, tudo mora na URL:
 * `params` são os filtros atuais, e mudar um preserva os outros.
 */

function useIrComParams(params: Record<string, string>) {
  const router = useRouter();
  const [pendente, iniciar] = useTransition();
  const ir = (chave: string, valor: string) => {
    const p = new URLSearchParams(params);
    if (valor) p.set(chave, valor);
    else p.delete(chave);
    iniciar(() => router.push(`/financeiro?${p.toString()}`));
  };
  return { ir, pendente };
}

/* O Select não guarda valor vazio; "todos" vira esta marca e some da URL. */
const TODOS = "__todos__";

export function SeletorFiltro({
  params,
  chave,
  rotulo,
  valor,
  opcoes,
  rotuloTodos = "Todos",
}: {
  params: Record<string, string>;
  chave: string;
  rotulo: string;
  valor: string;
  opcoes: ReadonlyArray<{ value: string; label: string }>;
  /** Sem rótulo de "todos", a escolha é obrigatória (ex.: ordem). */
  rotuloTodos?: string | null;
}) {
  const { ir, pendente } = useIrComParams(params);
  const id = `filtro-${chave}`;
  return (
    <span className="space-y-1">
      <label htmlFor={id} className="block text-xs text-muted-foreground">
        {rotulo}
      </label>
      <Seletor
        id={id}
        className="min-w-36"
        disabled={pendente}
        value={valor || (rotuloTodos === null ? (opcoes[0]?.value ?? "") : TODOS)}
        onValueChange={(v) => ir(chave, v === TODOS ? "" : v)}
        opcoes={[...(rotuloTodos === null ? [] : [{ value: TODOS, label: rotuloTodos }]), ...opcoes]}
      />
    </span>
  );
}

/** Busca que filtra enquanto se digita, sem disparar uma ida ao servidor por tecla. */
export function BuscaFiltro({
  params,
  valor,
  placeholder,
}: {
  params: Record<string, string>;
  valor: string;
  placeholder: string;
}) {
  const { ir } = useIrComParams(params);
  const [texto, setTexto] = useState(valor);
  const primeira = useRef(true);

  useEffect(() => {
    if (primeira.current) {
      primeira.current = false;
      return;
    }
    if (texto.trim() === valor) return;
    const t = setTimeout(() => ir("busca", texto.trim()), 400);
    return () => clearTimeout(t);
    // `ir` muda a cada render; o que importa é o texto digitado.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [texto]);

  return (
    <span className="min-w-48 flex-1 space-y-1">
      <label htmlFor="filtro-busca" className="block text-xs text-muted-foreground">
        Buscar
      </label>
      <span className="relative block">
        <MagnifyingGlassIcon
          className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          id="filtro-busca"
          type="search"
          value={texto}
          onChange={(e) => setTexto(e.target.value)}
          placeholder={placeholder}
          className="pl-8 text-base"
        />
      </span>
    </span>
  );
}

/*
 * Planilha que abre direto no Excel em português: separador ";", vírgula
 * decimal e a marca BOM no começo — sem ela o Excel lê "Março" como "MarÃ§o".
 * Gerada no navegador com o que já está na tela: nada a mais sai do servidor.
 */
export function BaixarPlanilha({
  nome,
  colunas,
  linhas,
}: {
  nome: string;
  colunas: string[];
  linhas: Array<Array<string | number>>;
}) {
  function baixar() {
    const campo = (v: string | number) => {
      const t = typeof v === "number" ? v.toFixed(2).replace(".", ",") : v;
      return /[";\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const texto = [colunas, ...linhas].map((l) => l.map(campo).join(";")).join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nome}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <Button type="button" variant="outline" onClick={baixar} disabled={linhas.length === 0}>
      <DownloadSimpleIcon className="mr-1.5 size-4" aria-hidden />
      Baixar planilha
    </Button>
  );
}

/*
 * "Ir para data" do calendário: escolhe um dia e abre o mês dele (ou a
 * semana, na visão de semana). Mais rápido que apertar a seta doze vezes.
 */
export function IrParaData({ params, vista }: { params: Record<string, string>; vista: "mes" | "semana" }) {
  const { ir, pendente } = useIrComParams(params);
  return (
    <span className="space-y-1">
      <label htmlFor="ir-para-data" className="block text-xs text-muted-foreground">
        Ir para data
      </label>
      <Input
        id="ir-para-data"
        type="date"
        disabled={pendente}
        className="w-40 text-base"
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          if (vista === "mes") ir("mes", v.slice(0, 7));
          else ir("semana", v);
        }}
      />
    </span>
  );
}
