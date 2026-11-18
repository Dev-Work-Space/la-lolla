"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ScanIcon } from "@phosphor-icons/react/ssr";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { pecaPorCodigoAction } from "../etiqueta.actions";
import { useLeitorQr } from "./leitor-qr";

/*
 * "Ler etiqueta" — portado de `abrirScannerQR` do app antigo.
 *
 * O QR da etiqueta guarda SÓ o código da peça (é o que a NIIMBOT imprime
 * nítido), então quem transforma o código em consulta é este leitor: aponta a
 * câmera, lê LL-0001-03 e cai na ficha da peça. A câmera e a leitura moram em
 * `leitor-qr.ts`, divididas com o PDV.
 *
 * O campo de digitar fica sempre à mão: a câmera não abre fora do https, e ele
 * também serve para leitor de código de balcão, que "digita" o código e dá Enter.
 */

export function LerEtiqueta() {
  const router = useRouter();
  const [aberto, setAberto] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [digitado, setDigitado] = useState("");
  const [buscando, buscar] = useTransition();

  // O motor da câmera é o mesmo do PDV (`leitor-qr`); aqui só se decide o que fazer com o código.
  const abrirPeca = (codigo: string, retomar?: () => void) => {
    setAviso(null);
    buscar(async () => {
      const r = await pecaPorCodigoAction(codigo);
      if (r.ok) {
        // Fechar a janela desliga a câmera.
        setAberto(false);
        router.push(`/estoque/${r.data.id}`);
        return;
      }
      setAviso(r.error.message);
      // Leu algo que não é peça: continua lendo, sem fechar a câmera.
      retomar?.();
    });
  };
  const { video, estado, setEstado, temCamera } = useLeitorQr(aberto, abrirPeca);

  return (
    <Dialog
      open={aberto}
      onOpenChange={(v) => {
        setAberto(v);
        if (v) {
          setAviso(null);
          setDigitado("");
          setEstado("parado");
        }
      }}
    >
      <DialogTrigger render={<Button variant="outline" />}>
        <ScanIcon className="mr-1.5 size-4" aria-hidden />
        Ler etiqueta
      </DialogTrigger>

      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ler etiqueta</DialogTitle>
          <DialogDescription>Aponte a câmera para o QR da etiqueta e o produto abre sozinho.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {temCamera && estado !== "sem-camera" ? (
            <div className="relative overflow-hidden rounded-lg border bg-black">
              <video ref={video} playsInline muted className="aspect-square w-full object-cover" />
              <div
                aria-hidden
                className="pointer-events-none absolute inset-[18%] rounded-xl border-2 border-white/80"
              />
              <p className="absolute inset-x-0 bottom-2 text-center text-xs text-white/90">
                {buscando ? "Procurando o produto…" : estado === "lendo" ? "Lendo…" : "Abrindo a câmera…"}
              </p>
            </div>
          ) : (
            <p className="rounded-lg border bg-muted/40 p-3 text-sm leading-relaxed text-muted-foreground">
              A câmera não abriu. Ela só funciona no endereço seguro do app (https) e com a permissão
              liberada no navegador. Pelo IP da rede de casa ela não liga — digite o código abaixo.
            </p>
          )}

          <form
            className="space-y-1.5"
            onSubmit={(e) => {
              e.preventDefault();
              if (digitado.trim()) abrirPeca(digitado.trim());
            }}
          >
            <Label htmlFor="codigo-etiqueta">Ou digite o código</Label>
            <div className="flex gap-2">
              <Input
                id="codigo-etiqueta"
                value={digitado}
                onChange={(e) => setDigitado(e.target.value.toUpperCase())}
                placeholder="LL-0001"
                autoCapitalize="characters"
                autoComplete="off"
                className="text-base"
              />
              <Button type="submit" disabled={buscando || !digitado.trim()}>
                Abrir
              </Button>
            </div>
          </form>

          {aviso && (
            <p role="alert" className="text-sm font-medium text-destructive">
              {aviso}
            </p>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
