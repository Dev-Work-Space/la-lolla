"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ETIQUETA_EXEMPLO } from "@/modules/pecas/pdf-etiqueta";
import { modeloDosAjustes } from "@/modules/pecas/etiqueta.regras";
import { usePreviaEtiqueta } from "@/modules/pecas/components/use-previa-etiqueta";
import { AJUSTES_PADRAO, ROTULOS } from "../ajustes.tipos";

/*
 * Um tamanho de rolo da NIIMBOT fora da lista de mercado, com a etiqueta
 * desenhada ao lado. Ele aparece por último no "Modelo de etiqueta" do painel
 * de impressão. A prévia muda enquanto o João digita: é o mesmo desenho que
 * vai para o PDF, então o que aparece aqui é o que sai na fita.
 */
const OPCOES_EXEMPLO = { preco: true, qr: true };

export function CamposEtiqueta({
  largura,
  altura,
  dobrada: dobradaInicial,
  erros,
}: {
  largura: number;
  altura: number;
  dobrada: boolean;
  erros: { largura?: string; altura?: string };
}) {
  const br = (n: number) => String(n).replace(".", ",");
  const [larg, setLarg] = useState(br(largura));
  const [alt, setAlt] = useState(br(altura));
  const [dobrada, setDobrada] = useState(dobradaInicial);
  const [ultimaValida, setUltimaValida] = useState({ l: largura, a: altura });

  const l = Number(larg.replace(",", "."));
  const a = Number(alt.replace(",", "."));
  // Só redesenha com medida plausível: enquanto digita "3" a caminho de "30", segura a anterior.
  const valida = l >= 10 && l <= 120 && a >= 8 && a <= 50;
  if (valida && (ultimaValida.l !== l || ultimaValida.a !== a)) setUltimaValida({ l, a });

  const previa = usePreviaEtiqueta(
    ETIQUETA_EXEMPLO,
    modeloDosAjustes({ etiquetaLargura: ultimaValida.l, etiquetaAltura: ultimaValida.a, etiquetaDobrada: dobrada }),
    OPCOES_EXEMPLO,
  );

  return (
    <div className="space-y-3">
      <div>
        <p className="text-sm font-medium">Etiqueta da NIIMBOT · tamanho próprio</p>
        <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">
          Só para um rolo que não esteja na lista de modelos da impressão — ele entra no fim dela. Padrão:{" "}
          {br(AJUSTES_PADRAO.etiquetaLargura)} × {br(AJUSTES_PADRAO.etiquetaAltura)} mm. Confira na caixa do
          rolo e numa impressão de teste.
        </p>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="etiquetaLargura">{ROTULOS.etiquetaLargura.nome} (mm)</Label>
          <Input
            id="etiquetaLargura"
            name="etiquetaLargura"
            inputMode="decimal"
            value={larg}
            onChange={(e) => setLarg(e.target.value)}
            aria-invalid={!!erros.largura}
            className="text-base"
          />
          {erros.largura && <p className="text-sm text-destructive">{erros.largura}</p>}
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="etiquetaAltura">{ROTULOS.etiquetaAltura.nome} (mm)</Label>
          <Input
            id="etiquetaAltura"
            name="etiquetaAltura"
            inputMode="decimal"
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            aria-invalid={!!erros.altura}
            className="text-base"
          />
          {erros.altura && <p className="text-sm text-destructive">{erros.altura}</p>}
        </div>
      </div>

      <label className="flex items-start gap-2.5">
        {/* O checkbox desmarcado não vai no formulário; o campo escondido vai sempre. */}
        <input type="hidden" name="etiquetaDobrada" value={String(dobrada)} />
        <input
          type="checkbox"
          checked={dobrada}
          onChange={(e) => setDobrada(e.target.checked)}
          className="mt-0.5 size-4 shrink-0 accent-primary"
        />
        <span className="text-sm">
          <span className="font-medium">{ROTULOS.etiquetaDobrada.nome}</span>
          <span className="block text-xs leading-relaxed text-muted-foreground">
            {ROTULOS.etiquetaDobrada.ajuda}
          </span>
        </span>
      </label>

      {previa && (
        <figure className="rounded-lg border bg-white p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previa}
            alt="Prévia da etiqueta com uma peça de exemplo"
            className="mx-auto h-auto w-full max-w-sm [image-rendering:pixelated]"
          />
          <figcaption className="mt-2 text-center text-xs text-neutral-500">
            Exemplo — preto e branco, como sai na impressora térmica
          </figcaption>
        </figure>
      )}
    </div>
  );
}
