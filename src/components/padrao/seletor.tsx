"use client";

import { useEffect, useRef, useState, type AriaAttributes, type ReactNode } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";

type Opcao = { value: string; label: ReactNode };

type SeletorProps = Pick<AriaAttributes, "aria-label" | "aria-invalid" | "aria-describedby"> & {
  opcoes: readonly Opcao[];
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onValueChange?: (valor: string) => void;
  disabled?: boolean;
  required?: boolean;
  className?: string;
};

/** Select compartilhado: mantém os nomes do FormData e a seleção inicial do select nativo. */
export function Seletor({
  opcoes,
  id,
  name,
  value,
  defaultValue,
  onValueChange,
  disabled,
  required,
  className,
  ...aria
}: SeletorProps) {
  const valorInicial = defaultValue ?? opcoes[0]?.value ?? "";
  const [valorInterno, setValorInterno] = useState(valorInicial);
  const inputRef = useRef<HTMLInputElement>(null);
  const valorAtual = opcoes.some((opcao) => opcao.value === valorInterno)
    ? valorInterno
    : opcoes[0]?.value ?? "";

  // Formulários HTML (inclusive action={...}) podem ser resetados sem um
  // Form do Base UI. Mantém o mesmo reset do select nativo nesses casos.
  useEffect(() => {
    if (value !== undefined) return;
    const formulario = inputRef.current?.form;
    if (!formulario) return;
    function restaurar(evento: Event) {
      queueMicrotask(() => {
        if (!evento.defaultPrevented) setValorInterno(valorInicial);
      });
    }
    formulario.addEventListener("reset", restaurar);
    return () => formulario.removeEventListener("reset", restaurar);
  }, [value, valorInicial]);

  return (
    <Select
      id={id}
      name={name}
      items={opcoes}
      inputRef={inputRef}
      value={value ?? valorAtual}
      onValueChange={(valor) => {
        if (valor === null) return;
        if (value === undefined) setValorInterno(valor);
        onValueChange?.(valor);
      }}
      disabled={disabled}
      required={required}
    >
      <SelectTrigger
        id={id}
        className={cn("w-full min-w-0 bg-card data-[size=default]:h-10", className)}
        {...aria}
      >
        <SelectValue />
      </SelectTrigger>
      <SelectContent alignItemWithTrigger={false}>
        {opcoes.map((opcao) => (
          <SelectItem key={opcao.value} value={opcao.value}>
            {opcao.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
