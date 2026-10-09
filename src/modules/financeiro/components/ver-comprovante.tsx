"use client";

import { useState, useTransition } from "react";
import { PaperclipIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { verComprovanteAction } from "../comprovante.actions";

/*
 * "Ver comprovante": busca o arquivo só quando a pessoa abre (a lista nunca
 * carrega imagem à toa) e mostra a foto, ou o botão de abrir o PDF.
 */
export function VerComprovante({ id, rotulo = "Ver comprovante" }: { id: string; rotulo?: string }) {
  const [aberto, setAberto] = useState(false);
  const [arquivo, setArquivo] = useState<{ url: string; tipo: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [carregando, carregar] = useTransition();

  function abrir(v: boolean) {
    setAberto(v);
    if (!v || arquivo) return;
    setAviso(null);
    carregar(async () => {
      const r = await verComprovanteAction(id);
      if (r.ok) setArquivo(r.data);
      else setAviso(r.error.message);
    });
  }

  return (
    <Dialog open={aberto} onOpenChange={abrir}>
      <DialogTrigger render={<Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" />}>
        <PaperclipIcon className="mr-1 size-3.5" aria-hidden />
        {rotulo}
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Comprovante</DialogTitle>
          <DialogDescription>O papel que foi anexado a este pagamento.</DialogDescription>
        </DialogHeader>
        {carregando && <p className="py-8 text-center text-sm text-muted-foreground">Abrindo…</p>}
        {aviso && (
          <p role="alert" className="text-sm text-destructive">
            {aviso}
          </p>
        )}
        {arquivo &&
          (arquivo.tipo === "application/pdf" ? (
            <Button nativeButton={false} render={<a href={arquivo.url} target="_blank" rel="noopener noreferrer" />}>
              Abrir o PDF
            </Button>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={arquivo.url} alt="Comprovante" className="mx-auto max-h-[70dvh] w-auto rounded-lg border" />
          ))}
      </DialogContent>
    </Dialog>
  );
}
