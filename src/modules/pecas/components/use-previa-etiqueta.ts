"use client";

import { useEffect, useState } from "react";
import { previaEtiqueta } from "../pdf-etiqueta";
import type { Etiqueta, ModeloEtiqueta, OpcoesEtiqueta } from "../etiqueta.regras";

/*
 * A prévia é desenhada no navegador e precisa da logo carregada — por isso
 * chega um instante depois. Enquanto a nova não fica pronta, segue a anterior
 * na tela: trocar de modelo não faz o painel pular.
 *
 * O efeito depende só da CHAVE (o texto dos dados): objetos recriados a cada
 * render redesenhariam a etiqueta sem parar.
 */
export function usePreviaEtiqueta(
  e: Etiqueta | null,
  m: ModeloEtiqueta,
  opc: OpcoesEtiqueta,
  ativo = true,
): string | null {
  const chave = ativo && e ? JSON.stringify([e, m, opc]) : null;
  const [pronta, setPronta] = useState<string | null>(null);

  useEffect(() => {
    if (!chave) return;
    const [ee, mm, oo] = JSON.parse(chave) as [Etiqueta, ModeloEtiqueta, OpcoesEtiqueta];
    let vivo = true;
    previaEtiqueta(ee, mm, oo).then(
      (url) => vivo && setPronta(url),
      () => vivo && setPronta(null),
    );
    return () => {
      vivo = false;
    };
  }, [chave]);

  return chave ? pronta : null;
}
