"use client";

import { useRef } from "react";
import { useServerInsertedHTML } from "next/navigation";
import { SCRIPT_TEMA } from "./tema.constantes";

export function ScriptTema() {
  const inserido = useRef(false);

  // O callback só roda no servidor. O script é executado pelo parser do
  // navegador antes da pintura, sem montar uma tag script pelo React cliente.
  useServerInsertedHTML(() => {
    if (inserido.current) return null;
    inserido.current = true;

    return (
      <script
        id="lalolla-tema-inicial"
        dangerouslySetInnerHTML={{ __html: SCRIPT_TEMA }}
      />
    );
  });

  return null;
}
