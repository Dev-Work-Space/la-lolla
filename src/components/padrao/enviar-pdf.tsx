"use client";

import { useState, useTransition } from "react";
import { Download, Eye, FileText, Share2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/*
 * O que fazer com o papel depois de gerado — vale para o orçamento e para o
 * recibo.
 *
 * O app antigo mandava o PDF direto para o download e, no celular, abria o
 * visor em tela cheia — o "pdfzão" que tapava tudo e que o João reclamou. Aqui
 * gerar abre um painel de ESCOLHA: mandar, salvar ou só olhar.
 *
 * Sobre o WhatsApp, sem enganar ninguém: o link `wa.me` abre a conversa e leva
 * um texto, mas NÃO carrega arquivo — nenhum link consegue. Quem anexa o PDF
 * de verdade é a folha de compartilhar do próprio aparelho. Por isso
 * "Compartilhar" é o caminho para MANDAR, e a conversa da cliente é o atalho
 * para avisar. No computador a folha não existe, e o botão não aparece.
 */

/** Só dígitos, com 55 na frente — é o formato que o wa.me aceita. */
export function telefoneWhats(t: string | null): string {
  const d = String(t ?? "").replace(/\D/g, "");
  if (!d) return "";
  return d.length <= 11 ? "55" + d : d;
}

export function primeiroNome(nome: string) {
  const p = nome.trim().split(/\s+/)[0] ?? "";
  return p ? p.charAt(0).toUpperCase() + p.slice(1) : nome;
}

export function EnviarPdf({
  rotulo,
  titulo,
  descricao,
  mensagem,
  telefone,
  nomeCliente,
  rotuloBotao = "Gerar PDF",
  gerar,
}: {
  /** Como o documento se chama, para o título do compartilhamento. */
  rotulo: string;
  titulo: string;
  descricao: string;
  /** O texto que vai junto no WhatsApp. */
  mensagem: string;
  telefone: string | null;
  nomeCliente: string | null;
  rotuloBotao?: string;
  gerar: () => Promise<{ blob: Blob; nome: string }>;
}) {
  const [aberto, setAberto] = useState(false);
  const [gerando, comecar] = useTransition();
  const [pdf, setPdf] = useState<{ blob: Blob; nome: string; url: string } | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);

  const whats = telefoneWhats(telefone);

  /* `canShare` com arquivo é o único jeito honesto de saber se o aparelho
     consegue anexar. Testar só `navigator.share` prometeria demais: no
     computador ele às vezes existe e não aceita arquivo. */
  const arquivo = pdf ? new File([pdf.blob], pdf.nome, { type: "application/pdf" }) : null;
  const podeCompartilhar =
    !!arquivo &&
    typeof navigator !== "undefined" &&
    !!navigator.canShare &&
    navigator.canShare({ files: [arquivo] });

  function emitir() {
    setAviso(null);
    comecar(async () => {
      try {
        const r = await gerar();
        setPdf({ ...r, url: URL.createObjectURL(r.blob) });
        setAberto(true);
      } catch {
        setAviso("Não consegui gerar o PDF. Tente de novo.");
      }
    });
  }

  function baixar() {
    if (!pdf) return;
    const a = document.createElement("a");
    a.href = pdf.url;
    a.download = pdf.nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <>
      <Button onClick={emitir} disabled={gerando}>
        <FileText className="mr-1.5 size-4" aria-hidden />
        {gerando ? "Gerando…" : rotuloBotao}
      </Button>

      {aviso && (
        <p role="alert" className="text-sm font-medium text-destructive">
          {aviso}
        </p>
      )}

      <Dialog
        open={aberto}
        onOpenChange={(v) => {
          setAberto(v);
          /* Solta a memória do arquivo ao fechar — sem isso cada PDF gerado
             fica preso na aba até recarregar a página. */
          if (!v && pdf) {
            URL.revokeObjectURL(pdf.url);
            setPdf(null);
          }
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{titulo}</DialogTitle>
            <DialogDescription>{descricao}</DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {podeCompartilhar && (
              <div>
                <Button
                  className="w-full"
                  onClick={async () => {
                    try {
                      await navigator.share({ files: [arquivo!], title: rotulo, text: mensagem });
                    } catch {
                      /* a pessoa fechou a folha de compartilhar — nada a fazer */
                    }
                  }}
                >
                  <Share2 className="mr-1.5 size-4" aria-hidden />
                  Compartilhar PDF
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  WhatsApp, e-mail ou onde quiser — o PDF vai anexado.
                </p>
              </div>
            )}

            {whats && nomeCliente && (
              <div>
                <Button
                  variant={podeCompartilhar ? "outline" : "default"}
                  className="w-full"
                  nativeButton={false}
                  render={
                    <a
                      href={`https://wa.me/${whats}?text=${encodeURIComponent(mensagem)}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    />
                  }
                >
                  Abrir conversa de {primeiroNome(nomeCliente)}
                </Button>
                <p className="mt-1 text-xs text-muted-foreground">
                  Abre o WhatsApp dela com a mensagem pronta.
                  {podeCompartilhar ? "" : " Depois anexe o PDF que você salvou."}
                </p>
              </div>
            )}

            <Button variant="outline" className="w-full" onClick={baixar}>
              <Download className="mr-1.5 size-4" aria-hidden />
              Salvar no aparelho
            </Button>

            <Button
              variant="ghost"
              className="w-full"
              nativeButton={false}
              render={<a href={pdf?.url ?? "#"} target="_blank" rel="noopener noreferrer" />}
            >
              <Eye className="mr-1.5 size-4" aria-hidden />
              Visualizar
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
