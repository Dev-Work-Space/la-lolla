"use client";

import { useRef, useState } from "react";
import imageCompression from "browser-image-compression";
import { CameraIcon, CheckCircleIcon, FilePdfIcon, ImagesIcon, XIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { anexarComprovanteAction } from "../comprovante.actions";

/*
 * ANEXAR COMPROVANTE — "tirar foto" ou "escolher da galeria", como no app
 * antigo.
 *
 * O arquivo sobe NA HORA que é escolhido e a tela fica só com o id: assim o
 * formulário que usa este campo não carrega arquivo nenhum e a pessoa vê, no
 * ato, se o envio deu certo. A foto é reduzida aqui antes de subir (de 4 MB
 * do celular para uns 300 KB), porque no 4G do balcão cada megabyte conta.
 *
 * Obrigatório ou não é decisão de quem usa o campo: ele só mostra o aviso.
 * Quem barra de verdade é o servidor.
 */

type Anexo = { nome: string; previa: string | null };

export function CampoComprovante({
  valor,
  aoMudar,
  erro,
  rotulo = "Comprovante",
  obrigatorio = false,
}: {
  /** O id do comprovante já enviado, ou nulo. */
  valor: string | null;
  aoMudar: (id: string | null) => void;
  erro?: string | null;
  rotulo?: string;
  obrigatorio?: boolean;
}) {
  const camera = useRef<HTMLInputElement>(null);
  const galeria = useRef<HTMLInputElement>(null);
  const [anexo, setAnexo] = useState<Anexo | null>(null);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);

  async function escolher(arquivo: File | undefined) {
    if (!arquivo) return;
    setAviso(null);
    setEnviando(true);
    try {
      const ehPdf = arquivo.type === "application/pdf";
      if (!ehPdf && !arquivo.type.startsWith("image/")) {
        setAviso("Escolha uma foto ou um PDF.");
        return;
      }
      const pronto: File = ehPdf
        ? arquivo
        : new File(
            [
              await imageCompression(arquivo, {
                maxSizeMB: 0.4,
                maxWidthOrHeight: 1600,
                useWebWorker: true,
                fileType: "image/jpeg",
              }),
            ],
            "comprovante.jpg",
            { type: "image/jpeg" },
          );
      const fd = new FormData();
      fd.set("arquivo", pronto);
      const r = await anexarComprovanteAction(fd);
      if (!r.ok) {
        setAviso(r.error.message);
        return;
      }
      if (anexo?.previa) URL.revokeObjectURL(anexo.previa);
      setAnexo({ nome: arquivo.name, previa: ehPdf ? null : URL.createObjectURL(pronto) });
      aoMudar(r.data.id);
    } catch {
      setAviso("Não consegui enviar o comprovante. Confira a internet e tente de novo.");
    } finally {
      setEnviando(false);
      // Sem isto, escolher DE NOVO o mesmo arquivo não dispara nada.
      if (camera.current) camera.current.value = "";
      if (galeria.current) galeria.current.value = "";
    }
  }

  function remover() {
    if (anexo?.previa) URL.revokeObjectURL(anexo.previa);
    setAnexo(null);
    aoMudar(null);
  }

  const mensagem = aviso ?? erro ?? null;

  return (
    <div className="space-y-1.5">
      <p className="text-sm font-medium">
        {rotulo}
        {obrigatorio && <span className="text-destructive"> *</span>}
      </p>

      {valor ? (
        <div className="flex items-center gap-3 rounded-lg border border-(--ll-ok)/40 bg-(--ll-ok-soft) p-2">
          {anexo?.previa ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={anexo.previa} alt="Comprovante anexado" className="size-12 shrink-0 rounded-md object-cover" />
          ) : (
            <span className="grid size-12 shrink-0 place-items-center rounded-md bg-card text-muted-foreground">
              <FilePdfIcon className="size-6" aria-hidden />
            </span>
          )}
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1 text-sm font-medium text-ok">
              <CheckCircleIcon weight="fill" className="size-4" aria-hidden />
              Comprovante anexado
            </span>
            <span className="block truncate text-xs text-muted-foreground">{anexo?.nome ?? "enviado"}</span>
          </span>
          <Button type="button" variant="ghost" size="icon" onClick={remover} aria-label="Remover o comprovante">
            <XIcon className="size-4" aria-hidden />
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" disabled={enviando} onClick={() => camera.current?.click()}>
            <CameraIcon className="mr-1.5 size-4" aria-hidden />
            {enviando ? "Enviando…" : "Tirar foto"}
          </Button>
          <Button type="button" variant="outline" disabled={enviando} onClick={() => galeria.current?.click()}>
            <ImagesIcon className="mr-1.5 size-4" aria-hidden />
            Da galeria
          </Button>
        </div>
      )}

      {/* `capture` abre a câmera no celular; no computador vira escolher arquivo. */}
      <input
        ref={camera}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => escolher(e.target.files?.[0])}
      />
      <input
        ref={galeria}
        type="file"
        accept="image/*,application/pdf"
        className="sr-only"
        tabIndex={-1}
        aria-hidden
        onChange={(e) => escolher(e.target.files?.[0])}
      />

      {mensagem && (
        <p role="alert" className={cn("text-xs", "text-destructive")}>
          {mensagem}
        </p>
      )}
    </div>
  );
}
